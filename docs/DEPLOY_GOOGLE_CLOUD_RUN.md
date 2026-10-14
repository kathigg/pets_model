# Deploy PETs Model to Google Cloud Run

**Status:** This repository contains the Cloud Run application, but no Google Cloud deployment or public Cloud Run URL has been confirmed.

Cloud Run will host the chat page and its same-origin `/api/chat` endpoint. The server calls the project-scoped Vertex AI Gemini API using its [Cloud Run service identity](https://docs.cloud.google.com/run/docs/securing/service-identity). This route does **not** require a Gemini API key in ChatGPT, Codex, GitHub, the repository, or Cloud Run environment variables. A Google Cloud API key is not a console login; sign in to [Google Cloud Console](https://console.cloud.google.com/) with the Google account that has project access.

Vertex model access does **not** grant permission to deploy a public Cloud Run service or manage deployment, service-account, billing, and public-access settings. A project administrator must approve and arrange those separately. A dedicated project is preferable because it isolates public traffic, usage controls, and costs from other work.

## Prerequisites

- A Google Cloud project ID with an [active billing account](https://docs.cloud.google.com/docs/get-started/learn-about-billing). Google requires billing even for Free Tier services.
- [Vertex AI API enabled](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/start/quickstart) in that project.
- Approval and permissions to create a service account, connect GitHub to Cloud Build, and deploy a public Cloud Run service. The [Cloud Run repository setup guide](https://docs.cloud.google.com/run/docs/continuous-deployment) lists the roles needed.

## One-time setup in Google Cloud Console

1. An administrator creates a dedicated service account such as `pets-model-vertex` and grants it a custom role containing `aiplatform.endpoints.predict` for Gemini's `GenerateContent` call. Use it as the Cloud Run **service identity**. A person's Vertex permissions do not automatically transfer to this service account. [Vertex permission reference](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rpc/google.cloud.aiplatform.v1), [service identity guide](https://docs.cloud.google.com/run/docs/securing/service-identity).
2. An authorized deployer goes to **Cloud Run → Connect repository**, selects **Cloud Build**, connects the public GitHub repository `kathigg/pets_model`, selects the `main` branch, and chooses **Dockerfile** with the repository-root `Dockerfile`. This sets up automatic builds when `main` changes. [Repository deployment guide](https://docs.cloud.google.com/run/docs/continuous-deployment).
3. Configure the service as `pets-model` in a supported region. Select the dedicated service account from step 1. With MDI approval, set **Allow public access** so team members can open the Cloud Run URL without a Google login. Anyone who obtains the URL can use the app. Organization policy may prohibit public access. [Public access guide](https://docs.cloud.google.com/run/docs/authenticating/public).
4. Add the environment variable `VERTEX_PROJECT_ID` with your **project ID**. The code also accepts `GOOGLE_CLOUD_PROJECT`. `VERTEX_LOCATION` defaults to `global`; `GEMINI_MODEL` is optional and defaults to `gemini-2.5-flash`. Cloud Run supplies `PORT` automatically. Do **not** add `GEMINI_API_KEY` or `GOOGLE_APPLICATION_CREDENTIALS` to this service. [Service identity guide](https://docs.cloud.google.com/run/docs/securing/service-identity).
5. Start with **minimum instances 0**, **maximum instances 1** at the service level, and **maximum concurrent requests 1**. These settings limit idle use and overlapping requests while the team tests. They can reduce availability during heavy traffic and do not cap model charges. [Minimum instances](https://docs.cloud.google.com/run/docs/configuring/min-instances), [maximum instances](https://docs.cloud.google.com/run/docs/configuring/max-instances), and [concurrency](https://docs.cloud.google.com/run/docs/configuring/concurrency).
6. Deploy, open the Cloud Run URL, and ask a hypothetical PET question. Check that the response has citations to public sources. A provider error may cause the browser to show the local public-source fallback; that does not prove Vertex AI is connected.

Once repository deployment is connected, pushes to `main` trigger a new build and revision. Check the Cloud Run **Build History** and service logs if a build or Vertex request fails.

## Cost and privacy

[Cloud Run has a free allowance](https://cloud.google.com/run/pricing), but usage beyond it can cost money. [Vertex AI Gemini use has separate pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing). The app limits valid chat requests to 30 per 10 minutes across all visitors **per process**, and paid model calls to 100 per UTC day **per process**. Those counters reset on restart and are duplicated if instances or revisions overlap. Cloud Run can briefly exceed a maximum-instance setting. These safeguards are **not a hard dollar cap**. Google also offers [monthly spend caps](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps) for Cloud Run and Vertex AI, but enforcement can lag and overages remain billable. In a shared project, a cap would pause that service for all users of the project. A separate project avoids that conflict. Monitor billing and usage during the public trial.

The app retrieves only original summaries of public PET sources. When Gemini is active, chat text and case details pass through Cloud Run to Vertex AI. Ask visitors to use hypothetical details, not protected student records or confidential partner information. See [the privacy boundary](../README.md#privacy-boundary) and [content policy](CONTENT_POLICY.md).
