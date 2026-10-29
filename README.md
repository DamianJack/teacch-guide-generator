# Visual Guide

A mobile-first PWA for trainers to turn workplace photos and task facts into editable visual work instructions. Scope: [PRD.md](PRD.md).

## Run

Use Node.js 24 and npm:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Manual authoring works without AI credentials. To enable generation and quality checking, copy `.env.example` to `.env.local`, set `OPENAI_API_KEY` and `AI_MODEL` to an accessible OpenAI image-capable model supporting Structured Outputs, and restart the server. Use the exact model ID without a provider prefix. Keep both settings server-only.

## Workflow

1. Create: enter a task and procedure, take/select photos, and expand **Materials & finish** for quantities, completion, next action and help. Choose the instruction language before entering content.
2. Edit: create steps with AI or add them manually. Edit text and photo associations, split, remove and reorder steps. Expand **AI check** for separate advisory suggestions. Answer factual questions and incorporate the answers into learner text.
3. Preview: inspect the entire guide, explicitly approve the current revision, then download its A4 PDF. Content changes revoke approval; changing interface language preserves it.

The English/German interface is separate from the instruction language. The labeled example is illustrative practice content; it requires real kit photos and trainer verification. It is not a prerecorded AI result.

One draft, including resized photo blobs, is stored atomically in IndexedDB using Dexie. Failed writes show **Not saved** and preserve the previous successful save. Browser/site data deletion removes the draft; there is no cloud backup. No photos or tasks are sent in the background. Explicit AI requests send the task and selected photos to OpenAI with provider storage disabled. Do not use identifiable participant data.

Image input: JPEG, PNG or WebP, at most 12 MB / 40 megapixels each, 12 photos total. Images are resized to at most 1280 pixels and compressed to at most 160 KB JPEG each. The server accepts at most 3.5 MB per request and validates input, output and photo references. Instructions support 24 materials and 24 steps. Verify these limits with the actual demo photos before presenting.

## Checks and production

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

There are five focused tests covering the PWA foundation, approval and revision rules, ordering, request limits, missing configuration, provider failure and invalid AI photo references. Provider responses in tests are mocked; they do not establish that live AI works.

The build runs Next.js then Serwist to precache the shell and static assets. Service worker registration is disabled in development. To check offline reopening, run the production build, open it online, wait for service worker activation, then reopen offline. Draft capture/edit/save/recovery stays local. AI routes remain online-only and are not cached. Requests never automatically repeat after reconnecting.

Use HTTPS for Android installation and camera access outside localhost. Deploy as a Next.js application with Node.js 24 and the two server environment variables; static export cannot run the AI Route Handlers. No shared database or authentication service is required. The existing Vercel deployment path remains available; no hosted deployment has been made here.

## Remaining demo verification

- Configure credentials and run real photo-aware generation and separate quality checks in English and German with the trainer's kit photos and exact quantities.
- On the target Android phone: install over HTTPS, capture photos, download/open the PDF and inspect its pages.
- Verify offline reopening, storage-write failure, network/model failure and interrupted requests on the deployed app.
- Review accessibility and learner suitability with the intended users before claiming conformance or educational outcomes.

The UI has been checked in a 390-pixel phone viewport, including navigation, local recovery and independent interface language switching. Lint, type checks, the production build and the five tests pass. Android hardware, live AI, deployment and PDF visual inspection remain unverified. Icons are neutral placeholders pending approved branding.
