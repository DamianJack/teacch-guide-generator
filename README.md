# Visual Guide

A mobile-first PWA for trainers to turn workplace photos and task facts into editable visual work instructions. Scope: [PRD.md](PRD.md).

## Run

Use Node.js 24 and npm:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Manual authoring works without AI credentials. To enable step generation, copy `.env.example` to `.env.local`, set `FIREWORKS_API_KEY`, and restart the server. `AI_MODEL` is set to `accounts/fireworks/models/deepseek-v4p1-flash` (DeepSeek V4.1 Flash). Keep both settings server-only. The model must accept photos and structured JSON outputs; use its exact Fireworks model ID.

For optional voice input, also set the server-only `ELEVENLABS_API_KEY` with Speech to Text (`speech_to_text`) permission and restart. A mic button on each text field opens a recording sheet: record, stop and transcribe, review/edit the transcript, then add it to the field. New speech appends to the latest field text; it never silently replaces text or truncates it to fit. Adding it uses the same draft-save and approval-invalidation path as typing.

Voice input uses the browser's microphone and MediaRecorder over HTTPS (or localhost), with up to 60 seconds / 3 MB per recording. The `/api/transcribe` route validates a bounded multipart upload and sends audio to [ElevenLabs Scribe v2](https://elevenlabs.io/docs/api-reference/speech-to-text/convert), with the guide's English/German language hint. No additional SDK is needed. Unsupported browsers, permission denial, offline use and request errors leave typing available. Cancelling or leaving the field releases the microphone and cancels pending browser requests. Hiding the app stops recording locally without submitting it.

Audio exists temporarily in memory and is sent only on an explicit transcription action. The app does not persist or log recordings. ElevenLabs' own account/retention policies still apply; the default provider logging setting is used. Zero retention is enterprise-only and is not claimed here. Do not record people or personal information without the necessary authorization.

## Workflow

1. Create: capture the task step by step. Each step card takes one or more photos (camera or gallery) and an optional note; tap **＋ Add step** for the next one. Optionally add a task title, notes and **Materials**. Choose the instruction language before entering content. **Create steps** turns each step's photos into one TEACCH-style learner action.
2. Edit: rewrite step text, add or remove photos, split, remove and reorder steps.
3. Preview: inspect the entire guide, explicitly approve the current revision, then download its A4 PDF. Approval only requires a photo for every step; empty optional sections are left out. Content changes revoke approval; changing interface language preserves it.

The English/German interface is separate from the instruction language. The labeled example is illustrative practice content; it requires real kit photos and trainer verification. It is not a prerecorded AI result.

One draft, including resized photo blobs, is stored atomically in IndexedDB using Dexie. Failed writes show **Not saved** and preserve the previous successful save. Browser/site data deletion removes the draft; there is no cloud backup. No photos or tasks are sent in the background. Explicit AI requests send the task and selected photos to Fireworks. Provider retention policies apply. Do not use identifiable participant data.

Step generation uses Fireworks' Chat Completions API with image data URLs and a JSON schema. Responses are validated again on the server, including step references; failures are logged server-side with their cause. Incomplete responses and provider errors leave the current draft intact. No client-side provider keys or raw task/photo logging are used.

Image input: JPEG, PNG or WebP, at most 12 MB / 40 megapixels each, 12 photos total. Images are resized to at most 1280 pixels and compressed to at most 160 KB JPEG each. The server accepts at most 3.5 MB per request and validates input, output and photo references. Instructions support 24 materials and 24 steps. Verify these limits with the actual demo photos before presenting.

## Checks and production

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

There are seven focused tests covering the PWA foundation, approval and revision rules, ordering, request limits, missing configuration, provider failure, invalid AI photo references, transcript insertion and speech-upload validation. Provider responses in tests are mocked; they do not establish that live AI or live transcription works.

The build runs Next.js then Serwist to precache the shell and static assets. Service worker registration is disabled in development. To check offline reopening, run the production build, open it online, wait for service worker activation, then reopen offline. Draft capture/edit/save/recovery stays local. AI routes remain online-only and are not cached. Requests never automatically repeat after reconnecting.

Use HTTPS for Android installation, camera and microphone access outside localhost. Deploy as a Next.js application with Node.js 24 and the server environment variables above; static export cannot run the AI or transcription Route Handlers. No shared database or authentication service is required. The existing Vercel deployment path remains available; no hosted deployment has been made here.

## Remaining demo verification

- Run photo-aware generation and separate quality checks in English and German with the trainer's actual kit photos and exact quantities.
- On the target Android phone: install over HTTPS, capture photos, download/open the PDF and inspect its pages.
- Verify real microphone capture and English/German transcription using the configured ElevenLabs key, including permission denial and cancellation.
- Verify offline reopening, storage-write failure, network/model failure and interrupted requests on the deployed app.
- Review accessibility and learner suitability with the intended users before claiming conformance or educational outcomes.

The UI has been checked in a 390-pixel phone viewport, including navigation, local recovery, independent interface language switching and the voice recording sheet. A synthetic English recording passed the real ElevenLabs transcription endpoint (HTTP 200, correct text). English drafting and quality checking passed through the running app against Fireworks DeepSeek V4.1 Flash using a neutral image fixture. The real materials-kit demo, live German generation/transcription, Android hardware, deployment and PDF visual inspection remain unverified. Icons are neutral placeholders pending approved branding.
