# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (FastAPI)
```bash
cd ingest
pip install -r requirements.txt
python -m uvicorn api:app --reload
# Runs at http://127.0.0.1:8000
```

### Frontend (React/Vite)
```bash
cd fast-food-ui
npm install
npm run dev      # http://localhost:5173
npm run build
npm run lint
npm run preview
```

### Environment
Create `fast-food-ui/.env` for local development:
```
VITE_API_BASE_URL=http://127.0.0.1:8000
```

## Architecture

Two-part full-stack app with separate hosting (Vercel + Render):

```
Crave/
├── fast-food-ui/       # React 19 + Vite frontend (single-file App.jsx)
├── ingest/             # FastAPI backend + scoring logic + JSON datasets
│   ├── api.py          # FastAPI routes and data loading
│   ├── recommend_items.py  # Scoring engine and meal optimizer
│   ├── mcdonalds_items.json
│   ├── chickfila_items.json
│   ├── wendys_items.json
│   ├── tacobell_items.json
│   └── burgerking_items.json
└── render.yaml         # Render.com deployment config
```

### Data Flow
1. JSON datasets are loaded at startup in `api.py` into `mcdonalds_items`, `chickfila_items`, `wendys_items`, `tacobell_items`, `burgerking_items`, and `ALL_ITEMS`
2. `/recommend` scores individual items via `health_score()` and filters/sorts them
3. `/optimize_meal` brute-forces entree × side × drink combinations (top 3 returned)
4. Frontend calls these endpoints and renders results + a Meal Builder with live nutrition totals

### Scoring System (`recommend_items.py`)
- `GOAL_PROFILES` defines per-nutrient weights for each goal (balanced, high_protein, low_sugar, low_fat)
- `health_score()` computes: `protein_score - sugar_penalty - fat_penalty - carb_penalty - sodium_penalty - calorie_penalty`, each clamped to [0,1]
- `GOAL_CONSTRAINTS` enforces hard minimums/maximums (e.g., `high_protein` requires ≥35g protein per meal)
- `build_optimal_meal()` categorizes items into entrees/sides/drinks using hardcoded category sets and brute-forces combinations under calorie cap

### Category Naming
Each restaurant uses different category strings in the JSON data. The backend maps these via hardcoded sets in `build_optimal_meal()`:
- Entree categories: `{"burgers", "entrees", "salads", "nuggets_strips", "breakfast", "chicken", "chicken_fish", "wraps", "snack_wraps", "kid_s_meals", "catering_entrees"}`
- Side categories: `{"fries_sides", "sides", "desserts"}`
- Drink detection: `item_type == "drink"` OR category in `{"beverages", "drinks", "mccafe_coffees"}`

### Frontend (`fast-food-ui/src/App.jsx`)
Single-component React app with three tabs (Browse / Meal Builder / Optimize). All state lives in `App`. Key state:
- `activeTab` — controls which tab is visible (`"browse"` | `"meal"` | `"optimize"`)
- `results` — raw `/recommend` response items (auto-fetched when Browse tab is active or filters change)
- `meal` — user-built meal items (added from Browse modal or sent from Optimize)
- `alternativeMeals` — the non-chosen Optimize results, shown in Meal Builder with nutrition deltas
- `optimizedMealResults` — all 3 results from `/optimize_meal`; user picks one to send to Meal Builder
- `modalItem` — item currently shown in the bottom-sheet detail modal (null = closed)

Shared filter state (`goal`, `restaurant`, `maxCalories`, `category`) is used by both Browse and Optimize tabs.

The `humanize_items()` backend function normalizes field names (`carbohydrate`/`carbs` inconsistency) so the frontend always receives `carbs`.

### Deployment
- Backend: `CORS_ORIGINS` env var controls allowed origins (comma-separated)
- Frontend: `VITE_API_BASE_URL` env var controls backend URL
- Production: Vercel (frontend) + Render (backend, `render.yaml` config)

## Workflow

### Spec-driven development
Before implementing any of the following, write and commit a spec to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` first:
- New features or new data sources (e.g., adding a restaurant, adding an endpoint)
- Cross-cutting changes touching both backend and frontend
- Anything where you'd need to choose between 2+ approaches

Spec-first is NOT required for: bug fixes, single-file refactors, dependency bumps, copy/style tweaks. When in doubt, ask the user.

## Validation

Run these checks before claiming any work is complete. Do not report success until all commands pass without errors.

### Frontend (after any changes to `fast-food-ui/`)
```bash
cd fast-food-ui && npm run lint && npm run build
```

### Backend (after any changes to `ingest/`)
```bash
cd ingest && python -c "import api"
```

If either command fails, fix the errors and re-run before proceeding.
