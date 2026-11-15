// Date fields read the Finnish form and ISO dates, and refuse dates that do not exist.
import { describe, expect, it } from "vitest";
import { parseDateField } from "./dateField";

describe("date field", () => {
  it("reads Finnish and ISO dates", () => {
    expect(parseDateField("31.12.2026")).toBe("2026-12-31");
    expect(parseDateField(" 1.2.2026 ")).toBe("2026-02-01");
    expect(parseDateField("2026-12-31")).toBe("2026-12-31");
  });
  it("refuses dates that do not exist and other text", () => {
    expect(parseDateField("31.20.2026")).toBeNull();
    expect(parseDateField("29.2.2025")).toBeNull();
    expect(parseDateField("12/31/2026")).toBeNull();
    expect(parseDateField("")).toBeNull();
  });
});
