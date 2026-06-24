# Vegetarian Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Vegetarian only" filter (Browse + Optimize) backed by a derived `vegetarian` boolean baked into all 5 datasets.

**Architecture:** A new idempotent generator script tags every item with a `vegetarian` boolean (heuristic on name/category + explicit override dict). The backend filters candidate items by that field at the route level (no scoring-engine changes). The frontend adds a shared-state toggle that passes `vegetarian=true` to both endpoints, plus an always-on 🌱 badge.

**Tech Stack:** Python 3 / FastAPI (backend), pytest + FastAPI TestClient (tests), React 19 + Vite (frontend).

## Global Constraints

- Conservative bias: an item is `vegetarian: true` ONLY when confident; ambiguity defaults to `false`. (Showing meat to a vegetarian is the failure to avoid.)
- The generator MUST be idempotent: re-running produces a no-op diff.
- Datasets are non-uniform: `chickfila_items.json` is a **dict keyed by item_id**; the other 4 are **lists**. Chick-fil-A uses field `carbs`; others use `carbohydrate`. Preserve every existing field and the file's top-level shape.
- `item_id` types are mixed (ints, slugs, names) — treat as opaque; never assume numeric.
- Default `vegetarian=False` on both endpoints — off = current behavior, fully backwards-compatible.
- Validation gates (CLAUDE.md): backend `cd ingest && python -c "import api"` + `pytest`; frontend `cd fast-food-ui && npm run lint && npm run build`.
- Local git identity for this repo is already `roshet` — do not change it. Merge to main triggers prod deploy and requires explicit user authorization.

---

### Task 1: Generator script + tag all datasets

**Files:**
- Create: `ingest/tag_vegetarian.py`
- Modify (generated output): `ingest/mcdonalds_items.json`, `ingest/chickfila_items.json`, `ingest/wendys_items.json`, `ingest/tacobell_items.json`, `ingest/burgerking_items.json`
- Test: `ingest/test_api.py`

