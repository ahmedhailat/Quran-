import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const recitationSessions = mysqlTable("recitation_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  surahNumber: int("surahNumber").notNull(),
  startAyah: int("startAyah").notNull(),
  currentAyah: int("currentAyah").notNull(),
  reciter: varchar("reciter", { length: 32 }).notNull().default("husary"),
  status: mysqlEnum("status", ["active", "completed", "paused"]).notNull().default("active"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const recitationAttempts = mysqlTable("recitation_attempts", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId"),
  userId: int("userId"),
  surahNumber: int("surahNumber").notNull(),
  ayahNumber: int("ayahNumber").notNull(),
  audioKey: varchar("audioKey", { length: 512 }),
  audioUrl: varchar("audioUrl", { length: 1024 }),
  transcript: text("transcript"),
  score: int("score"),
  missingWords: text("missingWords"),
  feedback: text("feedback"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type RecitationSession = typeof recitationSessions.$inferSelect;
export type RecitationAttempt = typeof recitationAttempts.$inferSelect;
