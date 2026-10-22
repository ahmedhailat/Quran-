import { describe, expect, it, vi } from "vitest";
import { focusSurahPicker, SURAH_PICKER_ID } from "./quranPicker";

describe("focusSurahPicker", () => {
  it("focuses and scrolls to the existing surah selector without changing session state", () => {
    const focus = vi.fn();
    const scrollIntoView = vi.fn();
    const documentRef = { getElementById: (id: string) => id === SURAH_PICKER_ID ? { focus, scrollIntoView } : null } as unknown as Document;
    expect(focusSurahPicker(documentRef)).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    expect(focus).toHaveBeenCalledOnce();
  });

  it("returns false when the selector is unavailable", () => {
    const documentRef = { getElementById: () => null } as unknown as Document;
    expect(focusSurahPicker(documentRef)).toBe(false);
  });
});
