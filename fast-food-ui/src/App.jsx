import { useMemo, useState, useEffect } from "react";
import "./App.css";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

const CATEGORY_EMOJI = {
  burgers:        { emoji: "🍔", gradient: ["#dbeafe", "#3b82f6"] },
  chicken:        { emoji: "🍗", gradient: ["#fde68a", "#f59e0b"] },
  chicken_fish:   { emoji: "🍗", gradient: ["#fde68a", "#f59e0b"] },
  nuggets_strips: { emoji: "🍗", gradient: ["#fde68a", "#f59e0b"] },
  salads:         { emoji: "🥗", gradient: ["#bbf7d0", "#16a34a"] },
  breakfast:      { emoji: "🥞", gradient: ["#fed7aa", "#f97316"] },
  fries_sides:    { emoji: "🍟", gradient: ["#fef08a", "#eab308"] },
  sides:          { emoji: "🥙", gradient: ["#e9d5ff", "#a855f7"] },
  desserts:       { emoji: "🍦", gradient: ["#fce7f3", "#ec4899"] },
  beverages:      { emoji: "🥤", gradient: ["#cffafe", "#06b6d4"] },
  drinks:         { emoji: "🥤", gradient: ["#cffafe", "#06b6d4"] },
  mccafe_coffees: { emoji: "☕", gradient: ["#d6d3d1", "#78716c"] },
  entrees:        { emoji: "🍗", gradient: ["#fde68a", "#f59e0b"] },
  proteins:       { emoji: "🍗", gradient: ["#fde68a", "#f59e0b"] },
  wraps:          { emoji: "🌯", gradient: ["#fef9c3", "#ca8a04"] },
  snack_wraps:    { emoji: "🌯", gradient: ["#fef9c3", "#ca8a04"] },
  kid_s_meals:    { emoji: "🎉", gradient: ["#fce7f3", "#ec4899"] },
};
const DEFAULT_EMOJI = { emoji: "🍽️", gradient: ["#f1f5f9", "#94a3b8"] };

const NAME_EMOJI_OVERRIDES = [
  { test: /fish/i,    result: { emoji: "🐟", gradient: ["#cffafe", "#06b6d4"] } },
  { test: /\bbun\b/i, result: { emoji: "🍞", gradient: ["#fef3c7", "#d97706"] } },
];

// Theoretical min/max of health_score per goal — derived from GOAL_PROFILES weights
// in recommend_items.py. Used to map raw scores onto a friendly 0–100 scale.
const SCORE_RANGES = {
  balanced:     { min: -4.8, max: 1.2 },
  high_protein: { min: -4.0, max: 2.0 },
  low_sugar:    { min: -5.4, max: 1.0 },
  low_fat:      { min: -5.4, max: 1.0 },
};

