import { Fragment } from "react";
import { bestWorstStyle, COMPARE_MAX } from "../helpers";

// Nutrient rows shown in the Compare table. higherIsBetter drives best/worst coloring.
const COMPARE_NUTRIENTS = [
  { key: "calories", label: "Calories", unit: "",   higherIsBetter: false },
  { key: "protein",  label: "Protein",  unit: "g",  higherIsBetter: true  },
  { key: "sugars",   label: "Sugar",    unit: "g",  higherIsBetter: false },
  { key: "fat",      label: "Fat",      unit: "g",  higherIsBetter: false },
  { key: "carbs",    label: "Carbs",    unit: "g",  higherIsBetter: false },
  { key: "sodium",   label: "Sodium",   unit: "mg", higherIsBetter: false },
];

// Lines up 2–COMPARE_MAX items/meals as columns; each nutrient row highlights the best
// (green) and worst (red) value. State lives in App; this component is presentational.
export default function CompareTab({ compareColumns, removeFromCompare, clearCompare }) {
  return (
    <div className="compareTab">
      <p className="optimizeIntro">
        Line up 2–{COMPARE_MAX} items or meals side by side. For each nutrient the
        best value is green and the worst is red (more protein is better; less of
        everything else is better).
      </p>
      {compareColumns.length === 0 ? (
        <div className="optimizeEmpty">
          <p>
            Nothing to compare yet. Add items from the Browse detail view, or add a
            meal from the Meal Builder or your saved meals.
          </p>
        </div>
      ) : (
        <>
          <div className="compareScroll">
            <div
              className="compareTable"
              style={{ gridTemplateColumns: `minmax(88px, auto) repeat(${compareColumns.length}, minmax(96px, 1fr))` }}
            >
              {/* Header row: nutrient label spacer + one head per column */}
              <div className="compareRowLabel compareCorner" />
              {compareColumns.map((col) => (
                <div key={col.id} className="compareColHead">
                  <span className="compareColLabel">
                    {col.kind === "meal" ? "🍽️ " : ""}{col.label}
                  </span>
                  <button
                    className="compareRemove"
                    onClick={() => removeFromCompare(col.id)}
                    aria-label={`Remove ${col.label} from compare`}
                  >
                    ✕
                  </button>
                </div>
              ))}

              {/* One row per nutrient */}
              {COMPARE_NUTRIENTS.map((n) => {
                const values = compareColumns.map((c) => c.totals[n.key]);
                return (
                  <Fragment key={n.key}>
                    <div className="compareRowLabel">{n.label}</div>
                    {compareColumns.map((col, i) => (
                      <div
                        key={col.id}
                        className="compareCell"
                        style={bestWorstStyle(values, i, n.higherIsBetter)}
                      >
                        {Number(values[i] ?? 0).toFixed(0)}{n.unit}
                      </div>
                    ))}
                  </Fragment>
                );
              })}
            </div>
          </div>
          <div className="actionRow">
            <button className="btn btnOutline" onClick={clearCompare}>Clear all</button>
          </div>
        </>
      )}
    </div>
  );
}
