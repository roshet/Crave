import { describe, it, expect, beforeEach } from "vitest";
import {
  normalizeScore, sumNutrition, sumDailyLog, mergeDay, loadHistory, loadDailyLog,
  weeklyAverages, lastNDates, formatLocalDate, weekdayLabel, today,
  getItemKey, deltaStyle, bestWorstStyle, defaultMealName, formatDelta, mergeLibrary,
  HISTORY_KEY, ZERO_TOTALS,
} from "./helpers";

describe("normalizeScore", () => {
  const bounds = { min: -6, max: 3 };
  it("maps the min bound to 0 and the max to 100", () => {
    expect(normalizeScore(-6, bounds)).toBe(0);
    expect(normalizeScore(3, bounds)).toBe(100);
  });
  it("maps a midpoint proportionally and rounds", () => {
    expect(normalizeScore(0, bounds)).toBe(67); // (0 - -6)/(3 - -6) = 0.666..
  });
  it("clamps out-of-range scores to [0,100]", () => {
    expect(normalizeScore(-100, bounds)).toBe(0);
    expect(normalizeScore(100, bounds)).toBe(100);
  });
  it("scales the bounds by itemCount for meal totals", () => {
    // itemCount 2 => bounds [-12, 6]; a raw 0 maps to (0 - -12)/(6 - -12) = 0.666..
    expect(normalizeScore(0, bounds, 2)).toBe(67);
  });
  it("returns 0 when bounds are missing or degenerate", () => {
    expect(normalizeScore(5, null)).toBe(0);
    expect(normalizeScore(5, { min: 4, max: 4 })).toBe(0);
  });
});

describe("sumNutrition", () => {
  it("sums every nutrient field across items", () => {
    const items = [
      { calories: 100, protein: 10, sugars: 1, fat: 5, carbs: 20, sodium: 300 },
      { calories: 200, protein: 20, sugars: 2, fat: 6, carbs: 30, sodium: 400 },
    ];
    expect(sumNutrition(items)).toEqual({
      calories: 300, protein: 30, sugars: 3, fat: 11, carbs: 50, sodium: 700,
    });
  });
  it("treats missing fields as 0 and empty list as all-zero", () => {
    expect(sumNutrition([{ calories: 50 }])).toEqual({
      calories: 50, protein: 0, sugars: 0, fat: 0, carbs: 0, sodium: 0,
    });
    expect(sumNutrition([])).toEqual({
      calories: 0, protein: 0, sugars: 0, fat: 0, carbs: 0, sodium: 0,
    });
  });
});

describe("sumDailyLog", () => {
  it("sums the four tracked nutrients from entry totals", () => {
    const entries = [
      { totals: { calories: 500, protein: 30, sugars: 5, fat: 10 } },
      { totals: { calories: 300, protein: 20, sugars: 3, fat: 8 } },
    ];
    expect(sumDailyLog(entries)).toEqual({ calories: 800, protein: 50, sugars: 8, fat: 18 });
  });
  it("tolerates entries without totals", () => {
    expect(sumDailyLog([{}])).toEqual({ calories: 0, protein: 0, sugars: 0, fat: 0 });
  });
});

describe("mergeDay", () => {
  const day = (date, cals) => ({ date, entries: [{ totals: { calories: cals, protein: 0, sugars: 0, fat: 0 } }] });

  it("adds a day's totals, newest-first", () => {
    let h = [];
    h = mergeDay(h, day("2026-07-05", 500));
    h = mergeDay(h, day("2026-07-06", 600));
    expect(h.map((x) => x.date)).toEqual(["2026-07-06", "2026-07-05"]);
    expect(h[0].totals.calories).toBe(600);
  });
  it("replaces an existing entry for the same date", () => {
    let h = mergeDay([], day("2026-07-05", 500));
    h = mergeDay(h, day("2026-07-05", 999));
    expect(h).toHaveLength(1);
    expect(h[0].totals.calories).toBe(999);
  });
  it("is a no-op for an empty/invalid day", () => {
    const h = [{ date: "2026-07-06", totals: ZERO_TOTALS }];
    expect(mergeDay(h, { date: "x", entries: [] })).toBe(h);
    expect(mergeDay(h, null)).toBe(h);
  });
  it("prunes to the last 30 days, keeping the newest", () => {
    // 40 consecutive valid dates so lexical order matches chronological order
    const base = new Date(2026, 0, 1);
    const dates = [];
    let h = [];
    for (let i = 0; i < 40; i++) {
      const dt = new Date(base);
      dt.setDate(base.getDate() + i);
      const ds = formatLocalDate(dt);
      dates.push(ds);
      h = mergeDay(h, day(ds, 100));
    }
    expect(h).toHaveLength(30);
    expect(h[0].date).toBe(dates[39]);                 // newest kept, sorted desc
    expect(h.some((x) => x.date === dates[0])).toBe(false); // oldest pruned
  });
});

