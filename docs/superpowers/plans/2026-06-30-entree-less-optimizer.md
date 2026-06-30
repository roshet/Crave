# Entree-less Optimizer Meals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When no entree qualifies for the active filters, the meal optimizer assembles an honest sides-only meal (one side + optional drink) instead of failing, flagged so the UI can label it truthfully.

**Architecture:** Relax `build_optimal_meal` in `recommend_items.py` to select an anchor pool — entrees normally, sides when no entree qualifies — and tag entree-less meals with an `entree_less` boolean. Plumb the flag through `/optimize_meal`'s human response in `api.py`. The frontend (`App.jsx`) renders a sides-only label on flagged meal cards and a diet-aware hint when optimization genuinely can't build a meal.

**Tech Stack:** Python 3 / FastAPI / pytest (backend), React 19 + Vite (frontend).

## Global Constraints

- No menu data is invented or added — Wendy's genuinely has no vegan entree; the fix is behavioral, not data.
- Sides-only meals are **one side + optional drink** only — no second side, no drink-only meals.
- The anchor of any meal is always a side or entree, never a drink.
- No new endpoints or query params; the `entree_less` flag is additive.
- Backend validation: `cd ingest && python -c "import api"` then `python -m pytest`.
- Frontend validation: `cd fast-food-ui && npm run lint && npm run build`.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Optimizer entree-less fallback + `entree_less` flag

**Files:**
- Modify: `ingest/recommend_items.py` (`build_optimal_meal`, lines ~283–352)
- Test: `ingest/test_scoring.py`

**Interfaces:**
- Consumes: `build_optimal_meal(items, max_calories, goal, allow_side, allow_drink, category_filter)` and `api.wendys_items` (already exist).
- Produces: `build_optimal_meal` returns `{"meals": [{"items": [...], "total_score": float, "total_calories": int, "entree_less": bool}]}` or `None`. `entree_less` is `True` when the meal was assembled from sides because no entree qualified, else `False`.

- [ ] **Step 1: Write the failing tests**

Append to `ingest/test_scoring.py`:

```python
from recommend_items import build_optimal_meal


def _entree_categories():
    # Mirror the entree category set used by build_optimal_meal.
    return {
        "burgers", "entrees", "salads", "nuggets_strips", "breakfast",
        "chicken", "chicken_fish", "wraps", "snack_wraps", "kid_s_meals",
        "tacos", "burritos", "quesadillas", "nachos", "specialties",
    }


def test_wendys_vegan_builds_entree_less_meal():
    """Wendy's has no vegan entree, so the optimizer must fall back to a sides-only meal."""
    vegan = [it for it in api.wendys_items if it.get("vegan")]
    result = build_optimal_meal(vegan, max_calories=800, goal="low_fat")
    assert result is not None
    assert result["meals"], "expected at least one sides-only meal"
    first = result["meals"][0]
    assert first["entree_less"] is True
    # No item in the meal is an entree-category item.
    cats = {(i.get("category") or "").lower() for i in first["items"]}
    assert not (cats & _entree_categories())


def test_entree_anchored_meal_not_flagged():
    """A normal menu with entrees keeps the entree anchor and is not flagged entree_less."""
    result = build_optimal_meal(api.mcdonalds_items, max_calories=800, goal="balanced")
    assert result is not None
    assert result["meals"][0]["entree_less"] is False


def test_drinks_only_returns_none():
    """No entree and no side (drinks only) cannot form a meal."""
    drinks = [it for it in api.wendys_items
              if (it.get("item_type") == "drink") or (it.get("category") == "drinks")]
    assert build_optimal_meal(drinks, max_calories=800, goal="balanced") is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ingest && python -m pytest test_scoring.py -k "entree_less or drinks_only or entree_anchored" -v`
Expected: FAIL — `test_wendys_vegan_builds_entree_less_meal` errors because `build_optimal_meal` returns `None` (no entrees), and the other two fail on the missing `entree_less` key.

- [ ] **Step 3: Implement the fallback**

In `ingest/recommend_items.py`, replace the early return (lines 283–284):

```python
    if not entrees:
        return None
```

with anchor selection:

```python
    if entrees:
        anchors = entrees
        entree_less = False
    elif sides:
        anchors = sides
        entree_less = True
    else:
        return None
```

Change the score cache (line ~287) so it covers whichever pool is the anchor — `entrees + sides + drinks` already includes sides, so leave it as-is.

Replace the `sides_list` line (line 292) so entree-less meals never add a second side:

```python
    sides_list = [None] if entree_less else (sides if (allow_side and sides) else [None])
```

Change the outer loop (line 297) to iterate the anchor pool:

```python
    for entree in anchors:
```

Add the flag to the result dict (the `ranked_results.append({...})` block, lines 344–348):

```python
        ranked_results.append({
            "items": enriched,
            "total_score": round(score, 3),
            "total_calories": sum((i.get("calories") or 0) for i in enriched),
            "entree_less": entree_less,
        })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ingest && python -m pytest test_scoring.py -v`
Expected: PASS (all prior tests plus the 3 new ones).

- [ ] **Step 5: Commit**

