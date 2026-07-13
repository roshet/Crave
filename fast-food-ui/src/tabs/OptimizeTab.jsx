import FilterChips from "../components/FilterChips";
import ScoreBreakdown from "../components/ScoreBreakdown";
import { normalizeScore, sumNutrition } from "../helpers";

// One-tap goal + calorie-cap combos.
const GOAL_PRESETS = [
  { label: "Weight Loss", goal: "balanced",     maxCalories: 500 },
  { label: "Athlete",     goal: "high_protein", maxCalories: 800 },
  { label: "Low Carb",    goal: "low_sugar",    maxCalories: 600 },
  { label: "Light Meal",  goal: "low_fat",      maxCalories: 400 },
];

// Builds the top-3 optimized meals for the current filters. State + the optimizeMeal fetch
// live in App; this renders the presets, the build button, and the result cards.
export default function OptimizeTab({
  filters, optimizeMeal, optimizeLoading, optimizeError, optimizeNoMeal,
  optimizedMealResults, scoreBounds, sendToMealBuilder,
}) {
  const { goal, setGoal, maxCalories, setMaxCalories, diet, restaurant } = filters;

  function checkMealGoal(items) {
    const t = sumNutrition(items);
    const checks = [];
    if (goal === "high_protein") checks.push(t.protein >= 35 ? "✓ High Protein" : "✗ Low Protein");
    if (goal === "low_sugar")    checks.push(t.sugars  <= 20 ? "✓ Low Sugar"    : "✗ High Sugar");
    if (goal === "low_fat")      checks.push(t.fat     <= 30 ? "✓ Low Fat"      : "✗ High Fat");
    checks.push(t.calories <= maxCalories ? "✓ Within Calories" : "✗ Over Calories");
    return checks;
  }

  return (
    <div className="optimizeTab">
      <p className="optimizeIntro">
        Picks the best entrée + side + drink combo under your calorie cap for the
        selected goal, and shows the top 3 meals. Adjust the filters or a preset below,
        then build.
      </p>
      <FilterChips filters={filters} showCategory={false} />

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
            {optimizeNoMeal && diet !== "none"
              ? `No ${diet} meal fits the ${goal.replace(/_/g, " ")} goal here` +
                (goal === "high_protein"
                  ? ` — ${diet} options can't reach 35g protein.`
                  : ".") +
                " Try another goal or a different restaurant."
              : "Try raising the calorie cap, switching the goal, or picking a different restaurant — some menus don't have a combo that fits every constraint."}
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
              {result.entree_less && (
                <p className="optimizeSidesOnly">
                  🥬 Sides-only meal — no {diet !== "none" ? `${diet} ` : ""}entree{" "}
                  {restaurant === "all" ? "available" : "at this restaurant"}
                </p>
              )}
              <p className="optimizeStats">{result.total_calories} kcal total</p>
              <div className="optimizeGoalChecks">
                {checkMealGoal(result.items).map((check, ci) => (
                  <span key={ci} className={`goalCheck ${check.startsWith("✓") ? "goalCheck--pass" : "goalCheck--fail"}`}>
                    {check}
                  </span>
                ))}
              </div>
              {result.breakdown && (
                <ScoreBreakdown breakdown={result.breakdown} title="Why this meal scores…" />
              )}
              <button className="btn btnDark" onClick={() => sendToMealBuilder(idx)}>
                Send to Meal Builder →
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
