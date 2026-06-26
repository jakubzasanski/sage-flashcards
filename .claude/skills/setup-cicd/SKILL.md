---
name: setup-cicd
description: Generate a GitHub Actions validation and publish pipeline for an AI toolkit package published to AWS CodeArtifact through OIDC.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
---

# /setup-cicd — Build The CodeArtifact Publish Pipeline

You generate the CI/CD workflow for the Model 2 AI toolkit package.

The pipeline validates the package and publishes it to AWS CodeArtifact from GitHub Actions using OIDC. It must not depend on long-lived AWS access keys.

## Inputs

Read these files when present:

- `m5l4-codeartifact-spec-cicd.md`
- `m5l4-codeartifact-spec-terraform.md`
- `context/spec-cicd.md`
- `context/spec-terraform.md`
- `packages/ai-toolkit/package.json`
- `packages/ai-toolkit/pack.yaml`

If the CodeArtifact domain, repository, AWS region, package location or branch are missing, ask for them before writing the workflow.

## Workflow

1. Determine:
   - default branch,
   - package location,
   - AWS region,
   - CodeArtifact domain,
   - CodeArtifact repository,
   - package namespace,
   - role ARN secret name.
2. Create `.github/workflows/ci.yml`.
3. Add workflow permissions:

```yaml
permissions:
  contents: read
  id-token: write
```

4. Add a validation job that checks:
   - `pack.yaml` exists,
   - required `pack.yaml` fields are present,
   - every `skills/*/SKILL.md` has `name` and `description` frontmatter,
   - frontmatter `name` matches the skill directory,
   - `npm pack --dry-run` succeeds.
5. Add a publish job that runs only on push to the default branch.
6. Configure AWS credentials with `aws-actions/configure-aws-credentials@v4`.
7. Run `aws codeartifact login`.
8. Publish from the package directory.

## Security Rules

- Use OIDC through `AWS_ROLE_ARN`; do not generate workflows with `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY`.
- Do not print tokens.
- Keep account id and role arn in GitHub secrets unless the user explicitly chooses another mechanism.
- Do not publish on pull requests.

## Verification

Run local checks when possible:

```bash
test -f .github/workflows/ci.yml
grep -q "id-token: write" .github/workflows/ci.yml
grep -q "aws codeartifact login" .github/workflows/ci.yml
npm --prefix packages/ai-toolkit pack --dry-run
```

Finish by listing the required GitHub secrets and any manual AWS setup that must exist before the first run.
