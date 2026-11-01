// Server-only configuration read from environment variables.
import path from "path";

export type LlmProvider = "gemini" | "groq" | "offline";

const env = (k: string) => (process.env[k] ?? "").trim();

export const config = {
  dataDir: path.resolve(env("DATA_DIR") || path.join(process.cwd(), "data")),

  llmPreference: (env("LLM_PROVIDER") || "auto").toLowerCase(),
  geminiKey: env("GEMINI_API_KEY"),
  geminiModel: env("GEMINI_MODEL") || "gemini-3.8-flash",
  groqKey: env("GROQ_API_KEY"),
  groqModel: env("GROQ_MODEL") || "llama-3.3-70b-versatile",

  pollinationsEnabled: env("POLLINATIONS_ENABLED") !== "false",
  pollinationsToken: env("POLLINATIONS_TOKEN"),
  pollinationsModel: env("POLLINATIONS_MODEL") || "flux",
  // anonymous Pollinations allows one image every 45 seconds per IP (and adds its logo)
  pollinationsIntervalMs: Number(env("POLLINATIONS_INTERVAL_MS")) || (env("POLLINATIONS_TOKEN") ? 4000 : 46000),
  pexelsKey: env("PEXELS_API_KEY"),
  // Openverse: free Creative Commons photo search, no key needed
  openverseEnabled: env("OPENVERSE_ENABLED") !== "false",

  // "mysql" (XAMPP / Laragon / any MySQL or MariaDB) or "file" (JSON files in DATA_DIR)
  dbDriver: (env("DB_DRIVER") || "file").toLowerCase() === "mysql" ? ("mysql" as const) : ("file" as const),
  db: {
    host: env("DB_HOST") || "127.0.0.1",
    port: Number(env("DB_PORT")) || 3306,
    user: env("DB_USER") || "root",
    password: process.env.DB_PASSWORD ?? "",
    name: env("DB_NAME") || "lyrics2ppt",
    ssl: env("DB_SSL") === "true",
  },

  maxUploadBytes: 5 * 1024 * 1024,
  maxLyricsChars: 20000,
};

export function activeLlm(): LlmProvider {
  const p = config.llmPreference;
  if (p === "offline") return "offline";
  if (p === "gemini") return config.geminiKey ? "gemini" : "offline";
  if (p === "groq") return config.groqKey ? "groq" : "offline";
  if (config.geminiKey) return "gemini";
  if (config.groqKey) return "groq";
  return "offline";
}

export function providerStatus() {
  const llm = activeLlm();
  return {
    llm,
    llmLabel:
      llm === "gemini"
        ? `Google Gemini (${config.geminiModel})`
        : llm === "groq"
          ? `Groq (${config.groqModel})`
          : "Offline keyword analysis",
    gemini: Boolean(config.geminiKey),
    groq: Boolean(config.groqKey),
    pollinations: config.pollinationsEnabled,
    pollinationsAuthed: Boolean(config.pollinationsToken),
    pexels: Boolean(config.pexelsKey),
    openverse: config.openverseEnabled,
    stock: Boolean(config.pexelsKey) || config.openverseEnabled,
    passwordProtected: Boolean(env("APP_PASSWORD")),
    storage: config.dbDriver,
    storageLabel:
      config.dbDriver === "mysql"
        ? `MySQL database "${config.db.name}" on ${config.db.host}:${config.db.port}`
        : `JSON files in ${config.dataDir}`,
  };
}
