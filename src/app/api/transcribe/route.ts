import { z } from "zod";
import { isCrossOrigin } from "../../../lib/origin";
import { SPEECH_LIMITS } from "../../../lib/speech";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const reply = (body: unknown, status = 200, detail?: unknown) => {
    // Server-only diagnostics; the client still receives just the error code.
    if (status >= 400) console.error(`[transcribe] ${status}`, body, detail ?? "");
    return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  };
  if (isCrossOrigin(request)) return reply({ error: "invalid" }, 403, { origin: request.headers.get("origin"), url: request.url, host: request.headers.get("host"), forwardedHost: request.headers.get("x-forwarded-host") });
  let file: File; let language: string;
  try {
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) return reply({ error: "invalid" }, 400, request.headers.get("content-type"));
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
    if (!(audio instanceof File) || !["en", "de"].includes(String(locale)) || !audio.size) return reply({ error: "invalid" }, 400, { locale, size: audio instanceof File ? audio.size : null });
    if (audio.size > SPEECH_LIMITS.audioBytes) return reply({ error: "limit" }, 413);
    // Mobile browsers label recordings inconsistently, so the container is identified from its bytes, not the declared type.
    const header = Buffer.from(await audio.slice(0, 12).arrayBuffer());
    const format = header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) ? { type: "audio/webm", name: "speech.webm" }
      : header.subarray(0, 4).toString() === "OggS" ? { type: "audio/ogg", name: "speech.ogg" }
      : header.subarray(0, 4).toString() === "RIFF" && header.subarray(8, 12).toString() === "WAVE" ? { type: "audio/wav", name: "speech.wav" }
      : header.subarray(4, 8).toString() === "ftyp" ? { type: "audio/mp4", name: "speech.m4a" } : null;
    if (!format) return reply({ error: "invalid" }, 400, { declared: audio.type, header: header.toString("hex") });
    file = new File([audio], format.name, { type: format.type }); language = String(locale);
  } catch (error) { return reply({ error: "invalid" }, 400, error); }
  if (!process.env.ELEVENLABS_API_KEY) return reply({ error: "configuration" }, 503);
  try {
    const form = new FormData();
    form.set("file", file); form.set("model_id", "scribe_v2"); form.set("language_code", language);
    form.set("tag_audio_events", "false"); form.set("diarize", "false"); form.set("timestamps_granularity", "none");
    const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST", headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY }, body: form,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(45_000)]),
    });
    if (response.status === 401 || response.status === 403) return reply({ error: "configuration" }, 503, await response.text());
    if (!response.ok) return reply({ error: "provider" }, 502, { status: response.status, body: await response.text(), type: file.type, size: file.size });
    const result = z.object({ text: z.string().trim().min(1).max(8000) }).safeParse(await response.json());
    if (!result.success) return reply({ error: "empty" }, 502);
    return reply({ text: result.data.text });
  } catch (error) { return reply({ error: "provider" }, 502, error); }
}
