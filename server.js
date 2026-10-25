// Recall First — the local server.
// Job 1: hand the browser the files in public/.
// Job 2: answer the API requests in lib/routes.js, which talk to the AI through lib/ai.js.
// The AI key lives only on the server, in process.env — the browser never sees it.
// On Vercel the same handlers run as functions in api/ and public/ is served as static files.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { handlers, errorResponse } from "./lib/routes.js";
import { aiStatus } from "./lib/ai.js";

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(import.meta.dirname, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".txt": "text/plain; charset=utf-8" };

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

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://x");
  const file = path.normalize(path.join(PUBLIC_DIR, url.pathname === "/" ? "index.html" : url.pathname));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, "Forbidden", "text/plain");
  try {
    send(res, 200, await fs.readFile(file), TYPES[path.extname(file)] || "application/octet-stream");
  } catch {
    send(res, 404, "Not found", "text/plain");
  }
}

http.createServer(async (req, res) => {
  const m = new URL(req.url, "http://x").pathname.match(/^\/api\/(\w+)$/);
  const handler = m && handlers[m[1]];
  if (!handler) return serveStatic(req, res);
  try {
    const body = req.method === "POST" ? await readJson(req) : {};
    send(res, 200, await handler(body));
  } catch (err) {
    const { status, body } = errorResponse(err);
    send(res, status, body);
  }
}).listen(PORT, () => {
  const s = aiStatus();
  console.log(`Recall First → http://localhost:${PORT}`);
  console.log(s.mock ? "Mode: MOCK (canned questions, no AI calls)"
    : s.ready ? `Mode: live, model ${s.model}` : "Mode: no key — add ANTHROPIC_API_KEY to .env");
});
