import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const context = {
  user: null,
  req: { protocol: "https", headers: {} },
  res: { clearCookie: () => undefined },
} as unknown as TrpcContext;

describe("quran router", () => {
  it("returns the complete 114-surah index", async () => {
    const result = await appRouter.createCaller(context).quran.listSurahs();
    expect(result).toHaveLength(114);
    expect(result[0]).toMatchObject({ number: 1, numberOfAyahs: 7 });
    expect(result[113]).toMatchObject({ number: 114, numberOfAyahs: 6 });
  }, 20_000);
});
