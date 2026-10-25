// Wraps a lib/routes.js handler as a Vercel Node function. Vercel parses JSON bodies for us.
import { handlers, errorResponse } from "./routes.js";

export const asFunction = (name) => async (req, res) => {
  try {
    const body = req.method === "POST" ? (typeof req.body === "object" && req.body) || {} : {};
    res.setHeader("cache-control", "no-store");
    res.status(200).json(await handlers[name](body));
  } catch (err) {
    const { status, body } = errorResponse(err);
    res.status(status).json(body);
  }
};
