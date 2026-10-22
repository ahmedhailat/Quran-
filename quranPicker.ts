export const SURAH_PICKER_ID = "surah-select";

type PickerDocument = Pick<Document, "getElementById">;
type PickerElement = { scrollIntoView?: (options?: ScrollIntoViewOptions) => void; focus?: () => void };

export function focusSurahPicker(documentRef: PickerDocument): boolean {
  const selector = documentRef.getElementById(SURAH_PICKER_ID) as PickerElement | null;
  if (!selector) return false;
  selector.scrollIntoView?.({ behavior: "smooth", block: "center" });
  selector.focus?.();
  return true;
}