function normalizeScore(rawScore, goal, itemCount = 1) {
  const r = SCORE_RANGES[goal] || SCORE_RANGES.balanced;
  const minTotal = r.min * itemCount;
  const maxTotal = r.max * itemCount;
  const pct = ((Number(rawScore ?? 0) - minTotal) / (maxTotal - minTotal)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

const MCD_CATEGORIES = [
  { value: "burgers",        label: "Burgers" },
  { value: "breakfast",      label: "Breakfast" },
  { value: "nuggets_strips", label: "Nuggets & Strips" },
  { value: "chicken_fish",   label: "Chicken & Fish" },
  { value: "snack_wraps",    label: "Snack Wraps" },
  { value: "fries_sides",    label: "Fries & Sides" },
  { value: "desserts",       label: "Desserts" },
  { value: "beverages",      label: "Beverages" },
  { value: "mccafe_coffees", label: "McCafe Coffees" },
];

const CHICKFILA_CATEGORIES = [
  { value: "breakfast",   label: "Breakfast" },
  { value: "entrees",     label: "Entrees" },
  { value: "salads",      label: "Salads" },
  { value: "sides",       label: "Sides" },
  { value: "drinks",      label: "Drinks" },
  { value: "kid_s_meals", label: "Kid's Meals" },
];

const WENDYS_CATEGORIES = [
  { value: "burgers", label: "Burgers" },
  { value: "chicken", label: "Chicken" },
  { value: "wraps",   label: "Wraps" },
  { value: "salads",  label: "Salads" },
  { value: "sides",   label: "Sides" },
];

const GOAL_PRESETS = [
  { label: "Weight Loss", goal: "balanced",     maxCalories: 500 },
  { label: "Athlete",     goal: "high_protein", maxCalories: 800 },
  { label: "Low Carb",    goal: "low_sugar",    maxCalories: 600 },
  { label: "Light Meal",  goal: "low_fat",      maxCalories: 400 },
];

function getThumbnail(item) {
  const name = item.title || item.name || "";
  for (const o of NAME_EMOJI_OVERRIDES) {
    if (o.test.test(name)) return o.result;
  }
  return CATEGORY_EMOJI[(item.category || "").toLowerCase()] || DEFAULT_EMOJI;
}

function getItemKey(item) {
  return item.item_id ?? item.id ?? `${item.restaurant}-${item.category}-${item.title || item.name}`;
}

function getItemTags(item) {
  const tags = [];
  if (Number(item.protein  ?? 0) >= 20) tags.push({ label: "high protein", type: "protein" });
  if (Number(item.sugars   ?? 0) <= 5)  tags.push({ label: "low sugar",    type: "sugar-good" });
  if (Number(item.fat      ?? 0) >= 20) tags.push({ label: "high fat",     type: "fat" });
  else if (Number(item.fat ?? 0) <= 8)  tags.push({ label: "low fat",      type: "fat-good" });
  if (Number(item.calories ?? 0) <= 200) tags.push({ label: "low cal",     type: "cal" });
  return tags.slice(0, 3);
}

function formatDelta(n, unit = "") {
  const v = Number(n ?? 0);
  return `${v > 0 ? "+" : ""}${v.toFixed(0)}${unit}`;
}

function deltaStyle(delta, higherIsBetter) {
  const d = Number(delta ?? 0);
  if (higherIsBetter ? d > 0 : d < 0) return { color: "#047857", fontWeight: 700 };
  if (higherIsBetter ? d < 0 : d > 0) return { color: "#b91c1c", fontWeight: 700 };
  return { color: "#64748b", fontWeight: 600 };
}

function App() {
  // Shared filter state (Browse + Optimize)
  const [goal, setGoal]               = useState("balanced");
  const [restaurant, setRestaurant]   = useState("all");
  const [maxCalories, setMaxCalories] = useState(600);
  const [category, setCategory]       = useState("");

  // Navigation
  const [activeTab, setActiveTab] = useState("browse");

  // Theme — explicit toggle; defaults to system preference, persists to localStorage
  const [theme, setTheme] = useState(() => {
    const stored = typeof window !== "undefined" && window.localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") return stored;
    return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("theme", theme);
  }, [theme]);

  // Browse
  const [results, setResults]         = useState([]);
  const [search, setSearch]           = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  // Modal
  const [modalItem, setModalItem] = useState(null);

  // Meal
  const [meal, setMeal]                         = useState([]);
  const [alternativeMeals, setAlternativeMeals] = useState([]);
  const [copySuccess, setCopySuccess]           = useState(false);

  // Optimize
  const [optimizedMealResults, setOptimizedMealResults] = useState([]);
  const [optimizeLoading, setOptimizeLoading]           = useState(false);
  const [optimizeError, setOptimizeError]               = useState("");

  // Auto-fetch Browse when tab is active and filters change
  useEffect(() => {
    if (activeTab === "browse") fetchBrowse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, goal, restaurant, maxCalories, category]);

  // Escape closes modal
  useEffect(() => {
    if (!modalItem) return;
    const onKey = (e) => { if (e.key === "Escape") setModalItem(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modalItem]);

  function isInMeal(item) {
    const key = getItemKey(item);
    return meal.some((x) => getItemKey(x) === key);
  }

  function addToMeal(item) {
    const key = getItemKey(item);
    setMeal((prev) => prev.some((x) => getItemKey(x) === key) ? prev : [...prev, item]);
  }

  function removeFromMeal(item) {
    const key = getItemKey(item);
    setMeal((prev) => prev.filter((x) => getItemKey(x) !== key));
  }

  function clearMeal() {
    setMeal([]);
    setAlternativeMeals([]);
    setOptimizedMealResults([]);
  }

  function sendToMealBuilder(idx) {
    setMeal(optimizedMealResults[idx].items);
    setAlternativeMeals(optimizedMealResults.filter((_, j) => j !== idx));
    setActiveTab("meal");
  }

  const mealTotals = useMemo(() =>
    meal.reduce(
      (acc, item) => {
        acc.calories += Number(item.calories ?? 0);
        acc.protein  += Number(item.protein  ?? 0);
        acc.sugars   += Number(item.sugars   ?? 0);
        acc.fat      += Number(item.fat      ?? 0);
        acc.carbs    += Number(item.carbs    ?? 0);
        acc.sodium   += Number(item.sodium   ?? 0);
        return acc;
      },
      { calories: 0, protein: 0, sugars: 0, fat: 0, carbs: 0, sodium: 0 }
    ),
  [meal]);

  const alternativeMealsWithDeltas = useMemo(() => {
    const base = mealTotals;
    return alternativeMeals.map((m) => {
      const t = m.items.reduce(
        (acc, item) => {
          acc.calories += Number(item.calories ?? 0);
          acc.protein  += Number(item.protein  ?? 0);
          acc.sugars   += Number(item.sugars   ?? 0);
          acc.fat      += Number(item.fat      ?? 0);
          acc.sodium   += Number(item.sodium   ?? 0);
          return acc;
        },
        { calories: 0, protein: 0, sugars: 0, fat: 0, sodium: 0 }
      );
      return {
        ...m,
        totals: t,
        deltas: {
          calories: t.calories - base.calories,
          protein:  t.protein  - base.protein,
          sugars:   t.sugars   - base.sugars,
          fat:      t.fat      - base.fat,
          sodium:   t.sodium   - base.sodium,
        },
      };
    });
  }, [alternativeMeals, mealTotals]);

  const displayedResults = useMemo(() =>
    results.filter((item) => {
      if (!search.trim()) return true;
      return (item.title || item.name || "").toLowerCase().includes(search.trim().toLowerCase());
    }),
  [results, search]);

  async function fetchBrowse() {
    setHasSearched(true);
    setLoading(true);
    setError("");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      let url = `${API_BASE_URL}/recommend?restaurant=${encodeURIComponent(restaurant)}&goal=${encodeURIComponent(goal)}&max_calories=${encodeURIComponent(maxCalories)}&top_n=20&format=human`;
      if (category) url += `&category=${encodeURIComponent(category)}`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`API error (${res.status}): ${await res.text()}`);
      const data = await res.json();
      setResults(data.results || []);
    } catch (e) {
      setResults([]);
      setError(e.name === "AbortError" ? "Request timed out. Please try again." : e.message || "Something went wrong.");
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }

  async function optimizeMeal() {
    setOptimizeLoading(true);
    setOptimizeError("");
    setOptimizedMealResults([]);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const url = `${API_BASE_URL}/optimize_meal?restaurant=${encodeURIComponent(restaurant)}&goal=${encodeURIComponent(goal)}&max_calories=${encodeURIComponent(maxCalories)}&format=human`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`API error (${res.status}): ${await res.text()}`);
      const data = await res.json();
      if (!data?.meals?.length || !data.meals[0]?.items) {
        setOptimizeError(data.message || "No meal found.");
        return;
      }
      setOptimizedMealResults(data.meals);
    } catch (e) {
      setOptimizeError(e.name === "AbortError" ? "Request timed out. Please try again." : e.message || "Something went wrong.");
    } finally {
      clearTimeout(timer);
      setOptimizeLoading(false);
    }
  }

  async function exportMeal() {
    const lines = [
      `Crave Meal Summary — ${goal.replace(/_/g, " ")} goal`,
      `Max calories: ${maxCalories}`,
      "",
      "Items:",
      ...meal.map((m) => `  • ${m.title || m.name} — ${m.calories} kcal, ${m.protein}g protein, ${m.fat}g fat`),
      "",
      `Totals: ${mealTotals.calories.toFixed(0)} kcal | ${mealTotals.protein.toFixed(0)}g protein | ${mealTotals.fat.toFixed(0)}g fat | ${mealTotals.sugars.toFixed(0)}g sugar`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }

  function getGoalBadges() {
    const badges = [];
    if (goal === "high_protein") {
      badges.push(mealTotals.protein >= 35
        ? { text: "✓ Meets High Protein Target", type: "success" }
        : { text: "✗ Below 35g Protein Target",  type: "failure" });
    }
    if (goal === "low_sugar") {
      badges.push(mealTotals.sugars <= 20
        ? { text: "✓ Within Low Sugar Target", type: "success" }
        : { text: "✗ Exceeds 20g Sugar Limit",  type: "failure" });
    }
    if (goal === "low_fat") {
      badges.push(mealTotals.fat <= 30
        ? { text: "✓ Within Low Fat Target", type: "success" }
        : { text: "✗ Exceeds 30g Fat Limit",  type: "failure" });
    }
    if (meal.length > 0) {
      badges.push(mealTotals.calories > maxCalories
        ? { text: `✗ Over limit by ${(mealTotals.calories - maxCalories).toFixed(0)} cal`, type: "failure" }
        : { text: `✓ Within ${maxCalories} cal limit`, type: "success" });
    }
    return badges;
  }

  function checkMealGoal(items) {
    const t = items.reduce(
      (acc, item) => {
        acc.calories += Number(item.calories ?? 0);
        acc.protein  += Number(item.protein  ?? 0);
        acc.sugars   += Number(item.sugars   ?? 0);
        acc.fat      += Number(item.fat      ?? 0);
        return acc;
      },
      { calories: 0, protein: 0, sugars: 0, fat: 0 }
    );
    const checks = [];
    if (goal === "high_protein") checks.push(t.protein >= 35 ? "✓ High Protein" : "✗ Low Protein");
    if (goal === "low_sugar")    checks.push(t.sugars  <= 20 ? "✓ Low Sugar"    : "✗ High Sugar");
    if (goal === "low_fat")      checks.push(t.fat     <= 30 ? "✓ Low Fat"      : "✗ High Fat");
    checks.push(t.calories <= maxCalories ? "✓ Within Calories" : "✗ Over Calories");
    return checks;
  }

  const currentCategories =
    restaurant === "mcdonalds" ? MCD_CATEGORIES :
    restaurant === "chickfila" ? CHICKFILA_CATEGORIES :
    restaurant === "wendys"    ? WENDYS_CATEGORIES : [];

  function FilterChips({ showCategory }) {
    return (
      <div className="filterChips">
        <select className="chipSelect" value={restaurant} onChange={(e) => { setRestaurant(e.target.value); setCategory(""); }}>
          <option value="mcdonalds">McDonald&#39;s</option>
          <option value="chickfila">Chick-fil-A</option>
          <option value="wendys">Wendy&#39;s</option>
          <option value="all">All</option>
        </select>
        <select className="chipSelect" value={goal} onChange={(e) => setGoal(e.target.value)}>
          <option value="balanced">Balanced</option>
          <option value="high_protein">High Protein</option>
          <option value="low_sugar">Low Sugar</option>
          <option value="low_fat">Low Fat</option>
        </select>
        <select className="chipSelect" value={maxCalories} onChange={(e) => setMaxCalories(Number(e.target.value))}>
          <option value={300}>300 cal</option>
          <option value={400}>400 cal</option>
          <option value={500}>500 cal</option>
          <option value={600}>600 cal</option>
          <option value={800}>800 cal</option>
          <option value={1000}>1000 cal</option>
        </select>
        {showCategory && restaurant !== "all" && (
          <select className="chipSelect" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {currentCategories.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        )}
      </div>
    );
  }

  function SkeletonRow() {
    return (
      <div className="itemRow skeletonRow">
        <div className="skeletonThumb" />
        <div className="skeletonInfo">
          <div className="skeletonText" style={{ width: "55%" }} />
          <div className="skeletonText" style={{ width: "40%" }} />
        </div>
      </div>
    );
  }

  return (
    <div className="page">

      {/* Header */}
      <header className="appHeader">
        <div>
          <h1 className="appWordmark">Crave</h1>
          <p className="appTagline">Smart fast-food nutrition</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {meal.length > 0 && (
            <button className="mealBadge" onClick={() => setActiveTab("meal")}>
              🍽️ {meal.length} item{meal.length !== 1 ? "s" : ""}
            </button>
          )}
          <button
            className="themeToggle"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <nav className="tabBar">
        {[
          { id: "browse",   label: "Browse" },
          { id: "meal",     label: meal.length > 0 ? `Meal Builder (${meal.length})` : "Meal Builder" },
          { id: "optimize", label: "Optimize" },
        ].map((tab) => (
          <button
            key={tab.id}
            className={`tabBtn${activeTab === tab.id ? " tabActive" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="tabContent">

        {/* ── BROWSE ── */}
        {activeTab === "browse" && (
          <div className="browseTab">
            <FilterChips showCategory={true} />
            <div className="searchBar">
              <span className="searchIcon">🔍</span>
              <input
                className="searchInput"
                type="text"
                placeholder="Search items..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {error && <p className="errorMsg">{error}</p>}
            <div className="itemList">
              {loading && [0,1,2,3,4].map((i) => <SkeletonRow key={i} />)}
              {!loading && hasSearched && displayedResults.length === 0 && !error && (
                <p className="emptyMsg">No items matched your criteria.</p>
              )}
              {!loading && displayedResults.map((item) => {
                const { emoji, gradient } = getThumbnail(item);
                const tags = getItemTags(item);
                return (
                  <div key={getItemKey(item)} className="itemRow" onClick={() => setModalItem(item)}>
                    <div
                      className="itemThumbnail"
                      style={{ background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})` }}
                    >
                      {emoji}
                    </div>
                    <div className="itemInfo">
                      <div className="itemName">{item.title || item.name}</div>
                      <div className="itemStats">
                        {item.calories} kcal · {item.protein}g protein · {item.sugars}g sugar
                      </div>
                      {tags.length > 0 && (
                        <div className="itemTags">
                          {tags.map((tag) => (
                            <span key={tag.label} className={`itemTag itemTag--${tag.type}`}>{tag.label}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="itemScore" title={`Health score for ${goal.replace(/_/g," ")} goal`}>
                      {normalizeScore(item.score, goal)}<span className="itemScoreUnit">/100</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── MEAL BUILDER ── */}
        {activeTab === "meal" && (
          <div className="mealTab">
            <div className="macroRingsCard">
              {[
                { label: "Calories", value: mealTotals.calories.toFixed(0), unit: "kcal", color: "#6366f1" },
                { label: "Protein",  value: mealTotals.protein.toFixed(0),  unit: "g",    color: "#22c55e" },
                { label: "Sugar",    value: mealTotals.sugars.toFixed(0),   unit: "g",    color: "#f59e0b" },
                { label: "Fat",      value: mealTotals.fat.toFixed(0),      unit: "g",    color: "#ef4444" },
              ].map((ring) => (
                <div key={ring.label} className="macroRing">
                  <div className="ringCircle" style={{ borderColor: meal.length > 0 ? ring.color : undefined }}>
                    <span className="ringValueNum" style={{ color: meal.length > 0 ? ring.color : undefined }}>{ring.value}</span>
                    <span className="ringValueUnit" style={{ color: meal.length > 0 ? ring.color : undefined }}>{ring.unit}</span>
                  </div>
                  <span className="ringLabel">{ring.label}</span>
                </div>
              ))}
            </div>

            {meal.length > 0 && (
              <div className="goalBadges">
                {getGoalBadges().map((b, i) => (
                  <span key={i} className={`goalBadge goalBadge--${b.type}`}>{b.text}</span>
                ))}
              </div>
            )}

            {meal.length === 0 ? (
              <div className="emptyState">
                <p>Add items from Browse to build your meal.</p>
              </div>
            ) : (
              <>
                <div className="mealList">
                  {meal.map((item) => {
                    const { emoji, gradient } = getThumbnail(item);
                    return (
                      <div key={getItemKey(item)} className="mealItem">
                        <div
                          className="itemThumbnail itemThumbnail--sm"
                          style={{ background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})` }}
                        >
                          {emoji}
                        </div>
                        <span className="mealItemName">{item.title || item.name}</span>
                        <button className="mealItemRemove" onClick={() => removeFromMeal(item)} aria-label="Remove">✕</button>
                      </div>
                    );
                  })}
                </div>

                <div className="actionRow">
                  <button className="btn btnDark" onClick={exportMeal}>
                    {copySuccess ? "✓ Copied!" : "Copy Summary"}
                  </button>
                  <button className="btn btnOutline" onClick={clearMeal}>Clear</button>
                </div>

                {alternativeMeals.length > 0 && (
                  <div className="altSection">
                    <h4 className="altSectionTitle">Alternative Meals</h4>
                    {alternativeMealsWithDeltas.map((mealOption, idx) => (
                      <div key={idx} className="altCard">
                        <p className="altCardItems">
                          {mealOption.items.map((m) => m.title || m.name).join(", ")}
                        </p>
                        <p className="altCardStats">
                          {mealOption.total_calories} kcal · Score: {normalizeScore(mealOption.total_score, goal, mealOption.items.length)}/100
                        </p>
                        <div className="deltaRow">
                          <strong>Δ vs current:</strong>{" "}
                          <span style={deltaStyle(mealOption.deltas.calories, false)}>Cal {formatDelta(mealOption.deltas.calories)}</span>
                          {" · "}
                          <span style={deltaStyle(mealOption.deltas.protein, true)}>Protein {formatDelta(mealOption.deltas.protein, "g")}</span>
                          {" · "}
                          <span style={deltaStyle(mealOption.deltas.sugars, false)}>Sugar {formatDelta(mealOption.deltas.sugars, "g")}</span>
                          {" · "}
                          <span style={deltaStyle(mealOption.deltas.fat, false)}>Fat {formatDelta(mealOption.deltas.fat, "g")}</span>
                        </div>
                        <button
                          className="btn btnOutline btnSm"
                          onClick={() => {
                            setMeal(mealOption.items);
                            setAlternativeMeals((prev) => prev.filter((_, j) => j !== idx));
                          }}
                        >
                          Select This Meal
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── OPTIMIZE ── */}
        {activeTab === "optimize" && (
          <div className="optimizeTab">
            <FilterChips showCategory={false} />

            <div className="presetGrid">
              {GOAL_PRESETS.map((p) => {
                const isActive = goal === p.goal && maxCalories === p.maxCalories;
                return (
                  <button
                    key={p.label}
                    className={`presetCard${isActive ? " presetCardActive" : ""}`}
                    onClick={() => { setGoal(p.goal); setMaxCalories(p.maxCalories); }}
                  >
                    <span className="presetCardLabel">{p.label}</span>
                    <span className="presetCardMeta">{p.goal.replace(/_/g, " ")} · {p.maxCalories} cal</span>
                  </button>
                );
              })}
            </div>

            <button className="buildBtn" onClick={optimizeMeal} disabled={optimizeLoading}>
              {optimizeLoading ? "Building..." : "⚡ Build Optimal Meal"}
            </button>

            {optimizeError && <p className="errorMsg">{optimizeError}</p>}

            {optimizedMealResults.length > 0 && (
              <div className="optimizeResults">
                {optimizedMealResults.map((result, idx) => (
                  <div key={idx} className="optimizeCard">
                    <div className="optimizeCardHeader">
                      <span className="optimizeRank">#{idx + 1}</span>
                      <span className="optimizeScore" title={`Health score for ${goal.replace(/_/g," ")} goal`}>Score {normalizeScore(result.total_score, goal, result.items.length)}/100</span>
                    </div>
                    <p className="optimizeItems">
                      {result.items.map((m) => m.title || m.name).join(", ")}
                    </p>
                    <p className="optimizeStats">{result.total_calories} kcal total</p>
                    <div className="optimizeGoalChecks">
                      {checkMealGoal(result.items).map((check, ci) => (
                        <span key={ci} className={`goalCheck ${check.startsWith("✓") ? "goalCheck--pass" : "goalCheck--fail"}`}>
                          {check}
                        </span>
                      ))}
                    </div>
                    <button className="btn btnDark" onClick={() => sendToMealBuilder(idx)}>
                      Send to Meal Builder →
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── ITEM DETAIL MODAL ── */}
      {modalItem && (
        <div className="modalBackdrop" onClick={() => setModalItem(null)}>
          <div className="modalSheet" onClick={(e) => e.stopPropagation()}>
            <div className="modalDragHandle" />

            <div className="modalItemHeader">
              {(() => {
                const { emoji, gradient } = getThumbnail(modalItem);
                return (
                  <div className="modalThumb" style={{ background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})` }}>
                    {emoji}
                  </div>
                );
              })()}
              <div className="modalItemMeta">
                <h2 className="modalItemName">{modalItem.title || modalItem.name}</h2>
                <p className="modalItemSub">{modalItem.restaurant} · {modalItem.category}</p>
              </div>
              {typeof modalItem.score !== "undefined" && (
                <span className="modalScoreBadge" title={`Health score for ${goal.replace(/_/g," ")} goal`}>
                  {normalizeScore(modalItem.score, goal)}<span className="modalScoreUnit">/100</span>
                </span>
              )}
            </div>

            <div className="nutritionGrid">
              {[
                { label: "Calories", value: String(modalItem.calories), color: "#6366f1" },
                { label: "Protein",  value: `${modalItem.protein}g`,    color: "#22c55e" },
                { label: "Sugar",    value: `${modalItem.sugars}g`,     color: "#f59e0b" },
                { label: "Fat",      value: `${modalItem.fat}g`,        color: "#ef4444" },
                { label: "Carbs",    value: `${modalItem.carbs}g`,      color: "#6366f1" },
                { label: "Sodium",   value: `${modalItem.sodium}mg`,    color: "#64748b" },
              ].map((n) => (
                <div key={n.label} className="nutritionTile">
                  <span className="nutritionValue" style={{ color: n.color }}>{n.value}</span>
                  <span className="nutritionLabel">{n.label}</span>
                </div>
              ))}
            </div>

            {modalItem.summary && (
              <div className="summaryBadge">✓ {modalItem.summary}</div>
            )}

            <button
              className={`addToMealBtn${isInMeal(modalItem) ? " addToMealBtn--added" : ""}`}
              disabled={isInMeal(modalItem)}
              onClick={() => { addToMeal(modalItem); setModalItem(null); }}
            >
              {isInMeal(modalItem) ? "✓ Added" : "Add to Meal"}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
