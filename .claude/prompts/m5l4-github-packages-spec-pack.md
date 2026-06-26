# GitHub Packages AI Toolkit Pack — Requirements

> **Default path for Zadanie 2.** This spec describes Model 1 from the lesson:
> an internal team toolkit distributed as a private npm package through GitHub
> Packages. Use this as the baseline unless your team specifically needs AWS
> CodeArtifact or a full API+CLI delivery product.

## Goal
Package the team's AI artifacts into a distributable npm package that consumer
repositories can install from GitHub Packages.

## Package metadata
- Package name: `@twoj-zespol/ai-toolkit`
- Short name: `ai-toolkit`
- Version: `0.1.0`
- Registry: `https://npm.pkg.github.com`
- Node version: `>=20`

## Required files
Generate this starter structure:

```text
ai-toolkit/
├── package.json
├── README.md
├── install.js
├── uninstall.js
├── skills/
│   └── code-review/
│       └── SKILL.md
└── rules/
    └── CLAUDE.md
```

## package.json requirements
The package must:
- publish to GitHub Packages through `publishConfig.registry`;
- include only `skills/`, `rules/`, `install.js`, `uninstall.js`, and `README.md`
  in the published package;
- run `node install.js` as `postinstall`;
- expose `ai-toolkit` as a bin command if you implement manual install/uninstall.

Example:

```json
{
  "name": "@twoj-zespol/ai-toolkit",
  "version": "0.1.0",
  "description": "Team AI artifacts distributed through GitHub Packages",
  "license": "UNLICENSED",
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  },
  "files": ["skills/", "rules/", "install.js", "uninstall.js", "README.md"],
  "scripts": {
    "postinstall": "node install.js"
  }
}
```

## Consumer repository setup
Generate instructions for consumer repositories:

```text
@twoj-zespol:registry=https://npm.pkg.github.com
```

The committed `.npmrc` must contain only the registry mapping. It must not
contain a token.

## Installer behavior
The installer should:
- locate the consumer project root;
- install skills into `.claude/skills/<skill-name>/`;
- append rules into `CLAUDE.md` between sentinel markers;
- write `.claude/.ai-toolkit-manifest.json` with package version and installed files;
- be idempotent: running install twice updates managed blocks instead of duplicating them;
- avoid failing the whole `npm install` when postinstall cleanup or linking fails.

Use these sentinel markers:

```text
<!-- BEGIN @twoj-zespol/ai-toolkit -->
<!-- END @twoj-zespol/ai-toolkit -->
```

## Authentication behavior
The installer may add this `preinstall` helper to consumer `package.json` when
the consumer project has no existing GitHub Packages auth flow:

```bash
[ -n "$GH_PKG_TOKEN" ] && echo '//npm.pkg.github.com/:_authToken=${GH_PKG_TOKEN}' >> .npmrc || true
```

This helper is for CI. Local developers should use `npm login` or their own
user-level `.npmrc`. Never commit `_authToken` to the repository.
