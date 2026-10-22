import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  recitationAttempts,
  recitationSessions,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined || user.openId === ENV.ownerOpenId) {
    values.role = user.role ?? "admin";
    updateSet.role = values.role;
  }
  values.lastSignedIn ??= new Date();
  updateSet.lastSignedIn ??= new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function createRecitationSession(input: {
  userId?: number;
  surahNumber: number;
  startAyah: number;
  reciter: string;
}) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(recitationSessions).values({
    userId: input.userId,
    surahNumber: input.surahNumber,
    startAyah: input.startAyah,
    currentAyah: input.startAyah,
    reciter: input.reciter,
    status: "active",
  });
  return Number(result[0].insertId);
}

export async function saveRecitationAttempt(input: {
  sessionId?: number;
  userId?: number;
  surahNumber: number;
  ayahNumber: number;
  audioKey?: string;
  audioUrl?: string;
  transcript?: string;
  score?: number | null;
  missingWords: string[];
  feedback: string[];
}) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(recitationAttempts).values({
    sessionId: input.sessionId,
    userId: input.userId,
    surahNumber: input.surahNumber,
    ayahNumber: input.ayahNumber,
    audioKey: input.audioKey,
    audioUrl: input.audioUrl,
    transcript: input.transcript,
    score: input.score ?? null,
    missingWords: JSON.stringify(input.missingWords),
    feedback: JSON.stringify(input.feedback),
  });
  return Number(result[0].insertId);
}

export async function updateSessionAyah(sessionId: number, currentAyah: number, status: "active" | "completed") {
  const db = await getDb();
  if (!db) return;
  await db.update(recitationSessions).set({ currentAyah, status }).where(eq(recitationSessions.id, sessionId));
}

export async function getRecentAttempts(userId?: number) {
  const db = await getDb();
  if (!db) return [];
  const query = db.select().from(recitationAttempts).orderBy(desc(recitationAttempts.createdAt)).limit(20);
  return userId ? query.where(eq(recitationAttempts.userId, userId)) : query;
}

export async function getProgressStats(userId: number) {
  const db = await getDb();
  if (!db) {
    return { totalAttempts: 0, reviewedVerses: 0, averageScore: null, strongVerses: 0, activeSurahs: [], difficultVerses: [] };
  }

  const attempts = await db.select().from(recitationAttempts).where(eq(recitationAttempts.userId, userId)).orderBy(desc(recitationAttempts.createdAt));
  const verses = new Map<string, { surahNumber: number; ayahNumber: number; attempts: number; scores: number[]; latestScore: number | null; missingWords: string[] }>();
  const surahs = new Map<number, { attempts: number; verses: Set<string>; scores: number[] }>();

  for (const attempt of attempts) {
    const key = `${attempt.surahNumber}:${attempt.ayahNumber}`;
    const current = verses.get(key) ?? { surahNumber: attempt.surahNumber, ayahNumber: attempt.ayahNumber, attempts: 0, scores: [], latestScore: null, missingWords: [] };
    current.attempts += 1;
    current.latestScore = current.latestScore ?? attempt.score;
    if (attempt.score !== null) current.scores.push(attempt.score);
    if (!current.missingWords.length && attempt.missingWords) {
      try { current.missingWords = JSON.parse(attempt.missingWords) as string[]; } catch { current.missingWords = []; }
    }
    verses.set(key, current);

    const surah = surahs.get(attempt.surahNumber) ?? { attempts: 0, verses: new Set<string>(), scores: [] };
    surah.attempts += 1;
    surah.verses.add(key);
    if (attempt.score !== null) surah.scores.push(attempt.score);
    surahs.set(attempt.surahNumber, surah);
  }

  const scored = attempts.map((attempt) => attempt.score).filter((score): score is number => score !== null);
  const averageScore = scored.length ? Math.round(scored.reduce((sum, score) => sum + score, 0) / scored.length) : null;
  const difficultVerses = Array.from(verses.values())
    .map((verse) => ({ ...verse, averageScore: verse.scores.length ? Math.round(verse.scores.reduce((sum, score) => sum + score, 0) / verse.scores.length) : null }))
    .filter((verse) => verse.averageScore === null || verse.averageScore < 75)
    .sort((a, b) => (a.averageScore ?? -1) - (b.averageScore ?? -1) || b.attempts - a.attempts)
    .slice(0, 8);

  return {
    totalAttempts: attempts.length,
    reviewedVerses: verses.size,
    averageScore,
    strongVerses: Array.from(verses.values()).filter((verse) => verse.scores.length > 0 && Math.max(...verse.scores) >= 80).length,
    activeSurahs: Array.from(surahs.entries()).map(([surahNumber, surah]) => ({ surahNumber, attempts: surah.attempts, reviewedVerses: surah.verses.size, averageScore: surah.scores.length ? Math.round(surah.scores.reduce((sum: number, score: number) => sum + score, 0) / surah.scores.length) : null })).sort((a, b) => b.attempts - a.attempts),
    difficultVerses,
  };
}
