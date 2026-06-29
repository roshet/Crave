# Vegan Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a vegan option to the diet filter (Browse + Optimize), backed by a derived `vegan` boolean baked into all 5 datasets, building on the shipped vegetarian filter.

**Architecture:** The existing `tag_vegetarian.py` generator is renamed to `tag_diet.py` and extended to *also* emit a `vegan` boolean (non-vegan keyword exclusion from the vegetarian set + a narrow vegan-default category + explicit override dict). The backend gains an additive `vegan=true` param on both endpoints, filtering at the route level exactly like `vegetarian`. The frontend replaces the vegetarian checkbox with a mutually-exclusive Diet `<select>` (Any / Vegetarian / Vegan) and shows the strictest-diet badge (🥬 vegan, 🌱 vegetarian-only).

**Tech Stack:** Python 3 / FastAPI (backend), pytest + FastAPI TestClient (tests), React 19 + Vite (frontend).

## Global Constraints

- **Subset invariant:** no item is `vegan: true` without also being `vegetarian: true`. Enforced structurally in the heuristic path (`veg and _has_vegan_signal(...)`) and asserted by a test across the finished data.
- Conservative bias: an item is `vegan: true` ONLY when confident; ambiguity defaults to `false`. (Showing dairy/egg to a vegan is the failure to avoid.) Vegan is *more* override-driven than vegetarian because dairy/egg are often name-invisible.
- The generator MUST be idempotent: re-running produces a no-op diff, and must NOT change any existing `vegetarian` value.
- Datasets are non-uniform: `chickfila_items.json` is a **dict keyed by item_id**; the other 4 are **lists**. Chick-fil-A uses field `carbs`; others use `carbohydrate`. Preserve every existing field and the file's top-level shape. (The existing `_iter_items` already handles this.)
- `item_id` types are mixed (ints, slugs, names) — treat as opaque; never assume numeric.
- Default `vegan=False` on both endpoints; the existing `vegetarian` param is untouched — off = current behavior, fully backwards-compatible.
- The UI sends at most ONE of `vegetarian=true` / `vegan=true` per request (mutually-exclusive selector).
- Validation gates (CLAUDE.md): backend `cd ingest && python -c "import api"` + `pytest`; frontend `cd fast-food-ui && npm run lint && npm run build`.
- Local git identity for this repo is already `roshet` — do not change it. Merge to main triggers prod deploy and requires explicit user authorization.

---

### Task 1: Rename generator to `tag_diet.py`, add vegan tagging, tag all datasets

**Files:**
- Rename: `ingest/tag_vegetarian.py` → `ingest/tag_diet.py` (via `git mv`)
- Modify (after rename): `ingest/tag_diet.py`
- Modify (generated output): `ingest/mcdonalds_items.json`, `ingest/chickfila_items.json`, `ingest/wendys_items.json`, `ingest/tacobell_items.json`, `ingest/burgerking_items.json`
- Test: `ingest/test_api.py`

**Interfaces:**
- Consumes: the existing `vegetarian` field + `_is_vegetarian`, `_iter_items` helpers in the generator.
- Produces: a boolean `vegan` field on every item object in all 5 JSON files, with `vegan == true ⊆ vegetarian == true`. No Python symbols consumed by other tasks (build script); later tasks rely only on the JSON field being present.

- [ ] **Step 1: Rename the generator**

Run: `git mv ingest/tag_vegetarian.py ingest/tag_diet.py`
Expected: file renamed, staged for commit.

- [ ] **Step 2: Write the failing data-invariant tests**

Add to `ingest/test_api.py` (near the existing `test_every_item_has_boolean_vegetarian_field`):

```python
# --- vegan field invariants --------------------------------------------------

def test_every_item_has_boolean_vegan_field():
    """The vegan filter relies on every item carrying the tag; a dataset edit
    that drops it would silently hide items. Guard the whole corpus."""
    from api import ALL_ITEMS
    missing = [it.get("name") for it in ALL_ITEMS if not isinstance(it.get("vegan"), bool)]
    assert missing == [], f"items missing boolean 'vegan': {missing[:10]}"


def test_vegan_is_subset_of_vegetarian():
    """A vegan item must also be vegetarian. This is the core safety invariant."""
    from api import ALL_ITEMS
    violations = [
        it.get("name") for it in ALL_ITEMS
        if it.get("vegan") and not it.get("vegetarian")
    ]
    assert violations == [], f"vegan-but-not-vegetarian items: {violations[:10]}"
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd ingest && python -m pytest test_api.py::test_every_item_has_boolean_vegan_field -v`
Expected: FAIL — items have no `vegan` key yet (the list is non-empty).

