import { useMemo, useState, useEffect, useRef } from "react";
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
  tacos:          { emoji: "🌮", gradient: ["#fed7aa", "#f97316"] },
  burritos:       { emoji: "🌯", gradient: ["#fde68a", "#d97706"] },
  quesadillas:    { emoji: "🫓", gradient: ["#fef9c3", "#ca8a04"] },
  nachos:         { emoji: "🧀", gradient: ["#fef08a", "#eab308"] },
  specialties:    { emoji: "🫔", gradient: ["#fecaca", "#ef4444"] },
  sweets:         { emoji: "🍩", gradient: ["#fce7f3", "#ec4899"] },
  catering:       { emoji: "🍱", gradient: ["#fde68a", "#d97706"] },
  sauces:         { emoji: "🥫", gradient: ["#fecaca", "#ef4444"] },
  dressings:      { emoji: "🫙", gradient: ["#d9f99d", "#65a30d"] },
  buns:           { emoji: "🍞", gradient: ["#fef3c7", "#d97706"] },
};
const DEFAULT_EMOJI = { emoji: "🍽️", gradient: ["#f1f5f9", "#94a3b8"] };

const NAME_EMOJI_OVERRIDES = [
  { test: /fish/i,    result: { emoji: "🐟", gradient: ["#cffafe", "#06b6d4"] } },
  { test: /\bbun\b/i, result: { emoji: "🍞", gradient: ["#fef3c7", "#d97706"] } },
];

// Map a raw health_score onto a friendly 0–100 scale using the per-item min/max bounds
// the backend ships with each response (see score_bounds() in recommend_items.py). The
// backend owns these numbers so they can never drift out of sync with the scoring weights.
// `bounds` is { min, max }; `itemCount` scales them for multi-item meal totals.
function normalizeScore(rawScore, bounds, itemCount = 1) {
  if (!bounds) return 0;
  const minTotal = bounds.min * itemCount;
  const maxTotal = bounds.max * itemCount;
  if (maxTotal === minTotal) return 0;
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
  { value: "burgers",   label: "Burgers" },
  { value: "chicken",   label: "Chicken" },
  { value: "wraps",     label: "Wraps" },
  { value: "salads",    label: "Salads" },
  { value: "sides",     label: "Sides" },
  { value: "breakfast", label: "Breakfast" },
  { value: "desserts",  label: "Desserts" },
];

const TACOBELL_CATEGORIES = [
  { value: "tacos",       label: "Tacos" },
  { value: "burritos",    label: "Burritos" },
  { value: "quesadillas", label: "Quesadillas" },
  { value: "nachos",      label: "Nachos" },
  { value: "specialties", label: "Specialties" },
  { value: "breakfast",   label: "Breakfast" },
  { value: "sides",       label: "Sides" },
  { value: "sweets",      label: "Sweets" },
  { value: "drinks",      label: "Drinks" },
];

