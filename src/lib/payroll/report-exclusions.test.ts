import { describe, expect, it } from "vitest";
import { hideFromZeroNetReports } from "./report-exclusions";

const SIMPLICIA_ID = "bad06b68-8186-413e-b118-e018432935c6";
const ARDIN_ID = "457853f6-643c-4cba-98c6-7a836b366305";
const OTHER_ID = "00000000-0000-0000-0000-000000000000";

describe("hideFromZeroNetReports", () => {
  it("hides Simplicia Cuevas and Ardin Cedullo when net pay is exactly 0", () => {
    expect(hideFromZeroNetReports(SIMPLICIA_ID, 0)).toBe(true);
    expect(hideFromZeroNetReports(ARDIN_ID, 0)).toBe(true);
  });

  it("does not hide them when net pay is nonzero (positive or negative)", () => {
    expect(hideFromZeroNetReports(SIMPLICIA_ID, 5000)).toBe(false);
    expect(hideFromZeroNetReports(ARDIN_ID, -100)).toBe(false);
  });

  it("does not hide any other employee, even at net pay 0", () => {
    expect(hideFromZeroNetReports(OTHER_ID, 0)).toBe(false);
  });
});
