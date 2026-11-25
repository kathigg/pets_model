<p align="center">
  <img src="public/assets/bmo-idle.gif" alt="BMO blinking" width="96">
</p>

# PETs Model

A chatbot for exploring privacy-enhancing technologies (PETs) in education data projects. It explains options, asks for the facts needed to assess a use case, and helps plan a reviewed pilot. It is decision support, not a legal determination or an expert-approved design.

**Hosting status (November 24, 2026):** The [private Cloud Run chatbot](https://pets-model-850678646784.us-east1.run.app) is in `mdi-yimingwu-pets`. Cloud Shell reported revision `pets-model-00027-8kq` serving 100% of traffic; an unauthenticated request still redirects to Google sign-in. Newer answer and citation changes are pushed to GitHub but await Cloud Run deployment and a signed-in live quality check. The [Sites preview](https://pets-model.fluffy-buddy-4572.chatgpt.site) remains separate and uses the public-source browser fallback. Access for other named teammates still needs administrator confirmation.

## How the chatbot works

The app uses 58 draft, original summaries linked to public sources, including selected NSF-supported America’s DataHub awards and IEEE Digital Privacy. Some have received a [public-source spot check](docs/SOURCE_AUDIT.md); none has a recorded expert approval. General PET and legislation questions stay in Q&A mode. The chatbot enters its case recommendation flow only when someone asks it to choose an approach. For locally covered questions, it retrieves public guidance and asks Gemini for a cited answer. For software comparisons, freshness questions, general legislation questions, missing definitions, and PET questions poorly covered by the local sources, the hosted service can ask Gemini to search the public web through Vertex AI and show links from Google's grounding metadata. If a local cited answer says its sources cannot answer a public question, the server retries with web grounding; it keeps apparent case details and earlier sensitive topics out of Search. This is live research, not an addition to the reviewed corpus; visitors should verify the linked pages. A small, conservative PET vocabulary corrects close spelling mistakes before retrieval or search. Substantive answers can use several paragraphs; a directly relevant public MDI pilot may illustrate an applied point after the main answer, but pilot examples are optional. Follow-up questions preserve the earlier topic. Relevant [MDI PET resources](https://mdi.georgetown.edu/pets/) get a small priority boost. NIST has a modest technical-source preference, while U.S. Education Department pages rank lower for general PET questions; official FERPA guidance remains favored for FERPA questions. When a described use case closely matches a public MDI pilot, the recommendation shows one short, linked “Similar MDI use case” note. Synthetic-data work points to Nebraska NSWERS; NYSED is reserved for relevant clean-room linkage. The server checks citation IDs, and source links follow the sentences they support. The “Why this answer” panel identifies draft summaries rather than claiming verbatim quotations. Inspectable rules add PET combinations, caveats, alternatives, and missing facts. If Gemini is unavailable or fails validation on Cloud Run, the browser asks the visitor to retry and the server logs only outcome metadata. Local previews can still use the public-source fallback.

The hosted chatbot uses public PET sources only. Confidential NYSED meeting notes remain local and are neither uploaded nor used by the hosted model. Chat history stays in the visitor's browser; the next request sends up to four recent exchanges for context. Source notes that link to the same original page are grouped, and the “Why this answer” summaries are labeled as our paraphrases rather than source quotations.

Legal-permission questions and selected risky releases go to human review. A PET choice does not establish authority to use or disclose data. See [the architecture](docs/ARCHITECTURE.md) for the request flow and limits.

## Share privately on Google Cloud Run

The selected host is [Google Cloud Run](https://docs.cloud.google.com/run/docs/overview). It serves the site and `/api/chat` together. [IAP directly on Cloud Run](https://docs.cloud.google.com/run/docs/securing/identity-aware-proxy-cloud-run) requires a Google sign-in and allows named users or a group to open the chatbot in a browser. Cloud Run uses a dedicated [service identity](https://docs.cloud.google.com/run/docs/securing/service-identity) to call the project-scoped Gemini API in Vertex AI. **No Gemini API key needs to be copied into ChatGPT, Codex, GitHub, or Cloud Run.**

The approved project has billing and the required deployment APIs enabled. The runtime account has the narrow `aiplatform.endpoints.predict` permission. IAP is enabled, but this account cannot read or edit its access policy; an administrator must confirm the five named Georgetown users. A Cloud Build trigger now watches this repository's `main` branch, but its run is denied `cloudbuild.builds.create`, so pushes do not yet update the live service. The current state and remaining steps are in [Deploy to Google Cloud Run](docs/DEPLOY_GOOGLE_CLOUD_RUN.md).

Cloud Run has a [free allowance](https://cloud.google.com/run/pricing), but hosting can incur charges. [Vertex AI model and web grounding use](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing) can be billed separately. The deployed service selects [Gemini 3.8 Flash](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-8-flash); a signed-in model call has not yet confirmed the new revision's responses. The private service has zero minimum instances and a one-instance service cap. The app allows up to 250 model calls and, within that, 75 web-research calls per UTC day **per process**; restarts can reset those counts. The requested spending target is **$500 per month**. Existing configured monthly spend caps are $450 for Vertex AI and $50 for Cloud Run; the older $500 alerts-only project budget still uses a cumulative period and needs a monthly reset. These controls do not guarantee a hard $500 total monthly cap because other services and billing delays remain. The server logs Gemini token counts and search-query counts without chat content; actual charges must be checked in Cloud Billing.

## Run locally

Use Node.js 22.13 or newer:

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:5173/`. The public-source fallback works without a key. Gemini answers on Cloud Run use its Google service identity, so no API key needs to be placed in this checkout or Codex.

## Privacy boundary

Use hypothetical details. When Gemini answers are active, the browser sends the current message, the earlier topic for a short follow-up, up to four recent conversation turns, and structured case details to the app's server endpoint. The server sends the message and recent context to Vertex AI; PET questions with matching sources also include the earlier topic, case facts, rules, and selected **public** source summaries. Eligible public research questions are sent to Vertex AI with Google Search grounding, so their query can be used for web search. The search route avoids requests that appear to contain confidential or personal case details, but this pattern-based gate is not a guarantee. Confidential meeting notes are not sent. This app cannot promise that the hosting platform or Google retains no request data. Do not enter protected records, direct identifiers, or material you are not authorized to send to that provider.

The app stores chats and case details in the visitor’s browser storage so they remain after a reload and can be reopened from **Chats**. This is specific to that browser profile, not synced across devices, and someone using the same browser profile can see them. **Clear saved chats** removes that browser copy. The app does not intentionally store server-side transcripts or use analytics; **Download** creates a local Markdown file that the visitor can review before sharing. The public retrieval corpus contains no internal project materials or example datasets. See [the content policy](docs/CONTENT_POLICY.md).

## Repository map

| Path | Purpose |
| --- | --- |
| `public/app.mjs`, `public/styles.css`, `public/assets/` | Chat interface and mascot |
| `cloud-run/`, `Dockerfile` | Google Cloud Run host and service identity |
| `server/`, `public/engine.mjs`, `public/retrieval.mjs` | Review gates, retrieval, PET rules, and Gemini transport |
| `public/data/sources.json` | Draft public-source summaries and provenance |
| `data/eval_queries.json`, `scripts/`, `tests/` | Corpus checks and regression evaluation |
| `data/persona_scenarios.json` | Hypothetical visitor scenarios for live Vertex review |
| `app/`, `vite.config.ts`, `build/sites-worker.ts` | Existing Sites preview |

The repository also retains an unused Cloudflare deployment path. Google Cloud Run with IAP is the selected private host. GitHub checks run on each push and pull request without Gemini credentials or model calls; they do not deploy the site.

## Check the project

```bash
npm run check
npm run build
```

`npm run check` validates corpus metadata and rule citations, runs decision, endpoint, and retrieval tests, and evaluates 19 synthetic retrieval questions. These checks do not establish expert accuracy, legal compliance, privacy protection, or source currency. Expert-labeled cases and privacy, utility, and security reviews are needed before agency use.

## License

Original code and original paraphrased summaries in this repository are MIT licensed. The user-supplied mascot images in `public/assets/` are excluded from that license. External pages remain with their publishers and are linked for attribution. No code or prose was copied from the unlicensed private project archive provided as background.
