import { z } from "zod";
import { SPEECH_LIMITS } from "../../../lib/speech";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return reply({ error: "invalid" }, 403);
  let file: File; let language: string;
  try {
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) return reply({ error: "invalid" }, 400);
    if (Number(request.headers.get("content-length")) > SPEECH_LIMITS.requestBytes) return reply({ error: "limit" }, 413);
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: "invalid" }, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length;
      if (size > SPEECH_LIMITS.requestBytes) { await reader.cancel(); return reply({ error: "limit" }, 413); }
      chunks.push(value);
    }
    const form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type")! } }).formData();
    const audio = form.get("file"); const locale = form.get("language");
    if (!(audio instanceof File) || !["en", "de"].includes(String(locale)) || !audio.size) return reply({ error: "invalid" }, 400);
    if (audio.size > SPEECH_LIMITS.audioBytes) return reply({ error: "limit" }, 413);
    const type = audio.type.split(";")[0];
    const header = Buffer.from(await audio.slice(0, 12).arrayBuffer());
    const valid = (type === "audio/webm" && header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])))
      || (type === "audio/ogg" && header.subarray(0, 4).toString() === "OggS")
      || (type === "audio/wav" && header.subarray(0, 4).toString() === "RIFF" && header.subarray(8, 12).toString() === "WAVE")
      || (type === "audio/mp4" && header.subarray(4, 8).toString() === "ftyp");
    if (!valid) return reply({ error: "invalid" }, 400);
    file = audio; language = String(locale);
  } catch { return reply({ error: "invalid" }, 400); }
  if (!process.env.ELEVENLABS_API_KEY) return reply({ error: "configuration" }, 503);
  try {
    const form = new FormData();
    form.set("file", file); form.set("model_id", "scribe_v2"); form.set("language_code", language);
    form.set("tag_audio_events", "false"); form.set("diarize", "false"); form.set("timestamps_granularity", "none");
    const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST", headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY }, body: form,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(45_000)]),
    });
    if (response.status === 401 || response.status === 403) return reply({ error: "configuration" }, 503);
    if (!response.ok) return reply({ error: "provider" }, 502);
    const result = z.object({ text: z.string().trim().min(1).max(8000) }).safeParse(await response.json());
    if (!result.success) return reply({ error: "empty" }, 502);
    return reply({ text: result.data.text });
  } catch { return reply({ error: "provider" }, 502); }
}
