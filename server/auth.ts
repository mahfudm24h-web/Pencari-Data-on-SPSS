import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { config } from "./config";
import { pool } from "./db";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: "user" | "admin";
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

const COOKIE = "sid";
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString("hex"), 12);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i !== -1 && part.slice(0, i).trim() === name) {
      return decodeURIComponent(part.slice(i + 1).trim());
    }
  }
  return undefined;
}

async function startSession(res: Response, userId: number): Promise<void> {
  const token = crypto.randomBytes(32).toString("hex");
  const maxAgeMs = config.sessionDays * 24 * 60 * 60 * 1000;
  await pool.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [
    hashToken(token),
    userId,
    new Date(Date.now() + maxAgeMs),
  ]);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    maxAge: maxAgeMs,
    path: "/",
  });
}

/** Attaches req.user when the request carries a valid session cookie. */
export async function loadUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = readCookie(req, COOKIE);
    if (token) {
      const { rows } = await pool.query(
        `SELECT u.id, u.email, u.name, u.role
           FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = $1 AND s.expires_at > now()`,
        [hashToken(token)]
      );
      if (rows[0]) req.user = rows[0];
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Please sign in." });
    return;
  }
  next();
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a few minutes and try again." },
});

export const authRouter = Router();

authRouter.get("/me", (req, res) => {
  res.json({ user: req.user ?? null, allowRegistration: config.allowRegistration });
});

authRouter.post("/register", authLimiter, async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 100) : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!EMAIL_RE.test(email) || email.length > 200) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }
  if (!name) return res.status(400).json({ error: "Please enter your name." });
  if (password.length < 8 || password.length > 200) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  const { rows: countRows } = await pool.query("SELECT count(*)::int AS n FROM users");
  const isFirstUser = countRows[0].n === 0;
  // The first account becomes the administrator and can always be created.
  if (!isFirstUser && !config.allowRegistration) {
    return res.status(403).json({ error: "Registration is closed. Ask the administrator for an account." });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (email, name, password_hash, role) VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, role`,
      [email, name, passwordHash, isFirstUser ? "admin" : "user"]
    );
    await startSession(res, rows[0].id);
    return res.status(201).json({ user: rows[0] });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      return res.status(409).json({ error: "An account with this email already exists." });
    }
    throw err;
  }
});

authRouter.post("/login", authLimiter, async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  const { rows } = await pool.query(
    "SELECT id, email, name, role, password_hash FROM users WHERE email = $1",
    [email]
  );
  const user = rows[0];
  // Compare against a dummy hash when the user is unknown so timing does not reveal it.
  const ok = (await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH)) && Boolean(user);
  if (!ok) return res.status(401).json({ error: "Incorrect email or password." });

  await startSession(res, user.id);
  return res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

authRouter.post("/logout", async (req, res) => {
  const token = readCookie(req, COOKIE);
  if (token) await pool.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
  res.clearCookie(COOKIE, { path: "/" });
  res.json({ ok: true });
});
