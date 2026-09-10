import { describe, it, expect } from "vitest";
import { fillsExactly } from "./CategoryGrid";

/**
 * The mosaic's tiling arithmetic. It gets its own test because it is the one
 * part of the block that fails SILENTLY: a wrong answer here does not throw, it
 * just leaves three empty cells at the bottom of the homepage's first section,
 * which looks like a rendering bug to everyone who sees it.
 *
 * Layout being tested: one 2x2 lead tile, every other tile 1x1.
 */
describe("fillsExactly", () => {
  it("accepts nine tiles at four columns (the default layout)", () => {
    // Lead takes 2 cells from each of rows 1-2, leaving 4 beside it; the
    // remaining 4 singles are exactly one more row.
    expect(fillsExactly(9, 4)).toBe(true);
  });

  it("rejects six tiles at four columns", () => {
    // 5 singles: 4 fit beside the lead and the 5th strands a row.
    expect(fillsExactly(6, 4)).toBe(false);
  });

  it("accepts six tiles at three columns — the live catalog's shape", () => {
    expect(fillsExactly(6, 3)).toBe(true);
  });

  it("accepts nine tiles at three columns too", () => {
    expect(fillsExactly(9, 3)).toBe(true);
  });

  it("rejects a count with fewer tiles than fit beside the lead", () => {
    // Three tiles cannot fill four columns: the lead's own rows are unfinished.
    expect(fillsExactly(3, 4)).toBe(false);
  });

  it("treats a lone lead tile as filling any grid", () => {
    expect(fillsExactly(1, 2)).toBe(true);
  });
});
