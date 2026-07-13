import FilterChips from "../components/FilterChips";
import SkeletonRow from "../components/SkeletonRow";
import { getThumbnail } from "../thumbnail";
import { getItemKey, getItemTags, normalizeScore } from "../helpers";

// Browse sort options. `value` matches the backend /recommend `sort` param; direction is
// baked into each label (backend sorts score/protein desc, calories/sugars/fat/sodium asc).
const SORT_OPTIONS = [
  { value: "score",    label: "Best score" },
  { value: "calories", label: "Fewest calories" },
  { value: "protein",  label: "Most protein" },
  { value: "sugars",   label: "Least sugar" },
  { value: "fat",      label: "Least fat" },
  { value: "sodium",   label: "Least sodium" },
];

// The Browse item list: shared filters + search + sort, then result rows that open the
// detail modal. All fetching/state lives in App; rows call setModalItem to open the modal.
export default function BrowseTab({
  filters, search, setSearch, sort, setSort, error, loading,
  results, displayedResults, debouncedSearch, hasSearched, scoreBounds, setModalItem,
}) {
  const { goal, diet, activeMacroCount } = filters;

  return (
    <div className="browseTab">
      <FilterChips filters={filters} showCategory={true} />
      <div className="searchBar">
        <span className="searchIcon">🔍</span>
        <input
          className="searchInput"
          type="text"
          placeholder="Search all menu items…"
          aria-label="Search all menu items by name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="sortRow">
        <span className="sortLabel">Sort by</span>
        <select
          className="chipSelect"
          aria-label="Sort results"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      {error && <p className="errorMsg">{error}</p>}
      {!loading && !error && results.length > 0 && (
        <p className="resultCount">
          {debouncedSearch.trim()
            ? `Showing ${results.length} result${results.length === 1 ? "" : "s"} for “${debouncedSearch.trim()}”`
            : `Showing ${results.length} items for these filters`}
        </p>
      )}
      <div className="itemList">
        {loading && [0,1,2,3,4].map((i) => <SkeletonRow key={i} />)}
        {!loading && hasSearched && displayedResults.length === 0 && !error && (
          debouncedSearch.trim() ? (
            <p className="emptyMsg">
              No menu items match “{debouncedSearch.trim()}”.
            </p>
          ) : diet !== "none" ? (
            <p className="emptyMsg">
              No {diet} items match this goal. Try a different goal (e.g. Low Fat) or Optimize for a {diet} meal.
            </p>
          ) : activeMacroCount > 0 ? (
            <p className="emptyMsg">
              No items match your macro filters. Try relaxing them under “More filters.”
            </p>
          ) : (
            <p className="emptyMsg">No items matched your criteria.</p>
          )
        )}
        {!loading && displayedResults.map((item) => {
          const { emoji, gradient } = getThumbnail(item);
          const tags = getItemTags(item);
          return (
            <button
              key={getItemKey(item)}
              type="button"
              className="itemRow"
              onClick={() => setModalItem(item)}
              aria-label={`View details for ${item.title || item.name}`}
            >
              <div
                className="itemThumbnail"
                style={{ background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})` }}
              >
                {emoji}
              </div>
              <div className="itemInfo">
                <div className="itemName">
                  {item.title || item.name}
                  {item.vegan
                    ? <span className="vegBadge" title="Vegan" aria-label="Vegan">🥬</span>
                    : item.vegetarian
                    ? <span className="vegBadge" title="Vegetarian" aria-label="Vegetarian">🌱</span>
                    : null}
                </div>
                <div className="itemStats">
                  {item.calories} kcal · {item.protein}g protein · {item.sugars}g sugar
                </div>
                {tags.length > 0 && (
                  <div className="itemTags">
                    {tags.map((tag) => (
                      <span key={tag.label} className={`itemTag itemTag--${tag.type}`}>{tag.label}</span>
                    ))}
                  </div>
                )}
              </div>
              <div
                className="itemScore"
                title={`Health score for ${goal.replace(/_/g," ")} goal`}
                aria-label={`Health score ${normalizeScore(item.score, scoreBounds)} out of 100`}
              >
                {normalizeScore(item.score, scoreBounds)}<span className="itemScoreUnit">/100</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
