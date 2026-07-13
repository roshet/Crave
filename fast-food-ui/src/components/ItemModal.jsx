import { useEffect, useRef } from "react";
import { getThumbnail } from "../thumbnail";
import { normalizeScore, COMPARE_MAX } from "../helpers";
import ScoreBreakdown from "./ScoreBreakdown";

// The bottom-sheet item detail modal: thumbnail, score badge, nutrition grid, score
// breakdown, and the Add-to-Meal / Add-to-Compare actions. App owns `modalItem` and only
// mounts this when an item is set, so there's no null-item branch here. Every action reads
// or writes App state, so they all arrive as props (same prop-drilling pattern as the tabs).
export default function ItemModal({
  item, onClose, goal, scoreBounds,
  isInMeal, addToMeal,
  isInCompare, addToCompare, compareEntryFromItem, compareFull,
}) {
  const sheetRef = useRef(null);

  // While open: Escape closes, focus is trapped within the sheet, and focus is restored to
  // the element that opened it (the Browse row) on close. `onClose` must be referentially
  // stable — App memoizes it — or this would re-run on every App render and steal focus.
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const sheet = sheetRef.current;
    const getFocusable = () => sheet
      ? Array.from(sheet.querySelectorAll(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ))
      : [];

    // Move focus into the dialog on open.
    getFocusable()[0]?.focus();

    const onKey = (e) => {
      if (e.key === "Escape") { onClose(); return; }
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
  }, [item, onClose]);

  const { emoji, gradient } = getThumbnail(item);
  const added = isInMeal(item);
  const compared = isInCompare(item);

  return (
    <div className="modalBackdrop" onClick={onClose}>
      <div
        className="modalSheet"
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modalItemName"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modalDragHandle" />
        <button className="modalClose" aria-label="Close" onClick={onClose}>✕</button>

        <div className="modalItemHeader">
          <div className="modalThumb" style={{ background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})` }}>
            {emoji}
          </div>
          <div className="modalItemMeta">
            <h2 className="modalItemName" id="modalItemName">
              {item.title || item.name}
              {item.vegan
                ? <span className="vegBadge" title="Vegan" aria-label="Vegan">🥬</span>
                : item.vegetarian
                ? <span className="vegBadge" title="Vegetarian" aria-label="Vegetarian">🌱</span>
                : null}
            </h2>
            <p className="modalItemSub">{item.restaurant} · {item.category}</p>
          </div>
          {typeof item.score !== "undefined" && (
            <span
              className="modalScoreBadge"
              title={`Health score for ${goal.replace(/_/g," ")} goal`}
              aria-label={`Health score ${normalizeScore(item.score, scoreBounds)} out of 100`}
            >
              {normalizeScore(item.score, scoreBounds)}<span className="modalScoreUnit">/100</span>
            </span>
          )}
        </div>

        <div className="nutritionGrid">
          {[
            { label: "Calories", value: String(item.calories), color: "#6366f1" },
            { label: "Protein",  value: `${item.protein}g`,    color: "#22c55e" },
            { label: "Sugar",    value: `${item.sugars}g`,     color: "#f59e0b" },
            { label: "Fat",      value: `${item.fat}g`,        color: "#ef4444" },
            { label: "Carbs",    value: `${item.carbs}g`,      color: "#6366f1" },
            { label: "Sodium",   value: `${item.sodium}mg`,    color: "#64748b" },
          ].map((n) => (
            <div key={n.label} className="nutritionTile">
              <span className="nutritionValue" style={{ color: n.color }}>{n.value}</span>
              <span className="nutritionLabel">{n.label}</span>
            </div>
          ))}
        </div>

        {item.summary && (
          <div className="summaryBadge">✓ {item.summary}</div>
        )}

        {item.breakdown && <ScoreBreakdown breakdown={item.breakdown} />}

        <button
          className={`addToMealBtn${added ? " addToMealBtn--added" : ""}`}
          disabled={added}
          onClick={() => { addToMeal(item); onClose(); }}
        >
          {added ? "✓ Added" : "Add to Meal"}
        </button>
        <button
          className="addToCompareBtn"
          disabled={compared || compareFull}
          onClick={() => { addToCompare(compareEntryFromItem(item)); onClose(); }}
        >
          {compared
            ? "✓ In compare"
            : compareFull
            ? `Compare full (${COMPARE_MAX})`
            : "⚖️ Add to Compare"}
        </button>
      </div>
    </div>
  );
}
