import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { pool, initDb } from "./db.js";
import authRouter from "./routes/auth.js";
import guildsRouter from "./routes/guilds.js";
import statsRouter from "./routes/stats.js";
import assistantRouter from "./routes/assistant.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PgStore = connectPgSimple(session);

app.set("trust proxy", 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    store: new PgStore({ pool, tableName: "session", createTableIfMissing: false }),
    secret: process.env["SESSION_SECRET"] ?? "changeme-set-SESSION_SECRET-in-env",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production",
      sameSite: "lax",
    },
  })
);

app.use("/api/auth", authRouter);
app.use("/api/guilds", guildsRouter);
app.use("/api/assistant", assistantRouter);
app.use("/api", statsRouter);

// Proxy /ping to the bot API server so uptime monitors can use the dashboard URL
app.get("/ping", async (_req: any, res: any) => {
  const botApiUrl = process.env["BOT_API_URL"] ?? "http://localhost:3000";
  try {
    const response = await fetch(`${botApiUrl}/ping`);
    const text = await response.text();
    res.status(response.status).send(text);
  } catch {
    res.status(503).send("Bot API unreachable");
  }
});

// process.cwd() is always the project root (artifacts/dashboard),
// regardless of whether this file is running as source (server/) or
// compiled bundle (dist/server/). Using __dirname would double the
// "dist" segment in production and cause ENOENT errors.
const clientDist = path.resolve(process.cwd(), "dist/client");

// Base URL helpers
/**
 * Derive the site's base URL from the request.
 * Prefers DASHBOARD_URL env var, then falls back to the request host.
 */
function getBaseUrl(req: any): string {
  const env = (process.env["DASHBOARD_URL"] ?? "").trim().replace(/\/+$/, "");
  if (env) return env;
  const proto = req.headers["x-forwarded-proto"] ?? (req.secure ? "https" : "http");
  const host  = req.headers["x-forwarded-host"] ?? req.headers["host"] ?? req.hostname;
  return `${proto}://${host}`;
}

// Raw index.html template — read once, cached, never mutated.
let _rawIndexHtml: string | null = null;

function getRawIndexHtml(indexPath: string): string {
  if (!_rawIndexHtml) _rawIndexHtml = fs.readFileSync(indexPath, "utf8");
  return _rawIndexHtml;
}

/**
 * Inject absolute-URL OG tags into the index.html for the given request.
 * Called on every request so the host is always correct.
 */
function buildHtmlForRequest(req: any, indexPath: string): string {
  let html = getRawIndexHtml(indexPath);
  const base     = getBaseUrl(req);
  const imageUrl = `${base}/pigeon.jpeg`;
  const injection = [
    `    <meta property="og:url" content="${base}" />`,
    `    <meta property="og:image" content="${imageUrl}" />`,
    `    <meta name="twitter:image" content="${imageUrl}" />`,
  ].join("\n");
  return html.replace("</head>", `${injection}\n  </head>`);
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Disable automatic index.html serving so every HTML request goes through
// the catch-all below, which injects the server-side og:image / og:url tags.
app.use(express.static(clientDist, { index: false }));

app.get("/{*splat}", (req: any, res: any) => {
  const indexPath = path.join(clientDist, "index.html");
  try {
    const html = buildHtmlForRequest(req, indexPath);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch {
    res.sendFile(indexPath);
  }
});

const port = Number(process.env["DASHBOARD_PORT"] ?? process.env["PORT"] ?? 4000);

initDb()
  .then(() => {
    app.listen(port, "0.0.0.0", () => {
      console.log(`Dashboard running on port ${port}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize DB:", err);
    process.exit(1);
  });
