import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { fileURLToPath } from "node:url";
import { appRouter } from "../routers";
import { createContext } from "./context";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const staticDirectory = fileURLToPath(new URL("../client", import.meta.url));

app.disable("x-powered-by");
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: false, limit: "12mb" }));
app.get("/health", (_req, res) => res.status(200).json({ ok: true }));
app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
app.use(express.static(staticDirectory, { index: false, fallthrough: true }));
app.get("*", (_req, res, next) => {
  res.sendFile(`${staticDirectory}/index.html`, (error) => {
    if (error) next(error);
  });
});
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[server] Request failed", error);
  res.status(500).json({ error: "حدث خطأ غير متوقع في الخادم." });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`[server] listening on 0.0.0.0:${port}`);
});
