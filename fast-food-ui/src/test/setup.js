// Vitest global setup for the jsdom environment.
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom doesn't implement matchMedia, which App's theme initializer calls on mount.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),      // deprecated but some libs still call it
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
}

// Unmount React trees and reset the DOM between tests so they stay isolated.
afterEach(() => {
  cleanup();
});
