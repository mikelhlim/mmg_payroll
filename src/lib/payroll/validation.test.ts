import { describe, expect, it } from "vitest";
import { periodDays, daysMatch, analyzeNewPeriod } from "./validation";

describe("periodDays", () => {
  it("counts an inclusive Saturday–Friday week as 7", () => {
    expect(periodDays({ period_start: "2026-07-18", period_end: "2026-07-24" })).toBe(7);
  });
  it("counts a single day as 1", () => {
    expect(periodDays({ period_start: "2026-07-18", period_end: "2026-07-18" })).toBe(1);
  });
  it("counts a fortnight as 14", () => {
    expect(periodDays({ period_start: "2026-07-18", period_end: "2026-07-31" })).toBe(14);
  });
});

describe("daysMatch", () => {
  const week = { period_start: "2026-07-18", period_end: "2026-07-24" }; // 7 days
  it("passes when worked + leave equals the period length", () => {
    expect(daysMatch(week, 6, 1)).toBe(true);
    expect(daysMatch(week, 7, 0)).toBe(true);
    expect(daysMatch(week, 5.5, 1.5)).toBe(true);
  });
  it("fails when worked + leave is short of the period", () => {
    expect(daysMatch(week, 6, 0)).toBe(false);
  });
  it("fails when worked + leave exceeds the period", () => {
    expect(daysMatch(week, 6, 2)).toBe(false);
  });
});

describe("analyzeNewPeriod", () => {
  const prev = { period_start: "2026-07-11", period_end: "2026-07-17" }; // week before

  it("flags an overlap with an existing period", () => {
    const a = analyzeNewPeriod([prev], { period_start: "2026-07-15", period_end: "2026-07-21" });
    expect(a.overlap).toEqual(prev);
  });

  it("flags a fully-contained overlap", () => {
    const big = { period_start: "2026-07-01", period_end: "2026-07-31" };
    const a = analyzeNewPeriod([big], { period_start: "2026-07-10", period_end: "2026-07-16" });
    expect(a.overlap).toEqual(big);
  });

  it("reports zero gap for a contiguous next week", () => {
    const a = analyzeNewPeriod([prev], { period_start: "2026-07-18", period_end: "2026-07-24" });
    expect(a.overlap).toBeNull();
    expect(a.gapDays).toBe(0);
  });

  it("reports skipped days when there's a gap after the previous period", () => {
    // prev ends 07-17; starting 07-20 skips 07-18 and 07-19 → 2 days.
    const a = analyzeNewPeriod([prev], { period_start: "2026-07-20", period_end: "2026-07-26" });
    expect(a.overlap).toBeNull();
    expect(a.gapDays).toBe(2);
    expect(a.precededBy).toEqual(prev);
  });

  it("has no gap/overlap when there is no prior period", () => {
    const a = analyzeNewPeriod([], { period_start: "2026-07-18", period_end: "2026-07-24" });
    expect(a.overlap).toBeNull();
    expect(a.precededBy).toBeNull();
    expect(a.gapDays).toBe(0);
  });
});
