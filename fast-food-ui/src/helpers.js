// Pure, framework-free helpers extracted from App.jsx so they can be unit-tested (see
// helpers.test.js) and reused without pulling in the whole component. Nothing here touches
// React; the only browser dependency is window.localStorage in the history loaders.

// Map a raw health_score onto a friendly 0–100 scale using the per-item min/max bounds
// the backend ships with each response (see score_bounds() in recommend_items.py). The
// backend owns these numbers so they can never drift out of sync with the scoring weights.
// `bounds` is { min, max }; `itemCount` scales them for multi-item meal totals.
export function normalizeScore(rawScore, bounds, itemCount = 1) {
  if (!bounds) return 0;
  const minTotal = bounds.min * itemCount;
  const maxTotal = bounds.max * itemCount;
  if (maxTotal === minTotal) return 0;
  const pct = ((Number(rawScore ?? 0) - minTotal) / (maxTotal - minTotal)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

export function getItemKey(item) {
  return item.item_id ?? item.id ?? `${item.restaurant}-${item.category}-${item.title || item.name}`;
}

export function getItemTags(item) {
  const tags = [];
  if (Number(item.protein  ?? 0) >= 20) tags.push({ label: "high protein", type: "protein" });
  if (Number(item.sugars   ?? 0) <= 5)  tags.push({ label: "low sugar",    type: "sugar-good" });
  if (Number(item.fat      ?? 0) >= 20) tags.push({ label: "high fat",     type: "fat" });
  else if (Number(item.fat ?? 0) <= 8)  tags.push({ label: "low fat",      type: "fat-good" });
  if (Number(item.calories ?? 0) <= 200) tags.push({ label: "low cal",     type: "cal" });
  return tags.slice(0, 3);
}

export function formatDelta(n, unit = "") {
  const v = Number(n ?? 0);
  return `${v > 0 ? "+" : ""}${v.toFixed(0)}${unit}`;
}

export function deltaStyle(delta, higherIsBetter) {
  const d = Number(delta ?? 0);
  if (higherIsBetter ? d > 0 : d < 0) return { color: "#047857", fontWeight: 700 };
  if (higherIsBetter ? d < 0 : d > 0) return { color: "#b91c1c", fontWeight: 700 };
  return { color: "#64748b", fontWeight: 600 };
}

// Max number of columns the Compare tab holds. Shared by App (staging guards) and the
// Compare tab (intro copy).
export const COMPARE_MAX = 3;

// Highlight the best/worst value across compare columns for one nutrient row. Reuses
// deltaStyle's green/red/gray semantics but scoped to the column set rather than a
// delta vs a base. All-equal (single column or a tie) gets no highlight.
export function bestWorstStyle(values, index, higherIsBetter) {
  const nums = values.map((v) => Number(v ?? 0));
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  if (max === min) return { color: "#64748b", fontWeight: 600 };
  const v = nums[index];
  const best = higherIsBetter ? max : min;
  const worst = higherIsBetter ? min : max;
  if (v === best) return { color: "#047857", fontWeight: 700 };
  if (v === worst) return { color: "#b91c1c", fontWeight: 700 };
  return { color: "#64748b", fontWeight: 600 };
}

// Single source of truth for summing a list of items' nutrition. Used everywhere a
// meal total is needed (meal builder, alternative-meal deltas, optimizer goal checks)
// so the field set can never drift between call sites.
export function sumNutrition(items) {
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

// Local calendar date as YYYY-MM-DD. Hand-built from local getters (NOT toISOString, which
// is UTC and would roll the date a few hours early/late for most timezones).
export function formatLocalDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Local calendar date as YYYY-MM-DD — the key the daily log resets on.
export function today() {
  return formatLocalDate(new Date());
}

// The last `n` local calendar dates ending today, oldest first. Used to lay out the weekly
// history chart. Uses setDate arithmetic so month/DST boundaries are handled by Date itself.
export function lastNDates(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(formatLocalDate(d));
  }
  return out;
}

// Short weekday label (Mon/Tue/…) for a YYYY-MM-DD string, parsed in LOCAL time so the
// weekday matches the calendar date (never shifted by a UTC parse of the bare string).
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function weekdayLabel(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
}

// Sum the precomputed per-entry totals into a single day total. Reuses the same nutrient
// keys as sumNutrition so the Today tab stays in lockstep with the Meal Builder.
export function sumDailyLog(entries) {
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
export function defaultMealName(items) {
  if (!items.length) return "Untitled meal";
  const first = items[0].title || items[0].name || "Meal";
  return items.length > 1 ? `${first} +${items.length - 1} more` : first;
}

// Optional macro-threshold filters surfaced under "More filters" in the filter bar. Shared
// between FilterChips (renders the inputs) and App (derives the active-count badge). Lives
// here rather than in FilterChips.jsx so that component file can export only its component
// (react-refresh/only-export-components).
export const MACRO_FIELDS = [
  { key: "minProtein", label: "Min protein", unit: "g" },
  { key: "maxSugar",   label: "Max sugar",   unit: "g" },
  { key: "maxFat",     label: "Max fat",     unit: "g" },
  { key: "maxSodium",  label: "Max sodium",  unit: "mg" },
];

// Weekly history: totals of completed past days (today stays live in dailyLog). Kept to the
// last 30 days so localStorage can't grow unbounded, though the UI only shows 7.
export const HISTORY_KEY = "crave_history";
export const HISTORY_MAX_DAYS = 30;
export const ZERO_TOTALS = { calories: 0, protein: 0, sugars: 0, fat: 0 };

// Add a day's totals to the history array (replacing any existing entry for that date),
// sorted newest-first and pruned. Pure — the same helper backs both rollover sites.
export function mergeDay(history, dayLog) {
  if (!dayLog || !Array.isArray(dayLog.entries) || dayLog.entries.length === 0) return history;
  const totals = sumDailyLog(dayLog.entries);
  const rest = history.filter((h) => h.date !== dayLog.date);
  return [{ date: dayLog.date, totals }, ...rest]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, HISTORY_MAX_DAYS);
}

export function loadHistory() {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((h) => h && typeof h.date === "string" && h.totals)
      : [];
  } catch {
    return [];
  }
}

// Per-nutrient average across a list of day totals (the 7 chart days). Divides by the full
// list length so untracked days count as zero — a truthful weekly average.
export function weeklyAverages(dayTotalsList) {
  if (!dayTotalsList.length) return { ...ZERO_TOTALS };
  const sum = dayTotalsList.reduce(
    (acc, t) => ({
      calories: acc.calories + (t.calories || 0),
      protein: acc.protein + (t.protein || 0),
      sugars: acc.sugars + (t.sugars || 0),
      fat: acc.fat + (t.fat || 0),
    }),
    { ...ZERO_TOTALS }
  );
  const n = dayTotalsList.length;
  return {
    calories: sum.calories / n,
    protein: sum.protein / n,
    sugars: sum.sugars / n,
    fat: sum.fat / n,
  };
}

// Read the persisted daily log, resetting to an empty day when the stored date isn't today.
// A stale non-empty day is first archived into crave_history so it survives in the weekly
// view. Runs before the `history` state initializer (declaration order), so loadHistory()
// below sees the archived value.
export function loadDailyLog() {
  const fresh = { date: today(), entries: [] };
  try {
    const raw = window.localStorage.getItem("crave_daily_log");
    if (!raw) return fresh;
    const parsed = JSON.parse(raw);
    if (parsed?.date !== today() || !Array.isArray(parsed.entries)) {
      if (parsed?.date && Array.isArray(parsed.entries) && parsed.entries.length) {
        try {
          window.localStorage.setItem(HISTORY_KEY, JSON.stringify(mergeDay(loadHistory(), parsed)));
        } catch { /* history archival is best-effort */ }
      }
      return fresh;
    }
    return parsed;
  } catch {
    return fresh;
  }
}
