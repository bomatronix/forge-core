#!/usr/bin/env bash

set -euo pipefail

strip_line_endings() {
  printf '%s' "$1" | tr -d '\r\n'
}

normalize_word_list() {
  printf '%s' "$1" | tr '\r\n' ' '
}

S3_BUCKET=$(strip_line_endings "${S3_BUCKET:-}")
S3_KMS_KEY_ID=$(strip_line_endings "${S3_KMS_KEY_ID:-}")
LAMBDA_KEY_PREFIX=$(strip_line_endings "${LAMBDA_KEY_PREFIX:-}")
DEPLOY_ENV_LABEL=$(strip_line_endings "${DEPLOY_ENV_LABEL:-target}")
GITHUB_SHA=$(strip_line_endings "${GITHUB_SHA:-}")
APPS=$(normalize_word_list "${APPS:-}")

if [ -z "$S3_BUCKET" ]; then
  echo "::error::S3_FORGE_CORE is not set for the ${DEPLOY_ENV_LABEL:-target} environment"
  exit 1
fi

if [ -z "$LAMBDA_KEY_PREFIX" ]; then
  echo "::error::LAMBDA_KEY_PREFIX is required"
  exit 1
fi

if [ -z "$APPS" ]; then
  echo "::error::APPS is required"
  exit 1
fi

if [ -z "$GITHUB_SHA" ]; then
  echo "::error::GITHUB_SHA is required"
  exit 1
fi

short_sha="${GITHUB_SHA::7}"
read -r -a apps <<<"$APPS"

for app in "${apps[@]}"; do
  artifact_path="dist/lambda/${app}/handler.js"
  object_key="${LAMBDA_KEY_PREFIX}/${app}-${short_sha}.zip"
  zip_path="${app}.zip"

  if [ ! -f "$artifact_path" ]; then
    echo "::error::Missing built artifact $artifact_path for app '$app'"
    exit 1
  fi

  if aws s3api head-object --bucket "$S3_BUCKET" --key "$object_key" >/dev/null 2>&1; then
    echo "Skipping existing s3://$S3_BUCKET/$object_key"
    continue
  fi

  rm -f "$zip_path"
  zip -j "$zip_path" "$artifact_path" >/dev/null

  put_args=(
    --bucket "$S3_BUCKET"
    --key "$object_key"
    --body "$zip_path"
    --content-type application/zip
    --server-side-encryption aws:kms
  )

  if [ -n "$S3_KMS_KEY_ID" ]; then
    put_args+=(--ssekms-key-id "$S3_KMS_KEY_ID")
  fi

  # put-object completes the write before returning, so one head-object check is enough.
  echo "Uploading $zip_path to s3://$S3_BUCKET/$object_key"
  etag=$(aws s3api put-object "${put_args[@]}" --query ETag --output text)
  echo "Uploaded $zip_path (ETag: $etag)"
  aws s3api head-object --bucket "$S3_BUCKET" --key "$object_key" >/dev/null
  echo "Verified s3://$S3_BUCKET/$object_key"

  rm -f "$zip_path"
done
