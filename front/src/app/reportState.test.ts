// Tests that the report filters that belong to a project reset when another project opens.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "./session";
import { ReportState } from "./reportState";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
});

const newState = () => new ReportState({} as Session);

describe("report state across projects", () => {
  it("resets the owner filter and the click-through on a project change", () => {
    const state = newState();
    state.set({ owner: "Ada" });
    state.drill = { filter: {} };
    state.resetProject();
    expect(state.filters.owner).toBe("");
    expect(state.drill).toBeNull();
    expect(JSON.parse(store.get("fire.reportFilters")!).owner).toBe("");
  });

  it("resets the custom period on a project change, and keeps the preset", () => {
    const state = newState();
    state.set({ preset: "custom", custom: { from: "2024-01", to: "2024-06" } });
    state.resetProject();
    expect(state.filters.custom).toEqual({ from: "", to: "" });
    expect(state.filters.preset).toBe("custom");
    expect(JSON.parse(store.get("fire.reportFilters")!).custom).toEqual({ from: "", to: "" });
  });

  it("keeps the other filters on a project change", () => {
    const state = newState();
    state.set({ thousands: false });
    state.resetProject();
    expect(state.filters.thousands).toBe(false);
  });

  it("a new ReportState reads the stored owner, and resetProject clears it", () => {
    newState().set({ owner: "Ada" });
    const reloaded = newState();
    expect(reloaded.filters.owner).toBe("Ada");
    reloaded.resetProject();
    expect(reloaded.filters.owner).toBe("");
  });
});
