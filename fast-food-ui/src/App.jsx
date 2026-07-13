import { useMemo, useState, useEffect, useRef } from "react";
import "./App.css";
import {
  normalizeScore, getItemKey,
  sumNutrition, today, lastNDates, weekdayLabel, sumDailyLog,
  defaultMealName, mergeDay, loadHistory, weeklyAverages, loadDailyLog,
  HISTORY_KEY, ZERO_TOTALS, MACRO_FIELDS, COMPARE_MAX,
} from "./helpers";
import FilterChips from "./components/FilterChips";
import SkeletonRow from "./components/SkeletonRow";
import CompareTab from "./tabs/CompareTab";
import TodayTab from "./tabs/TodayTab";
import ScoreBreakdown from "./components/ScoreBreakdown";
import OptimizeTab from "./tabs/OptimizeTab";
import { getThumbnail } from "./thumbnail";
import BrowseTab from "./tabs/BrowseTab";
import MealBuilderTab from "./tabs/MealBuilderTab";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

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

// A compare entry wraps either a single item or a full meal so the Compare table can
// treat both uniformly (nutrition = sumNutrition(entry.items)). `srcKey` lets us dedup
// single items against what's already staged; meals are snapshots and always add.
let compareIdCounter = 0;
function compareEntryFromItem(item) {
  return {
    id: `cmp-${compareIdCounter++}`,
    kind: "item",
    label: item.title || item.name || "Item",
    srcKey: getItemKey(item),
    items: [item],
  };
}
function compareEntryFromMeal(items, label) {
  return {
    id: `cmp-${compareIdCounter++}`,
    kind: "meal",
    label: label || defaultMealName(items),
    srcKey: null,
    items,
  };
}


const DEFAULT_TARGETS = { calories: 2000, protein: 100, sugars: 50, fat: 70 };