describe("weeklyAverages", () => {
  it("divides by the full list length so untracked days count as zero", () => {
    const list = [{ calories: 700, protein: 35, sugars: 7, fat: 14 }, ...Array(6).fill(ZERO_TOTALS)];
    const avg = weeklyAverages(list);
    expect(avg.calories).toBeCloseTo(100, 6);
    expect(avg.protein).toBeCloseTo(5, 6);
  });
  it("returns zeros for an empty list", () => {
    expect(weeklyAverages([])).toEqual(ZERO_TOTALS);
  });
});

describe("date helpers", () => {
  it("formatLocalDate uses local getters (no UTC shift)", () => {
    expect(formatLocalDate(new Date(2026, 6, 8))).toBe("2026-07-08");
  });
  it("lastNDates returns n consecutive local dates ending today", () => {
    const d = lastNDates(7);
    expect(d).toHaveLength(7);
    expect(d[6]).toBe(today());
    for (let i = 1; i < d.length; i++) {
      const gap = (new Date(d[i]) - new Date(d[i - 1])) / 86400000;
      expect(gap).toBe(1);
    }
  });
  it("weekdayLabel parses the date in local time", () => {
    // 2021-01-01 was a Friday; 2020-01-01 a Wednesday
    expect(weekdayLabel("2021-01-01")).toBe("Fri");
    expect(weekdayLabel("2020-01-01")).toBe("Wed");
  });
});

describe("getItemKey", () => {
  it("prefers item_id, then id, then a composite fallback", () => {
    expect(getItemKey({ item_id: "Dave's Single" })).toBe("Dave's Single");
    expect(getItemKey({ id: 42 })).toBe(42);
    expect(getItemKey({ restaurant: "mcd", category: "burgers", title: "Big Mac" }))
      .toBe("mcd-burgers-Big Mac");
  });
});

describe("deltaStyle & bestWorstStyle colors", () => {
  const GREEN = "#047857";
  const RED = "#b91c1c";
  const GRAY = "#64748b";
  it("deltaStyle: direction-aware green/red, zero is gray", () => {
    expect(deltaStyle(5, true).color).toBe(GREEN);   // more is better
    expect(deltaStyle(5, false).color).toBe(RED);    // more is worse
    expect(deltaStyle(-5, false).color).toBe(GREEN); // less is better
    expect(deltaStyle(0, true).color).toBe(GRAY);
  });
  it("bestWorstStyle: highlights best/worst, ties/single are gray", () => {
    const vals = [10, 20, 30];
    expect(bestWorstStyle(vals, 2, true).color).toBe(GREEN);  // 30 highest, higher better
    expect(bestWorstStyle(vals, 0, true).color).toBe(RED);    // 10 lowest
    expect(bestWorstStyle(vals, 2, false).color).toBe(RED);   // 30 highest, lower better
    expect(bestWorstStyle([5, 5, 5], 1, true).color).toBe(GRAY);
    expect(bestWorstStyle([5], 0, true).color).toBe(GRAY);
  });
});

