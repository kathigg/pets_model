<p align="center">
  <img src="public/assets/bmo-waving.gif" alt="BMO waving" width="96">
</p>

# PETs Model

A public-source chatbot for exploring privacy-enhancing technologies (PETs) in education data projects. It explains PETs, works through a use case, and helps plan a reviewed pilot. It is decision support, not a legal determination or an expert-approved design.

Current preview: [PETs Model](https://pets-model.fluffy-buddy-4572.chatgpt.site). Its access is managed separately from this repository. A public deployment outside ChatGPT is prepared but not yet connected to a hosting account.

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

The existing GitHub Environment `Gemini` holds `GEMINI_API_KEY`. GitHub Actions can pass it directly into a Cloudflare Worker secret at deployment. The key does not need to be stored in ChatGPT or committed to this repository. The current ChatGPT Sites preview has no access to that secret and still uses the browser's public-source fallback.

## Public hosting outside ChatGPT

The lightweight [Cloudflare Worker](cloudflare/worker.mjs) serves `public/` and runs `/api/chat` on the same origin. Its static pages do not invoke Worker code. The API applies a best-effort limit of six requests per minute per visitor, and a SQLite-backed Durable Object caps model-call attempts at 100 per UTC day across all visitors. Requests and model output are size-bounded. The cap is a call count, not a dollar budget. When the model is unavailable or the limit is reached, the browser falls back to local public-source answers.

The deployment is ready to use through [Deploy public chatbot](.github/workflows/deploy-public.yml). It requires a Cloudflare Free account and two additional secrets in the existing GitHub `Gemini` Environment: `CLOUDFLARE_ACCOUNT_ID` and a scoped `CLOUDFLARE_API_TOKEN` able to edit Workers. Restrict that Environment to deployments from `main`. Run the workflow from `main` to publish `https://pets-model.<account-subdomain>.workers.dev`; anyone with that link can open it. The workflow reads `GEMINI_API_KEY` only inside the GitHub runner and writes it as a Cloudflare Worker secret. No secret is included in the static assets, repository, or build output.

The default transport uses the Vertex AI Express endpoint. A standard Vertex project key also needs `VERTEX_PROJECT_ID` and optionally `VERTEX_LOCATION` configured as Worker secrets. A Google AI Studio Gemini Developer API key uses a different endpoint and cannot be assumed to work with this Vertex configuration. Confirm the key type with a live request before sharing the public link. Hosting may fit Cloudflare's free allowance; Gemini usage is billed separately. A dedicated provider billing cap is recommended as a second safeguard.

## Privacy boundary

Use hypothetical details. When Gemini answers are active, the browser sends the current message, up to four recent conversation turns, and structured case details to the app's server endpoint. The server sends those details, its rule summary, and selected **public** source summaries to Vertex AI. This app cannot promise that the hosting platform or provider retains no request data. Do not enter protected records, direct identifiers, confidential partner information, or material you are not authorized to send to that provider.

The app does not intentionally persist chats or use analytics. The transcript and case details are held in browser memory for the session; **Download** creates a local Markdown file that the visitor can review before sharing. The public retrieval corpus contains no internal project materials or example datasets. See [the content policy](docs/CONTENT_POLICY.md).

## Repository map

| Path | Purpose |
| --- | --- |
| `app/page.tsx`, `public/app.mjs`, `public/styles.css` | Chat page, browser state, and interface |
| `app/api/chat/route.js`, `server/` | Site endpoint, safety gates, retrieval-augmented answer, and Gemini transport |
| `cloudflare/`, `wrangler.public.jsonc`, `.github/workflows/deploy-public.yml` | Public host, shared model-call budget, and GitHub deployment |
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
