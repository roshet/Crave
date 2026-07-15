import { useMemo, useState, useEffect, useCallback } from "react";
import "./App.css";
import {
  getItemKey,
  sumNutrition, today, lastNDates, weekdayLabel, sumDailyLog,
  defaultMealName, mergeDay, loadHistory, weeklyAverages, loadDailyLog, mergeLibrary,
  HISTORY_KEY, ZERO_TOTALS, MACRO_FIELDS, COMPARE_MAX,
} from "./helpers";
import CompareTab from "./tabs/CompareTab";
import TodayTab from "./tabs/TodayTab";
import OptimizeTab from "./tabs/OptimizeTab";
import BrowseTab from "./tabs/BrowseTab";
import MealBuilderTab from "./tabs/MealBuilderTab";
import ItemModal from "./components/ItemModal";

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
  // Library sync (export/import the whole saved-meals library via a short code).
  const [libraryCode, setLibraryCode]                 = useState("");
  const [libraryShareSuccess, setLibraryShareSuccess] = useState(false);
  const [importError, setImportError]                 = useState("");

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

  // Modal — ItemModal owns its own focus trap; `closeModal` is memoized so that effect
  // doesn't re-run (and steal focus) on every App render.
  const [modalItem, setModalItem] = useState(null);
  const closeModal = useCallback(() => setModalItem(null), []);

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

  // On first load, rehydrate a shared meal from the URL. Two link shapes:
  //   /m/<code>       — a short link. Middleware serves the SPA in place (URL stays /m/<code>);
  //                     we resolve the code to ids via /api/resolve, load the meal, and LEAVE
  //                     the URL so it remains a copyable/bookmarkable permalink.
  //   /?meal=<ids>    — the long fallback link. We load the meal, then strip the param so the
  //                     address bar stays clean (the meal lives in state; Share regenerates it).
  // Both fail quietly — a link to since-deleted items should never break the app.
  useEffect(() => {
    // Fetch the full items for a ?meal= payload and drop the user on the Meal Builder.
    // Returns true if a meal was loaded.
    async function loadMealFromIds(ids) {
      const resp = await fetch(`${API_BASE_URL}/items?ids=${encodeURIComponent(ids)}`);
      if (!resp.ok) return false;
      const data = await resp.json();
      if (!data.results?.length) return false;
      setMeal(data.results);
      setActiveTab("meal");
      return true;
    }

    const shortMatch = window.location.pathname.match(/^\/m\/([^/]+)\/?$/);
    if (shortMatch) {
      (async () => {
        try {
          // /api/* is a Vercel function on the frontend origin, not the Render backend.
          const resp = await fetch(`${window.location.origin}/api/resolve?code=${encodeURIComponent(shortMatch[1])}`);
          if (resp.ok) {
            const { ids } = await resp.json();
            if (ids && await loadMealFromIds(ids)) return; // keep /m/<code> in the bar
          }
        } catch {
          /* fall through to the reset below */
        }
        // Dead/unknown code, KV down, or offline — don't leave a bogus /m/<code> lingering.
        window.history.replaceState({}, "", "/");
      })();
      return;
    }

    // /?lib=<code> — a shared saved-meals library. Import it (fetch + re-resolve ids + merge,
    // all in importLibrary), drop the user on the Meal Builder, then strip the param. Re-opening
    // is harmless: mergeLibrary dedups. Failures surface quietly via importError.
    const lib = new URLSearchParams(window.location.search).get("lib");
    if (lib) {
      (async () => {
        try {
          await importLibrary(lib);
          setActiveTab("meal");
        } finally {
          window.history.replaceState({}, "", window.location.pathname);
        }
      })();
      return;
    }

    const raw = new URLSearchParams(window.location.search).get("meal");
    if (!raw) return;
    (async () => {
      try {
        await loadMealFromIds(raw);
      } catch {
        /* ignore — leave Meal Builder empty */
      } finally {
        window.history.replaceState({}, "", window.location.pathname);
      }
    })();
  }, []);

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

  // Export the whole saved-meals library to a short code and copy a /?lib=<code> deep link. We
  // send ids only (not the full item snapshots) — the same choice as the meal short links — so
  // the stored blob is small and nutrition re-resolves fresh on import. POSTs to /api/library, a
  // Vercel function on the frontend origin (NOT API_BASE_URL/Render). Fails quietly if the store
  // is unavailable. The bare code is still surfaced for manual entry.
  async function exportLibrary() {
    if (savedMeals.length === 0) return;
    setImportError("");
    const library = savedMeals.map((m) => ({
      name: m.name,
      ids: m.items.map((it) => String(getItemKey(it))),
    }));
    try {
      const resp = await fetch(`${window.location.origin}/api/library`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ library }),
      });
      if (!resp.ok) throw new Error("store");
      const data = await resp.json();
      if (!data.code) throw new Error("store");
      setLibraryCode(data.code);
      try {
        await navigator.clipboard.writeText(`${window.location.origin}/?lib=${data.code}`);
        setLibraryShareSuccess(true);
        setTimeout(() => setLibraryShareSuccess(false), 2000);
      } catch { /* link/code is still shown on screen to copy manually */ }
    } catch {
      setImportError("Couldn't share your library — the sync store is unavailable right now.");
    }
  }

  // Import a library by code: fetch the { name, ids } list, re-resolve every id through /items
  // (one request for the union of ids), rebuild each saved meal with fresh item data, and
  // merge-append into the existing library (dedup handled by mergeLibrary). Fails quietly.
  async function importLibrary(code) {
    const trimmed = (code || "").trim();
    if (!trimmed) return;
    setImportError("");
    try {
      const resp = await fetch(`${window.location.origin}/api/library?code=${encodeURIComponent(trimmed)}`);
      if (resp.status === 404) { setImportError("No library found for that code."); return; }
      if (!resp.ok) throw new Error("store");
      const { library } = await resp.json();
      if (!Array.isArray(library) || library.length === 0) { setImportError("That library is empty."); return; }

      const unionIds = [...new Set(library.flatMap((m) => m.ids.map(String)))];
      const itemsResp = await fetch(
        `${API_BASE_URL}/items?ids=${unionIds.map((id) => encodeURIComponent(id)).join(",")}`
      );
      if (!itemsResp.ok) throw new Error("items");
      const itemsData = await itemsResp.json();
      const byId = new Map((itemsData.results || []).map((it) => [String(getItemKey(it)), it]));

      const rebuilt = library
        .map((m) => ({
          id: (crypto.randomUUID?.() ?? String(Date.now() + Math.random())),
          name: m.name || defaultMealName(m.ids.map((id) => byId.get(String(id))).filter(Boolean)),
          items: m.ids.map((id) => byId.get(String(id))).filter(Boolean),
          savedAt: Date.now(),
        }))
        .filter((m) => m.items.length > 0);

      if (rebuilt.length === 0) { setImportError("Those saved meals are no longer on the menu."); return; }
      setSavedMeals((prev) => mergeLibrary(prev, rebuilt));
    } catch {
      setImportError("Couldn't restore that library — the sync store is unavailable right now.");
    }
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
            exportLibrary={exportLibrary}
            libraryCode={libraryCode}
            libraryShareSuccess={libraryShareSuccess}
            importLibrary={importLibrary}
            importError={importError}
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
        <ItemModal
          item={modalItem}
          onClose={closeModal}
          goal={goal}
          scoreBounds={scoreBounds}
          isInMeal={isInMeal}
          addToMeal={addToMeal}
          isInCompare={isInCompare}
          addToCompare={addToCompare}
          compareEntryFromItem={compareEntryFromItem}
          compareFull={compareFull}
        />
      )}

    </div>
  );
}

export default App;