**Interfaces:**
- Produces: a boolean `vegetarian` field on every item object in all 5 JSON files. No Python symbols consumed by other tasks (it's a build script); later tasks rely only on the JSON field being present.

- [ ] **Step 1: Write the failing data-invariant test**

Add to `ingest/test_api.py` (after the imports, near the `/health` section):

```python
# --- vegetarian field invariant ----------------------------------------------

def test_every_item_has_boolean_vegetarian_field():
    """The vegetarian filter relies on every item carrying the tag; a dataset
    edit that drops it would silently hide items. Guard the whole corpus."""
    from api import ALL_ITEMS
    missing = [it.get("name") for it in ALL_ITEMS if not isinstance(it.get("vegetarian"), bool)]
    assert missing == [], f"items missing boolean 'vegetarian': {missing[:10]}"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ingest && python -m pytest test_api.py::test_every_item_has_boolean_vegetarian_field -v`
Expected: FAIL — items have no `vegetarian` key yet (the list is non-empty).

- [ ] **Step 3: Write the generator script**

Create `ingest/tag_vegetarian.py`:

```python
"""Derive a `vegetarian` boolean for every item across all 5 datasets and write it
back into the JSON files. Idempotent — re-running yields a no-op diff.

We have NO ingredient data, only name + category + macros, so vegetarian status is
*derived*: a non-vegetarian keyword match on the name, plus category defaults, plus
an explicit per-item OVERRIDES table for whatever the heuristic gets wrong.

Conservative bias: mark True only when confident; ambiguity stays False. Showing a
meat item to someone filtering vegetarian is the failure we must avoid.

Re-run after editing OVERRIDES:  python tag_vegetarian.py
"""

import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

DATASETS = [
    "mcdonalds_items.json",
    "chickfila_items.json",
    "wendys_items.json",
    "tacobell_items.json",
    "burgerking_items.json",
]

# Substrings (lowercased) that mark an item as NOT vegetarian. Word-ish fragments are
# fine because we match against full product names. Keep meat/seafood terms only.
NON_VEG_KEYWORDS = {
    "bacon", "beef", "burger", "hamburger", "cheeseburger", "chicken", "mcchicken",
    "nugget", "mcnugget", "sausage", "ham", "pepperoni", "steak", "filet", "fish",
    "fillet", "mcrib", "rib", "brisket", "turkey", "pork", "meat", "spicy chicken",
    "grilled chicken", "crispy chicken", "strips", "tender", "wing", "shrimp",
    "carne", "asada", "chorizo", "baconator", "dave's", "jr.", "whopper", "big mac",
    "quarter pounder", "mcdouble", "club", "blt", "anchov",
}

# Categories whose items are vegetarian by default UNLESS a non-veg keyword fires.
VEG_DEFAULT_CATEGORIES = {
    "drinks", "beverages", "mccafe_coffees", "desserts", "sweets", "sauces",
    "dressings", "buns",
}

# Explicit per-item corrections, keyed on str(item_id). Populated during review:
# run the script, inspect the printed report, and add entries for misclassifications
# (e.g. a cheese-only quesadilla the keywords wrongly flagged, or a "garden salad"
# that actually ships with chicken). Value is the FINAL vegetarian boolean.
OVERRIDES: dict[str, bool] = {}


def _is_vegetarian(item: dict) -> bool:
    item_id = str(item.get("item_id"))
    if item_id in OVERRIDES:
        return OVERRIDES[item_id]

    name = (item.get("name") or "").lower()
    if any(kw in name for kw in NON_VEG_KEYWORDS):
        return False

    category = (item.get("category") or "").lower()
    if category in VEG_DEFAULT_CATEGORIES:
        return True

    # Unknown territory (e.g. a generic "specialties"/"entrees" item with no meat word):
    # conservative default is False — better to hide a veg item than show a meat one.
    return False


def _iter_items(data):
    """Yield item dicts whether the file is a list or an id-keyed dict."""
    return data.values() if isinstance(data, dict) else data


def main():
    report = []
    for filename in DATASETS:
        path = BASE_DIR / filename
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        veg_count = 0
        for item in _iter_items(data):
            veg = _is_vegetarian(item)
            item["vegetarian"] = veg
            if veg:
                veg_count += 1
            report.append((filename, str(item.get("item_id")), item.get("name"), veg))

        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")

        total = sum(1 for _ in _iter_items(data))
        print(f"{filename}: {veg_count}/{total} vegetarian")

    # Full per-item report for review of the heuristic.
    print("\n--- items tagged vegetarian (review for false positives) ---")
    for fn, iid, name, veg in report:
        if veg:
            print(f"  VEG  {fn:24} {name}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the generator**

Run: `cd ingest && python tag_vegetarian.py`
Expected: prints per-file counts and a list of items tagged vegetarian. The 5 JSON files now each carry a `vegetarian` field on every item.

- [ ] **Step 5: Review the output with the user**

Read the printed "VEG" list and skim every non-veg dataset item too (the keyword set can miss things — e.g. a "Spicy" sauce-less item, a cheese quesadilla, fish tacos). Compile the borderline / wrong calls and present them to the user as a table for sign-off. Add confirmed corrections to `OVERRIDES` in `tag_vegetarian.py`, then re-run `python tag_vegetarian.py` so the JSON reflects them. Repeat until the user approves the tags.

(This is a real review gate, mirroring the `build_wendys_us.py` data-table review. Do not skip it.)

- [ ] **Step 6: Run the invariant test to verify it passes**

Run: `cd ingest && python -m pytest test_api.py::test_every_item_has_boolean_vegetarian_field -v`
Expected: PASS — every loaded item has a boolean `vegetarian`.

- [ ] **Step 7: Verify backend still imports + full suite green**

Run: `cd ingest && python -c "import api" && python -m pytest -q`
Expected: import succeeds; all existing tests + the new one pass.

- [ ] **Step 8: Commit**

```bash
git add ingest/tag_vegetarian.py ingest/*_items.json ingest/test_api.py
git commit -m "feat: tag every item with a derived vegetarian boolean

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Backend filtering + humanize passthrough

**Files:**
- Modify: `ingest/api.py` (the `/recommend` route ~140-191, the `/optimize_meal` route ~207-252)
- Modify: `ingest/recommend_items.py` (`humanize_items` ~159-192)
- Test: `ingest/test_api.py`

**Interfaces:**
- Consumes: the `vegetarian` field on items (Task 1).
- Produces: `GET /recommend?vegetarian=true` and `GET /optimize_meal?vegetarian=true` filter to vegetarian items; humanized items expose a `vegetarian` boolean for the frontend badge.

- [ ] **Step 1: Write the failing tests**

Add to `ingest/test_api.py` (in the `/recommend` and `/optimize_meal` sections):

```python
def test_recommend_vegetarian_excludes_meat_and_keeps_veg():
    resp = client.get("/recommend", params={"vegetarian": "true", "format": "human", "top_n": 50})
    assert resp.status_code == 200
    titles = [r["title"].lower() for r in resp.json()["results"]]
    # no obvious meat items survive the filter
    assert not any("nugget" in t or "bacon" in t or "burger" in t for t in titles)
    # the humanized payload carries the flag, and everything returned is vegetarian
    assert all(r.get("vegetarian") is True for r in resp.json()["results"])


def test_recommend_vegetarian_off_by_default_includes_meat():
    resp = client.get("/recommend", params={"format": "human", "top_n": 50})
    titles = [r["title"].lower() for r in resp.json()["results"]]
    assert any("chicken" in t or "burger" in t or "nugget" in t for t in titles)


def test_optimize_meal_vegetarian_returns_all_veg_meal():
    resp = client.get("/optimize_meal", params={"vegetarian": "true", "restaurant": "all"})
    assert resp.status_code == 200
    body = resp.json()
    assert "meals" in body and body["meals"], "expected at least one vegetarian meal"
    for meal in body["meals"]:
        for item in meal["items"]:
            assert item.get("vegetarian") is True
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ingest && python -m pytest test_api.py -k vegetarian -v`
Expected: FAIL — `vegetarian` is not yet a query param (filter not applied; humanized items lack the key, so `.get("vegetarian")` is `None`).

- [ ] **Step 3: Add the `vegetarian` field to `humanize_items`**

In `ingest/recommend_items.py`, inside the dict appended in `humanize_items` (after the `"score"` line ~189), add:

```python
            "score": item.get("health_score"),
            "vegetarian": bool(item.get("vegetarian", False)),
        })
```

(The existing `.copy()` in `get_recommendations` and `build_optimal_meal` already carries `vegetarian` through, so it's present on items reaching `humanize_items`.)

- [ ] **Step 4: Add the `vegetarian` param + filter to `/recommend`**

In `ingest/api.py`, add the param to the `recommend(...)` signature (after `format`):

```python
    format: str = Query("raw", pattern = "^(raw|human)$"),
    vegetarian: bool = Query(False),
):
```

Then, immediately after the restaurant→`items` selection block (right after the `else: items = ALL_ITEMS` at ~160, before the `if category:` block), insert:

```python
    if vegetarian:
        items = [it for it in items if it.get("vegetarian")]
```

- [ ] **Step 5: Add the `vegetarian` param + filter to `/optimize_meal`**

In `ingest/api.py`, add the param to the `optimize_meal(...)` signature (after `format`):

```python
    format: str = Query("human", pattern="^(raw|human)$"),
    vegetarian: bool = Query(False),
):
```

Then change the inner `_optimize` helper (~233) to filter first:

```python
    def _optimize(items):
        if vegetarian:
            items = [it for it in items if it.get("vegetarian")]
        return build_optimal_meal(
            items,
            max_calories=max_calories,
            goal=goal,
            allow_side=allow_side,
            allow_drink=allow_drink,
            category_filter=category,
        )
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd ingest && python -m pytest test_api.py -k vegetarian -v`
Expected: PASS (all 4 vegetarian tests — Task 1's invariant + these 3).

- [ ] **Step 7: Verify import + full suite**

Run: `cd ingest && python -c "import api" && python -m pytest -q`
Expected: import succeeds; entire suite green.

- [ ] **Step 8: Commit**

```bash
git add ingest/api.py ingest/recommend_items.py ingest/test_api.py
git commit -m "feat: vegetarian query param on /recommend and /optimize_meal

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Frontend toggle + badge

**Files:**
- Modify: `fast-food-ui/src/App.jsx` (state ~221-224; auto-fetch effect dep array ~306; `/recommend` fetch URL ~434; `/optimize_meal` fetch URL ~457; `FilterChips` ~610-644; item row ~752; modal ~1117)
- Modify: `fast-food-ui/src/App.css` (new badge class)

**Interfaces:**
- Consumes: `vegetarian` query param (Task 2) and the `vegetarian` field on humanized items (Task 2).
- Produces: user-facing filter + badge. No downstream consumers.

- [ ] **Step 1: Add the `vegetarian` filter state**

In `App.jsx`, after the `category` state (~224):

```jsx
  const [category, setCategory]       = useState("");
  const [vegetarian, setVegetarian]   = useState(false);
```

- [ ] **Step 2: Include `vegetarian` in the Browse auto-fetch dependency array**

In `App.jsx` the effect at ~306 currently ends `}, [activeTab, goal, restaurant, maxCalories, category]);`. Change to:

```jsx
  }, [activeTab, goal, restaurant, maxCalories, category, vegetarian]);
```

- [ ] **Step 3: Pass the param in both fetch URLs**

In the `/recommend` fetch (~434), after the `category` append line, add the flag (only when on):

```jsx
      let url = `${API_BASE_URL}/recommend?restaurant=${encodeURIComponent(restaurant)}&goal=${encodeURIComponent(goal)}&max_calories=${encodeURIComponent(maxCalories)}&top_n=20&format=human`;
      if (category) url += `&category=${encodeURIComponent(category)}`;
      if (vegetarian) url += `&vegetarian=true`;
```

In the `/optimize_meal` fetch (~457):

```jsx
      let url = `${API_BASE_URL}/optimize_meal?restaurant=${encodeURIComponent(restaurant)}&goal=${encodeURIComponent(goal)}&max_calories=${encodeURIComponent(maxCalories)}&format=human`;
      if (vegetarian) url += `&vegetarian=true`;
      const res = await fetch(url, { signal: controller.signal });
```

(Note: the optimize URL is currently declared `const`; change it to `let` so the append compiles.)

- [ ] **Step 4: Add the toggle to `FilterChips`**

In `App.jsx`, inside the `FilterChips` `div.filterChips` (after the category select block ~642, before the closing `</div>`):

```jsx
        <label className="vegToggle">
          <input
            type="checkbox"
            checked={vegetarian}
            onChange={(e) => setVegetarian(e.target.checked)}
            aria-label="Vegetarian only"
          />
          <span>🌱 Vegetarian</span>
        </label>
```

- [ ] **Step 5: Add the 🌱 badge to the item row and modal**

In the Browse item row, change the item name line (~752) to append a badge when vegetarian:

```jsx
                      <div className="itemName">
                        {item.title || item.name}
                        {item.vegetarian && <span className="vegBadge" title="Vegetarian" aria-label="Vegetarian">🌱</span>}
                      </div>
```

In the modal header (~1117), change the title line:

```jsx
                <h2 className="modalItemName" id="modalItemName">
                  {modalItem.title || modalItem.name}
                  {modalItem.vegetarian && <span className="vegBadge" title="Vegetarian" aria-label="Vegetarian">🌱</span>}
                </h2>
```

- [ ] **Step 6: Add the CSS**

Append to `fast-food-ui/src/App.css`:

```css
.vegToggle {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  cursor: pointer;
  user-select: none;
}

.vegToggle input {
  cursor: pointer;
}

.vegBadge {
  margin-left: 0.4rem;
  font-size: 0.9em;
}
```

- [ ] **Step 7: Validate the frontend**

Run: `cd fast-food-ui && npm run lint && npm run build`
Expected: lint clean, build succeeds.

- [ ] **Step 8: Manual smoke check**

Start backend (`cd ingest && python -m uvicorn api:app --reload`) and frontend (`cd fast-food-ui && npm run dev`). Toggle "🌱 Vegetarian" in Browse — meat items disappear, veg items show a 🌱. Switch to Optimize, run it — returned meals contain only vegetarian items. Open an item modal — badge present for veg items.

- [ ] **Step 9: Commit**

```bash
git add fast-food-ui/src/App.jsx fast-food-ui/src/App.css
git commit -m "feat: vegetarian-only toggle and badge in the UI

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** Data layer → Task 1 (generator, conservative bias, dict/list + carbs handling, override review gate). Backend filtering on both endpoints → Task 2. Frontend toggle (Browse+Optimize) + always-on badge + count line (already reflects filtered set) → Task 3. Tests (meat absent, veg present, optimizer all-veg, field invariant) → Tasks 1–2. All spec sections covered.
- **Type consistency:** `vegetarian` is a Python `bool` end-to-end (JSON bool → `item.get("vegetarian")` → `bool(...)` in `humanize_items` → JS truthy check). Query param is FastAPI `bool` (`?vegetarian=true`). Filter helper name and `_optimize` signature match Task 2 usage.
- **No placeholders:** `OVERRIDES` starts empty by design and is populated during the Task 1 Step 5 review gate (reviewed data, not a code placeholder), exactly like the `build_wendys_us.py` table.