const BURGERKING_CATEGORIES = [
  { value: "burgers",   label: "Burgers" },
  { value: "chicken",   label: "Chicken" },
  { value: "sides",     label: "Sides" },
  { value: "breakfast", label: "Breakfast" },
  { value: "desserts",  label: "Desserts" },
  { value: "drinks",    label: "Drinks" },
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

// Single source of truth for summing a list of items' nutrition. Used everywhere a
// meal total is needed (meal builder, alternative-meal deltas, optimizer goal checks)
// so the field set can never drift between call sites.
function sumNutrition(items) {
  return items.reduce(
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
  );
}

// Local calendar date as YYYY-MM-DD — the key the daily log resets on.
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Sum the precomputed per-entry totals into a single day total. Reuses the same nutrient
// keys as sumNutrition so the Today tab stays in lockstep with the Meal Builder.
function sumDailyLog(entries) {
  return entries.reduce(
    (acc, e) => {
      acc.calories += Number(e.totals?.calories ?? 0);
      acc.protein  += Number(e.totals?.protein  ?? 0);
      acc.sugars   += Number(e.totals?.sugars   ?? 0);
      acc.fat      += Number(e.totals?.fat      ?? 0);
      return acc;
    },
    { calories: 0, protein: 0, sugars: 0, fat: 0 }
  );
}

// Auto-name a meal from its first item when the user doesn't type one.
function defaultMealName(items) {
  if (!items.length) return "Untitled meal";
  const first = items[0].title || items[0].name || "Meal";
  return items.length > 1 ? `${first} +${items.length - 1} more` : first;
}

const DEFAULT_TARGETS = { calories: 2000, protein: 100, sugars: 50, fat: 70 };

// Nutrients tracked on the Today tab, with display metadata. Sodium/carbs exist in the data
// but are intentionally excluded to keep the daily view focused.
const TARGET_NUTRIENTS = [
  { key: "calories", label: "Calories", unit: "" },
  { key: "protein",  label: "Protein",  unit: "g" },
  { key: "sugars",   label: "Sugar",    unit: "g" },
  { key: "fat",      label: "Fat",      unit: "g" },
];

// Read the persisted daily log, resetting to an empty day when the stored date isn't today.
function loadDailyLog() {
  const fresh = { date: today(), entries: [] };
  try {
    const raw = window.localStorage.getItem("crave_daily_log");
    if (!raw) return fresh;
    const parsed = JSON.parse(raw);
    if (parsed?.date !== today() || !Array.isArray(parsed.entries)) return fresh;
    return parsed;
  } catch {
    return fresh;
  }
}

function App() {
  // Shared filter state (Browse + Optimize)
  const [goal, setGoal]               = useState("balanced");
  const [restaurant, setRestaurant]   = useState("all");
  const [maxCalories, setMaxCalories] = useState(600);
  const [category, setCategory]       = useState("");
  const [diet, setDiet]               = useState("none"); // "none" | "vegetarian" | "vegan"

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

  // Daily targets — user's budget, persists across days (never auto-reset).
  const [targets, setTargets] = useState(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem("crave_targets"));
      return stored && typeof stored === "object" ? { ...DEFAULT_TARGETS, ...stored } : DEFAULT_TARGETS;
    } catch {
      return DEFAULT_TARGETS;
    }
  });
  useEffect(() => {
    window.localStorage.setItem("crave_targets", JSON.stringify(targets));
  }, [targets]);

  // Today's logged meals — resets when the calendar day rolls over.
  const [dailyLog, setDailyLog] = useState(loadDailyLog);
  useEffect(() => {
    window.localStorage.setItem("crave_daily_log", JSON.stringify(dailyLog));
  }, [dailyLog]);

  // Saved meals — named meals the user keeps and reloads later. Persists across sessions.
  const [savedMeals, setSavedMeals] = useState(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem("crave_saved_meals"));
      return Array.isArray(stored) ? stored : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    window.localStorage.setItem("crave_saved_meals", JSON.stringify(savedMeals));
  }, [savedMeals]);
  const [mealName, setMealName]       = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Browse
  const [results, setResults]         = useState([]);
  // Per-item score min/max from the backend, used to normalize raw scores to 0–100.
  // Shared by Browse and Optimize since both use the same `goal`.
  const [scoreBounds, setScoreBounds] = useState(null);
  const [search, setSearch]           = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  // Modal
  const [modalItem, setModalItem] = useState(null);
  const modalSheetRef = useRef(null);

  // Meal
  const [meal, setMeal]                         = useState([]);
  const [alternativeMeals, setAlternativeMeals] = useState([]);
  const [copySuccess, setCopySuccess]           = useState(false);
  const [shareSuccess, setShareSuccess]         = useState(false);
  const [logSuccess, setLogSuccess]             = useState(false);

  // Optimize
  const [optimizedMealResults, setOptimizedMealResults] = useState([]);
  const [optimizeLoading, setOptimizeLoading]           = useState(false);
  const [optimizeError, setOptimizeError]               = useState("");

  // Auto-fetch Browse when tab is active and filters change
  useEffect(() => {
    if (activeTab === "browse") fetchBrowse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, goal, restaurant, maxCalories, category, diet]);

  // On first load, rehydrate a shared meal from the ?meal=<ids> URL param. Fetches the
  // full items by id, drops the user on the Meal Builder, then strips the param so the
  // address bar stays clean (the meal lives in state; Share regenerates a fresh link).
  // Fails quietly — a link to since-deleted items should never break the app.
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("meal");
    if (!raw) return;
    (async () => {
      try {
        const resp = await fetch(`${API_BASE_URL}/items?ids=${encodeURIComponent(raw)}`);
        if (!resp.ok) return;
        const data = await resp.json();
        if (data.results?.length) {
          setMeal(data.results);
          setActiveTab("meal");
        }
      } catch {
        /* ignore — leave Meal Builder empty */
      } finally {
        window.history.replaceState({}, "", window.location.pathname);
      }
    })();
  }, []);

  // While the modal is open: Escape closes, focus is trapped within the sheet, and
  // focus is restored to the element that opened it on close.
  useEffect(() => {
    if (!modalItem) return;
    const previouslyFocused = document.activeElement;
    const sheet = modalSheetRef.current;
    const getFocusable = () => sheet
      ? Array.from(sheet.querySelectorAll(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ))
      : [];

    // Move focus into the dialog on open.
    getFocusable()[0]?.focus();

    const onKey = (e) => {
      if (e.key === "Escape") { setModalItem(null); return; }
      if (e.key !== "Tab") return;
      const items = getFocusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    };
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

  const mealTotals = useMemo(() => sumNutrition(meal), [meal]);

  const dailyTotals = useMemo(() => sumDailyLog(dailyLog.entries), [dailyLog]);

  const alternativeMealsWithDeltas = useMemo(() => {
    const base = mealTotals;
    return alternativeMeals.map((m) => {
      const t = sumNutrition(m.items);
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
      if (diet === "vegetarian") url += `&vegetarian=true`;
      else if (diet === "vegan") url += `&vegan=true`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`API error (${res.status}): ${await res.text()}`);
      const data = await res.json();
      setResults(data.results || []);
      if (data.score_bounds) setScoreBounds(data.score_bounds);
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
      let url = `${API_BASE_URL}/optimize_meal?restaurant=${encodeURIComponent(restaurant)}&goal=${encodeURIComponent(goal)}&max_calories=${encodeURIComponent(maxCalories)}&format=human`;
      if (diet === "vegetarian") url += `&vegetarian=true`;
      else if (diet === "vegan") url += `&vegan=true`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`API error (${res.status}): ${await res.text()}`);
      const data = await res.json();
      if (!data?.meals?.length || !data.meals[0]?.items) {
        setOptimizeError(data.message || "No meal found.");
        return;
      }
      setOptimizedMealResults(data.meals);
      if (data.score_bounds) setScoreBounds(data.score_bounds);
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

  // Build a shareable link encoding the current meal's item_ids, and copy it. Each id is
  // URL-encoded (Wendy's ids contain spaces/apostrophes); commas separate them.
  async function shareMeal() {
    const ids = meal.map((m) => encodeURIComponent(getItemKey(m))).join(",");
    const url = `${window.location.origin}/?meal=${ids}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareSuccess(true);
      setTimeout(() => setShareSuccess(false), 2000);
    } catch {
      setError("Could not copy link.");
    }
  }

  // Append the current meal to today's log as one entry. Applies the day-rollover reset so a
  // meal logged after midnight starts a fresh day rather than piling onto yesterday.
  function logMealToToday() {
    if (meal.length === 0) return;
    const entry = {
      id: (crypto.randomUUID?.() ?? String(Date.now())),
      label: meal.map((m) => m.title || m.name).join(", "),
      totals: sumNutrition(meal),
      loggedAt: Date.now(),
    };
    setDailyLog((prev) => {
      const base = prev.date === today() ? prev.entries : [];
      return { date: today(), entries: [...base, entry] };
    });
    setLogSuccess(true);
    setTimeout(() => setLogSuccess(false), 2000);
  }

  function removeLogEntry(id) {
    setDailyLog((prev) => ({ ...prev, entries: prev.entries.filter((e) => e.id !== id) }));
  }

  function resetDay() {
    setDailyLog({ date: today(), entries: [] });
  }

  // Clamp target inputs to non-negative integers; NaN (empty field) becomes 0.
  function updateTarget(key, raw) {
    const n = Math.max(0, Math.floor(Number(raw)));
    setTargets((prev) => ({ ...prev, [key]: Number.isFinite(n) ? n : 0 }));
  }

  // Save the current meal under a (optional) name; newest first.
  function saveMeal() {
    if (meal.length === 0) return;
    const entry = {
      id: (crypto.randomUUID?.() ?? String(Date.now())),
      name: mealName.trim() || defaultMealName(meal),
      items: meal,
      savedAt: Date.now(),
    };
    setSavedMeals((prev) => [entry, ...prev]);
    setMealName("");
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  }

  // Load a saved meal back into the builder, clearing any optimizer leftovers.
  function loadSavedMeal(id) {
    const found = savedMeals.find((m) => m.id === id);
    if (!found) return;
    setMeal(found.items);
    setAlternativeMeals([]);
    setOptimizedMealResults([]);
  }

  function deleteSavedMeal(id) {
    setSavedMeals((prev) => prev.filter((m) => m.id !== id));
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
    const t = sumNutrition(items);
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
    restaurant === "wendys"    ? WENDYS_CATEGORIES :
    restaurant === "tacobell"  ? TACOBELL_CATEGORIES :
    restaurant === "burgerking" ? BURGERKING_CATEGORIES : [];

  function FilterChips({ showCategory }) {
    return (
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
      <nav className="tabBar" role="tablist" aria-label="Views">
        {[
          { id: "browse",   label: "Browse" },
          { id: "meal",     label: meal.length > 0 ? `Meal Builder (${meal.length})` : "Meal Builder" },
          { id: "optimize", label: "Optimize" },
          { id: "today",    label: dailyLog.entries.length > 0 ? `Today (${dailyLog.entries.length})` : "Today" },
        ].map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
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
                placeholder="Filter these results…"
                aria-label="Filter the loaded results by name"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {error && <p className="errorMsg">{error}</p>}
            {!loading && !error && results.length > 0 && (
              <p className="resultCount">
                Showing {displayedResults.length} of {results.length} items
                {search.trim() ? " matching your filter" : " for these filters"}
              </p>
            )}
            <div className="itemList">
              {loading && [0,1,2,3,4].map((i) => <SkeletonRow key={i} />)}
              {!loading && hasSearched && displayedResults.length === 0 && !error && (
                diet !== "none" ? (
                  <p className="emptyMsg">
                    No {diet} items match this goal. Try a different goal (e.g. Low Fat) or Optimize for a {diet} meal.
                  </p>
                ) : (
                  <p className="emptyMsg">No items matched your criteria.</p>
                )
              )}
              {!loading && displayedResults.map((item) => {
                const { emoji, gradient } = getThumbnail(item);
                const tags = getItemTags(item);
                return (
                  <button
                    key={getItemKey(item)}
                    type="button"
                    className="itemRow"
                    onClick={() => setModalItem(item)}
                    aria-label={`View details for ${item.title || item.name}`}
                  >
                    <div
                      className="itemThumbnail"
                      style={{ background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})` }}
                    >
                      {emoji}
                    </div>
                    <div className="itemInfo">
                      <div className="itemName">
                        {item.title || item.name}
                        {item.vegan
                          ? <span className="vegBadge" title="Vegan" aria-label="Vegan">🥬</span>
                          : item.vegetarian
                          ? <span className="vegBadge" title="Vegetarian" aria-label="Vegetarian">🌱</span>
                          : null}
                      </div>
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
                    <div
                      className="itemScore"
                      title={`Health score for ${goal.replace(/_/g," ")} goal`}
                      aria-label={`Health score ${normalizeScore(item.score, scoreBounds)} out of 100`}
                    >
                      {normalizeScore(item.score, scoreBounds)}<span className="itemScoreUnit">/100</span>
                    </div>
                  </button>
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
                  <button className="btn btnOutline" onClick={shareMeal}>
                    {shareSuccess ? "✓ Link copied!" : "🔗 Share Meal"}
                  </button>
                  <button className="btn btnOutline" onClick={logMealToToday}>
                    {logSuccess ? "✓ Logged!" : "➕ Log to Today"}
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
                          {mealOption.total_calories} kcal · Score: {normalizeScore(mealOption.total_score, scoreBounds, mealOption.items.length)}/100
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

            <section className="savedMeals">
              <h3 className="todaySectionTitle">Saved meals</h3>
              <div className="savedMealSaveRow">
                <input
                  className="savedMealNameInput"
                  type="text"
                  placeholder="Name this meal (optional)…"
                  aria-label="Name for the saved meal"
                  value={mealName}
                  onChange={(e) => setMealName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && meal.length > 0) saveMeal(); }}
                  disabled={meal.length === 0}
                />
                <button
                  className="btn btnDark btnSm"
                  onClick={saveMeal}
                  disabled={meal.length === 0}
                >
                  {saveSuccess ? "✓ Saved!" : "💾 Save meal"}
                </button>
              </div>
              {meal.length === 0 && savedMeals.length === 0 && (
                <p className="savedMealsHint">Build a meal above, then save it here to reuse later.</p>
              )}

              {savedMeals.length === 0 ? (
                meal.length > 0 && <p className="savedMealsHint">No saved meals yet.</p>
              ) : (
                <div className="savedMealList">
                  {savedMeals.map((m) => {
                    const t = sumNutrition(m.items);
                    return (
                      <div key={m.id} className="savedMealRow">
                        <div className="savedMealInfo">
                          <span className="savedMealName">{m.name}</span>
                          <span className="savedMealStats">
                            {m.items.length} item{m.items.length === 1 ? "" : "s"} · {t.calories.toFixed(0)} kcal
                          </span>
                        </div>
                        <button className="btn btnOutline btnSm" onClick={() => loadSavedMeal(m.id)}>Load</button>
                        <button className="mealItemRemove" onClick={() => deleteSavedMeal(m.id)} aria-label={`Delete saved meal ${m.name}`}>✕</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ── OPTIMIZE ── */}
        {activeTab === "optimize" && (
          <div className="optimizeTab">
            <p className="optimizeIntro">
              Picks the best entrée + side + drink combo under your calorie cap for the
              selected goal, and shows the top 3 meals. Adjust the filters or a preset below,
              then build.
            </p>
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

            {optimizeError && (
              <div className="optimizeEmpty">
                <p className="errorMsg">{optimizeError}</p>
                <p className="optimizeHint">
                  Try raising the calorie cap, switching the goal, or picking a different
                  restaurant — some menus don&#39;t have a combo that fits every constraint.
                </p>
              </div>
            )}

            {optimizedMealResults.length > 0 && (
              <div className="optimizeResults">
                {optimizedMealResults.map((result, idx) => (
                  <div key={idx} className="optimizeCard">
                    <div className="optimizeCardHeader">
                      <span className="optimizeRank">#{idx + 1}</span>
                      <span
                        className="optimizeScore"
                        title={`Health score for ${goal.replace(/_/g," ")} goal`}
                        aria-label={`Health score ${normalizeScore(result.total_score, scoreBounds, result.items.length)} out of 100`}
                      >Score {normalizeScore(result.total_score, scoreBounds, result.items.length)}/100</span>
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

        {/* ── TODAY ── */}
        {activeTab === "today" && (
          <div className="todayTab">
            <p className="optimizeIntro">
              Set your daily targets, then use <strong>➕ Log to Today</strong> in the Meal
              Builder to track meals against them. Totals persist on this device and reset each
              calendar day.
            </p>

            <div className="targetEditor">
              <h3 className="todaySectionTitle">Daily targets</h3>
              <div className="targetInputs">
                {TARGET_NUTRIENTS.map((n) => (
                  <label key={n.key} className="targetInput">
                    <span className="targetInputLabel">{n.label}{n.unit ? ` (${n.unit})` : ""}</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      aria-label={`Daily ${n.label} target`}
                      value={targets[n.key]}
                      onChange={(e) => updateTarget(n.key, e.target.value)}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="targetProgress">
              <h3 className="todaySectionTitle">Today&#39;s progress</h3>
              {TARGET_NUTRIENTS.map((n) => {
                const consumed = dailyTotals[n.key] || 0;
                const target = targets[n.key] || 0;
                const pct = target > 0 ? (consumed / target) * 100 : 0;
                const over = target > 0 && consumed > target;
                const remaining = target - consumed;
                return (
                  <div key={n.key} className="targetRow">
                    <div className="targetRowHead">
                      <span className="targetRowName">{n.label}</span>
                      <span className="targetRowVals">
                        {consumed.toFixed(0)}{n.unit} / {target}{n.unit}
                        {target > 0 && (
                          <span className={over ? "targetRemaining targetRemaining--over" : "targetRemaining"}>
                            {over
                              ? ` · ${Math.abs(remaining).toFixed(0)}${n.unit} over`
                              : ` · ${remaining.toFixed(0)}${n.unit} left`}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className={over ? "targetBar targetBar--over" : "targetBar"}>
                      <div className="targetFill" style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="loggedMeals">
              <div className="loggedMealsHead">
                <h3 className="todaySectionTitle">Logged meals</h3>
                {dailyLog.entries.length > 0 && (
                  <button className="btn btnOutline btnSm" onClick={resetDay}>Reset day</button>
                )}
              </div>
              {dailyLog.entries.length === 0 ? (
                <div className="emptyState">
                  <p>No meals logged today. Build a meal and tap “Log to Today.”</p>
                </div>
              ) : (
                dailyLog.entries.map((e) => (
                  <div key={e.id} className="loggedMeal">
                    <div className="loggedMealInfo">
                      <span className="loggedMealLabel">{e.label}</span>
                      <span className="loggedMealStats">
                        {e.totals.calories.toFixed(0)} kcal · {e.totals.protein.toFixed(0)}g protein
                        · {e.totals.sugars.toFixed(0)}g sugar · {e.totals.fat.toFixed(0)}g fat
                      </span>
                    </div>
                    <button className="mealItemRemove" onClick={() => removeLogEntry(e.id)} aria-label="Remove logged meal">✕</button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── ITEM DETAIL MODAL ── */}
      {modalItem && (
        <div className="modalBackdrop" onClick={() => setModalItem(null)}>
          <div
            className="modalSheet"
            ref={modalSheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modalItemName"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modalDragHandle" />
            <button className="modalClose" aria-label="Close" onClick={() => setModalItem(null)}>✕</button>

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
                <h2 className="modalItemName" id="modalItemName">
                  {modalItem.title || modalItem.name}
                  {modalItem.vegan
                    ? <span className="vegBadge" title="Vegan" aria-label="Vegan">🥬</span>
                    : modalItem.vegetarian
                    ? <span className="vegBadge" title="Vegetarian" aria-label="Vegetarian">🌱</span>
                    : null}
                </h2>
                <p className="modalItemSub">{modalItem.restaurant} · {modalItem.category}</p>
              </div>
              {typeof modalItem.score !== "undefined" && (
                <span
                  className="modalScoreBadge"
                  title={`Health score for ${goal.replace(/_/g," ")} goal`}
                  aria-label={`Health score ${normalizeScore(modalItem.score, scoreBounds)} out of 100`}
                >
                  {normalizeScore(modalItem.score, scoreBounds)}<span className="modalScoreUnit">/100</span>
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
