export const SPEECH_LIMITS = { seconds: 60, audioBytes: 3_000_000, requestBytes: 3_100_000 };

export function appendTranscript(value: string, transcript: string, maxLength: number, multiline = false) {
  const text = (multiline ? transcript : transcript.replace(/[\r\n]+/g, " ")).trim();
  if (!text) throw new Error("empty");
  const separator = value && !/\s$/.test(value) ? (multiline ? "\n" : " ") : "";
  const next = value + separator + text;
  if (next.length > maxLength) throw new Error("length");
  return next;
}
