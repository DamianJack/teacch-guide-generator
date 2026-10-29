"use client";

import { useEffect, useId, useRef, useState } from "react";
import { copy } from "../lib/copy";
import type { Language } from "../lib/guide";
import { appendTranscript, SPEECH_LIMITS } from "../lib/speech";

type Props = {
  label: string; value: string; onChange: (value: string) => void; maxLength: number;
  language: Language; uiLanguage: Language; rows?: number; placeholder?: string;
};
type VoiceError = "voiceUnavailable" | "voicePermission" | "voiceOffline" | "voiceFailed" | "voiceEmpty" | "voiceLimit" | "voiceLength" | "voiceConfiguration";

function Microphone() {
  return <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4m-4 0h8" /></svg>;
}

export function SpeechField(props: Props) {
  const fieldId = useId(); const [open, setOpen] = useState(false); const t = copy[props.uiLanguage];
  const input = { id: fieldId, value: props.value, maxLength: props.maxLength, placeholder: props.placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => props.onChange(e.target.value) };
  return <div className="field speech-field">
    <div className="field-label-row"><label htmlFor={fieldId}>{props.label}</label><button type="button" className="mic-button" aria-label={`${t.speak}: ${props.label}`} title={t.speak} onClick={() => setOpen(true)}><Microphone /></button></div>
    {props.rows ? <textarea {...input} rows={props.rows} /> : <input {...input} type="text" />}
    {open && <Dictation {...props} close={() => setOpen(false)} />}
  </div>;
}

