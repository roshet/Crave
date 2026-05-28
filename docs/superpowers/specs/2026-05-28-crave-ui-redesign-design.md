# Crave UI Redesign — Design Spec

**Date:** 2026-05-28
**Scope:** Frontend only (`fast-food-ui/`) — no backend changes required
**Next project:** Restaurant data expansion (separate spec)

---

## Context

The current Crave UI is a single long scrolling page with a controls block at the top, a meal builder section, and results below. It works but feels like a prototype — cluttered, with mixed responsibilities on one screen. This redesign gives each concern its own space, applies a premium editorial style inspired by top food and nutrition apps (NYT Cooking, MyFitnessPal, DoorDash), and makes the app feel like a real consumer product.

---

## Navigation Structure

Three tabs replacing the current single-page layout:

| Tab | Purpose |
|-----|---------|
| **Browse** | Discover and filter items, tap to see details, add to meal |
| **Meal Builder** | Track your selected items, view macro totals, export |
| **Optimize** | Auto-build the best meal for a goal with one button |

Tab state is managed in React (`activeTab` state, values: `"browse" | "meal" | "optimize"`). All three tabs share the same `meal` state array so adding from Browse instantly appears in Meal Builder.

---

## Visual Style

- **Background:** `#fafaf9` (warm off-white)
- **Card background:** `#ffffff` with `1px solid #e7e5e4` border
- **Primary text:** `#1c1917` (near-black warm)
- **Secondary text:** `#78716c`
- **Accent / score:** `#6366f1` (indigo)
- **Typography:** System UI, bold weights (700/800/900) for hierarchy
- **Border radius:** 12px cards, 10px inputs, 999px chips
- **Item thumbnails:** 44×44px colored gradient squares with emoji — no real photos needed

Nutrient color coding used consistently across the app:
- Calories → indigo `#6366f1`
- Protein → green `#22c55e`
- Sugar → amber `#f59e0b`
- Fat → red `#ef4444`
- Carbs → indigo `#6366f1`
- Sodium → slate `#64748b`

---

## Tab 1 — Browse

### Layout (top to bottom)
1. **App header** — "Crave" wordmark + tagline
2. **Tab bar** — Browse / Meal Builder / Optimize
3. **Filter chips** — pill-shaped, tappable. Active chip is filled `#1c1917`, inactive chips are outlined. Chips: Restaurant, Goal, Max Calories, Category
4. **Search bar** — single text input with 🔍 icon
5. **Item list** — scrollable, one item per row

### Filter chips behavior
Each chip is a native `<select>` element styled as a pill — the `▾` arrow is CSS, the click behavior is the browser's native select. This avoids building a custom dropdown. When `restaurant` changes, category resets to "All". Browse shows 4 chips (Restaurant, Goal, Max Calories, Category); Optimize shows 3 (Restaurant, Goal, Max Calories — no Category chip).

### Item list row
Each row contains:
- **Colored thumbnail** (44×44, rounded 10px) — gradient background + food emoji. Color scheme by category: burgers=blue, chicken=amber, salads=green, breakfast=orange, sides=purple, drinks=cyan
- **Name** (bold, 0.8rem)
- **Key stats** (0.65rem muted): `{calories} kcal · {protein}g protein · {sugar}g sugar`
- **Nutrition tags** (colored pill badges): generated from `explain_item()` output — e.g. "high protein" (green), "low sugar" (blue), "high fat" (red)
- **Score** (right-aligned, 1rem bold indigo)

Tapping anywhere on a row opens the Item Detail Modal.

