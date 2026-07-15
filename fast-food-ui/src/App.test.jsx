import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

// App fetches /recommend on mount (Browse is the default tab). Stub fetch so every request
// resolves to an empty-but-valid payload — these are render/navigation smoke tests, not data
// tests. score_bounds is included so normalizeScore has bounds to work with.
function mockFetch() {
  return vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ results: [], meals: [], score_bounds: { min: -6, max: 3 } }),
    })
  );
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/"); // reset URL between tests (mount effect reads it)
  globalThis.fetch = mockFetch();
});

describe("App smoke — tabs and navigation", () => {
  it("renders the header and all five tabs", async () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Crave" })).toBeInTheDocument();
    for (const name of ["Browse", "Meal Builder", "Optimize", "Today", "Compare"]) {
      expect(screen.getByRole("tab", { name })).toBeInTheDocument();
    }
  });

  it("opens on Browse with the menu search box", async () => {
    render(<App />);
    expect(screen.getByPlaceholderText("Search all menu items…")).toBeInTheDocument();
  });

  it("switches to Meal Builder and shows its empty state", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("tab", { name: "Meal Builder" }));
    expect(await screen.findByText("Add items from Browse to build your meal.")).toBeInTheDocument();
  });

  it("switches to Optimize and shows its intro", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("tab", { name: "Optimize" }));
    expect(await screen.findByText(/Picks the best entrée/)).toBeInTheDocument();
  });

  it("switches to Today and shows targets + weekly history", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("tab", { name: "Today" }));
    expect(await screen.findByRole("heading", { name: "Daily targets" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "This week" })).toBeInTheDocument();
  });

  it("switches to Compare and shows its intro", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("tab", { name: "Compare" }));
    expect(await screen.findByText(/items or meals side by side/)).toBeInTheDocument();
  });
});

describe("App smoke — theme toggle", () => {
  it("flips data-theme when the toggle is clicked", async () => {
    const user = userEvent.setup();
    render(<App />);
    const before = document.documentElement.getAttribute("data-theme");
    await user.click(screen.getByRole("button", { name: /Switch to (light|dark) mode/ }));
    const after = document.documentElement.getAttribute("data-theme");
    expect(after).not.toBe(before);
    expect(["light", "dark"]).toContain(after);
  });
});

describe("App smoke — filters render on Browse", () => {
  it("shows the shared FilterChips controls (aria-labelled selects)", async () => {
    render(<App />);
    expect(screen.getByLabelText("Restaurant")).toBeInTheDocument();
    expect(screen.getByLabelText("Nutrition goal")).toBeInTheDocument();
    expect(screen.getByLabelText("Maximum calories")).toBeInTheDocument();
    expect(screen.getByLabelText("Diet")).toBeInTheDocument();
  });
});

describe("App — short-link permalink (/m/<code>)", () => {
  const ITEM = {
    item_id: 200463, title: "Big Mac", restaurant: "mcdonalds", category: "burgers",
    calories: 590, protein: 25, sugars: 9, fat: 34, carbs: 46, sodium: 1050, score: 0.5,
  };

  // Routes fetch by URL: /api/resolve → resolveResp, /items → the item, everything else empty.
  function routedFetch(resolveResp) {
    return vi.fn((url) => {
      if (String(url).includes("/api/resolve")) return Promise.resolve(resolveResp);
      if (String(url).includes("/items")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [ITEM] }) });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ results: [], meals: [], score_bounds: { min: -6, max: 3 } }),
      });
    });
  }

  it("resolves the code, loads the meal, and keeps /m/<code> in the address bar", async () => {
    window.history.replaceState({}, "", "/m/abc123");
    globalThis.fetch = routedFetch({ ok: true, json: () => Promise.resolve({ ids: "200463" }) });
    render(<App />);

    // Lands on Meal Builder with the resolved item, and the URL is NOT stripped.
    expect(await screen.findByText("Big Mac")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/m/abc123");
  });

  it("resets to / when the code is unknown (resolve 404)", async () => {
    window.history.replaceState({}, "", "/m/deadcode");
    globalThis.fetch = routedFetch({ ok: false, status: 404, json: () => Promise.resolve({ error: "Unknown code." }) });
    render(<App />);

    // The Browse default tab still renders; the bogus short path is cleared.
    expect(await screen.findByRole("tab", { name: "Browse" })).toBeInTheDocument();
    await vi.waitFor(() => expect(window.location.pathname).toBe("/"));
  });
});

