#!/usr/bin/env bash
set -euo pipefail

project=mdi-yimingwu-pets
region=us-east1
service=pets-model
runtime_account=pets-model-runtime@mdi-yimingwu-pets.iam.gserviceaccount.com

command -v gcloud >/dev/null || { echo 'Google Cloud CLI is required.' >&2; exit 1; }
account=$(gcloud config get-value account 2>/dev/null)
if [[ -z "$account" || "$account" == '(unset)' ]]; then
  echo 'Open Cloud Shell from the Google Cloud Console and authorize it first.' >&2
  exit 1
fi
gcloud projects describe "$project" --format='value(projectId)' >/dev/null
echo "Deploying the checked-out commit to $service in $project as $account"
gcloud run deploy "$service" \
  --source . \
  --project "$project" \
  --region "$region" \
  --service-account "$runtime_account" \
  --min-instances 0 \
  --max-instances 1 \
  --concurrency 4 \
  --update-env-vars GEMINI_MODEL=gemini-3.8-flash \
  --no-allow-unauthenticated \
  --quiet
echo 'Ready revision:'
gcloud run services describe "$service" --project "$project" --region "$region" \
  --format='value(status.latestReadyRevisionName)'