```bash
git add ingest/recommend_items.py ingest/test_scoring.py
git commit -m "feat: optimizer falls back to sides-only meal when no entree qualifies

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Plumb `entree_less` through `/optimize_meal`

**Files:**
- Modify: `ingest/api.py` (`optimize_meal`, human-format block ~line 270–280)
- Test: `ingest/test_api.py`

**Interfaces:**
- Consumes: `build_optimal_meal` results now carry `entree_less` (Task 1).
- Produces: `GET /optimize_meal?...&format=human` returns each meal with an `entree_less` boolean.

- [ ] **Step 1: Write the failing tests**

Append to `ingest/test_api.py`:

```python
# --- entree-less (sides-only) optimizer meals --------------------------------

def test_wendys_vegan_optimize_returns_sides_only_meal():
    resp = client.get("/optimize_meal?restaurant=wendys&vegan=true&goal=low_fat")
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("meals"), "expected a sides-only meal, got: %r" % body
    first = body["meals"][0]
    assert first["entree_less"] is True
    for item in first["items"]:
        assert item["vegan"] is True


def test_wendys_vegan_high_protein_still_no_meal():
    resp = client.get("/optimize_meal?restaurant=wendys&vegan=true&goal=high_protein")
    assert resp.status_code == 200
    assert "message" in resp.json()  # honest: sides cannot reach 35g protein


def test_normal_optimize_not_entree_less():
    resp = client.get("/optimize_meal?restaurant=mcdonalds&goal=balanced")
    assert resp.status_code == 200
    body = resp.json()
    assert body["meals"][0]["entree_less"] is False
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ingest && python -m pytest test_api.py -k "entree_less or sides_only or high_protein_still" -v`
Expected: FAIL — `entree_less` key missing from the human-format meal dicts.

- [ ] **Step 3: Add the flag to the human response**

In `ingest/api.py`, in the `format == "human"` block of `optimize_meal`, add `entree_less` to each meal dict:

```python
        return {
            "meals": [
                {
                    "items": humanize_items(m["items"]),
                    "total_score": m["total_score"],
                    "total_calories": m["total_calories"],
                    "entree_less": m.get("entree_less", False),
                }
                for m in meal["meals"]
            ],
            "score_bounds": score_bounds(goal),
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ingest && python -m pytest test_api.py -v`
Expected: PASS (all prior tests plus the 3 new ones).

- [ ] **Step 5: Verify the import still loads, then commit**

```bash
cd ingest && python -c "import api"
git add ingest/api.py ingest/test_api.py
git commit -m "feat: expose entree_less flag on /optimize_meal human response

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Frontend sides-only label + diet-aware failure hint

**Files:**
- Modify: `fast-food-ui/src/App.jsx` (optimize result card ~line 1005; optimizeError hint ~line 986)
- Modify: `fast-food-ui/src/App.css` (new `.optimizeSidesOnly` class)

**Interfaces:**
- Consumes: each `optimizedMealResults` entry now has `result.entree_less` (Task 2); existing `diet` and `restaurant` state.
- Produces: rendered label on flagged cards; diet-aware hint text. No new exported symbols.

- [ ] **Step 1: Add the sides-only label to flagged cards**

In `fast-food-ui/src/App.jsx`, inside the optimize card, immediately after the `optimizeItems` paragraph (line ~1007, after the `</p>` that joins item titles), insert:

```jsx
                    {result.entree_less && (
                      <p className="optimizeSidesOnly">
                        🥬 Sides-only meal — no {diet !== "none" ? `${diet} ` : ""}entree{" "}
                        {restaurant === "all" ? "available" : "at this restaurant"}
                      </p>
                    )}
```

- [ ] **Step 2: Make the failure hint diet-aware**

In `fast-food-ui/src/App.jsx`, replace the `optimizeHint` paragraph (lines ~986–989) with:

```jsx
                <p className="optimizeHint">
                  {diet !== "none"
                    ? `No ${diet} meal fits the ${goal.replace(/_/g, " ")} goal here` +
                      (goal === "high_protein"
                        ? ` — ${diet} options can't reach 35g protein.`
                        : ".") +
                      " Try another goal or a different restaurant."
                    : "Try raising the calorie cap, switching the goal, or picking a different restaurant — some menus don't have a combo that fits every constraint."}
                </p>
```

- [ ] **Step 3: Add the CSS class**

In `fast-food-ui/src/App.css`, add near the other `.optimize*` rules:

```css
.optimizeSidesOnly {
  margin: 4px 0 0;
  font-size: 0.85rem;
  color: var(--accent, #2e7d32);
  font-weight: 600;
}
```

- [ ] **Step 4: Validate lint + build**

Run: `cd fast-food-ui && npm run lint && npm run build`
Expected: both succeed with no errors.

- [ ] **Step 5: Commit**

```bash
git add fast-food-ui/src/App.jsx fast-food-ui/src/App.css
git commit -m "feat: label sides-only optimizer meals and give diet-aware failure hint

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final validation (after all tasks)

- [ ] `cd ingest && python -c "import api" && python -m pytest`
- [ ] `cd fast-food-ui && npm run lint && npm run build`
- [ ] Manual API smoke (backend running): `GET /optimize_meal?restaurant=wendys&vegan=true&goal=low_fat` returns a meal with `entree_less: true` and all-vegan items; `&goal=high_protein` returns `{"message": ...}`.
