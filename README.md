<p align="center">
  <img src="public/assets/bmo-idle.gif" alt="BMO blinking" width="96">
</p>

# PETs Model

A chatbot for exploring privacy-enhancing technologies (PETs) in education data projects. It explains options, asks for the facts needed to assess a use case, and helps plan a reviewed pilot. It is decision support, not a legal determination or an expert-approved design.

**Hosting status:** The current [Sites preview](https://pets-model.fluffy-buddy-4572.chatgpt.site) has separate access settings and uses the public-source browser fallback. The Google Cloud Run version is prepared in this repository but **has not been deployed**. The intended public link will come from Cloud Run after a Google Cloud project is connected.

## How the chatbot works

The app uses 47 draft, original summaries linked to public sources. They have not yet received a recorded source-by-source expert review. For each eligible question, the app retrieves relevant passages and asks Gemini on the server to draft a short answer. The server checks citations against the passages it supplied. Inspectable rules add PET combinations, caveats, alternatives, and missing facts for use cases. If Gemini is unavailable or fails validation, the browser shows a local rule or retrieval answer.

Legal-permission questions and selected risky releases go to human review. A PET choice does not establish authority to use or disclose data. See [the architecture](docs/ARCHITECTURE.md) for the request flow and limits.

## Publish on Google Cloud Run

The selected public host is [Google Cloud Run](https://docs.cloud.google.com/run/docs/overview). It serves the site and `/api/chat` together. Cloud Run uses a dedicated [service identity](https://docs.cloud.google.com/run/docs/securing/service-identity) to call the project-scoped Gemini API in Vertex AI. **No Gemini API key needs to be copied into ChatGPT, Codex, GitHub, or Cloud Run.**

Deployment still needs an approved Google Cloud project with an [active billing account](https://docs.cloud.google.com/docs/get-started/learn-about-billing), the Vertex AI API enabled, and a dedicated service account permitted to call Gemini. Vertex model access alone does not authorize deploying a public Cloud Run service. Connecting [this GitHub repository](https://github.com/kathigg/pets_model) to Cloud Run can automatically redeploy pushes to `main` after a project administrator sets it up. The exact steps and required approval are in [Deploy to Google Cloud Run](docs/DEPLOY_GOOGLE_CLOUD_RUN.md).

Cloud Run has a [free allowance](https://cloud.google.com/run/pricing), but a billing account is still required and hosting can incur charges beyond that allowance. [Vertex AI model use](https://cloud.google.com/vertex-ai/generative-ai/pricing) is billed separately. A public link can receive traffic beyond the intended team. The app limits model calls to 100 per UTC day **per process**; a restart or overlapping revision resets or duplicates that count. These controls are not a guaranteed dollar cap. An approved separate project would allow [service-level spend caps](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps) without interrupting other workloads.

## Run locally

Use Node.js 22.13 or newer:

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:5173/`. The public-source fallback works without a key. Gemini answers on Cloud Run use its Google service identity, so no API key needs to be placed in this checkout or Codex.

## Privacy boundary

Use hypothetical details. When Gemini answers are active, the browser sends the current message, up to four recent conversation turns, and structured case details to the app's server endpoint. The server sends those details, its rule summary, and selected **public** source summaries to Vertex AI. This app cannot promise that the hosting platform or Google retains no request data. Do not enter protected records, direct identifiers, confidential partner information, or material you are not authorized to send to that provider.

The app does not intentionally persist chats or use analytics. The transcript and case details are held in browser memory for the session; **Download** creates a local Markdown file that the visitor can review before sharing. The public retrieval corpus contains no internal project materials or example datasets. See [the content policy](docs/CONTENT_POLICY.md).

## Repository map

| Path | Purpose |
| --- | --- |
| `public/app.mjs`, `public/styles.css`, `public/assets/` | Chat interface and mascot |
| `cloud-run/`, `Dockerfile` | Google Cloud Run public host and service identity |
| `server/`, `public/engine.mjs`, `public/retrieval.mjs` | Review gates, retrieval, PET rules, and Gemini transport |
| `public/data/sources.json` | Draft public-source summaries and provenance |
| `data/eval_queries.json`, `scripts/`, `tests/` | Corpus checks and regression evaluation |
| `app/`, `vite.config.ts`, `build/sites-worker.ts` | Existing Sites preview |

The repository also retains an unused Cloudflare deployment path. Google Cloud Run is the selected public host.

## Check the project

```bash
npm run check
npm run build
```

`npm run check` validates corpus metadata and rule citations, runs decision, endpoint, and retrieval tests, and evaluates ten synthetic retrieval questions. These checks do not establish expert accuracy, legal compliance, privacy protection, or source currency. Expert-labeled cases and privacy, utility, and security reviews are needed before agency use.

## License

Original code and original paraphrased summaries in this repository are MIT licensed. The user-supplied mascot images in `public/assets/` are excluded from that license. External pages remain with their publishers and are linked for attribution. No code or prose was copied from the unlicensed private project archive provided as background.
