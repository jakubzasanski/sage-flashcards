# Changelog

## [1.2.0](https://github.com/jakubzasanski/sage-flashcards/compare/v1.1.0...v1.2.0) (2026-06-27)


### Features

* **ci-cd-code-review:** composite ai-review action (p2) ([092a77d](https://github.com/jakubzasanski/sage-flashcards/commit/092a77d457065fa38e2ff547efd1719905b85eb5))
* **ci-cd-code-review:** consumer review workflow (p3) ([6964c39](https://github.com/jakubzasanski/sage-flashcards/commit/6964c39491b585931dde1fd48a3f1cea20b85621))
* **ci-cd-code-review:** extend code-reviewer agent (p1) ([b3bfdc5](https://github.com/jakubzasanski/sage-flashcards/commit/b3bfdc500d1873ce0845566ff5696e626c427b62))
* **ci-test-pyramid:** add html reporter so CI generates a Playwright report (3.3) ([a49c897](https://github.com/jakubzasanski/sage-flashcards/commit/a49c89738e0f4e7f81afa5b493e775109d437f2e))
* **ci-test-pyramid:** e2e job with Playwright + Supabase (p3) ([7b4192e](https://github.com/jakubzasanski/sage-flashcards/commit/7b4192ee407a3ab19f420eabc2e9c4d6e2b7e266))
* **ci-test-pyramid:** integration job on local Supabase (p2) ([691768a](https://github.com/jakubzasanski/sage-flashcards/commit/691768a64035b1d0de60fe37e90f9e5dc9810f39))
* **ci-test-pyramid:** nightly e2e safety net (p4) ([e526c29](https://github.com/jakubzasanski/sage-flashcards/commit/e526c29e7f4343ecd33ef1b7f231f7c3274259db))
* **dependency-automation:** Dependabot configuration (p1) ([0628467](https://github.com/jakubzasanski/sage-flashcards/commit/06284676d2ec815225df4dc0dee847c4ecdb4234))
* **m5l2:** scripted code-review agent on Codex SDK ([c969d40](https://github.com/jakubzasanski/sage-flashcards/commit/c969d4036987c3ed5056f814e524513b392cbe88))
* **release-automation:** branch protection, release-please, and commit linting ([#21](https://github.com/jakubzasanski/sage-flashcards/issues/21)) ([bf69a85](https://github.com/jakubzasanski/sage-flashcards/commit/bf69a85701b158db0b057552513b7864ff34c556))


### Bug Fixes

* **ci-cd-code-review:** guard consumer on producer success + head_sha (W1, W2) ([9e0f816](https://github.com/jakubzasanski/sage-flashcards/commit/9e0f816177ee3c48af0cf11541badf535236d4d9))
* **ci-cd-code-review:** isolate secret via pull_request → workflow_run (p4) ([9ad3501](https://github.com/jakubzasanski/sage-flashcards/commit/9ad35011376fa9eeba0efbe080a731751874c3de))
* **ci-cd:** pass absolute diff-path to ai-review action in consumer ([80234f0](https://github.com/jakubzasanski/sage-flashcards/commit/80234f09064dfac8df719fad43821b6df1d135a4))
* **ci-test-pyramid:** e2e local Supabase env + pin CLI + reusable recipe ([0bc108b](https://github.com/jakubzasanski/sage-flashcards/commit/0bc108b82ddbde7d49ae37a5501bf8a962794099))
* **ci-test-pyramid:** least-privilege permissions + impl-review report ([0cc7a83](https://github.com/jakubzasanski/sage-flashcards/commit/0cc7a83e5f13c13765ac05e49f90c121421a37f2))
* **ci-test-pyramid:** pin supabase CLI to 2.107.0 (config.toml parity) ([20009b9](https://github.com/jakubzasanski/sage-flashcards/commit/20009b953540c2b51b3bffb7d4739574086b461a))
* **ci-test-pyramid:** write .dev.vars so workerd preview sees Supabase ([d683eef](https://github.com/jakubzasanski/sage-flashcards/commit/d683eef5420ceac4a5903055bcef276ce90e1766))
* **dependency-automation:** add root .npmrc pinning [@openai](https://github.com/openai) to public npm ([152d2d5](https://github.com/jakubzasanski/sage-flashcards/commit/152d2d504d6564dd59e49016a2d98160cf442437))
* **dependency-automation:** pin @openai/* to public npm for Dependabot ([b2d1b79](https://github.com/jakubzasanski/sage-flashcards/commit/b2d1b79fbf554b5980b2786d01fd06529b4c989b))


### Code Refactoring

* **ci-test-pyramid:** fast lane + concurrency (p1) ([4afd08a](https://github.com/jakubzasanski/sage-flashcards/commit/4afd08ae8d3b9bad9a71122a7d222b3b279ab750))
* **ci-test-pyramid:** upload e2e artifacts only on failure ([d582864](https://github.com/jakubzasanski/sage-flashcards/commit/d5828641dc148e1828b1cf5311ac490bbddbbf12))
