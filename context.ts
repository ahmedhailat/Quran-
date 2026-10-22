import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";

export type SessionUser = { id: number; openId: string; name?: string | null; email?: string | null; role: "user" | "admin" };
export type AppContext = { req: CreateExpressContextOptions["req"]; res: CreateExpressContextOptions["res"]; user?: SessionUser };

export function createContext({ req, res }: CreateExpressContextOptions): AppContext {
  // Authentication middleware was not present in the recovered source bundle.
  // Keep requests anonymous until a real, verified session provider is restored.
  return { req, res, user: undefined };
}
