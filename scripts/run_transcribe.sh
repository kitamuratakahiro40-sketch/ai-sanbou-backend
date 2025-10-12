#!/usr/bin/env bash
set -euo pipefail


usage() {
cat <<'USAGE'
Usage: ./run_transcribe.sh <local-audio-file>


ENV override (optional):
REGION=asia-southeast1
API_SERVICE=scribe-api
BUCKET_NAME=sanbou-ai-uploads-<PROJECT_ID>
SLICE_SEC=600 # chunk length in seconds
USAGE
}


if [[ ${1:-} == "" ]]; then
usage; exit 1
fi


FILE_PATH="$1"
if [[ ! -f "$FILE_PATH" ]]; then
echo "[!] file not found: $FILE_PATH" >&2; exit 2
fi


# ---- settings ----
PROJECT_ID="$(gcloud config get-value project 2>/dev/null)"
REGION="${REGION:-asia-southeast1}"
API_SERVICE="${API_SERVICE:-scribe-api}"
BUCKET_NAME="${BUCKET_NAME:-sanbou-ai-uploads-${PROJECT_ID}}"
SLICE_SEC="${SLICE_SEC:-600}"


# ---- dependency check ----
for c in gcloud gsutil curl jq; do
command -v "$c" >/dev/null || { echo "[!] required command not found: $c" >&2; exit 3; }


done


# ---- prepare ----
TS="$(date +%Y%m%d-%H%M%S)"; RAND="$RANDOM"
BASE="$(basename "$FILE_PATH")"
MIME="$( (command -v file >/dev/null && file -b --mime-type "$FILE_PATH") || echo audio/mpeg )"
GCS_URI="gs://${BUCKET_NAME}/raw/${TS}-${RAND}-${BASE}"


# ---- upload ----
echo "[+] Uploading to ${GCS_URI} (Content-Type: ${MIME})"
gsutil -h "Content-Type:${MIME}" cp "$FILE_PATH" "$GCS_URI"


echo "[+] Resolving API endpoint"
SERVICE_URL="$(gcloud run services describe "$API_SERVICE" --region "$REGION" --format='value(status.url)')"
if [[ -z "$SERVICE_URL" ]]; then echo "[!] failed to resolve service url" >&2; exit 4; fi


ID_TOKEN="$(gcloud auth print-identity-token)"


# ---- create job ----
echo "[+] Creating job for $GCS_URI"
CREATE_RESP="$(curl -sS -X POST "$SERVICE_URL/jobs" \
-H "Authorization: Bearer ${ID_TOKEN}" \
-H "Content-Type: application/json" \
-d "{\"gcsUri\":\"$GCS_URI\",\"sliceSec\":${SLICE_SEC}}")"


JOB_ID="$(echo "$CREATE_RESP" | jq -r '.jobId')"
if [[ "$JOB_ID" == "null" || -z "$JOB_ID" ]]; then
echo "[!] failed to create job" >&2; echo "$CREATE_RESP"; exit 5
fi


echo "[+] Job created: $JOB_ID"


# ---- poll progress ----
echo "[+] Polling progress... (every 5s)"
while true; do
RESP="$(curl -sS -H "Authorization: Bearer ${ID_TOKEN}" "$SERVICE_URL/jobs/${JOB_ID}")"
STATUS="$(echo "$RESP" | jq -r '.status')"
PENDING_RUNNING="$(echo "$RESP" | jq -r '[.chunkSummary[] | select(.status=="PENDING" or .status=="RUNNING") | (.count|tonumber)] | add // 0')"
echo " - status=${STATUS}, remaining=${PENDING_RUNNING}"
if [[ "$PENDING_RUNNING" -eq 0 ]]; then break; fi
sleep 5
done


echo "[+] Fetching transcript"
OUT_FILE="transcript-${JOB_ID}.txt"
fi