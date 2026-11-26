import "dotenv/config";

function int(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function str(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

export const config = {
  port: int("PORT", 3000),
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: str("DATABASE_URL"),
  allowRegistration: str("ALLOW_REGISTRATION", "true") !== "false",
  dailySearchLimit: int("DAILY_SEARCH_LIMIT", 20),
  dailyDeepLimit: int("DAILY_DEEP_LIMIT", 5),
  dailyChatLimit: int("DAILY_CHAT_LIMIT", 50),
  sessionDays: int("SESSION_DAYS", 30),
  geminiApiKey: str("GEMINI_API_KEY"),
  geminiModelFast: str("GEMINI_MODEL_FAST", "gemini-3-flash-preview"),
  geminiModelDeep: str("GEMINI_MODEL_DEEP", "gemini-3-pro-preview"),
  anthropicApiKey: str("ANTHROPIC_API_KEY"),
  claudeModel: str("CLAUDE_MODEL", "claude-opus-5-5"),
};
