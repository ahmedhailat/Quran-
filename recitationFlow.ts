export function shouldAdvanceAfterEvaluation(input: {
  shouldAdvance: boolean;
  isComplete: boolean;
  nextAyah: number | null | undefined;
}) {
  return input.shouldAdvance && !input.isComplete && input.nextAyah !== null && input.nextAyah !== undefined;
}

export function shouldAdvanceAfterFailure(shouldAdvance: boolean) {
  return shouldAdvance;
}

export function getNextAyah(currentAyah: number, ayahCount: number) {
  return currentAyah < ayahCount ? currentAyah + 1 : null;
}