describe("defaultMealName & formatDelta", () => {
  it("names a meal from its first item with a +N suffix", () => {
    expect(defaultMealName([{ title: "Fries" }])).toBe("Fries");
    expect(defaultMealName([{ title: "Fries" }, { title: "Coke" }])).toBe("Fries +1 more");
    expect(defaultMealName([])).toBe("Untitled meal");
  });
  it("formatDelta signs and rounds with an optional unit", () => {
    expect(formatDelta(12.4, "g")).toBe("+12g");
    expect(formatDelta(-3)).toBe("-3");
    expect(formatDelta(0)).toBe("0");
  });
});

describe("mergeLibrary", () => {
  const meal = (name, ids) => ({ id: `id-${name}`, name, items: ids.map((x) => ({ item_id: x })), savedAt: 1 });

  it("appends incoming meals to the existing library", () => {
    const existing = [meal("A", [1])];
    const incoming = [meal("B", [2, 3])];
    const merged = mergeLibrary(existing, incoming);
    expect(merged.map((m) => m.name)).toEqual(["A", "B"]);
  });

  it("skips an exact duplicate (same name + same ordered ids)", () => {
    const existing = [meal("Lunch", [1, 2])];
    const incoming = [meal("Lunch", [1, 2])]; // different object id, same signature
    expect(mergeLibrary(existing, incoming)).toHaveLength(1);
  });

  it("keeps a same-name meal whose items differ", () => {
    const existing = [meal("Lunch", [1, 2])];
    const incoming = [meal("Lunch", [1, 3])];
    expect(mergeLibrary(existing, incoming)).toHaveLength(2);
  });

  it("treats a reordered id-set as distinct (order is part of the signature)", () => {
    const existing = [meal("Lunch", [1, 2])];
    const incoming = [meal("Lunch", [2, 1])];
    expect(mergeLibrary(existing, incoming)).toHaveLength(2);
  });

  it("does not mutate the input arrays", () => {
    const existing = [meal("A", [1])];
    const incoming = [meal("B", [2])];
    mergeLibrary(existing, incoming);
    expect(existing).toHaveLength(1);
    expect(incoming).toHaveLength(1);
  });

  it("tolerates null/empty arguments", () => {
    expect(mergeLibrary(null, null)).toEqual([]);
    expect(mergeLibrary([meal("A", [1])], null)).toHaveLength(1);
    expect(mergeLibrary(null, [meal("B", [2])])).toHaveLength(1);
  });
});

// The rollover logic that previously had no test: a stale day archives into crave_history.
describe("loadDailyLog / loadHistory (localStorage rollover)", () => {
  beforeEach(() => localStorage.clear());

  it("returns the stored log unchanged when it is for today", () => {
    const log = { date: today(), entries: [{ id: "a", totals: { calories: 100, protein: 5, sugars: 1, fat: 2 } }] };
    localStorage.setItem("crave_daily_log", JSON.stringify(log));
    expect(loadDailyLog()).toEqual(log);
    expect(loadHistory()).toEqual([]); // nothing archived
  });

  it("archives a stale non-empty day into crave_history and returns a fresh empty day", () => {
    const stale = { date: "2020-01-01", entries: [{ id: "a", totals: { calories: 700, protein: 30, sugars: 5, fat: 10 } }] };
    localStorage.setItem("crave_daily_log", JSON.stringify(stale));

    const fresh = loadDailyLog();
    expect(fresh.date).toBe(today());
    expect(fresh.entries).toEqual([]);

    const archived = JSON.parse(localStorage.getItem(HISTORY_KEY));
    expect(archived).toHaveLength(1);
    expect(archived[0].date).toBe("2020-01-01");
    expect(archived[0].totals.calories).toBe(700);
    // loadHistory reads it back
    expect(loadHistory()[0].date).toBe("2020-01-01");
  });

  it("does not archive a stale but empty day", () => {
    localStorage.setItem("crave_daily_log", JSON.stringify({ date: "2020-01-01", entries: [] }));
    loadDailyLog();
    expect(localStorage.getItem(HISTORY_KEY)).toBeNull();
  });

  it("returns a fresh day and ignores corrupt storage", () => {
    localStorage.setItem("crave_daily_log", "{not json");
    expect(loadDailyLog()).toEqual({ date: today(), entries: [] });
    localStorage.setItem(HISTORY_KEY, "{not json");
    expect(loadHistory()).toEqual([]);
  });
});
