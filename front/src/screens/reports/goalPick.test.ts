import { describe, expect, it } from "vitest";
import { pickGoal, pickedGoals } from "./goalPick";

describe("goal picker", () => {
  it("fills the rows in name order without remembered picks", () => {
    expect(pickedGoals([], ["A", "B", "C"], 2)).toEqual(["A", "B"]);
  });

  it("keeps remembered picks that are in the period", () => {
    expect(pickedGoals(["C", "X"], ["A", "B", "C"], 2)).toEqual(["C", "A"]);
  });

  it("swaps when the second row picks the first row's target", () => {
    expect(pickGoal(["A", "B"], 1, "A")).toEqual(["B", "A"]);
    expect(pickedGoals(pickGoal(["A", "B"], 1, "A"), ["A", "B", "C"], 2)).toEqual(["B", "A"]);
  });

  it("swaps when the first row picks the second row's target", () => {
    expect(pickGoal(["A", "B"], 0, "B")).toEqual(["B", "A"]);
  });

  it("replaces only its own row with a target not shown", () => {
    expect(pickGoal(["A", "B"], 1, "C")).toEqual(["A", "C"]);
  });
});
