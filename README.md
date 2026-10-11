# PETs Model

A public-source chatbot for exploring privacy-enhancing technologies (PETs) in education data projects. It explains PETs, works through a use case, and helps plan a reviewed pilot. It is decision support, not a legal determination or an expert-approved design.

Hosted demo: [PETs Model](https://pets-model.fluffy-buddy-4572.chatgpt.site). Site access is managed separately from this repository.

## How it works

The app is built with Vinext and runs as a Cloudflare Worker on Sites. The browser loads 47 reviewed, original paraphrased passages from public sources. For an eligible question, the same-origin `/api/chat` endpoint selects relevant passages and uses Gemini to draft a short answer. The server checks that each returned citation belongs to the selected public evidence before sending the answer to the browser. Case recommendations also use inspectable rules for PET combinations, caveats, alternatives, and missing facts.

If the model is unavailable or its answer fails validation, the browser shows a local rule or retrieval answer. Legal-permission questions and certain proposed releases are routed to human review. A PET choice never establishes authority to use or disclose data. See [the architecture](docs/ARCHITECTURE.md) for the request flow and limits.

## Run locally

Use Node.js 22.13 or newer:

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Add a Vertex AI API key to the ignored `.env.local` file as `GEMINI_API_KEY=...`. By default the app uses Vertex AI express mode and `gemini-3-flash-preview`. For a standard Google Cloud project, the key must be [bound to a service account](https://docs.cloud.google.com/docs/authentication/api-keys#authorization_keys); also set `VERTEX_PROJECT_ID` and, if needed, `VERTEX_LOCATION` (default `global`). `GEMINI_MODEL` can select a different model your account supports. Open `http://localhost:5173/`. The browser-side public-source fallback works without a key. Cloudflare documents [local Worker secrets](https://developers.cloudflare.com/workers/local-development/environment-variables/) for the Vite plugin.

For a hosted deployment, configure `GEMINI_API_KEY` as a **server-side secret in the PETs Model Sites runtime**. A GitHub Environment secret is available to GitHub Actions, not to this hosted Worker. Add `VERTEX_PROJECT_ID` and `VERTEX_LOCATION` there if using a standard project key, or `GEMINI_MODEL` to change models, then redeploy the saved Site version. Do not put the key in browser code or a `NEXT_PUBLIC_` variable. The production chat endpoint requires a Sites authenticated-user identity; the site access setting and secret configuration are separate.

## Privacy boundary

Use hypothetical details. When Gemini answers are active, the browser sends the current message, up to four recent conversation turns, and structured case details to the app's server endpoint. The server sends those details, its rule summary, and selected **public** source summaries to Vertex AI. This app cannot promise that the hosting platform or provider retains no request data. Do not enter protected records, direct identifiers, confidential partner information, or material you are not authorized to send to that provider.

The app does not intentionally persist chats or use analytics. The transcript and case details are held in browser memory for the session; **Download** creates a local Markdown file that the visitor can review before sharing. The public retrieval corpus contains no internal project materials or example datasets. See [the content policy](docs/CONTENT_POLICY.md).

## Repository map

| Path | Purpose |
| --- | --- |
| `app/page.tsx`, `public/app.mjs`, `public/styles.css` | Chat page, browser state, and interface |
| `app/api/chat/route.js`, `server/` | Worker endpoint, safety gates, retrieval-augmented answer, and Gemini transport |
| `public/engine.mjs`, `public/retrieval.mjs` | Inspectable case rules and BM25 retrieval, also used for browser fallback |
| `public/data/sources.json` | Reviewed public-source passages and provenance |
| `data/eval_queries.json`, `scripts/`, `tests/` | Corpus checks and regression evaluation |
| `vite.config.ts`, `build/sites-worker.ts` | Vinext, Cloudflare, and Sites integration |

## Check the project

```bash
npm run check
npm run build
```

`npm run check` validates corpus metadata and rule citations, runs decision, endpoint, and retrieval tests, and evaluates ten synthetic retrieval questions. These checks do not establish expert accuracy, legal compliance, privacy protection, or source currency. Expert-labeled cases and privacy, utility, and security reviews are needed before agency use.

## License

Original code and original paraphrased summaries in this repository are MIT licensed. The user-supplied mascot images in `public/assets/` are excluded from that license. External pages remain with their publishers and are linked for attribution. No code or prose was copied from the unlicensed private project archive provided as background.