function Dictation({ label, value, onChange, maxLength, language, uiLanguage, rows, close }: Props & { close: () => void }) {
  const t = copy[uiLanguage]; const dialog = useRef<HTMLDialogElement>(null); const titleId = useId();
  const recorder = useRef<MediaRecorder | null>(null); const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null); const controller = useRef<AbortController | null>(null);
  const alive = useRef(false); const submitOnStop = useRef(false); const chunks = useRef<Blob[]>([]); const byteCount = useRef(0);
  const [phase, setPhase] = useState<"idle" | "starting" | "recording" | "recorded" | "transcribing" | "review">("idle");
  const [audio, setAudio] = useState<Blob | null>(null); const [transcript, setTranscript] = useState("");
  const [seconds, setSeconds] = useState(0); const [error, setError] = useState<VoiceError | null>(null);

  function dismiss() { dialog.current?.close(); close(); }

  function releaseMicrophone() {
    if (timer.current) clearInterval(timer.current); timer.current = null;
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
  }
  useEffect(() => {
    alive.current = true; dialog.current?.showModal();
    const pauseWhenHidden = () => { if (document.hidden) { submitOnStop.current = false; if (recorder.current?.state === "recording") recorder.current.stop(); releaseMicrophone(); } };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => {
      document.removeEventListener("visibilitychange", pauseWhenHidden);
      alive.current = false; controller.current?.abort();
      const active = recorder.current;
      if (active) { active.ondataavailable = null; active.onstop = null; active.onerror = null; if (active.state !== "inactive") active.stop(); }
      releaseMicrophone();
    };
  }, []);

  async function transcribe(blob: Blob) {
    if (!navigator.onLine) { setError("voiceOffline"); setPhase("recorded"); return; }
    if (!blob.size || blob.size > SPEECH_LIMITS.audioBytes) { setError("voiceLimit"); setPhase("idle"); return; }
    setPhase("transcribing"); setError(null); controller.current = new AbortController();
    const form = new FormData(); const type = blob.type.split(";")[0];
    form.set("file", blob, `speech.${type === "audio/mp4" ? "m4a" : type === "audio/ogg" ? "ogg" : "webm"}`); form.set("language", language);
    try {
      const response = await fetch("/api/transcribe", { method: "POST", body: form,
        signal: AbortSignal.any([controller.current.signal, AbortSignal.timeout(55_000)]) });
      const result = await response.json();
      if (!alive.current) return;
      if (!response.ok) {
        setError(result.error === "configuration" ? "voiceConfiguration" : result.error === "empty" ? "voiceEmpty" : result.error === "limit" ? "voiceLimit" : "voiceFailed");
        setPhase("recorded"); return;
      }
      if (typeof result.text !== "string" || !result.text.trim() || result.text.length > 8000) { setError("voiceEmpty"); setPhase("recorded"); return; }
      setTranscript(result.text.trim()); setPhase("review");
    } catch {
      if (alive.current) { setError("voiceFailed"); setPhase("recorded"); }
    }
  }
  function stop(send = false) {
    submitOnStop.current = send;
    if (recorder.current?.state === "recording") recorder.current.stop();
    releaseMicrophone();
  }
  async function start() {
    if (!navigator.onLine) { setError("voiceOffline"); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setError("voiceUnavailable"); return; }
    const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"].find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) { setError("voiceUnavailable"); return; }
    setPhase("starting"); setError(null); setAudio(null); setSeconds(0);
    try {
      const captured = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current || document.hidden) { captured.getTracks().forEach(track => track.stop()); if (alive.current) setPhase("idle"); return; }
      stream.current = captured;
      const active = new MediaRecorder(captured, { mimeType, audioBitsPerSecond: 64_000 }); recorder.current = active;
      chunks.current = []; byteCount.current = 0; submitOnStop.current = false;
      active.ondataavailable = event => {
        if (!alive.current || !event.data.size) return;
        byteCount.current += event.data.size; chunks.current.push(event.data);
        if (byteCount.current > SPEECH_LIMITS.audioBytes) { setError("voiceLimit"); stop(); }
      };
      active.onerror = () => { active.onstop = null; stop(); setError("voiceFailed"); setPhase("idle"); };
      active.onstop = () => {
        releaseMicrophone(); if (!alive.current) return;
        const blob = new Blob(chunks.current, { type: active.mimeType });
        if (!blob.size || blob.size > SPEECH_LIMITS.audioBytes) { setError("voiceLimit"); setPhase("idle"); return; }
        setAudio(blob); setPhase("recorded");
        if (submitOnStop.current) void transcribe(blob);
      };
      active.start(1000); setPhase("recording");
      const started = performance.now();
      timer.current = setInterval(() => {
        const elapsed = Math.floor((performance.now() - started) / 1000); setSeconds(elapsed);
        if (elapsed >= SPEECH_LIMITS.seconds) stop();
      }, 250);
    } catch (cause) {
      releaseMicrophone();
      if (alive.current) { setError(cause instanceof DOMException && ["NotAllowedError", "PermissionDeniedError"].includes(cause.name) ? "voicePermission" : "voiceUnavailable"); setPhase("idle"); }
    }
  }
  function apply() {
    try { onChange(appendTranscript(value, transcript, maxLength, !!rows)); dismiss(); }
    catch { setError(transcript.trim() ? "voiceLength" : "voiceEmpty"); }
  }
  return <dialog ref={dialog} className="voice-dialog" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); dismiss(); }}>
    <div className="voice-heading"><h2 id={titleId}>{t.speak}</h2><button className="icon-button" aria-label={t.close} onClick={dismiss}>×</button></div>
    <p className="voice-target">{label} · {language === "de" ? "Deutsch" : "English"}</p>
    <p className="voice-privacy">{t.voicePrivacy}</p>
    {error && <p className="voice-error" role="alert">{t[error]}</p>}
    {phase === "review" ? <><label className="voice-review"><span>{t.voiceReview}</span><textarea rows={5} value={transcript} maxLength={8000} onChange={e => { setTranscript(e.target.value); setError(null); }} /></label><button className="primary full-width" disabled={!transcript.trim()} onClick={apply}>{t.voiceAdd}</button></> : <>
      <div className={`voice-indicator ${phase === "recording" ? "is-recording" : ""}`} aria-hidden="true"><Microphone /></div>
      <p className="voice-state" role="status">{phase === "recording" ? `${t.voiceListening} ${seconds}s / ${SPEECH_LIMITS.seconds}s` : phase === "transcribing" ? t.voiceTranscribing : phase === "starting" ? t.voiceStarting : phase === "recorded" ? t.voiceRecorded : t.voiceLimitHint}</p>
      {phase === "recording" ? <button className="primary full-width" onClick={() => stop(true)}>{t.voiceStop}</button> : phase === "recorded" && audio ? <button className="primary full-width" onClick={() => void transcribe(audio)}>{t.voiceTranscribe}</button> : <button className="primary full-width" disabled={phase === "starting" || phase === "transcribing"} onClick={() => void start()}>{t.voiceStart}</button>}
    </>}
    {(phase === "review" || phase === "recorded") && <button className="text-button" onClick={() => { setAudio(null); setTranscript(""); setError(null); setPhase("idle"); }}>{t.voiceAgain}</button>}
  </dialog>;
}
