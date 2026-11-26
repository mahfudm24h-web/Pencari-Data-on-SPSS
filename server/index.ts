import path from "node:path";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { authRouter, loadUser, requireUser } from "./auth";
import { config } from "./config";
import { normalizeDataset } from "./dataset";
import { migrate, pool } from "./db";
import { availableProviders, getProvider } from "./providers";
import { ProviderError, SearchMode } from "./providers/types";

const SEARCH_TIMEOUT_MS: Record<SearchMode, number> = { fast: 180_000, deep: 420_000 };
const MAX_SAVED_DATASETS = 100;

async function usageToday(userId: number): Promise<{ total: number; deep: number }> {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE mode = 'deep')::int AS deep
       FROM search_logs
      WHERE user_id = $1 AND created_at > now() - interval '24 hours'`,
    [userId]
  );
  return rows[0];
}

async function main() {
  await migrate();
  await pool.query("DELETE FROM sessions WHERE expires_at < now()");

  const app = express();
  // The app runs behind one reverse proxy (Traefik); needed for client IPs and secure cookies.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api", loadUser);
  app.use("/api/auth", authRouter);

  app.get("/api/providers", requireUser, async (req, res) => {
    const used = await usageToday(req.user!.id);
    res.json({
      providers: availableProviders().map((p) => ({
        id: p.id,
        label: p.label,
        models: { fast: p.modelFor("fast"), deep: p.modelFor("deep") },
      })),
      quota: {
        used: used.total,
        usedDeep: used.deep,
        limit: config.dailySearchLimit,
        limitDeep: config.dailyDeepLimit,
        unlimited: req.user!.role === "admin",
      },
    });
  });

  const searchLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 6,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `user:${(req as Request).user?.id}`,
    message: { error: "Too many searches at once. Please wait a minute." },
  });

  app.post("/api/search", requireUser, searchLimiter, async (req, res) => {
    const user = req.user!;
    const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
    const mode: SearchMode = req.body?.mode === "deep" ? "deep" : "fast";

    if (!query) return res.status(400).json({ error: "Please enter what data you are looking for." });
    if (query.length > 2000) {
      return res.status(400).json({ error: "The request is too long. Keep it under 2,000 characters." });
    }

    const provider = getProvider(String(req.body?.provider ?? ""));
    if (!provider) return res.status(400).json({ error: "That AI model is not available." });

    if (user.role !== "admin") {
      const used = await usageToday(user.id);
      if (used.total >= config.dailySearchLimit) {
        return res.status(429).json({
          error: `You have used all ${config.dailySearchLimit} searches for today. Try again tomorrow.`,
        });
      }
      if (mode === "deep" && used.deep >= config.dailyDeepLimit) {
        return res.status(429).json({
          error: `You have used all ${config.dailyDeepLimit} deep searches for today. Fast mode is still available.`,
        });
      }
    }

    const log = async (status: string, model: string, inTok?: number, outTok?: number) => {
      await pool
        .query(
          `INSERT INTO search_logs (user_id, provider, model, mode, query, status, input_tokens, output_tokens)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [user.id, provider.id, model, mode, query, status, inTok ?? null, outTok ?? null]
        )
        .catch((err) => console.error("Failed to write search log:", err));
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS[mode]);
    // Stop paying for a search nobody is waiting for.
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });

    try {
      const result = await provider.search(query, mode, controller.signal);
      const dataset = normalizeDataset(result.raw, result.sources);
      await log("ok", result.model, result.inputTokens, result.outputTokens);
      return res.json({
        ...dataset,
        provider: provider.id,
        providerLabel: provider.label,
        model: result.model,
        mode,
        query,
        retrievedAt: new Date().toISOString(),
      });
    } catch (error) {
      await log("error", provider.modelFor(mode));
      if (res.destroyed) return;
      if (error instanceof ProviderError) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error(`Search failed (${provider.id}):`, error);
      return res.status(502).json({
        error: "The AI could not produce a usable dataset. Please try again or rephrase the request.",
      });
    } finally {
      clearTimeout(timer);
    }
  });

  app.get("/api/datasets", requireUser, async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, title, description, row_count AS "rowCount", created_at AS "savedAt"
         FROM datasets WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user!.id]
    );
    res.json({ datasets: rows });
  });

  app.get("/api/datasets/:id", requireUser, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(404).json({ error: "Dataset not found." });
    const { rows } = await pool.query(
      `SELECT id, payload, created_at AS "savedAt" FROM datasets WHERE id = $1 AND user_id = $2`,
      [id, req.user!.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Dataset not found." });
    return res.json({ ...rows[0].payload, id: rows[0].id, savedAt: rows[0].savedAt });
  });

  app.post("/api/datasets", requireUser, async (req, res) => {
    const body = req.body;
    if (!body || typeof body.title !== "string" || !Array.isArray(body.variables) || !Array.isArray(body.data)) {
      return res.status(400).json({ error: "That is not a valid dataset." });
    }
    const { rows: countRows } = await pool.query(
      "SELECT count(*)::int AS n FROM datasets WHERE user_id = $1",
      [req.user!.id]
    );
    if (countRows[0].n >= MAX_SAVED_DATASETS) {
      return res.status(400).json({
        error: `You can save up to ${MAX_SAVED_DATASETS} datasets. Delete one to save another.`,
      });
    }
    const { id: _id, savedAt: _savedAt, ...payload } = body;
    const { rows } = await pool.query(
      `INSERT INTO datasets (user_id, title, description, row_count, payload)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, title, description, row_count AS "rowCount", created_at AS "savedAt"`,
      [
        req.user!.id,
        body.title.slice(0, 200),
        typeof body.description === "string" ? body.description.slice(0, 1000) : "",
        body.data.length,
        JSON.stringify(payload),
      ]
    );
    return res.status(201).json({ dataset: rows[0] });
  });

  app.delete("/api/datasets/:id", requireUser, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isInteger(id)) {
      await pool.query("DELETE FROM datasets WHERE id = $1 AND user_id = $2", [id, req.user!.id]);
    }
    res.json({ ok: true });
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found." });
  });

  if (config.isProduction) {
    const distDir = path.resolve(process.cwd(), "dist");
    app.use(express.static(distDir, { index: false, maxAge: "1h" }));
    app.use((req, res, next) => {
      if (req.method !== "GET") return next();
      res.sendFile(path.join(distDir, "index.html"));
    });
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if ((err as { type?: string })?.type === "entity.too.large") {
      res.status(413).json({ error: "That dataset is too large to save." });
      return;
    }
    console.error("Unhandled error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Something went wrong. Please try again." });
  });

  app.listen(config.port, "0.0.0.0", () => {
    console.log(`Server running on port ${config.port}`);
    const names = availableProviders().map((p) => p.label);
    console.log(names.length ? `AI providers: ${names.join(", ")}` : "Warning: no AI provider API key is set.");
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
