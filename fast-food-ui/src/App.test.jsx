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