describe("App — saved-meals library sync", () => {
  const ITEM = {
    item_id: 200463, title: "Big Mac", restaurant: "mcdonalds", category: "burgers",
    calories: 590, protein: 25, sugars: 9, fat: 34, carbs: 46, sodium: 1050, score: 0.5,
  };
  const SAVED = { id: "s1", name: "My Lunch", items: [ITEM], savedAt: 1 };

  async function gotoMealBuilder(user) {
    await user.click(screen.getByRole("tab", { name: /Meal Builder/ }));
  }

  it("exports the library and surfaces a code", async () => {
    localStorage.setItem("crave_saved_meals", JSON.stringify([SAVED]));
    globalThis.fetch = vi.fn((url, opts) => {
      if (String(url).includes("/api/library") && opts?.method === "POST") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ code: "LIB1234" }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [], meals: [], score_bounds: { min: -6, max: 3 } }) });
    });
    const user = userEvent.setup();
    render(<App />);
    await gotoMealBuilder(user);

    await user.click(screen.getByRole("button", { name: /Share library/ }));
    // Surfaces the /?lib=<code> deep link (and the bare code for manual entry).
    expect(await screen.findByText(/Library link copied/)).toHaveTextContent("LIB1234");
  });

  it("auto-imports a shared library from a ?lib= deep link and strips the param", async () => {
    window.history.replaceState({}, "", "/?lib=LIB1234");
    globalThis.fetch = vi.fn((url) => {
      const s = String(url);
      if (s.includes("/api/library")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ library: [{ name: "Shared Meal", ids: ["200463"] }] }) });
      }
      if (s.includes("/items")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [ITEM] }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [], meals: [], score_bounds: { min: -6, max: 3 } }) });
    });
    render(<App />);

    // Lands on Meal Builder with the imported meal, and the ?lib= param is stripped.
    expect(await screen.findByText("Shared Meal")).toBeInTheDocument();
    await vi.waitFor(() => expect(window.location.search).toBe(""));
  });

  it("imports a library by code and merges it into saved meals", async () => {
    globalThis.fetch = vi.fn((url) => {
      const s = String(url);
      if (s.includes("/api/library")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ library: [{ name: "Shared Meal", ids: ["200463"] }] }) });
      }
      if (s.includes("/items")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [ITEM] }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [], meals: [], score_bounds: { min: -6, max: 3 } }) });
    });
    const user = userEvent.setup();
    render(<App />);
    await gotoMealBuilder(user);

    await user.type(screen.getByLabelText("Library code to restore"), "LIB1234");
    await user.click(screen.getByRole("button", { name: /Restore/ }));
    expect(await screen.findByText("Shared Meal")).toBeInTheDocument();
  });

  it("shows a clean message for an unknown code and keeps the local library", async () => {
    localStorage.setItem("crave_saved_meals", JSON.stringify([SAVED]));
    globalThis.fetch = vi.fn((url) => {
      if (String(url).includes("/api/library")) {
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "Unknown code." }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [], meals: [], score_bounds: { min: -6, max: 3 } }) });
    });
    const user = userEvent.setup();
    render(<App />);
    await gotoMealBuilder(user);

    await user.type(screen.getByLabelText("Library code to restore"), "nope");
    await user.click(screen.getByRole("button", { name: /Restore/ }));
    expect(await screen.findByText(/No library found for that code/)).toBeInTheDocument();
    expect(screen.getByText("My Lunch")).toBeInTheDocument(); // existing library untouched
  });
});

describe("App smoke — item detail modal", () => {
  const ITEM = {
    item_id: 200463, title: "Big Mac", restaurant: "mcdonalds", category: "burgers",
    calories: 590, protein: 25, sugars: 9, fat: 34, carbs: 46, sodium: 1050, score: 0.5,
  };

  // Guards the App→BrowseTab→ItemModal wiring: a row click must still open the dialog.
  it("opens the dialog when a Browse row is clicked, and closes it again", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ results: [ITEM], score_bounds: { min: -6, max: 3 } }),
      })
    );
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "View details for Big Mac" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Big Mac/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