### What Browse does NOT show
- No macro rings (those live in Meal Builder)
- No "Add" button on the row itself (that's in the modal)
- No meal totals

---

## Item Detail Modal

Triggered by tapping any item row. Implemented as a bottom-sheet style overlay (slides up from bottom, backdrop dims the list).

### Modal contents (top to bottom)
1. **Drag handle** — 44×4px pill at top center
2. **Item header** — large thumbnail (64×64) + name + restaurant/category + score badge
3. **Nutrition grid** — 3×2 grid of stat tiles (calories, protein, sugar, fat, carbs, sodium). Each tile shows the value in its nutrient color
4. **Summary badge** — green info bar showing the `explain_item()` reason string (e.g. "✓ High protein · Low sugar · Optimized for high protein goal")
5. **Add to Meal button** — full-width dark button. If item is already in meal, button shows "✓ Added" (muted, not re-clickable). Tapping adds item to `meal` state and closes modal.

Close behavior: tap the dimmed backdrop or press Escape. The drag handle is decorative only (visual affordance, no gesture handling needed).

---

## Tab 2 — Meal Builder

### Layout (top to bottom)
1. **Tab bar**
2. **Macro rings row** — 4 rings in a card: calories (indigo), protein (green), sugar (amber), fat (red). Values reflect live `mealTotals`. Empty state shows zeroes with muted borders.
3. **Goal status badges** — conditional, same logic as current app (✓ Meets High Protein Target, ✗ Exceeds 20g Limit, etc.)
4. **Item list** — each item shows thumbnail + name + ✕ remove button
5. **Empty state** — "Add items from Browse to build your meal." when `meal.length === 0`
6. **Action row** — "Copy Summary" button (dark) + "Clear" button (outlined). Only shown when `meal.length > 0`.

### Alternative meals section
If the meal was populated via Optimize, the alternative meals (options 2 and 3) appear below the main meal as collapsible cards showing deltas vs. the current meal, with a "Select This Meal" button.

---

## Tab 3 — Optimize

### Layout (top to bottom)
1. **Tab bar**
2. **Filter chips** — Restaurant, Goal, Max Calories (same chip style as Browse, shared state)
3. **Quick Presets** — 2×2 grid of preset buttons: Weight Loss (balanced/500cal), Athlete (high_protein/800cal), Low Carb (low_sugar/600cal), Light Meal (low_fat/400cal). Active preset is filled dark.
4. **Build Optimal Meal button** — full-width indigo gradient, "⚡ Build Optimal Meal"
5. **Results** — top 3 meal options returned by `/optimize_meal`, each as a card showing: rank + score, item names, total calories, goal status. "Send to Meal Builder →" button on each card populates `meal` state and switches to Meal Builder tab.

---

## State Architecture

All state stays in `App`. No new libraries needed.

```
activeTab: "browse" | "meal" | "optimize"
goal, restaurant, maxCalories, category     — shared across Browse + Optimize
results                                      — Browse item list
loading, error, hasSearched                 — fetch status
meal[]                                       — shared across all tabs
alternativeMeals[]                           — from /optimize_meal
modalItem                                    — currently open item (null = closed)
copySuccess                                  — clipboard feedback flag
```

---

## Files to Change

| File | What changes |
|------|-------------|
| `fast-food-ui/src/App.jsx` | Full rewrite — new tab structure, modal component, new layout per tab |
| `fast-food-ui/src/App.css` | Full rewrite — new design system, modal styles, tab bar, chips, rings |

No backend changes. No new dependencies.

---

## Emoji → Category Mapping

Used to assign colored thumbnails without real photos:

```js
const CATEGORY_EMOJI = {
  burgers: { emoji: "🍔", gradient: ["#dbeafe", "#3b82f6"] },
  chicken: { emoji: "🍗", gradient: ["#fde68a", "#f59e0b"] },
  chicken_fish: { emoji: "🐟", gradient: ["#cffafe", "#06b6d4"] },
  nuggets_strips: { emoji: "🍗", gradient: ["#fde68a", "#f59e0b"] },
  salads: { emoji: "🥗", gradient: ["#bbf7d0", "#16a34a"] },
  breakfast: { emoji: "🥞", gradient: ["#fed7aa", "#f97316"] },
  fries_sides: { emoji: "🍟", gradient: ["#fef08a", "#eab308"] },
  sides: { emoji: "🥙", gradient: ["#e9d5ff", "#a855f7"] },
  desserts: { emoji: "🍦", gradient: ["#fce7f3", "#ec4899"] },
  beverages: { emoji: "🥤", gradient: ["#cffafe", "#06b6d4"] },
  drinks: { emoji: "🥤", gradient: ["#cffafe", "#06b6d4"] },
  mccafe_coffees: { emoji: "☕", gradient: ["#d6d3d1", "#78716c"] },
  entrees: { emoji: "🍱", gradient: ["#bbf7d0", "#16a34a"] },
  wraps: { emoji: "🌯", gradient: ["#fef9c3", "#ca8a04"] },
  snack_wraps: { emoji: "🌯", gradient: ["#fef9c3", "#ca8a04"] },
  kid_s_meals: { emoji: "🎉", gradient: ["#fce7f3", "#ec4899"] },
};
// Fallback for unmapped categories:
const DEFAULT_EMOJI = { emoji: "🍽️", gradient: ["#f1f5f9", "#94a3b8"] };
```

---

## Verification

1. `npm run lint && npm run build` — must pass clean
2. **Browse tab:** filter chips update results, search filters inline, tapping a row opens modal, "Add to Meal" adds item and closes modal, item shows as "✓ Added" if already in meal
3. **Meal Builder tab:** macro rings update as items added/removed, goal badges appear correctly, Copy Summary works, Clear empties meal
4. **Optimize tab:** presets fill goal+calories, Build button calls `/optimize_meal`, result appears, "Send to Meal Builder" switches to Meal Builder tab with meal populated
5. **Cross-tab:** meal state is shared — items added via Browse appear in Meal Builder; items sent from Optimize appear in Meal Builder
6. **Dark mode:** all new elements must have dark mode overrides in CSS
7. **Mobile:** tabs scroll horizontally if needed, modal is full-width bottom sheet, filter chips wrap
