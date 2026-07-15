// Nutrients tracked on the Today tab, with display metadata. Sodium/carbs exist in the data
// but are intentionally excluded to keep the daily view focused.
const TARGET_NUTRIENTS = [
  { key: "calories", label: "Calories", unit: "" },
  { key: "protein",  label: "Protein",  unit: "g" },
  { key: "sugars",   label: "Sugar",    unit: "g" },
  { key: "fat",      label: "Fat",      unit: "g" },
];

// Daily targets editor + today's progress + logged meals + the 7-day "This week" chart.
// All state and the derived week memos live in App and are passed in as props.
export default function TodayTab({
  targets, updateTarget, dailyTotals, dailyLog, removeLogEntry, resetDay, weekChart, weekSeries,
  weekMetric, setWeekMetric,
}) {
  const metric = TARGET_NUTRIENTS.find((n) => n.key === weekMetric) ?? TARGET_NUTRIENTS[0];
  // Calories read as "kcal"; the other three tracked nutrients are all grams.
  const chartUnit = weekMetric === "calories" ? "kcal" : "g";
  return (
    <div className="todayTab">
      <p className="optimizeIntro">
        Set your daily targets, then use <strong>➕ Log to Today</strong> in the Meal
        Builder to track meals against them. Totals persist on this device; each day rolls
        into your <strong>7-day history</strong> below.
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

      <div className="weekHistory">
        <h3 className="todaySectionTitle">This week</h3>
        <div className="weekMetricTabs" role="group" aria-label="Choose which nutrient to chart">
          {TARGET_NUTRIENTS.map((n) => (
            <button
              key={n.key}
              type="button"
              className={"weekMetricBtn" + (n.key === weekMetric ? " weekMetricBtn--active" : "")}
              aria-pressed={n.key === weekMetric}
              onClick={() => setWeekMetric(n.key)}
            >
              {n.label}
            </button>
          ))}
        </div>
        {weekChart.allZero ? (
          <p className="weekEmptyHint">Log meals each day to see your weekly {metric.label.toLowerCase()} trend.</p>
        ) : (
          <>
            <div
              className="weekChart"
              role="img"
              aria-label={
                `Daily ${metric.label.toLowerCase()} over the last 7 days` +
                (weekChart.metricTarget ? ` versus your ${weekChart.metricTarget} ${chartUnit} target` : "")
              }
            >
              {weekChart.metricTarget > 0 && (
                <div className="weekTargetLine" style={{ bottom: `${weekChart.targetPct}%` }}>
                  <span className="weekTargetLabel">Target {weekChart.metricTarget} {chartUnit}</span>
                </div>
              )}
              {weekChart.days.map((d) => (
                <div key={d.date} className="weekBarCell">
                  <div
                    className={
                      "weekBar" +
                      (d.over ? " weekBar--over" : "") +
                      (d.isToday ? " weekBar--today" : "")
                    }
                    style={{ height: `${d.heightPct}%` }}
                    title={`${d.label}: ${d.value.toFixed(0)} ${chartUnit}`}
                  />
                </div>
              ))}
            </div>
            <div className="weekDayRow">
              {weekChart.days.map((d) => (
                <span
                  key={d.date}
                  className={"weekDayLabel" + (d.isToday ? " weekDayLabel--today" : "")}
                >
                  {d.label}
                </span>
              ))}
            </div>
            <div className="weekAverages">
              <span className="weekAveragesLabel">7-day avg</span>
              {TARGET_NUTRIENTS.map((n) => {
                const avg = weekSeries.averages[n.key] || 0;
                const over = targets[n.key] > 0 && avg > targets[n.key];
                return (
                  <span key={n.key} className={"weekAvgStat" + (over ? " weekAvgStat--over" : "")}>
                    {avg.toFixed(0)}{n.unit} {n.label.toLowerCase()}
                  </span>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
