# teacch-guide-generator

Mobile AI that turns workplace photos into clear, TEACCH-aligned step-by-step work instructions

Foundation for the PWA described in [idea.md](idea.md). This stage only provides a placeholder page, an offline app shell, and a serverless health endpoint.

## Local development

Use Node.js 24 LTS and npm; the Node major version is recorded in `.nvmrc`. Dependencies are pinned in `package-lock.json`. Older system installations need updating before development.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. `GET /api/health` returns `{"status":"ok"}`. No credentials are required yet.

## Checks and production

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

The build runs Next.js first, then Serwist so the generated home page and its assets can be precached. Service worker registration is disabled in development; use the production build to check offline reopening. Open the app online, wait for the service worker to activate, then reload offline. API routes are not cached. Future draft/photo recovery will use Dexie and is not implemented yet.

Development and production use webpack because Turbopack's CSS worker failed on this Windows setup.

## Stack

- Next.js App Router, React, TypeScript, and Tailwind CSS.
- Web app manifest and Serwist for installability and offline shell caching.
- Next.js Node.js Route Handlers for the serverless backend.
- Dexie for future IndexedDB draft/photo storage.
- LangChain, its OpenAI integration, and Zod for future AI requests and validated output.
- React PDF for future PDF export.

The Zod override keeps Serwist's pinned transitive dependency on the same patched version as the app.

The AI provider and model are not configured yet. The OpenAI adapter is installed as the initial integration; add another adapter when choosing a different provider. Copy `.env.example` to `.env.local` when implementing AI routes. Keep provider keys server-only; never prefix them with `NEXT_PUBLIC_`.

## Deployment

The project is ready to import into Vercel as a Next.js project using Node.js 24, `npm ci`, and `npm run build`. Do not use a static export: API Route Handlers need the server runtime. No separate backend server or shared database is needed for the planned single-device prototype.

Deployment, Android installation, real-device offline checks, workflow UI, persistence, AI calls, and PDF export remain later work. Icons are neutral placeholders pending branding.
