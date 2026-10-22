import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  transcribeArabicAudio: vi.fn(),
  storagePut: vi.fn(),
  saveRecitationAttempt: vi.fn(),
  updateSessionAyah: vi.fn(),
  evaluateTajweed: vi.fn(),
}));
const { transcribeArabicAudio, storagePut, saveRecitationAttempt, updateSessionAyah } = mocks;

vi.mock("./whisper", () => ({ transcribeArabicAudio: mocks.transcribeArabicAudio }));
vi.mock("./storage", () => ({ storagePut: mocks.storagePut }));
vi.mock("./tajweed", () => ({ evaluateTajweed: mocks.evaluateTajweed }));
vi.mock("./db", () => ({
  createRecitationSession: vi.fn(),
  getRecentAttempts: vi.fn(),
  saveRecitationAttempt: mocks.saveRecitationAttempt,
  updateSessionAyah: mocks.updateSessionAyah,
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
}));

const context = {
  user: null,
  req: { protocol: "https", headers: {} },
  res: { clearCookie: () => undefined },
} as unknown as TrpcContext;

describe("quran.analyzeAttempt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transcribeArabicAudio.mockResolvedValue({ text: "الحمد لله رب العالمين", language: "ar" });
    storagePut.mockResolvedValue({ key: "recitations/guest/surah-1-ayah-1.webm", url: "https://storage.example/reading.webm" });
    saveRecitationAttempt.mockResolvedValue(73);
    updateSessionAyah.mockResolvedValue(undefined);
    mocks.evaluateTajweed.mockResolvedValue({ evaluator: "مراجع تجويد تدريبي", note: "لا توجد إشارة كافية", confidence: "منخفض", issues: [] });
  });

  it("transcribes, stores, evaluates, and returns the next ayah", async () => {
    const result = await appRouter.createCaller(context).quran.analyzeAttempt({
      sessionId: 9,
      surahNumber: 1,
      ayahNumber: 1,
      surahAyahCount: 7,
      expectedText: "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ",
      reciter: "husary",
      audioBase64: Buffer.from("student audio").toString("base64"),
      mimeType: "audio/webm",
    });

    expect(transcribeArabicAudio).toHaveBeenCalledOnce();
    expect(storagePut).toHaveBeenCalledOnce();
    expect(saveRecitationAttempt).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 9, ayahNumber: 1, score: expect.any(Number) }));
    expect(updateSessionAyah).toHaveBeenCalledWith(9, 2, "active");
    expect(result).toMatchObject({ attemptId: 73, nextAyah: 2, isComplete: false, audioUrl: "https://storage.example/reading.webm", tajweedReview: expect.objectContaining({ evaluator: "مراجع تجويد تدريبي" }) });
    expect(result.score).toBeGreaterThan(0);
  });

  it("falls back to the browser transcript when Whisper has no credits", async () => {
    transcribeArabicAudio.mockRejectedValueOnce(new Error("Whisper request failed (429): credit_balance_exhausted"));

    const result = await appRouter.createCaller(context).quran.analyzeAttempt({
      sessionId: 9,
      surahNumber: 1,
      ayahNumber: 1,
      surahAyahCount: 7,
      expectedText: "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ",
      reciter: "husary",
      audioBase64: Buffer.from("student audio").toString("base64"),
      mimeType: "audio/webm",
      clientTranscript: "الحمد لله رب العالمين",
    });

    expect(result.transcript).toBe("الحمد لله رب العالمين");
    expect(result.transcriptionProvider).toBe("browser");
    expect(result.feedback.join(" ")).toContain("استُخدم التعرف المحلي");
    expect(result.audioAnalysis).toBeDefined();
  });
});
