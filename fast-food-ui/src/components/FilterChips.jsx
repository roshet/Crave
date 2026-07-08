// Shared filter bar used by both the Browse and Optimize tabs. Extracted from App so it has a
// stable component identity (defining it inside App() remounted the whole subtree — and its
// <select> state — on every render). All state lives in App and is passed in via `filters`.
import { MACRO_FIELDS } from "../helpers";

export default function FilterChips({ filters, showCategory }) {
  const {
    goal, setGoal, restaurant, setRestaurant, maxCalories, setMaxCalories,
    category, setCategory, diet, setDiet, macros, setMacro,
    showMoreFilters, setShowMoreFilters, currentCategories, activeMacroCount,
  } = filters;

  return (
    <>
    <div className="filterChips">
      <select className="chipSelect" aria-label="Restaurant" value={restaurant} onChange={(e) => { setRestaurant(e.target.value); setCategory(""); }}>
        <option value="mcdonalds">McDonald&#39;s</option>
        <option value="chickfila">Chick-fil-A</option>
        <option value="wendys">Wendy&#39;s</option>
        <option value="tacobell">Taco Bell</option>
        <option value="burgerking">Burger King</option>
        <option value="all">All</option>
      </select>
      <select className="chipSelect" aria-label="Nutrition goal" value={goal} onChange={(e) => setGoal(e.target.value)}>
        <option value="balanced">Balanced</option>
        <option value="high_protein">High Protein</option>
        <option value="low_sugar">Low Sugar</option>
        <option value="low_fat">Low Fat</option>
      </select>
      <select className="chipSelect" aria-label="Maximum calories" value={maxCalories} onChange={(e) => setMaxCalories(Number(e.target.value))}>
        <option value={300}>300 cal</option>
        <option value={400}>400 cal</option>
        <option value={500}>500 cal</option>
        <option value={600}>600 cal</option>
        <option value={800}>800 cal</option>
        <option value={1000}>1000 cal</option>
      </select>
      {showCategory && restaurant !== "all" && (
        <select className="chipSelect" aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {currentCategories.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      )}
      <select className="chipSelect" aria-label="Diet" value={diet} onChange={(e) => setDiet(e.target.value)}>
        <option value="none">Any diet</option>
        <option value="vegetarian">🌱 Vegetarian</option>
        <option value="vegan">🥬 Vegan</option>
      </select>
    </div>

    <button
      type="button"
      className="moreFiltersToggle"
      aria-expanded={showMoreFilters}
      onClick={() => setShowMoreFilters((v) => !v)}
    >
      {showMoreFilters ? "⊖" : "⊕"} More filters
      {!showMoreFilters && activeMacroCount > 0 ? ` (${activeMacroCount})` : ""}
    </button>
    {showMoreFilters && (
      <div className="moreFiltersPanel">
        <div className="targetInputs">
          {MACRO_FIELDS.map((m) => (
            <label key={m.key} className="targetInput">
              <span className="targetInputLabel">{m.label} ({m.unit})</span>
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                placeholder="—"
                aria-label={`${m.label} in ${m.unit}`}
                value={macros[m.key]}
                onChange={(e) => setMacro(m.key, e.target.value)}
              />
            </label>
          ))}
        </div>
      </div>
    )}
    </>
  );
}
