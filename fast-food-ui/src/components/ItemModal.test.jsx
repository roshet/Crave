import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ItemModal from "./ItemModal";
import { COMPARE_MAX } from "../helpers";

const ITEM = {
  item_id: 200463,
  title: "Big Mac",
  restaurant: "mcdonalds",
  category: "burgers",
  calories: 590,
  protein: 25,
  sugars: 9,
  fat: 34,
  carbs: 46,
  sodium: 1050,
  score: 0.5,
  summary: "Solid protein for the calories",
};

const BOUNDS = { min: -6, max: 3 };

// App always supplies every prop; each test overrides only what it's exercising.
function renderModal(overrides = {}) {
  const props = {
    item: ITEM,
    onClose: vi.fn(),
    goal: "balanced",
    scoreBounds: BOUNDS,
    isInMeal: () => false,
    addToMeal: vi.fn(),
    isInCompare: () => false,
    addToCompare: vi.fn(),
    compareEntryFromItem: (item) => ({ id: "cmp-0", kind: "item", items: [item] }),
    compareFull: false,
    ...overrides,
  };
  render(<ItemModal {...props} />);
  return props;
}

describe("ItemModal — rendering", () => {
  it("renders as a labelled dialog with the item's name and meta", () => {
    renderModal();
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("heading", { name: /Big Mac/ })).toBeInTheDocument();
    expect(screen.getByText("mcdonalds · burgers")).toBeInTheDocument();
  });

  it("renders all six nutrition tiles", () => {
    renderModal();
    for (const label of ["Calories", "Protein", "Sugar", "Fat", "Carbs", "Sodium"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("590")).toBeInTheDocument();
    expect(screen.getByText("1050mg")).toBeInTheDocument();
  });

  it("omits the score breakdown when the item carries none", () => {
    renderModal();
    expect(screen.queryByText("Why this score?")).not.toBeInTheDocument();
  });

  it("renders the score breakdown when the item carries one", () => {
    renderModal({
      item: { ...ITEM, breakdown: [{ key: "sodium", label: "Sodium load", value: 1050, unit: "mg", points: -0.8 }] },
    });
    expect(screen.getByText("Why this score?")).toBeInTheDocument();
    expect(screen.getByText("Sodium load")).toBeInTheDocument();
  });
});

describe("ItemModal — closing", () => {
  it("closes on the ✕ button", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});

describe("ItemModal — actions", () => {
  it("Add to Meal adds the item and closes", async () => {
    const user = userEvent.setup();
    const { addToMeal, onClose } = renderModal();
    await user.click(screen.getByRole("button", { name: "Add to Meal" }));
    expect(addToMeal).toHaveBeenCalledWith(ITEM);
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a disabled '✓ Added' when the item is already in the meal", () => {
    renderModal({ isInMeal: () => true });
    expect(screen.getByRole("button", { name: "✓ Added" })).toBeDisabled();
  });

  it("Add to Compare stages the item and closes", async () => {
    const user = userEvent.setup();
    const { addToCompare, onClose } = renderModal();
    await user.click(screen.getByRole("button", { name: /Add to Compare/ }));
    expect(addToCompare).toHaveBeenCalledWith(expect.objectContaining({ items: [ITEM] }));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a disabled '✓ In compare' when the item is already staged", () => {
    renderModal({ isInCompare: () => true });
    expect(screen.getByRole("button", { name: "✓ In compare" })).toBeDisabled();
  });

  it("disables Add to Compare when the compare tray is full", () => {
    renderModal({ compareFull: true });
    expect(screen.getByRole("button", { name: `Compare full (${COMPARE_MAX})` })).toBeDisabled();
  });
});
