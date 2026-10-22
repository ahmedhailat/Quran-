import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  getProgressStats: vi.fn(),
}));

vi.mock("./db", () => ({
  getProgressStats: mocks.getProgressStats,
  createRecitationSession: vi.fn(),
  getRecentAttempts: vi.fn(),
  saveRecitationAttempt: vi.fn(),
  updateSessionAyah: vi.fn(),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
}));

const baseContext = {
  req: { protocol: "https", headers: {} },
  res: { clearCookie: () => undefined },
} as unknown as TrpcContext;

describe("quran.progress", () => {
  it("returns progress stats for the authenticated student", async () => {
    mocks.getProgressStats.mockResolvedValueOnce({
      totalAttempts: 4,
      reviewedVerses: 2,
      averageScore: 68,
      strongVerses: 1,
      activeSurahs: [{ surahNumber: 1, attempts: 4, reviewedVerses: 2, averageScore: 68 }],
      difficultVerses: [{ surahNumber: 1, ayahNumber: 2, attempts: 2, scores: [60, 70], latestScore: 70, missingWords: ["العالمين"], averageScore: 65 }],
    });

    const result = await appRouter.createCaller({ ...baseContext, user: { id: 7 } as TrpcContext["user"] }).quran.progress();

    expect(mocks.getProgressStats).toHaveBeenCalledWith(7);
    expect(result.averageScore).toBe(68);
    expect(result.difficultVerses[0]?.ayahNumber).toBe(2);
  });

  it("returns empty zero-state for a new student", async () => {
    mocks.getProgressStats.mockResolvedValueOnce({ totalAttempts: 0, reviewedVerses: 0, averageScore: null, strongVerses: 0, activeSurahs: [], difficultVerses: [] });
    const result = await appRouter.createCaller({ ...baseContext, user: { id: 99 } as TrpcContext["user"] }).quran.progress();
    expect(result).toMatchObject({ totalAttempts: 0, reviewedVerses: 0, averageScore: null, activeSurahs: [], difficultVerses: [] });
  });

  it("rejects anonymous access", async () => {
    await expect(appRouter.createCaller({ ...baseContext, user: null }).quran.progress()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