- [ ] **Step 4: Update the module docstring and add vegan logic**

In `ingest/tag_diet.py`, replace the module docstring (the top triple-quoted block) with:

```python
"""Derive `vegetarian` and `vegan` booleans for every item across all 5 datasets
and write them back into the JSON files. Idempotent — re-running yields a no-op diff.

We have NO ingredient data, only name + category + macros, so diet status is
*derived*: keyword matches on the name, plus category defaults, plus explicit
per-item override tables for whatever the heuristics get wrong.

Conservative bias: mark True only when confident; ambiguity stays False. Showing a
meat item to a vegetarian (or a dairy/egg item to a vegan) is the failure we avoid.
Vegan is a strict subset of vegetarian and leans harder on overrides, since dairy
and egg are frequently invisible in product names.

Re-run after editing any OVERRIDES table:  python tag_diet.py
"""
```

- [ ] **Step 5: Add the vegan keyword set, default categories, override table, and helpers**

In `ingest/tag_diet.py`, immediately after the `VEG_DEFAULT_CATEGORIES = {...}` block, add:

```python
# Substrings (lowercased) that mark an otherwise-vegetarian item as NOT vegan:
# dairy, egg, honey, and dairy-dessert/drink signals. Matched against full names.
NON_VEGAN_KEYWORDS = {
    "cheese", "cheesy", "milk", "cream", "creamy", "butter", "egg", "mayo",
    "ranch", "yogurt", "parfait", "shake", "float", "latte", "cappuccino",
    "mocha", "frappe", "frosted", "queso", "honey", "custard", "icedream",
    "sundae", "mcflurry", "cheddar", "parmesan", "aioli", "alfredo",
}

# Categories whose items are vegan by default UNLESS a non-vegan keyword fires.
# Deliberately narrow: only fountain drinks/teas/lemonades/water reliably qualify
# (milkshakes/lattes are caught by NON_VEGAN_KEYWORDS). Sides/buns/sauces are NOT
# here — they carry name-invisible dairy/egg/tallow, so they stay override-driven.
VEGAN_DEFAULT_CATEGORIES = {"drinks", "beverages"}

# Explicit per-item vegan corrections, keyed on str(item_id). Populated during the
# review gate (Step 8). Value is the FINAL vegan boolean. NEVER set True for a
# non-vegetarian item (a test asserts the subset invariant).
VEGAN_OVERRIDES: dict[str, bool] = {}


def _has_vegan_signal(item: dict) -> bool:
    """Vegan-specific heuristic only — does NOT re-check meat. The vegetarian gate
    lives in _is_vegan's composing rule."""
    name = (item.get("name") or "").lower()
    if any(kw in name for kw in NON_VEGAN_KEYWORDS):
        return False
    category = (item.get("category") or "").lower()
    if category in VEGAN_DEFAULT_CATEGORIES:
        return True
    # Unknown territory: conservative default is False.
    return False


def _is_vegan(item: dict) -> bool:
    item_id = str(item.get("item_id"))
    if item_id in VEGAN_OVERRIDES:
        return VEGAN_OVERRIDES[item_id]
    # Subset invariant: must be vegetarian first.
    return _is_vegetarian(item) and _has_vegan_signal(item)
```

- [ ] **Step 6: Tag both fields in `main()` and extend the report**

In `ingest/tag_diet.py`, replace the body of the per-file loop and the report section in `main()` with this (keeps vegetarian counting, adds vegan):

```python
def main():
    report = []
    for filename in DATASETS:
        path = BASE_DIR / filename
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        veg_count = 0
        vegan_count = 0
        for item in _iter_items(data):
            veg = _is_vegetarian(item)
            vegan = _is_vegan(item)
            item["vegetarian"] = veg
            item["vegan"] = vegan
            if veg:
                veg_count += 1
            if vegan:
                vegan_count += 1
            report.append((filename, str(item.get("item_id")), item.get("name"), veg, vegan))

        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")

        total = sum(1 for _ in _iter_items(data))
        print(f"{filename}: {veg_count}/{total} vegetarian, {vegan_count}/{total} vegan")

    # Full per-item report for review of the heuristics.
    print("\n--- items tagged VEGAN (review for false positives) ---")
    for fn, iid, name, veg, vegan in report:
        if vegan:
            print(f"  VEGAN  {fn:24} {name}")

    print("\n--- vegetarian-but-NOT-vegan (review for false negatives) ---")
    for fn, iid, name, veg, vegan in report:
        if veg and not vegan:
            print(f"  veg-only  {fn:24} {name}")
```

