// Conventional Commits linting, shared by the local husky `commit-msg` hook.
// ESM (`package.json` has "type": "module"). The PR-title CI check
// (.github/workflows/pr-title.yml) enforces the same convention on the squash
// subject release-please consumes.
export default {
  extends: ["@commitlint/config-conventional"],
};
