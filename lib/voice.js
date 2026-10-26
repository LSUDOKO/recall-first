// Voice: text to speech (Groq Orpheus) and speech to text (Groq Whisper).
// If Groq TTS is unavailable (no key, terms not accepted, any error) the page falls back to the
// browser's own speechSynthesis, so reading aloud always works somewhere.
const GROQ = "https://api.groq.com/openai/v1";
const TTS_MODEL = process.env.RECALL_TTS_MODEL || "canopylabs/orpheus-v1-english";
const TTS_VOICE = process.env.RECALL_TTS_VOICE || "hannah";
const STT_MODEL = process.env.RECALL_STT_MODEL || "whisper-large-v3-turbo";
export const TTS_MAX_CHARS = 200;          // Orpheus limit per request
export const STT_MAX_BYTES = 3_000_000;   // ~3 MB of audio; Vercel bodies max out at 4.5 MB

const key = () => process.env.GROQ_API_KEY;
const fail = (message, status = 502, code = "voice_failed") => Object.assign(new Error(message), { status, code });
let ttsBlocked = null;   // remembered reason after the first hard refusal (e.g. terms not accepted)

export function voiceStatus() {
  return { tts: key() && !ttsBlocked ? "groq" : "browser", ttsBlocked, stt: key() ? "groq" : "browser" };
}

export async function speak(text) {
  const input = String(text || "").replace(/\s+/g, " ").trim();
  if (!input) throw fail("Nothing to read.", 400, "bad_request");
  if (!key() || ttsBlocked) throw fail("Use the browser voice.", 503, "tts_unavailable");
  if (input.length > TTS_MAX_CHARS) throw fail("Too long for the AI voice.", 413, "tts_too_long");
  const res = await fetch(`${GROQ}/audio/speech`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key()}` },
    body: JSON.stringify({ model: TTS_MODEL, voice: TTS_VOICE, input, response_format: "wav" }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!res) throw fail("Couldn't reach the voice service.", 502, "tts_unavailable");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const code = err.error && err.error.code;
    if (code === "model_terms_required" || res.status === 401 || res.status === 403 || res.status === 404) {
      ttsBlocked = code || `http_${res.status}`;
      console.error("[voice] Groq TTS disabled:", (err.error && err.error.message) || res.status);
    }
    throw fail("Use the browser voice.", 503, "tts_unavailable");
  }
  return Buffer.from(await res.arrayBuffer());
}

const EXT = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav" };
export async function transcribe({ audio, mime }) {
  if (!key()) throw fail("Speech to text needs GROQ_API_KEY.", 503, "stt_unavailable");
  if (typeof audio !== "string" || !audio) throw fail("No audio received.", 400, "bad_request");
  const bytes = Buffer.from(audio, "base64");
  if (bytes.length < 2000) throw fail("That was too short to hear. Hold the mic a little longer.", 400, "too_short");
  if (bytes.length > STT_MAX_BYTES) throw fail("That recording is too long. Keep answers under a minute.", 413, "too_long");
  const type = String(mime || "audio/webm").split(";")[0];
  const form = new FormData();
  form.append("file", new Blob([bytes], { type }), `answer.${EXT[type] || "webm"}`);
  form.append("model", STT_MODEL);
  form.append("response_format", "json");
  form.append("temperature", "0");
  const res = await fetch(`${GROQ}/audio/transcriptions`, { method: "POST", headers: { authorization: `Bearer ${key()}` }, body: form, signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (!res) throw fail("Couldn't reach the speech service.");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { console.error("[voice] whisper error:", res.status, JSON.stringify(data).slice(0, 300)); throw fail(`Speech to text failed (${res.status}).`); }
  const text = String(data.text || "").trim();
  // Whisper invents filler on silence; treat those as "heard nothing".
  if (!text || /^(thank you\.?|thanks for watching!?|you|\.+|bye\.?)$/i.test(text)) return { text: "", heard: false };
  return { text, heard: true };
}