- [ ] **Step 7: Run the generator**

Run: `cd ingest && python tag_diet.py`
Expected: prints per-file vegetarian + vegan counts, a VEGAN list, and a vegetarian-but-not-vegan list. The 5 JSON files now each carry a `vegan` field on every item; existing `vegetarian` values are unchanged.

- [ ] **Step 8: Review the output with the user (review gate — do not skip)**

Read both printed lists and apply real-world vegan knowledge that names don't reveal. Known traps to check explicitly:
- **McDonald's US fries** contain "natural beef flavor" → **NOT vegan** (add `VEGAN_OVERRIDES['200066'] = False` etc. if the heuristic ever marks them vegan; with the narrow default categories they won't auto-qualify, but confirm).
- **Taco Bell beans/bean burrito/black beans** are certified vegan when ordered "fresco" → candidates to flip ON via override.
- Drinks that snuck in via the default but contain dairy not caught by keywords (e.g. horchata-style) → flip OFF.
- Plain items like apple slices, plain baked potato, some sodas/teas/water → flip ON if not already.

Compile the borderline / corrected calls into a table and present to the user for sign-off. Add confirmed corrections to `VEGAN_OVERRIDES`, then re-run `python tag_diet.py`. Repeat until the user approves. (Mirrors the vegetarian `OVERRIDES` review gate.)

- [ ] **Step 9: Run the invariant tests to verify they pass**

Run: `cd ingest && python -m pytest test_api.py -k "vegan_field or subset_of_vegetarian" -v`
Expected: PASS — every loaded item has a boolean `vegan`, and no vegan item is non-vegetarian.

- [ ] **Step 10: Verify backend still imports + full suite green**

Run: `cd ingest && python -c "import api" && python -m pytest -q`
Expected: import succeeds; all existing tests + the 2 new ones pass.

- [ ] **Step 11: Commit**

```bash
git add ingest/tag_diet.py ingest/tag_vegetarian.py ingest/*_items.json ingest/test_api.py
git commit -m "feat: derive a vegan boolean for every item (tag_diet.py)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

(`git mv` plus the new path means both the old and new names appear in `git add`; git records it as a rename.)

---

### Task 2: Backend vegan param + humanize passthrough

**Files:**
- Modify: `ingest/api.py` (`/recommend` route signature ~148 + filter ~163; `/optimize_meal` signature ~220 + `_optimize` helper ~238)
- Modify: `ingest/recommend_items.py` (`humanize_items` ~190)
- Test: `ingest/test_api.py`

**Interfaces:**
- Consumes: the `vegan` field on items (Task 1).
- Produces: `GET /recommend?vegan=true` and `GET /optimize_meal?vegan=true` filter to vegan items; humanized items expose a `vegan` boolean for the frontend badge.

- [ ] **Step 1: Write the failing tests**

Add to `ingest/test_api.py` (in the `/recommend` and `/optimize_meal` sections):

```python
def test_recommend_vegan_excludes_dairy_and_keeps_vegan():
    resp = client.get("/recommend", params={"vegan": "true", "format": "human", "top_n": 50})
    assert resp.status_code == 200
    results = resp.json()["results"]
    titles = [r["title"].lower() for r in results]
    # no obvious dairy/egg items survive the filter
    assert not any("cheese" in t or "shake" in t or "egg" in t for t in titles)
    # everything returned is vegan (and therefore vegetarian)
    assert all(r.get("vegan") is True for r in results)
    assert all(r.get("vegetarian") is True for r in results)


def test_recommend_vegan_off_by_default_includes_non_vegan():
    resp = client.get("/recommend", params={"format": "human", "top_n": 50})
    results = resp.json()["results"]
    assert any(r.get("vegan") is False for r in results)


def test_optimize_meal_vegan_returns_all_vegan_meal():
    resp = client.get("/optimize_meal", params={"vegan": "true", "restaurant": "all"})
    assert resp.status_code == 200
    body = resp.json()
    assert "meals" in body and body["meals"], "expected at least one vegan meal"
    for meal in body["meals"]:
        for item in meal["items"]:
            assert item.get("vegan") is True


