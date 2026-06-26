---
name: tf-registry
description: Generate Terraform for the Model 2 AWS CodeArtifact npm registry, including domain, repositories, KMS and IAM policy wiring.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
---

# /tf-registry — Generate The CodeArtifact Registry

You generate Terraform for the Model 2 private npm registry used by the AI toolkit package.

This skill owns the managed-infrastructure path from m5l4: AWS CodeArtifact provisioned through Terraform. It should be used only when the learner consciously chooses the AWS appendix path, not as the default for every team.

## Inputs

Read these files when present:

- `m5l4-codeartifact-spec-terraform.md`
- `m5l4-codeartifact-spec-cicd.md`
- `context/spec-terraform.md`
- `context/spec-cicd.md`

If required values are missing, ask for:

- AWS region,
- AWS account id,
- CodeArtifact domain name,
- private repository name,
- proxy repository name,
- package namespace,
- Terraform state bucket/key,
- GitHub Actions role name or ARN.

## Terraform Targets

Generate a `terraform/` directory with files such as:

```text
terraform/
├── main.tf
├── variables.tf
├── outputs.tf
├── codeartifact.tf
├── iam.tf
├── kms.tf
└── terraform.tfvars.example
```

The infrastructure should include:

- S3 backend configuration with native S3 locking when Terraform version supports it,
- CodeArtifact domain,
- private npm repository,
- npm public upstream/proxy repository,
- external npm connection,
- KMS key and alias,
- IAM managed policy for CodeArtifact read/publish operations,
- attachment point for the GitHub Actions role used by CI/CD.

## Gotchas To Preserve

- CodeArtifact domain and npm package scope are different concepts.
- `aws codeartifact login --namespace` expects the npm scope without `@`.
- Terraform should not contain hardcoded personal credentials.
- The GitHub Actions role can be referenced as an existing role when the org already owns OIDC setup.

## Verification

Run when possible:

```bash
terraform -chdir=terraform fmt -check
terraform -chdir=terraform validate
```

If Terraform is not installed or provider initialization is unavailable, say so and still run static checks over the generated files.

Do not run `terraform apply` unless the user explicitly asks for it.
