# Crave Restaurant Expansion: Taco Bell — Design Spec

**Date:** 2026-05-29
**Scope:** Adds Taco Bell as a fourth restaurant — backend data file, scoring/optimizer wiring, and frontend filter
**Prior spec:** `2026-05-28-crave-ui-redesign-design.md` (named "Restaurant data expansion" as the next project)

---

## Context

Crave currently covers three restaurants — McDonald's, Chick-fil-A, Wendy's — all of which lean burger/chicken. Adding Taco Bell fills the Mexican-style gap and gives the optimizer a meaningfully different macro profile: different protein sources (beef, beans), more carb/fat variance (tortillas, cheese sauce), and a distinct drink lineup (Baja Blast). It also exercises the existing per-restaurant category-mapping pattern with a clearly different menu structure than the existing three.

This work is **deferred for execution** while another Claude instance is making backend fixes in `ingest/api.py` and `ingest/recommend_items.py`. Implementation will run in a **git worktree** to avoid merge conflicts and merge back once the other instance's changes land on `main`.

---

## Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Restaurant | Taco Bell | Fills Mexican-style gap; distinct macro profile from existing 3 |
| Menu scope | Full menu (~60–90 items) | Regular menu + breakfast + value/cravings + sides + drinks. More variety for the optimizer. |
| Data source | User-provided | Most accurate; avoids stale-training-data risk |
| Isolation | Git worktree + branch | Avoids conflict with the parallel backend work in `ingest/` |

---

## Data Schema

Each item must match the existing JSON schema used by McDonald's, Chick-fil-A, and Wendy's:

```json
{
  "item_id": 600001,
  "name": "Crunchwrap Supreme",
  "restaurant": "tacobell",
  "category": "specialties",
  "item_type": "food",
  "calories": 530.0,
  "protein": 16.0,
  "fat": 21.0,
  "carbohydrate": 71.0,
  "sugars": 6.0,
  "sodium": 1210.0
}
```

Field notes:
- `item_id`: use `600000+` sequential to avoid colliding with McD/CFA/Wendy's ID ranges
- `restaurant`: always `"tacobell"`
- `item_type`: `"food"` | `"drink"` | `"sauce"`. Sauces are filtered out by the scoring engine (`recommend_items.py:175`)
- `sodium`: may be `null` if unknown — `recommend_items.py` already handles missing sodium gracefully

---

## Category Mapping

Each restaurant ships its own category strings; `recommend_items.py:218-223` declares which categories count as entrees vs. sides. Taco Bell categories:

| Class | Categories |
|-------|------------|
| Entree | `tacos`, `burritos`, `quesadillas`, `nachos`, `specialties`, `breakfast` |
| Side | `sides`, `sweets` |
| Drink | Any item with `item_type == "drink"` (already handled by existing detection) |
| Sauce | Any item with `item_type == "sauce"` (filtered out before scoring) |

`breakfast` is already in the existing `entree_categories` set, so Taco Bell breakfast items reuse it directly.

---

## Files to Change

1. **NEW** `ingest/tacobell_items.json` — the dataset, provided by the user
2. **`ingest/api.py`** — load the JSON, add `tacobell` to the three query regex patterns, add a `tacobell` branch to each dispatch block, append to `ALL_ITEMS`
3. **`ingest/recommend_items.py`** — extend `entree_categories` with `tacos`, `burritos`, `quesadillas`, `nachos`, `specialties`; extend `side_categories` with `sweets`
4. **`fast-food-ui/src/App.jsx`** — add `tacobell` to the restaurant filter pill/dropdown (highest conflict risk vs. parallel UI work — covered by the worktree)

---

## Workflow

1. Wait for the other Claude instance's backend changes to land on `main`
2. From up-to-date `main`: `git worktree add ../Crave-tacobell -b add-tacobell`
3. In the worktree: drop the user-provided JSON into `ingest/tacobell_items.json`, apply the wiring edits above
4. Run the validation steps below
5. Merge `add-tacobell` back to `main`, then `git worktree remove ../Crave-tacobell`

---

## Verification

Run from inside the worktree before merging:

```powershell
# Backend imports cleanly
cd ingest; python -c "import api"

# Backend serves the new restaurant — start the server, then in another shell:
python -m uvicorn api:app --reload
#   GET /categories?restaurant=tacobell   → returns Taco Bell's category list
#   GET /recommend?restaurant=tacobell&goal=high_protein   → returns scored Taco Bell items
#   GET /optimize_meal?restaurant=tacobell&goal=balanced   → returns a meal with entree + side + drink

# Frontend lint + build
cd ../fast-food-ui; npm run lint; npm run build

# Manual smoke test
npm run dev
# In browser: select Taco Bell in the restaurant filter on Browse and Optimize tabs.
# Verify items appear, modal opens with correct nutrition, Meal Builder accepts a Taco Bell item.
```

**Success criteria:** all four restaurants selectable in the UI, `/optimize_meal?restaurant=tacobell` returns three valid meals for every goal (`balanced`, `high_protein`, `low_sugar`, `low_fat`), no lint or build errors.
