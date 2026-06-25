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

An editor agent plans sections → parallel reporter agents call Tako tools and distill grounded pages → NDJSON stream drives the build animation → finished newspaper opens in the page-flip reader.
