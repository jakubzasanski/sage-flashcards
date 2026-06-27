#!/usr/bin/env bash
# Apply the master-branch protection ruleset + repo merge settings for release-please.
#
# This is the source-of-record for the GitHub-side protection state (the live ruleset
# is GitHub state, not a repo file). Re-runnable: it updates the existing "master
# protection" ruleset in place if present, else creates it. Requires `gh` authed with
# repo admin.
#
#   ./scripts/apply-ruleset.sh
#
set -euo pipefail

REPO="$(gh repo view --json nameWithOwner --jq '.nameWithOwner')"
RULESET_NAME="master protection"
PAYLOAD="$(dirname "$0")/../.github/rulesets/master.json"

echo "Repo: $REPO"

# 1) Ruleset: update in place if one with the same name exists, else create.
EXISTING_ID="$(gh api "repos/$REPO/rulesets" --jq \
  ".[] | select(.name == \"$RULESET_NAME\") | .id" 2>/dev/null | head -n1)"

if [ -n "${EXISTING_ID:-}" ]; then
  echo "Updating existing ruleset #$EXISTING_ID ..."
  gh api -X PUT "repos/$REPO/rulesets/$EXISTING_ID" --input "$PAYLOAD" >/dev/null
else
  echo "Creating ruleset ..."
  gh api -X POST "repos/$REPO/rulesets" --input "$PAYLOAD" >/dev/null
fi

# 2) Repo merge settings: squash-only, and make the squash commit SUBJECT the PR
#    title (this is what release-please parses to decide the version bump).
echo "Setting merge methods (squash-only, subject = PR title) ..."
gh api -X PATCH "repos/$REPO" \
  -F allow_squash_merge=true \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false \
  -F squash_merge_commit_title=PR_TITLE \
  -F squash_merge_commit_message=COMMIT_MESSAGES \
  -F delete_branch_on_merge=true >/dev/null

# 3) Allow GitHub Actions (release-please) to create pull requests.
echo "Allowing Actions to create pull requests ..."
gh api -X PUT "repos/$REPO/actions/permissions/workflow" \
  -F can_approve_pull_request_reviews=true >/dev/null

echo "Done. Current ruleset:"
gh api "repos/$REPO/rulesets" --jq '.[] | select(.name == "'"$RULESET_NAME"'") | {id, name, enforcement}'
