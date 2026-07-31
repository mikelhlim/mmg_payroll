import { describe, expect, it } from "vitest";
import { fromCentavos } from "@/lib/money";
import {
  MIN_ROWS,
  carryForwardDescriptions,
  categorySubtotal,
  expenseTotals,
  isBlankItem,
  padToMinRows,
  type ExpenseLineInput,
} from "./totals";

describe("isBlankItem", () => {
  it("is blank when there's no description, date, or amount", () => {
    expect(isBlankItem({ item_date: null, description: "", amount: 0 })).toBe(true);
    expect(isBlankItem({ item_date: null, description: "   ", amount: 0 })).toBe(true);
  });

  it("is not blank if any single field is set", () => {
    expect(isBlankItem({ item_date: "2026-08-01", description: "", amount: 0 })).toBe(false);
    expect(isBlankItem({ item_date: null, description: "Gas", amount: 0 })).toBe(false);
    expect(isBlankItem({ item_date: null, description: "", amount: 50 })).toBe(false);
  });
});

describe("categorySubtotal", () => {
  it("sums centavos exactly, avoiding float drift", () => {
    const items: ExpenseLineInput[] = [
      { item_date: null, description: "a", amount: 0.1 },
      { item_date: null, description: "b", amount: 0.2 },
    ];
    // 0.1 + 0.2 !== 0.3 in raw float arithmetic; centavo-integer summing must
    // not carry that drift through.
    expect(categorySubtotal(items)).toBe(30);
    expect(fromCentavos(categorySubtotal(items))).toBe(0.3);
  });

  it("ignores blank rows naturally (amount 0 contributes nothing)", () => {
    const items: ExpenseLineInput[] = [
      { item_date: null, description: "", amount: 0 },
      { item_date: null, description: "Gas", amount: 125.5 },
    ];
    expect(categorySubtotal(items)).toBe(12550);
  });
});

describe("padToMinRows", () => {
  it("pads short lists up to MIN_ROWS blank rows", () => {
    const padded = padToMinRows([{ item_date: null, description: "One", amount: 10 }]);
    expect(padded).toHaveLength(MIN_ROWS);
    expect(padded[0].description).toBe("One");
    expect(padded.slice(1).every(isBlankItem)).toBe(true);
  });

  it("never truncates a list already at or above MIN_ROWS", () => {
    const twelve = Array.from({ length: 12 }, (_, i) => ({
      item_date: null,
      description: `Row ${i}`,
      amount: 1,
    }));
    expect(padToMinRows(twelve)).toHaveLength(12);
  });
});

describe("carryForwardDescriptions", () => {
  const category = { default_descriptions: ["CTK Flowers", "Anilao/Tagbakin", "Ding", "Mau", "Michael"] };
  const emptyCategory = { default_descriptions: [] };

  it("carries forward only non-blank descriptions, in order, with dates/amounts cleared", () => {
    const previous: ExpenseLineInput[] = [
      { item_date: "2026-07-25", description: "Gas", amount: 500 },
      { item_date: null, description: "", amount: 0 },
      { item_date: "2026-07-26", description: "Toll", amount: 120 },
      ...Array.from({ length: 7 }, () => ({ item_date: null, description: "", amount: 0 })),
    ];
    const result = carryForwardDescriptions(previous, category);
    expect(result.slice(0, 2)).toEqual([
      { item_date: null, description: "Gas", amount: 0 },
      { item_date: null, description: "Toll", amount: 0 },
    ]);
    expect(result).toHaveLength(MIN_ROWS);
    expect(result.slice(2).every(isBlankItem)).toBe(true);
  });

  it("falls back to the category's default descriptions when there's no previous report", () => {
    const result = carryForwardDescriptions([], category);
    expect(result.slice(0, 5).map((r) => r.description)).toEqual([
      "CTK Flowers",
      "Anilao/Tagbakin",
      "Ding",
      "Mau",
      "Michael",
    ]);
    expect(result).toHaveLength(MIN_ROWS);
  });

  it("falls back to all-blank rows when there are no previous items and no defaults", () => {
    const result = carryForwardDescriptions([], emptyCategory);
    expect(result).toHaveLength(MIN_ROWS);
    expect(result.every(isBlankItem)).toBe(true);
  });

  it("prefers the previous report's descriptions over the category defaults when both exist", () => {
    const previous: ExpenseLineInput[] = [{ item_date: null, description: "Updated desc", amount: 0 }];
    const result = carryForwardDescriptions(previous, category);
    expect(result[0].description).toBe("Updated desc");
    expect(result.map((r) => r.description)).not.toContain("CTK Flowers");
  });
});

describe("expenseTotals", () => {
  it("grand total equals the payroll total plus every category subtotal", () => {
    const categories = [{ id: "mau" }, { id: "gcash" }, { id: "hardware" }, { id: "misc" }];
    const itemsByCategory: Record<string, ExpenseLineInput[]> = {
      mau: [{ item_date: null, description: "a", amount: 100 }],
      gcash: [{ item_date: null, description: "b", amount: 250.75 }],
      hardware: [],
      misc: [
        { item_date: null, description: "c", amount: 10 },
        { item_date: null, description: "d", amount: 5.25 },
      ],
    };
    const totals = expenseTotals({
      payrollNetTotalCentavos: 500000,
      categories,
      itemsByCategory,
    });

    expect(totals.byCategoryCentavos).toEqual({
      mau: 10000,
      gcash: 25075,
      hardware: 0,
      misc: 1525,
    });
    expect(totals.expensesTotalCentavos).toBe(10000 + 25075 + 0 + 1525);
    expect(totals.payrollTotalCentavos).toBe(500000);
    expect(totals.grandTotalCentavos).toBe(500000 + 10000 + 25075 + 0 + 1525);
  });

  it("handles zero categories/items", () => {
    const totals = expenseTotals({
      payrollNetTotalCentavos: 0,
      categories: [],
      itemsByCategory: {},
    });
    expect(totals.expensesTotalCentavos).toBe(0);
    expect(totals.grandTotalCentavos).toBe(0);
  });
});