def test_no_dairy_keyword_in_any_vegan_item():
    """Regression tripwire: no vegan-tagged item name contains a dairy/egg term.
    Mirrors the meat tripwire for the vegetarian filter."""
    from api import ALL_ITEMS
    dairy_terms = [
        "cheese", "milk", "cream", "butter", "egg", "mayo", "ranch", "yogurt",
        "parfait", "shake", "float", "latte", "queso", "honey", "custard",
        "icedream", "sundae", "mcflurry", "cheddar", "parmesan",
    ]
    leaks = [
        it.get("name") for it in ALL_ITEMS
        if it.get("vegan") and any(term in (it.get("name") or "").lower() for term in dairy_terms)
    ]
    assert leaks == [], f"vegan items with a dairy/egg keyword: {leaks[:10]}"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ingest && python -m pytest test_api.py -k "vegan" -v`
Expected: the 3 endpoint tests FAIL — `vegan` is not yet a query param (filter not applied; humanized items lack the key so `.get("vegan")` is `None`). The tripwire test (`test_no_dairy_keyword_in_any_vegan_item`) should already PASS from Task 1's data.

- [ ] **Step 3: Add the `vegan` field to `humanize_items`**

In `ingest/recommend_items.py`, in the dict appended in `humanize_items`, add a `vegan` line right after the `vegetarian` line (~190):

```python
            "score": item.get("health_score"),
            "vegetarian": bool(item.get("vegetarian", False)),
            "vegan": bool(item.get("vegan", False)),
        })
```

- [ ] **Step 4: Add the `vegan` param + filter to `/recommend`**

In `ingest/api.py`, add the param to the `recommend(...)` signature right after the existing `vegetarian` line (~148):

```python
    vegetarian: bool = Query(False),
    vegan: bool = Query(False),
):
```

Then add the filter right after the existing vegetarian filter block (~163-164):

```python
    if vegetarian:
        items = [it for it in items if it.get("vegetarian")]

    if vegan:
        items = [it for it in items if it.get("vegan")]
```

- [ ] **Step 5: Add the `vegan` param + filter to `/optimize_meal`**

In `ingest/api.py`, add the param to the `optimize_meal(...)` signature right after the existing `vegetarian` line (~220):

```python
    vegetarian: bool = Query(False),
    vegan: bool = Query(False),
):
```

Then extend the inner `_optimize` helper (~238) to filter vegan too:

```python
    def _optimize(items):
        if vegetarian:
            items = [it for it in items if it.get("vegetarian")]
        if vegan:
            items = [it for it in items if it.get("vegan")]
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

Run: `cd ingest && python -m pytest test_api.py -k "vegan" -v`
Expected: PASS (all vegan tests — the 3 endpoint tests + the tripwire + Task 1's 2 invariants matched by `-k vegan`).

- [ ] **Step 7: Verify import + full suite**

Run: `cd ingest && python -c "import api" && python -m pytest -q`
Expected: import succeeds; entire suite green.

- [ ] **Step 8: Commit**

```bash
git add ingest/api.py ingest/recommend_items.py ingest/test_api.py
git commit -m "feat: vegan query param on /recommend and /optimize_meal

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Frontend Diet selector + strictest-diet badge

**Files:**
- Modify: `fast-food-ui/src/App.jsx` (state ~225; auto-fetch effect dep array ~307; `/recommend` fetch URL ~437; `/optimize_meal` fetch URL ~460; `FilterChips` toggle ~646-654; item row badge ~766; modal badge ~1134)
- Modify: `fast-food-ui/src/App.css` (remove dead `.vegToggle` rules ~1034-1045; keep `.vegBadge`)

**Interfaces:**
- Consumes: `vegetarian` / `vegan` query params (Task 2) and the `vegetarian` + `vegan` fields on humanized items (Task 2).
- Produces: user-facing mutually-exclusive Diet filter + strictest-diet badge. No downstream consumers.

- [ ] **Step 1: Replace the `vegetarian` state with a `diet` state**

In `App.jsx`, change the state line (~225) from:

```jsx
  const [vegetarian, setVegetarian]   = useState(false);
```

to:

```jsx
  const [diet, setDiet]               = useState("none"); // "none" | "vegetarian" | "vegan"
```

- [ ] **Step 2: Update the Browse auto-fetch dependency array**

In `App.jsx` the effect dep array (~307) currently ends `..., category, vegetarian]);`. Change `vegetarian` to `diet`:

```jsx
  }, [activeTab, goal, restaurant, maxCalories, category, diet]);
```

- [ ] **Step 3: Update both fetch URLs to send the selected diet**

In the `/recommend` fetch (~437), replace the `if (vegetarian) ...` line with:

```jsx
      if (category) url += `&category=${encodeURIComponent(category)}`;
      if (diet === "vegetarian") url += `&vegetarian=true`;
      else if (diet === "vegan") url += `&vegan=true`;
