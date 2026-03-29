import { useMemo, useState } from "react";
import "./App.css";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

function App() {
  const [goal, setGoal] = useState("balanced");
  const [category, setCategory] = useState("");
  const [restaurant, setRestaurant] = useState("mcdonalds");
  const [maxCalories, setMaxCalories] = useState(600);

  // Keep as string so the input can be edited naturally (no “stuck 0” problem)
  const [topN, setTopN] = useState("10");

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("score");
  const [sortDir, setSortDir] = useState("desc");

  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState("");

  // -----------------------------
  // Meal Builder state
  // -----------------------------
  const [meal, setMeal] = useState([]);
  const [mealExplanation, setMealExplanation] = useState([]);
  const [alternativeMeals, setAlternativeMeals] = useState([]);

  const mcdCategories = [
    { value: "burgers", label: "Burgers" },
    { value: "breakfast", label: "Breakfast" },
    { value: "nuggets_strips", label: "Nuggets & Strips" },
    { value: "fries_sides", label: "Fries & Sides" },
    { value: "desserts", label: "Desserts" },
    { value: "beverages", label: "Beverages" },
  ];

  const chickfilaCategories = [
    { value: "breakfast", label: "Breakfast" },
    { value: "entrees", label: "Entrees" },
    { value: "salads", label: "Salads" },
    { value: "sides", label: "Sides" },
    { value: "drinks", label: "Drinks" },
  ];

  const wendysCategories = [
    { value: "burgers", label: "Burgers" },
    { value: "chicken", label: "Chicken" },
    { value: "wraps", label: "Wraps" },
    { value: "salads", label: "Salads" },
    { value: "sides", label: "Sides" },
  ];

  function getItemKey(item) {
    // Use a real ID if you have it; otherwise build a stable-ish key
    return item.item_id ?? item.id ?? `${item.restaurant}-${item.category}-${item.title || item.name}`;
  }

  function isInMeal(item) {
    const key = getItemKey(item);
    return meal.some((x) => getItemKey(x) === key);
  }

  function addToMeal(item) {
    const key = getItemKey(item);
    setMeal((prev) => {
      if (prev.some((x) => getItemKey(x) === key)) return prev; // no duplicates
      return [...prev, item];
    });
  }

  function removeFromMeal(item) {
    const key = getItemKey(item);
    setMeal((prev) => prev.filter((x) => getItemKey(x) !== key));
  }

  function clearMeal() {
    setMeal([]);
  }

  function calcTotals(items) {
    return (items || []).reduce(
      (acc, item) => {
        acc.calories += Number(item.calories ?? 0);
        acc.protein += Number(item.protein ?? 0);
        acc.sugars += Number(item.sugars ?? 0);
        acc.fat += Number(item.fat ?? 0);
        acc.carbs += Number(item.carbs ?? 0);
        acc.sodium += Number(item.sodium ?? 0);
        return acc;
      },
      { calories: 0, protein: 0, sugars: 0, fat: 0, carbs: 0, sodium: 0 }
    );
  }

  function formatDelta(n, unit = "") {
    const value = Number(n ?? 0);
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(0)}${unit}`;
  }

  // For coloring deltas: for some nutrients lower is better, for others higher is better.
  // If higherIsBetter = true: positive is green, negative is red.
  // If higherIsBetter = false: negative is green, positive is red.
  function deltaStyle(delta, higherIsBetter) {
    const d = Number(delta ?? 0);
    const good = higherIsBetter ? d > 0 : d < 0;
    const bad = higherIsBetter ? d < 0 : d > 0;

    if (good) return { color: "#047857", fontWeight: 700 }; // green
    if (bad) return { color: "#b91c1c", fontWeight: 700 }; // red
    return { color: "#374151", fontWeight: 600 }; // neutral
  }

  const mealTotals = useMemo(() => {
    return meal.reduce(
      (acc, item) => {
        acc.calories += Number(item.calories ?? 0);
        acc.protein += Number(item.protein ?? 0);
        acc.sugars += Number(item.sugars ?? 0);
        acc.fat += Number(item.fat ?? 0);
        acc.carbs += Number(item.carbs ?? 0);
        acc.sodium += Number(item.sodium ?? 0);
        return acc;
      },
      { calories: 0, protein: 0, sugars: 0, fat: 0, carbs: 0, sodium: 0 }
    );
  }, [meal]);

  const alternativeMealsWithDeltas = useMemo(() => {
  const base = mealTotals; // compare against currently selected meal
  return (alternativeMeals || []).map((m) => {
    const t = calcTotals(m.items);

    return {
      ...m,
      totals: t,
      deltas: {
        calories: t.calories - base.calories,
        protein: t.protein - base.protein,
        sugars: t.sugars - base.sugars,
        fat: t.fat - base.fat,
        sodium: t.sodium - base.sodium,
      },
    };
  });
}, [alternativeMeals, mealTotals]);

  const remainingCalories = Math.max(0, maxCalories - mealTotals.calories);
  const overCalories = Math.max(0, mealTotals.calories - maxCalories);

  async function fetchRecommendations() {
    setHasSearched(true);
    setLoading(true);
    setError("");

    const parsedTopN = Number(topN) || 10;

    try {
      let url = `${API_BASE_URL}/recommend?restaurant=${encodeURIComponent(
        restaurant
      )}&goal=${encodeURIComponent(goal)}&max_calories=${encodeURIComponent(
        maxCalories
      )}&top_n=${encodeURIComponent(parsedTopN)}&format=human`;

      if (category) url += `&category=${encodeURIComponent(category)}`;

      const response = await fetch(url);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`API error (${response.status}): ${text}`);
      }

      const data = await response.json();
      setResults(data.results || []);
    } catch (e) {
      setResults([]);
      setError(e.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function optimizeMeal() {
    console.log("OPTIMIZE CLICKED - CATEGORY STATE:", category);

    setLoading(true);
    setError("");

    try {
      let url = `${API_BASE_URL}/optimize_meal?restaurant=${encodeURIComponent(
        restaurant
      )}&goal=${encodeURIComponent(goal)}&max_calories=${encodeURIComponent(
        maxCalories
      )}&format=human`;

      url += `&category=${encodeURIComponent(category)}`;

      console.log("OPTIMIZE URL:", url);

      const response = await fetch(url);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`API error (${response.status}): ${text}`);
      }

      const data = await response.json();

      if (data.meals && data.meals.length > 0) {
        // Best meal
        setMeal(data.meals[0].items);
        setMealExplanation([]);

        // Remaining meals are alternatives
        setAlternativeMeals(data.meals.slice(1));
      } else {
        setError(data.message || "No meal found.");
      }
    } catch (e) {
      setError(e.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  // Filter + Sort
  const displayedResults = useMemo(() => {
    return [...results]
      .filter((item) => {
        if (!search.trim()) return true;
        const text = (item.title || item.name || "").toLowerCase();
        return text.includes(search.trim().toLowerCase());
      })
      .sort((a, b) => {
        const dir = sortDir === "asc" ? 1 : -1;

        if (sortBy === "score") {
          const av = Number(a.score ?? 0);
          const bv = Number(b.score ?? 0);
          return (av - bv) * dir;
        }

        const getNum = (obj, key) => Number(obj[key] ?? 0);
        const av = getNum(a, sortBy);
        const bv = getNum(b, sortBy);
        return (av - bv) * dir;
      });
  }, [results, search, sortBy, sortDir]);

  function NutritionBar({ label, value = 0, max = 100 }) {
    const safeValue = Number(value ?? 0);
    const percent = Math.min((safeValue / max) * 100, 100);

    return (
      <div className="barRow">
        <div className="barLabel">
          {label}: {safeValue}
        </div>
        <div className="barTrack">
          <div className="barFill" style={{ width: `${percent}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="container">
        <h1 className="title">Fast Food Recommender</h1>
        <p className="subtitle">Build healthier fast-food meals with smart nutrition ranking.</p>

        {/* Controls */}
        <div className="card controlsCard">
          <div className="grid">
            <div>
              <label className="label">Restaurant</label>
              <select
                className="select"
                value={restaurant}
                onChange={(e) => {
                  setRestaurant(e.target.value);
                  setCategory("");
                }}
              >
                <option value="mcdonalds">McDonald's</option>
                <option value="chickfila">Chick-fil-A</option>
                <option value="wendys">Wendy's</option>
                <option value="all">All Restaurants</option>
              </select>
            </div>

            <div>
              <label className="label">Goal</label>
              <select
                className="select"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
              >
                <option value="balanced">Balanced</option>
                <option value="high_protein">High Protein</option>
                <option value="low_sugar">Low Sugar</option>
                <option value="low_fat">Low Fat</option>
              </select>
            </div>

            {restaurant !== "all" && (
              <div>
                <label className="label">Category</label>
                <select
                  className="select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">All</option>
                  {(restaurant === "mcdonalds"
                    ? mcdCategories
                    : restaurant === "chickfila"
                    ? chickfilaCategories
                    : restaurant === "wendys"
                    ? wendysCategories
                    : []
                  ).map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="label">Max Calories: {maxCalories}</label>
              <input
                className="range"
                type="range"
                min="200"
                max="1000"
                step="50"
                value={maxCalories}
                onChange={(e) => setMaxCalories(Number(e.target.value))}
              />
            </div>

            <div>
              <label className="label">Top N</label>
              <input
                className="input"
                type="number"
                min="1"
                max="50"
                value={topN}
                onChange={(e) => setTopN(e.target.value)} // keep string
              />
            </div>

            <div>
              <label className="label">Search</label>
              <input
                className="input"
                type="text"
                placeholder="Search items..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div>
              <label className="label">Sort By</label>
              <select
                className="select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="score">Health Score</option>
                <option value="calories">Calories</option>
                <option value="protein">Protein</option>
                <option value="sugars">Sugars</option>
                <option value="fat">Fat</option>
              </select>
            </div>

            <div>
              <label className="label">Direction</label>
              <select
                className="select"
                value={sortDir}
                onChange={(e) => setSortDir(e.target.value)}
              >
                <option value="desc">High → Low</option>
                <option value="asc">Low → High</option>
              </select>
            </div>

            <div className="actionButtons">
              <button className="btn" onClick={fetchRecommendations} disabled={loading}>
                {loading ? "Loading..." : "Get Recommendations"}
              </button>

              <button className="btn secondaryBtn" onClick={optimizeMeal} disabled={loading}>
                {loading ? "Loading..." : "Auto Build Optimal Meal"}
              </button>
            </div>
          </div>
        </div>

        {/* Meal Builder */}
        <div className="card resultsCard" style={{ marginBottom: "1.5rem" }}>
          <div className="resultHeader">
            <h3 className="resultTitle">Meal Builder</h3>
            <button
              className="btn compactBtn"
              onClick={clearMeal}
              disabled={meal.length === 0}
            >
              Clear
            </button>
          </div>

          {meal.length === 0 ? (
            <p className="msg">Add items from the results to build a meal.</p>
          ) : (
            <>
              <p className="meta">
                <strong>Items:</strong>{" "}
                {meal.map((m) => m.title || m.name).join(", ")}
              </p>

              <p className="meta">
                <strong>Total Calories:</strong> {mealTotals.calories.toFixed(0)}{" "}
                {overCalories > 0 ? (
                  <span style={{ color: "#b91c1c", fontWeight: 700 }}>
                    (Over by {overCalories.toFixed(0)})
                  </span>
                ) : (
                  <span style={{ color: "#047857", fontWeight: 700 }}>
                    (Remaining {remainingCalories.toFixed(0)})
                  </span>
                )}
              </p>

              <p className="meta">
                <strong>Total Protein:</strong> {mealTotals.protein.toFixed(0)}g
                {goal === "high_protein" && (
                  mealTotals.protein >= 35 ? (
                    <span style={{ color: "#047857", fontWeight: 700 }}>
                      {" "}✓ Meets High Protein Target
                    </span>
                  ) : (
                    <span style={{ color: "#b91c1c", fontWeight: 700 }}>
                      {" "}✗ Below 35g Target
                    </span>
                  )
                )}
              </p>

              <p className="meta">
                <strong>Total Sugar:</strong> {mealTotals.sugars.toFixed(0)}g
                {goal === "low_sugar" && (
                  mealTotals.sugars <= 20 ? (
                    <span style={{ color: "#047857", fontWeight: 700 }}>
                      {" "}✓ Within Low Sugar Target
                    </span>
                  ) : (
                    <span style={{ color: "#b91c1c", fontWeight: 700 }}>
                      {" "}✗ Exceeds 20g Limit
                    </span>
                  )
                )}
              </p>

              <p className="meta">
                <strong>Total Fat:</strong> {mealTotals.fat.toFixed(0)}g
                {goal === "low_fat" && (
                  mealTotals.fat <= 30 ? (
                    <span style={{ color: "#047857", fontWeight: 700 }}>
                      {" "}✓ Within Low Fat Target
                    </span>
                  ) : (
                    <span style={{ color: "#b91c1c", fontWeight: 700 }}>
                      {" "}✗ Exceeds 30g Limit
                    </span>
                  )
                )}
              </p>

              <div className="bars">
                <NutritionBar label="Calories" value={mealTotals.calories} max={1000} />
                <NutritionBar label="Protein" value={mealTotals.protein} max={120} />
                <NutritionBar label="Sugar" value={mealTotals.sugars} max={80} />
                <NutritionBar label="Fat" value={mealTotals.fat} max={80} />
              </div>

              {mealExplanation.length > 0 && (
                <div className="mealWhy">
                  <strong>Why this meal?</strong>
                  <ul>
                    {mealExplanation.map((line, idx) => (
                      <li key = {idx}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}

              {alternativeMeals.length > 0 && (
                <div className="alternativeSection">
                  <h4 className="alternativeTitle">Alternative Optimized Meals</h4>

                  {alternativeMealsWithDeltas.map((mealOption, idx) => (
                    <div key={idx} className="altMealCard">
                      <p><strong>Option {idx + 2}</strong></p>

                      <p>
                        {mealOption.items.map((m) => m.title || m.name).join(", ")}
                      </p>

                      <p>
                        Calories: {mealOption.total_calories} | Score: {mealOption.total_score}
                      </p>

                      <div className="deltaWrap">
                        <div>
                          <strong>Δ vs current:</strong>{" "}
                          <span style={deltaStyle(mealOption.deltas.calories, false)}>
                            Calories {formatDelta(mealOption.deltas.calories)}
                          </span>
                        </div>

                        <div className="deltaMetrics">
                          <span style={deltaStyle(mealOption.deltas.protein, true)}>
                            Protein {formatDelta(mealOption.deltas.protein, "g")}
                          </span>

                          <span style={deltaStyle(mealOption.deltas.sugars, false)}>
                            Sugar {formatDelta(mealOption.deltas.sugars, "g")}
                          </span>

                          <span style={deltaStyle(mealOption.deltas.fat, goal !== "low_fat")}>
                            Fat {formatDelta(mealOption.deltas.fat, "g")}
                          </span>

                          <span style={deltaStyle(mealOption.deltas.sodium, false)}>
                            Sodium {formatDelta(mealOption.deltas.sodium, "mg")}
                          </span>
                        </div>
                      </div>

                      <button
                        className="btn"
                        onClick={() => setMeal(mealOption.items)}
                      >
                        Select This Meal
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {error && <p className="msg error">{error}</p>}

        {!loading && hasSearched && displayedResults.length === 0 && !error && (
          <p className="msg">No items matched your criteria.</p>
        )}

        {hasSearched && !loading && !error && (
          <p className="msg">
            Showing {displayedResults.length} of {results.length} results
          </p>
        )}

        {displayedResults.map((item, index) => {
          const inMeal = isInMeal(item);

          return (
            <div key={getItemKey(item)} className="card resultsCard">
              <div className="resultHeader">
                <h3 className="resultTitle">
                  #{index + 1} — {item.title || item.name}
                </h3>
                <div className="resultActions">
                  {typeof item.score !== "undefined" && (
                    <span className="badge">Score: {item.score}</span>
                  )}
                  <button
                    className="btn compactBtn"
                    onClick={() => (inMeal ? removeFromMeal(item) : addToMeal(item))}
                  >
                    {inMeal ? "Remove" : "Add"}
                  </button>
                </div>
              </div>

              <p className="meta">
                <strong>Category:</strong> {item.category}
              </p>

              {item.restaurant && (
                <p className="meta">
                  <strong>Restaurant:</strong> {item.restaurant}
                </p>
              )}

              <p className="nutrition">{item.nutrition}</p>

              <div className="bars">
                <NutritionBar label="Calories" value={item.calories} max={1000} />
                <NutritionBar label="Protein" value={item.protein} max={60} />
                <NutritionBar label="Sugar" value={item.sugars} max={50} />
                <NutritionBar label="Fat" value={item.fat} max={50} />
              </div>

              <p className="summary">{item.summary}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default App;