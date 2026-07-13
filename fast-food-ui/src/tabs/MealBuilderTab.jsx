import ScoreBreakdown from "../components/ScoreBreakdown";
import { getThumbnail } from "../thumbnail";
import { getItemKey, normalizeScore, sumNutrition, deltaStyle, formatDelta, COMPARE_MAX } from "../helpers";

// The user's hand-built meal: macro rings, goal badges, the backend meal score, action row,
// optimizer alternatives, and saved meals. State + all handlers live in App and are passed in.
export default function MealBuilderTab({
  meal, mealTotals, mealScore, goal, maxCalories, scoreBounds,
  removeFromMeal, exportMeal, copySuccess, shareMeal, shareSuccess,
  logMealToToday, logSuccess, addToCompare, compareEntryFromMeal, compareFull, clearMeal,
  alternativeMealsWithDeltas, setMeal, setAlternativeMeals,
  savedMeals, mealName, setMealName, saveMeal, saveSuccess, loadSavedMeal, deleteSavedMeal,
}) {
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

  return (
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

          {mealScore && mealScore.item_count > 0 && (
            <div className="mealScoreCard">
              <div className="mealScoreHead">
                <span className="mealScoreLabel">Meal score</span>
                <span
                  className="mealScoreValue"
                  title={`Health score for ${goal.replace(/_/g, " ")} goal`}
                  aria-label={`Meal health score ${normalizeScore(mealScore.total_score, mealScore.score_bounds, mealScore.item_count)} out of 100`}
                >
                  {normalizeScore(mealScore.total_score, mealScore.score_bounds, mealScore.item_count)}
                  <span className="mealScoreUnit">/100</span>
                </span>
              </div>
              <ScoreBreakdown breakdown={mealScore.breakdown} title="Why this meal scores…" />
            </div>
          )}

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
            <button
              className="btn btnOutline"
              onClick={() => addToCompare(compareEntryFromMeal(meal))}
              disabled={compareFull}
              title={compareFull ? `Compare holds ${COMPARE_MAX}` : "Add this meal to Compare"}
            >
              {compareFull ? `Compare full (${COMPARE_MAX})` : "⚖️ Compare"}
            </button>
            <button className="btn btnOutline" onClick={clearMeal}>Clear</button>
          </div>

          {alternativeMealsWithDeltas.length > 0 && (
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
                  <button
                    className="btn btnOutline btnSm"
                    onClick={() => addToCompare(compareEntryFromMeal(m.items, m.name))}
                    disabled={compareFull}
                    title={compareFull ? `Compare holds ${COMPARE_MAX}` : "Add to Compare"}
                  >
                    Compare
                  </button>
                  <button className="mealItemRemove" onClick={() => deleteSavedMeal(m.id)} aria-label={`Delete saved meal ${m.name}`}>✕</button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
