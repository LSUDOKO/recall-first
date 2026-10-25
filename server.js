// Recall First — a tiny Node server.
// Job 1: hand the browser the files in public/.
// Job 2: answer two API requests by talking to the AI (lib/ai.js).
// The AI key lives only here, in process.env — the browser never sees it.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { generateQuestions, gradeAnswer, aiStatus, MAX_WORDS } from "./lib/ai.js";

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(import.meta.dirname, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
  ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readJson(req, limit = 200_000) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("Request too large"), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const routes = {
  "GET /api/status": async () => aiStatus(),
  "POST /api/questions": async (req) => {
    const { notes } = await readJson(req);
    if (typeof notes !== "string" || !notes.trim()) throw Object.assign(new Error("Paste some notes first."), { status: 400 });
    return generateQuestions(notes);
  },
  "POST /api/grade": async (req) => {
    const body = await readJson(req);
    for (const k of ["question", "referenceAnswer", "userAnswer", "notes"])
      if (typeof body[k] !== "string") throw Object.assign(new Error(`Missing ${k}`), { status: 400 });
    return gradeAnswer(body);
  },
};

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://x");
  const file = path.normalize(path.join(PUBLIC_DIR, url.pathname === "/" ? "index.html" : url.pathname));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, "Forbidden", "text/plain");
  try {
    const data = await fs.readFile(file);
    send(res, 200, data, TYPES[path.extname(file)] || "application/octet-stream");
  } catch {
    send(res, 404, "Not found", "text/plain");
  }
}

http.createServer(async (req, res) => {
  const key = `${req.method} ${new URL(req.url, "http://x").pathname}`;
  if (!routes[key]) return serveStatic(req, res);
  try {
    send(res, 200, await routes[key](req));
  } catch (err) {
    const status = err.status || 502;
    if (status >= 500) console.error(`[${key}]`, err.message);
    send(res, status, { error: err.code || "failed", message: err.message });
  }
}).listen(PORT, () => {
  const s = aiStatus();
  console.log(`Recall First → http://localhost:${PORT}`);
  console.log(s.mock ? "Mode: MOCK (canned questions, no AI calls)"
    : s.ready ? `Mode: live, model ${s.model}` : "Mode: no key — add ANTHROPIC_API_KEY to .env");
});