```

In the `/optimize_meal` fetch (~460), replace the `if (vegetarian) ...` line with:

```jsx
      if (diet === "vegetarian") url += `&vegetarian=true`;
      else if (diet === "vegan") url += `&vegan=true`;
```

(Both URLs are already declared `let`, so the appends compile.)

- [ ] **Step 4: Replace the checkbox toggle with a Diet `<select>` in `FilterChips`**

In `App.jsx`, replace the entire `<label className="vegToggle">…</label>` block (~646-654) with:

```jsx
        <select className="chipSelect" aria-label="Diet" value={diet} onChange={(e) => setDiet(e.target.value)}>
          <option value="none">Any diet</option>
          <option value="vegetarian">🌱 Vegetarian</option>
          <option value="vegan">🥬 Vegan</option>
        </select>
```

- [ ] **Step 5: Update the badge in the item row (strictest diet)**

In the Browse item row (~764-767), replace the name line so vegan shows 🥬, vegetarian-only shows 🌱:

```jsx
                      <div className="itemName">
                        {item.title || item.name}
                        {item.vegan
                          ? <span className="vegBadge" title="Vegan" aria-label="Vegan">🥬</span>
                          : item.vegetarian
                          ? <span className="vegBadge" title="Vegetarian" aria-label="Vegetarian">🌱</span>
                          : null}
                      </div>
```

- [ ] **Step 6: Update the badge in the modal header (strictest diet)**

In the modal header (~1132-1135), replace the title line:

```jsx
                <h2 className="modalItemName" id="modalItemName">
                  {modalItem.title || modalItem.name}
                  {modalItem.vegan
                    ? <span className="vegBadge" title="Vegan" aria-label="Vegan">🥬</span>
                    : modalItem.vegetarian
                    ? <span className="vegBadge" title="Vegetarian" aria-label="Vegetarian">🌱</span>
                    : null}
                </h2>
```

- [ ] **Step 7: Remove the now-dead `.vegToggle` CSS**

In `fast-food-ui/src/App.css`, delete the `.vegToggle` and `.vegToggle input` rules (~1034-1045). Keep `.vegBadge` (reused by both badges):

```css
.vegBadge {
  margin-left: 0.4rem;
  font-size: 0.9em;
}
```

- [ ] **Step 8: Validate the frontend**

Run: `cd fast-food-ui && npm run lint && npm run build`
Expected: lint clean (no unused `vegetarian`/`setVegetarian` references remain), build succeeds.

- [ ] **Step 9: Manual smoke check**

Start backend (`cd ingest && python -m uvicorn api:app --reload`) and frontend (`cd fast-food-ui && npm run dev`). In Browse, set Diet → Vegan: dairy/egg items disappear, vegan items show 🥬, vegetarian-only items show 🌱. Set Diet → Vegetarian: 🌱 + 🥬 items both show. Switch to Optimize, run with Diet → Vegan: every returned meal item is vegan (or the no-meal message appears for restaurants with no vegan entree). Open an item modal — badge matches.

- [ ] **Step 10: Commit**

```bash
git add fast-food-ui/src/App.jsx fast-food-ui/src/App.css
git commit -m "feat: mutually-exclusive Diet selector (vegan) and strictest-diet badge

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** Rename + vegan derivation (heuristic, narrow default categories, override table, subset invariant structural gate, review gate) → Task 1. Backend additive `vegan` param on both endpoints + humanize passthrough → Task 2. Frontend mutually-exclusive Diet `<select>` (Any/Vegetarian/Vegan) + strictest-diet badge + dead-CSS cleanup → Task 3. Tests: vegan field invariant + subset invariant (Task 1); recommend excludes non-vegan / off-by-default / optimizer all-vegan / dairy tripwire (Task 2). All spec sections covered.
- **Type consistency:** `vegan` is a Python `bool` end-to-end (JSON bool → `item.get("vegan")` → `bool(...)` in `humanize_items` → JS truthy check). Query param is FastAPI `bool` (`?vegan=true`). `diet` is a JS string `"none" | "vegetarian" | "vegan"` mapped to at most one query param. `_has_vegan_signal` / `_is_vegan` names match Task 1 usage.
- **No placeholders:** `VEGAN_OVERRIDES` starts empty by design and is populated during the Task 1 Step 8 review gate (reviewed data, not a code placeholder), exactly like the vegetarian `OVERRIDES` table.
- **Backwards compatibility:** the `vegetarian` param and field are untouched; `vegan` is purely additive. Existing vegetarian tests (incl. the meat tripwire) remain and must stay green.
