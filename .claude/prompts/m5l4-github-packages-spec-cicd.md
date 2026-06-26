# GitHub Packages CI/CD — Requirements

> **Default path for Zadanie 2.** This spec publishes the AI toolkit package to
> GitHub Packages. It deliberately avoids AWS, Terraform, IAM roles and
> CodeArtifact.

## Goal
Create a GitHub Actions workflow that validates and publishes the AI toolkit npm
package to GitHub Packages.

## Configuration
- Workflow file: `.github/workflows/publish-ai-toolkit.yml`
- Package location: repository root, unless the agent generated a monorepo
  layout; if so, use `packages/ai-toolkit/`
- Branch: support both `main` and `master`
- Node version: `20` or newer
- Registry: `https://npm.pkg.github.com`
- Package scope: `@twoj-zespol`

## Permissions
Use the ephemeral GitHub Actions token for publishing:

```yaml
permissions:
  contents: read
  packages: write
```

Do not require `AWS_ACCOUNT_ID`, `AWS_ROLE_ARN`, `id-token: write`, or any
CodeArtifact login step.

## Validation job
Before publishing, validate:
1. `package.json` exists and has `name`, `version`, `publishConfig.registry`.
2. `skills/code-review/SKILL.md` exists.
3. `SKILL.md` has YAML frontmatter with `name` and `description`.
4. The frontmatter `name` matches the skill directory name.
5. `npm pack --dry-run` succeeds.

## Publish job
On push to `main` or `master`:
1. Check out the repository.
2. Set up Node with GitHub Packages registry and the package scope.
3. Run validation.
4. Publish with `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.

Starter shape:

```yaml
name: Publish AI Toolkit

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

permissions:
  contents: read
  packages: write

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: "https://npm.pkg.github.com"
          scope: "@twoj-zespol"
      - run: npm ci
      - run: npm pack --dry-run

  publish:
    needs: validate
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: "https://npm.pkg.github.com"
          scope: "@twoj-zespol"
      - run: npm ci
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Consumer CI note
Consumer repositories that install this private package need read auth. Use a
separate `GH_PKG_TOKEN` secret for third-party CI or cross-org consumers. Same-org
GitHub Actions may be able to use repository/package permissions instead, but do
not assume every build platform can see GitHub's token.