function App() {
  // Shared filter state (Browse + Optimize)
  const [goal, setGoal]               = useState("balanced");
  const [restaurant, setRestaurant]   = useState("all");
  const [maxCalories, setMaxCalories] = useState(600);
  const [category, setCategory]       = useState("");
  const [diet, setDiet]               = useState("none"); // "none" | "vegetarian" | "vegan"
  // Optional macro thresholds (empty string = no limit). Applied item-level in Browse,
  // meal-level in Optimize. Shared across both tabs like the chips above.
  const [macros, setMacros]           = useState({ minProtein: "", maxSugar: "", maxFat: "", maxSodium: "" });
  const [showMoreFilters, setShowMoreFilters] = useState(false);

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

  // Weekly history: totals of completed past days (initialized AFTER dailyLog so it picks up
  // any day loadDailyLog just archived). Powers the "This week" chart on the Today tab.
  const [history, setHistory] = useState(loadHistory);
  useEffect(() => {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history]);

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
  // Debounced copy of `search` — drives the server-side /search fetch so we don't fire a
  // request per keystroke. Empty = normal /recommend browsing.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort]               = useState("score"); // Browse-only ordering
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
  // Backend-computed score + breakdown for the hand-built meal ({ total_score,
  // item_count, breakdown, score_bounds } or null). The backend owns the math so it
  // stays in sync with the scoring weights (never reimplemented in JS).
  const [mealScore, setMealScore]               = useState(null);

  // Compare — ephemeral set of up to COMPARE_MAX entries (items and/or meals)
  const [compareItems, setCompareItems]         = useState([]);

  // Optimize
  const [optimizedMealResults, setOptimizedMealResults] = useState([]);
  const [optimizeLoading, setOptimizeLoading]           = useState(false);
  const [optimizeError, setOptimizeError]               = useState("");
  const [optimizeNoMeal, setOptimizeNoMeal]             = useState(false);

  // Debounce the search box so typing fires at most one /search request per pause.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Auto-fetch Browse when tab is active and filters (or the debounced search) change
  useEffect(() => {
    if (activeTab === "browse") fetchBrowse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, goal, restaurant, maxCalories, category, diet, sort, debouncedSearch,
      macros.minProtein, macros.maxSugar, macros.maxFat, macros.maxSodium]);

  // Score the current hand-built meal via the backend (same engine the optimizer uses),
  // re-fetching whenever the meal, goal, or calorie cap changes. Fails quietly (clears
  // the score) so the section simply hides offline / in local dev — never blocks the app.
  useEffect(() => {
    if (meal.length === 0) { setMealScore(null); return; }
    const ids = meal.map((m) => encodeURIComponent(getItemKey(m))).join(",");
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(
          `${API_BASE_URL}/score_meal?ids=${ids}&goal=${encodeURIComponent(goal)}&max_calories=${encodeURIComponent(maxCalories)}`
        );
        if (!resp.ok) { if (!cancelled) setMealScore(null); return; }
        const data = await resp.json();
        if (!cancelled) setMealScore(data);
      } catch {
        if (!cancelled) setMealScore(null);
      }
    })();
    return () => { cancelled = true; };
  }, [meal, goal, maxCalories]);

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

  const compareFull = compareItems.length >= COMPARE_MAX;

  // True when this exact item is already staged as a compare column (used to disable
  // its "Add to Compare" button). Meals aren't deduped — they're snapshots.
  function isInCompare(item) {
    const key = getItemKey(item);
    return compareItems.some((e) => e.srcKey === key);
  }

  function addToCompare(entry) {
    setCompareItems((prev) => {
      if (prev.length >= COMPARE_MAX) return prev;
      if (entry.srcKey && prev.some((e) => e.srcKey === entry.srcKey)) return prev;
      return [...prev, entry];
    });
  }

  function removeFromCompare(id) {
    setCompareItems((prev) => prev.filter((e) => e.id !== id));
  }

  function clearCompare() {
    setCompareItems([]);
  }

  const mealTotals = useMemo(() => sumNutrition(meal), [meal]);

  const dailyTotals = useMemo(() => sumDailyLog(dailyLog.entries), [dailyLog]);

  // The last 7 calendar days for the "This week" chart: today reads the live totals; past
  // days come from the archived history (missing days = zero). Includes per-day averages.
  const weekSeries = useMemo(() => {
    const dates = lastNDates(7);
    const byDate = Object.fromEntries(history.map((h) => [h.date, h.totals]));
    const t = today();
    const days = dates.map((date) => ({
      date,
      isToday: date === t,
      totals: date === t ? dailyTotals : (byDate[date] ?? ZERO_TOTALS),
    }));
    return { days, averages: weeklyAverages(days.map((d) => d.totals)) };
  }, [history, dailyTotals]);

  // Layout math for the weekly calories chart: bar heights + the target reference line, all
  // as % of a common max (the taller of the target or the biggest day) so the line and bars
  // share one scale. `over` marks days above the calorie target (redundant with the bar
  // crossing the target line, so color isn't the sole signal).
  const weekChart = useMemo(() => {
    const calTarget = targets.calories || 0;
    const maxCal = Math.max(calTarget, ...weekSeries.days.map((d) => d.totals.calories), 1);
    const days = weekSeries.days.map((d) => ({
      ...d,
      label: weekdayLabel(d.date),
      heightPct: (d.totals.calories / maxCal) * 100,
      over: calTarget > 0 && d.totals.calories > calTarget,
    }));
    return {
      days,
      calTarget,
      targetPct: maxCal > 0 ? (calTarget / maxCal) * 100 : 0,
      allZero: weekSeries.days.every((d) => d.totals.calories === 0),
    };
  }, [weekSeries, targets.calories]);

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

  // Per-column nutrition totals for the Compare table (one entry = one column).
  const compareColumns = useMemo(
    () => compareItems.map((e) => ({ ...e, totals: sumNutrition(e.items) })),
    [compareItems]
  );

  // Search is now server-side (/search), so `results` are already the matches — no client
  // filtering. Kept as a named memo so the render + count sites stay unchanged.
  const displayedResults = results;

  // Build the &min_protein=…&max_sugar=… suffix, emitting only the macros the user set.
  function macroQuery() {
    const map = {
      min_protein: macros.minProtein,
      max_sugar:   macros.maxSugar,
      max_fat:     macros.maxFat,
      max_sodium:  macros.maxSodium,
    };
    return Object.entries(map)
      .filter(([, v]) => v !== "")
      .map(([k, v]) => `&${k}=${encodeURIComponent(v)}`)
      .join("");
  }

  async function fetchBrowse() {
    setHasSearched(true);
    setLoading(true);
    setError("");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const q = debouncedSearch.trim();
      let url;
      if (q) {
        // Menu-wide name search: honors restaurant + diet + goal only (search deliberately
        // ignores the calorie/category/macro/sort chips so a searched item is never hidden).
        url = `${API_BASE_URL}/search?q=${encodeURIComponent(q)}&restaurant=${encodeURIComponent(restaurant)}&goal=${encodeURIComponent(goal)}`;
        if (diet === "vegetarian") url += `&vegetarian=true`;
        else if (diet === "vegan") url += `&vegan=true`;
      } else {
        url = `${API_BASE_URL}/recommend?restaurant=${encodeURIComponent(restaurant)}&goal=${encodeURIComponent(goal)}&max_calories=${encodeURIComponent(maxCalories)}&top_n=20&format=human`;
        if (category) url += `&category=${encodeURIComponent(category)}`;
        if (diet === "vegetarian") url += `&vegetarian=true`;
        else if (diet === "vegan") url += `&vegan=true`;
        if (sort !== "score") url += `&sort=${encodeURIComponent(sort)}`;
        url += macroQuery();
      }
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
    setOptimizeNoMeal(false);
    setOptimizedMealResults([]);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      let url = `${API_BASE_URL}/optimize_meal?restaurant=${encodeURIComponent(restaurant)}&goal=${encodeURIComponent(goal)}&max_calories=${encodeURIComponent(maxCalories)}&format=human`;
      if (diet === "vegetarian") url += `&vegetarian=true`;
      else if (diet === "vegan") url += `&vegan=true`;
      url += macroQuery();
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`API error (${res.status}): ${await res.text()}`);
      const data = await res.json();
      if (!data?.meals?.length || !data.meals[0]?.items) {
        setOptimizeError(data.message || "No meal found.");
        setOptimizeNoMeal(true);
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

  // Build a shareable link for the current meal and copy it. Each id is URL-encoded
  // (Wendy's ids contain spaces/apostrophes); commas separate them. We prefer a short
  // /m/<code> link (the /api/shorten Vercel function stores the ids in KV); on any failure
  // — offline, store not provisioned, or local dev with no serverless functions — we fall
  // back to the long ?meal= link, which the rehydration effect handles identically.
  async function shareMeal() {
    const ids = meal.map((m) => encodeURIComponent(getItemKey(m))).join(",");
    const longUrl = `${window.location.origin}/?meal=${ids}`;
    let url = longUrl;
    try {
      // /api/* is a Vercel function on the frontend origin, not the Render backend.
      const resp = await fetch(`${window.location.origin}/api/shorten`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.code) url = `${window.location.origin}/m/${data.code}`;
      }
    } catch {
      /* keep longUrl */
    }
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
    // If the calendar day rolled over while the app was open, archive the stale day into the
    // weekly history before it's reset (read the closure value so the setDailyLog updater
    // stays pure).
    if (dailyLog.date !== today() && dailyLog.entries.length) {
      setHistory((h) => mergeDay(h, dailyLog));
    }
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

  // Macro filter inputs: keep "" for an empty field (= no limit), else clamp to a
  // non-negative integer.
  function setMacro(key, raw) {
    const value = raw === "" ? "" : String(Math.max(0, Math.floor(Number(raw) || 0)));
    setMacros((prev) => ({ ...prev, [key]: value }));
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

  const currentCategories =
    restaurant === "mcdonalds" ? MCD_CATEGORIES :
    restaurant === "chickfila" ? CHICKFILA_CATEGORIES :
    restaurant === "wendys"    ? WENDYS_CATEGORIES :
    restaurant === "tacobell"  ? TACOBELL_CATEGORIES :
    restaurant === "burgerking" ? BURGERKING_CATEGORIES : [];

  const activeMacroCount = MACRO_FIELDS.filter((m) => macros[m.key] !== "").length;

  // Bundle the shared filter state + setters so FilterChips (now its own component) receives
  // one prop instead of ~16.
  const filters = {
    goal, setGoal, restaurant, setRestaurant, maxCalories, setMaxCalories,
    category, setCategory, diet, setDiet, macros, setMacro,
    showMoreFilters, setShowMoreFilters, currentCategories, activeMacroCount,
  };

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
          { id: "compare",  label: compareItems.length > 0 ? `Compare (${compareItems.length})` : "Compare" },
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
          <BrowseTab
            filters={filters}
            search={search}
            setSearch={setSearch}
            sort={sort}
            setSort={setSort}
            error={error}
            loading={loading}
            results={results}
            displayedResults={displayedResults}
            debouncedSearch={debouncedSearch}
            hasSearched={hasSearched}
            scoreBounds={scoreBounds}
            setModalItem={setModalItem}
          />
        )}

        {/* ── MEAL BUILDER ── */}
        {activeTab === "meal" && (
          <MealBuilderTab
            meal={meal}
            mealTotals={mealTotals}
            mealScore={mealScore}
            goal={goal}
            maxCalories={maxCalories}
            scoreBounds={scoreBounds}
            removeFromMeal={removeFromMeal}
            exportMeal={exportMeal}
            copySuccess={copySuccess}
            shareMeal={shareMeal}
            shareSuccess={shareSuccess}
            logMealToToday={logMealToToday}
            logSuccess={logSuccess}
            addToCompare={addToCompare}
            compareEntryFromMeal={compareEntryFromMeal}
            compareFull={compareFull}
            clearMeal={clearMeal}
            alternativeMealsWithDeltas={alternativeMealsWithDeltas}
            setMeal={setMeal}
            setAlternativeMeals={setAlternativeMeals}
            savedMeals={savedMeals}
            mealName={mealName}
            setMealName={setMealName}
            saveMeal={saveMeal}
            saveSuccess={saveSuccess}
            loadSavedMeal={loadSavedMeal}
            deleteSavedMeal={deleteSavedMeal}
          />
        )}

        {/* ── OPTIMIZE ── */}
        {activeTab === "optimize" && (
          <OptimizeTab
            filters={filters}
            optimizeMeal={optimizeMeal}
            optimizeLoading={optimizeLoading}
            optimizeError={optimizeError}
            optimizeNoMeal={optimizeNoMeal}
            optimizedMealResults={optimizedMealResults}
            scoreBounds={scoreBounds}
            sendToMealBuilder={sendToMealBuilder}
          />
        )}

        {/* ── TODAY ── */}
        {activeTab === "today" && (
          <TodayTab
            targets={targets}
            updateTarget={updateTarget}
            dailyTotals={dailyTotals}
            dailyLog={dailyLog}
            removeLogEntry={removeLogEntry}
            resetDay={resetDay}
            weekChart={weekChart}
            weekSeries={weekSeries}
          />
        )}

        {/* ── COMPARE ── */}
        {activeTab === "compare" && (
          <CompareTab
            compareColumns={compareColumns}
            removeFromCompare={removeFromCompare}
            clearCompare={clearCompare}
          />
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

            {modalItem.breakdown && <ScoreBreakdown breakdown={modalItem.breakdown} />}

            <button
              className={`addToMealBtn${isInMeal(modalItem) ? " addToMealBtn--added" : ""}`}
              disabled={isInMeal(modalItem)}
              onClick={() => { addToMeal(modalItem); setModalItem(null); }}
            >
              {isInMeal(modalItem) ? "✓ Added" : "Add to Meal"}
            </button>
            <button
              className="addToCompareBtn"
              disabled={isInCompare(modalItem) || (compareFull && !isInCompare(modalItem))}
              onClick={() => { addToCompare(compareEntryFromItem(modalItem)); setModalItem(null); }}
            >
              {isInCompare(modalItem)
                ? "✓ In compare"
                : compareFull
                ? `Compare full (${COMPARE_MAX})`
                : "⚖️ Add to Compare"}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
