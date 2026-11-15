// Chart layout: stacked bars share a slot and scale by their total; value labels show only when
// every label fits.
import { describe, expect, it } from "vitest";
import { renderChart } from "./charts";

const labels = (svg: string) => [...svg.matchAll(/<text class="lbl"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);

describe("charts", () => {
  it("stacks bars with the same key and labels the stack total", () => {
    const svg = renderChart({
      title: "t",
      categories: ["a", "b"],
      format: String,
      series: [
        { name: "x", role: "sij", kind: "bar", stack: "s", values: [5, 1] },
        { name: "y", role: "inv", kind: "bar", stack: "s", values: [7, 2] },
      ],
    });
    expect(labels(svg)).toEqual(["12", "3"]);
    // the scale reaches the stack total, not the largest single bar
    expect(svg).toContain(">12<");
  });

  it("leaves labels out when they do not fit", () => {
    const many = Array.from({ length: 40 }, (_, i) => String(i));
    const svg = renderChart({
      title: "t",
      categories: many,
      format: String,
      series: [{ name: "x", role: "menot", kind: "bar", values: many.map(() => 123456) }],
    });
    expect(labels(svg)).toEqual([]);
  });
});
