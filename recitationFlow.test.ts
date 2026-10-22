import { describe, expect, it } from "vitest";
import { getNextAyah, shouldAdvanceAfterEvaluation, shouldAdvanceAfterFailure } from "./recitationFlow";

describe("recitation flow", () => {
  it("advances after a successful non-final evaluation", () => {
    expect(shouldAdvanceAfterEvaluation({ shouldAdvance: true, isComplete: false, nextAyah: 2 })).toBe(true);
    expect(getNextAyah(1, 7)).toBe(2);
  });

  it("does not advance after the final ayah", () => {
    expect(shouldAdvanceAfterEvaluation({ shouldAdvance: true, isComplete: true, nextAyah: null })).toBe(false);
    expect(getNextAyah(7, 7)).toBeNull();
  });

  it("still advances after a Whisper failure when automatic advance was requested", () => {
    expect(shouldAdvanceAfterFailure(true)).toBe(true);
    expect(shouldAdvanceAfterFailure(false)).toBe(false);
  });
});
