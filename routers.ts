import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { createRecitationSession, getProgressStats, getRecentAttempts, saveRecitationAttempt, updateSessionAyah } from "./db";
import { storagePut } from "./storage";
import { transcribeArabicAudio } from "./whisper";
import { evaluateTajweed } from "./tajweed";
import { analyzeAudio } from "./audioAnalysis";

const AL_QURAN_CLOUD = "https://api.alquran.cloud/v1";
let surahCache: Array<{ number: number; name: string; englishName: string; numberOfAyahs: number; revelationType: string }> | null = null;

async function getSurahIndex() {
  if (surahCache) return surahCache;
  const response = await fetch(`${AL_QURAN_CLOUD}/surah`);
  if (!response.ok) throw new Error("تعذر تحميل فهرس السور");
  const payload = (await response.json()) as { data: Array<{ number: number; name: string; englishName: string; numberOfAyahs: number; revelationType: string }> };
  surahCache = payload.data;
  return surahCache;
}

function normalizeArabic(value: string) {
  return value
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\u0600-\u06FF\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function evaluateTranscript(transcript: string, expected: string) {
  const spoken = normalizeArabic(transcript).split(" ").filter(Boolean);
  const target = normalizeArabic(expected).split(" ").filter(Boolean);
  if (!spoken.length || !target.length) return { score: null as number | null, missingWords: target };
  const spokenSet = new Set(spoken);
  const matched = target.filter((word) => spokenSet.has(word));
  const targetBigrams = target.slice(0, -1).map((word, index) => `${word}|${target[index + 1]}`);
  const spokenBigrams = new Set(spoken.slice(0, -1).map((word, index) => `${word}|${spoken[index + 1]}`));
  const bigramMatches = targetBigrams.filter((bigram) => spokenBigrams.has(bigram)).length;
  const wordRatio = matched.length / target.length;
  const orderRatio = targetBigrams.length ? bigramMatches / targetBigrams.length : wordRatio;
  const lengthRatio = Math.min(spoken.length / target.length, 1);
  const score = Math.round((wordRatio * 0.6 + orderRatio * 0.3 + lengthRatio * 0.1) * 100);
  return { score: Math.max(0, Math.min(100, score)), missingWords: target.filter((word) => !spokenSet.has(word)) };
}

function isWhisperQuotaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /429|insufficient_quota|credit_balance_exhausted|no credits remaining/i.test(message);
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  quran: router({
    listSurahs: publicProcedure.query(async () => getSurahIndex()),
    getSurah: publicProcedure.input(z.object({ surahNumber: z.number().int().min(1).max(114) })).query(async ({ input }) => {
      const response = await fetch(`${AL_QURAN_CLOUD}/surah/${input.surahNumber}/quran-uthmani`);
      if (!response.ok) throw new Error("تعذر تحميل آيات السورة");
      const payload = (await response.json()) as { data: { number: number; name: string; numberOfAyahs: number; ayahs: Array<{ numberInSurah: number; text: string }> } };
      return payload.data;
    }),
    createSession: publicProcedure.input(z.object({ surahNumber: z.number().int().min(1).max(114), startAyah: z.number().int().min(1), reciter: z.enum(["husary", "minshawi"]) })).mutation(async ({ input, ctx }) => {
      const sessionId = await createRecitationSession({ userId: ctx.user?.id, ...input });
      return { sessionId: sessionId ?? null, ...input };
    }),
    recentAttempts: publicProcedure.query(({ ctx }) => getRecentAttempts(ctx.user?.id)),
    progress: protectedProcedure.query(({ ctx }) => getProgressStats(ctx.user.id)),
    analyzeAttempt: publicProcedure.input(z.object({
      sessionId: z.number().int().nullable().optional(),
      surahNumber: z.number().int().min(1).max(114),
      ayahNumber: z.number().int().min(1),
      surahAyahCount: z.number().int().min(1),
      expectedText: z.string().min(1),
      reciter: z.enum(["husary", "minshawi"]),
      audioBase64: z.string().min(16),
      mimeType: z.string().default("audio/webm"),
      clientTranscript: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const audio = Buffer.from(input.audioBase64, "base64");
      if (!audio.length) throw new Error("ملف الصوت فارغ");
      let whisperUnavailable = false;
      const [transcription, audioAnalysis] = await Promise.all([
        transcribeArabicAudio(audio, input.mimeType, input.expectedText).catch((error) => {
          if (!isWhisperQuotaError(error)) throw error;
          whisperUnavailable = true;
          return { text: input.clientTranscript?.trim() ?? "", language: "ar" };
        }),
        analyzeAudio(audio, input.mimeType),
      ]);
      const evaluation = evaluateTranscript(transcription.text, input.expectedText);
      const tajweedReview = await evaluateTajweed({ expectedText: input.expectedText, transcript: transcription.text });
      const extension = input.mimeType.includes("ogg") ? "ogg" : input.mimeType.includes("mp4") ? "m4a" : "webm";
      const stored = await storagePut(`recitations/${ctx.user?.id ?? "guest"}/surah-${input.surahNumber}-ayah-${input.ayahNumber}.${extension}`, audio, input.mimeType);
      const feedback = evaluation.score === null
        ? [whisperUnavailable ? "تعذر الاتصال بخدمة Whisper لأن رصيد واجهة OpenAI منتهٍ؛ تم حفظ التسجيل والتحليل الصوتي، لكن المقارنة النصية غير متاحة الآن." : "لم يتم التقاط نص عربي واضح يمكن مقارنته.", "استمع إلى التسجيل المحفوظ وحاول القراءة مرة أخرى."]
        : evaluation.missingWords.length
          ? [`انتبه إلى الكلمات: ${evaluation.missingWords.slice(0, 4).join(" و ")}.`, "راجع المدود ومخارج الحروف مع شيخ متقن.", `درجة المطابقة النصية ${evaluation.score}%`, ...(whisperUnavailable ? ["استُخدم التعرف المحلي في المتصفح بدل Whisper مؤقتًا."] : [])]
          : ["تم التقاط كلمات الآية بالترتيب المتوقع.", "حافظ على المدود ومخارج الحروف.", `درجة المطابقة النصية ${evaluation.score}%`, ...(whisperUnavailable ? ["استُخدم التعرف المحلي في المتصفح بدل Whisper مؤقتًا."] : [])];
      const attemptId = await saveRecitationAttempt({
        sessionId: input.sessionId ?? undefined,
        userId: ctx.user?.id,
        surahNumber: input.surahNumber,
        ayahNumber: input.ayahNumber,
        audioKey: stored.key,
        audioUrl: stored.url,
        transcript: transcription.text,
        score: evaluation.score,
        missingWords: evaluation.missingWords,
        feedback: [...feedback, ...audioAnalysis.findings],
      });
      const isComplete = input.ayahNumber >= input.surahAyahCount;
      if (input.sessionId) await updateSessionAyah(input.sessionId, isComplete ? input.ayahNumber : input.ayahNumber + 1, isComplete ? "completed" : "active");
      return {
        attemptId: attemptId ?? null,
        transcript: transcription.text,
        score: evaluation.score,
        missingWords: evaluation.missingWords,
        feedback,
        tajweedReview,
        audioAnalysis,
        transcriptionProvider: whisperUnavailable ? (transcription.text ? "browser" : "none") : "whisper",
        audioUrl: stored.url,
        nextAyah: isComplete ? null : input.ayahNumber + 1,
        isComplete,
      };
    }),
  }),
});

export type AppRouter = typeof appRouter;
