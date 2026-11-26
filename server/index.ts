import path from "node:path";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { authRouter, loadUser, requireUser } from "./auth";
import { fetchBpsDataset, listDomains, listPeriods, listSubjects, listVariables, MAX_PERIODS } from "./bps";
import { config } from "./config";
import { normalizeDataset } from "./dataset";
import { migrate, pool } from "./db";
import { availableProviders, getProvider } from "./providers";
import { assistantSystemPrompt } from "./providers/prompt";
import { ChatTurn, ProviderError, SearchMode } from "./providers/types";

const SEARCH_TIMEOUT_MS: Record<SearchMode, number> = { fast: 180_000, deep: 420_000 };
const MAX_SAVED_DATASETS = 100;

async function usageToday(userId: number): Promise<{ total: number; deep: number; chat: number }> {
  const { rows } = await pool.query(
    `SELECT count(*) FILTER (WHERE mode IN ('fast', 'deep'))::int AS total,
            count(*) FILTER (WHERE mode = 'deep')::int AS deep,
            count(*) FILTER (WHERE mode = 'chat')::int AS chat
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
      bps: Boolean(config.bpsApiKey),
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
    message: { error: "Terlalu banyak pencarian sekaligus. Tunggu sebentar." },
  });

  app.post("/api/search", requireUser, searchLimiter, async (req, res) => {
    const user = req.user!;
    const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
    const mode: SearchMode = req.body?.mode === "deep" ? "deep" : "fast";

    if (!query) return res.status(400).json({ error: "Tuliskan data yang Anda cari." });
    if (query.length > 2000) {
      return res.status(400).json({ error: "Permintaan terlalu panjang. Maksimal 2.000 karakter." });
    }

    const provider = getProvider(String(req.body?.provider ?? ""));
    if (!provider) return res.status(400).json({ error: "Model AI itu tidak tersedia." });

    if (user.role !== "admin") {
      const used = await usageToday(user.id);
      if (used.total >= config.dailySearchLimit) {
        return res.status(429).json({
          error: `Jatah ${config.dailySearchLimit} pencarian hari ini sudah habis. Coba lagi besok.`,
        });
      }
      if (mode === "deep" && used.deep >= config.dailyDeepLimit) {
        return res.status(429).json({
          error: `Jatah ${config.dailyDeepLimit} pencarian mendalam hari ini sudah habis. Mode cepat masih bisa dipakai.`,
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
        error: "AI tidak berhasil menyusun dataset. Coba lagi atau ubah kalimat permintaan.",
      });
    } finally {
      clearTimeout(timer);
    }
  });

  // --- BPS: official statistics fetched directly, no AI involved ---
  const bpsLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 40,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `user:${(req as Request).user?.id}`,
    message: { error: "Terlalu banyak permintaan ke BPS. Tunggu sebentar." },
  });
  const bps = express.Router();
  bps.use(requireUser, bpsLimiter);
  bps.get("/domains", async (_req, res) => res.json({ items: await listDomains() }));
  bps.get("/subjects", async (req, res) => res.json({ items: await listSubjects(String(req.query.domain)) }));
  bps.get("/variables", async (req, res) =>
    res.json({ items: await listVariables(String(req.query.domain), String(req.query.subject)) })
  );
  bps.get("/periods", async (req, res) =>
    res.json({ items: await listPeriods(String(req.query.domain), String(req.query.variable)), max: MAX_PERIODS })
  );
  bps.post("/dataset", async (req, res) => {
    const periods: unknown[] = Array.isArray(req.body?.periods) ? req.body.periods : [];
    const dataset = await fetchBpsDataset(String(req.body?.domain), String(req.body?.variable), periods.map(String));
    pool
      .query(
        `INSERT INTO search_logs (user_id, provider, model, mode, query, status) VALUES ($1, 'bps', '', 'bps', $2, 'ok')`,
        [req.user!.id, dataset.title.slice(0, 500)]
      )
      .catch((err) => console.error("Failed to write BPS log:", err));
    res.json({
      ...dataset,
      provider: "bps",
      providerLabel: "WebAPI BPS",
      model: "",
      mode: "bps",
      query: dataset.title,
      retrievedAt: new Date().toISOString(),
    });
  });
  bps.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof ProviderError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    next(err);
  });
  app.use("/api/bps", bps);

  const assistantLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 12,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `user:${(req as Request).user?.id}`,
    message: { error: "Terlalu banyak pertanyaan sekaligus. Tunggu sebentar." },
  });

  app.post("/api/assistant", requireUser, assistantLimiter, async (req, res) => {
    const user = req.user!;
    const context = typeof req.body?.context === "string" ? req.body.context.slice(0, 30_000) : "";
    const rawTurns: unknown[] = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const turns: ChatTurn[] = rawTurns
      .filter((t: any) => (t?.role === "user" || t?.role === "assistant") && typeof t?.text === "string" && t.text.trim())
      .map((t: any) => ({ role: t.role, text: t.text.trim().slice(0, 4000) }))
      .slice(-12);
    // A conversation sent to the model must start and end with the user.
    while (turns.length && turns[0].role !== "user") turns.shift();
    if (!context || turns.length === 0 || turns[turns.length - 1].role !== "user") {
      return res.status(400).json({ error: "Tuliskan pertanyaan Anda." });
    }

    const provider = getProvider(String(req.body?.provider ?? "")) ?? availableProviders()[0];
    if (!provider) return res.status(400).json({ error: "Belum ada model AI yang tersedia." });

    if (user.role !== "admin" && (await usageToday(user.id)).chat >= config.dailyChatLimit) {
      return res.status(429).json({
        error: `Jatah ${config.dailyChatLimit} pertanyaan ke asisten hari ini sudah habis. Coba lagi besok.`,
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });

    const question = turns[turns.length - 1].text.slice(0, 500);
    const log = (status: string, model: string, inTok?: number, outTok?: number) =>
      pool
        .query(
          `INSERT INTO search_logs (user_id, provider, model, mode, query, status, input_tokens, output_tokens)
           VALUES ($1, $2, $3, 'chat', $4, $5, $6, $7)`,
          [user.id, provider.id, model, question, status, inTok ?? null, outTok ?? null]
        )
        .catch((err) => console.error("Failed to write chat log:", err));

    try {
      const result = await provider.chat(assistantSystemPrompt(context), turns, controller.signal);
      await log("ok", result.model, result.inputTokens, result.outputTokens);
      return res.json({ text: result.text, model: result.model, providerLabel: provider.label });
    } catch (error) {
      await log("error", provider.modelFor("fast"));
      if (res.destroyed) return;
      if (error instanceof ProviderError) return res.status(error.status).json({ error: error.message });
      console.error(`Assistant failed (${provider.id}):`, error);
      return res.status(502).json({ error: "Asisten tidak bisa menjawab saat ini. Silakan coba lagi." });
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
    if (!Number.isInteger(id)) return res.status(404).json({ error: "Dataset tidak ditemukan." });
    const { rows } = await pool.query(
      `SELECT id, payload, created_at AS "savedAt" FROM datasets WHERE id = $1 AND user_id = $2`,
      [id, req.user!.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Dataset tidak ditemukan." });
    return res.json({ ...rows[0].payload, id: rows[0].id, savedAt: rows[0].savedAt });
  });

  app.post("/api/datasets", requireUser, async (req, res) => {
    const body = req.body;
    if (!body || typeof body.title !== "string" || !Array.isArray(body.variables) || !Array.isArray(body.data)) {
      return res.status(400).json({ error: "Dataset tidak sah." });
    }
    const { rows: countRows } = await pool.query(
      "SELECT count(*)::int AS n FROM datasets WHERE user_id = $1",
      [req.user!.id]
    );
    if (countRows[0].n >= MAX_SAVED_DATASETS) {
      return res.status(400).json({
        error: `Anda bisa menyimpan sampai ${MAX_SAVED_DATASETS} dataset. Hapus salah satu untuk menyimpan yang baru.`,
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

  app.put("/api/datasets/:id", requireUser, async (req, res) => {
    const id = Number(req.params.id);
    const body = req.body;
    if (!body || typeof body.title !== "string" || !Array.isArray(body.variables) || !Array.isArray(body.data)) {
      return res.status(400).json({ error: "Dataset tidak sah." });
    }
    const { id: _id, savedAt: _savedAt, ...payload } = body;
    const { rows } = await pool.query(
      `UPDATE datasets SET title = $3, description = $4, row_count = $5, payload = $6
        WHERE id = $1 AND user_id = $2
        RETURNING id, title, description, row_count AS "rowCount", created_at AS "savedAt"`,
      [
        Number.isInteger(id) ? id : -1,
        req.user!.id,
        body.title.slice(0, 200),
        typeof body.description === "string" ? body.description.slice(0, 1000) : "",
        body.data.length,
        JSON.stringify(payload),
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: "Dataset tidak ditemukan." });
    return res.json({ dataset: rows[0] });
  });

  app.delete("/api/datasets/:id", requireUser, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isInteger(id)) {
      await pool.query("DELETE FROM datasets WHERE id = $1 AND user_id = $2", [id, req.user!.id]);
    }
    res.json({ ok: true });
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Tidak ditemukan." });
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
      res.status(413).json({ error: "Dataset terlalu besar untuk disimpan." });
      return;
    }
    console.error("Unhandled error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Terjadi kesalahan. Silakan coba lagi." });
  });

  app.listen(config.port, "0.0.0.0", () => {
    console.log(`Server running on port ${config.port}`);
    const names = availableProviders().map((p) => p.label);
    if (config.bpsApiKey) console.log("BPS WebAPI source: on");
    console.log(names.length ? `AI providers: ${names.join(", ")}` : "Warning: no AI provider API key is set.");
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
