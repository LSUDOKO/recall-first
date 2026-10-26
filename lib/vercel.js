// Wraps a lib/routes.js handler as a Vercel Node function. Vercel parses JSON bodies for us.
import { handlers, errorResponse } from "./routes.js";

export const asFunction = (name) => async (req, res) => {
  try {
    const body = req.method === "POST" ? (typeof req.body === "object" && req.body) || {} : {};
    res.setHeader("cache-control", "no-store");
    const out = await handlers[name](body);
    if (Buffer.isBuffer(out)) { res.setHeader("content-type", "audio/wav"); res.setHeader("cache-control", "public, max-age=86400"); return res.status(200).send(out); }
    res.status(200).json(out);
  } catch (err) {
    const { status, body } = errorResponse(err);
    res.status(status).json(body);
  }
};
