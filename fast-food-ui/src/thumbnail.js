// Emoji + gradient thumbnails for menu items, chosen by category with a couple of
// name-based overrides. Pure — shared by Browse rows, the item modal, and the Meal Builder.

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

export function getThumbnail(item) {
  const name = item.title || item.name || "";
  for (const o of NAME_EMOJI_OVERRIDES) {
    if (o.test.test(name)) return o.result;
  }
  return CATEGORY_EMOJI[(item.category || "").toLowerCase()] || DEFAULT_EMOJI;
}
