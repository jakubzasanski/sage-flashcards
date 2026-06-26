# CodeArtifact CI/CD — Requirements

> **AWS appendix for Model 2.** Use this only if you deliberately chose the
> managed-infrastructure path: AWS CodeArtifact + Terraform. For the default
> Zadanie 2 path, use `m5l4-github-packages-spec-cicd.md` instead.

## Goal
Create a GitHub Actions workflow that validates and publishes the AI toolkit npm
package to AWS CodeArtifact.

## Configuration
- Branch: `master` (adapt to `main` if that is your default branch)
- AWS region: `eu-central-1`
- CodeArtifact domain: `devs10x`
- CodeArtifact repository: `npm`
- Workflow file: `.github/workflows/ci.yml`
- Package location: `packages/ai-toolkit/` (relative to repo root)
- GitHub secrets: `AWS_ACCOUNT_ID` and `AWS_ROLE_ARN`

## OIDC Authentication
- Action: `aws-actions/configure-aws-credentials@v4`
- Role: referenced via `${{ secrets.AWS_ROLE_ARN }}`
- Required workflow permission: `id-token: write`

## Validation checks
1. `pack.yaml` exists with required fields: `name`, `version`, `description`, `namespace`
2. Each `skills/*/SKILL.md` has YAML frontmatter with `name` and `description`
3. Frontmatter `name` matches the skill's directory name
4. `npm pack --dry-run` succeeds

## Secrets setup
```bash
gh secret set AWS_ACCOUNT_ID --body "<account-id>" --repo <owner>/<repo>
gh secret set AWS_ROLE_ARN --body "<role-arn>" --repo <owner>/<repo>
```

## Publish flow
1. Configure AWS credentials through OIDC.
2. Run `aws codeartifact login`.
3. Run validation.
4. Publish the npm package.
