// Renders the "Why this score" contribution bars. `breakdown` is the array the backend
// ships (score_breakdown / meal_breakdown): one entry per nutrient with
// { key, label, value, unit, points }. Positive points raised the score (green bar
// growing right from the center axis); negative lowered it (red bar growing left). Bar
// length is relative to the biggest-magnitude term so the dominant driver reads at a
// glance. The backend owns the math — this only visualizes what it sends. Shared by the
// Browse modal, the Optimize meal cards, and the Meal Builder.
export default function ScoreBreakdown({ breakdown, title = "Why this score?" }) {
  if (!breakdown || !breakdown.length) return null;
  const maxMag = Math.max(...breakdown.map((t) => Math.abs(Number(t.points) || 0)), 0);
  const EPS = 0.02; // below this a term didn't meaningfully move the score
  return (
    <div className="scoreBreakdown">
      <div className="breakdownHead">{title}</div>
      {breakdown.map((t) => {
        const mag = Math.abs(Number(t.points) || 0);
        const neutral = maxMag === 0 || mag < EPS;
        const up = Number(t.points) > 0;
        const width = neutral ? 0 : (mag / maxMag) * 50;
        const valNum = Number(t.value);
        const valLabel = Number.isInteger(valNum) ? valNum : valNum.toFixed(1);
        return (
          <div className="breakdownRow" key={t.key}>
            <span className="breakdownLabel">{t.label}</span>
            <span className="breakdownValue">{valLabel}{t.unit}</span>
            <span className="breakdownBarTrack">
              {neutral ? (
                <span className="breakdownNeutral" />
              ) : (
                <span
                  className={`breakdownBar breakdownBar--${up ? "up" : "down"}`}
                  style={{ width: `${width}%`, [up ? "left" : "right"]: "50%" }}
                />
              )}
            </span>
          </div>
        );
      })}
      <div className="breakdownLegend">
        <span className="breakdownLegendUp">Green raises</span> ·{" "}
        <span className="breakdownLegendDown">red lowers</span>
      </div>
    </div>
  );
}
