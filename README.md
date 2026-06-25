# The Daily Tako

An AI-reported newspaper generator: give it a one-line brief and it produces a fully sourced, typeset newspaper. An editor agent plans the sections, parallel reporter agents call [@takoviz/ai-sdk](https://tako.com) tools and distill grounded pages, and a NDJSON stream drives a live build animation. Finished editions open in a page-flip reader with B&W/color toggle.

Built with `@takoviz/ai-sdk`, Vercel AI SDK, and OpenAI.

## Setup

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`:
- `TAKO_API_KEY` — your Tako API key (server-side only, never exposed to the client)
- `OPENAI_API_KEY` — your OpenAI API key (server-side only, never exposed to the client)

Both env files are git-ignored.

## Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Test

```bash
npm test
```

## Build

```bash
npm run build
```

## How it works

An editor agent plans sections → parallel reporter agents call Tako tools and distill grounded pages → NDJSON stream drives the build animation → finished newspaper opens in the page-flip reader (two-page spread on wide screens, single page on mobile).

As the agents work, a live **Tako Wire** ticker and per-section captions cite each tool call in real time ("Using Tako search — …", "Asking Tako — …", "Reading Tako data — …"). Every model and Tako API call is also logged server-side as one structured JSON line per call (kinds: `request`, `editor.start/done`, `reporter.start/done`, `tool.call`, `distill.start/done`, `error`) — visible in the `npm run dev` console.

## Background image

The hero/background is a cartoon desk. A placeholder (`public/desk-placeholder.svg`) ships by default. **To use your own art, drop a PNG at `public/desk.png`** — it overrides the placeholder automatically. To use a different filename, change `--desk-image` in `app/globals.css`.

## Preview without API keys

Click **"Preview a sample edition (no API key)"** on the home screen to watch the full build animation, Tako wire ticker, page-flip spread, and B&W/color toggle using bundled sample data — no API calls, no credits spent.
