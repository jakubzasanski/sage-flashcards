# Sage Flashcards — prezentacja projektu (treść)

> Źródło treści dla decku `sage-deck.html`. Edytuj punkty tutaj, potem przenieś zmiany do HTML i zredeployuj artefakt.
>
> - Deck (HTML, self-contained): `docs/presentation/sage-deck.html`
> - Live artifact: https://claude.ai/code/artifact/8e2a728b-f7a7-459c-90f3-d8f669dbc103
> - Redeploy: w Claude Code podaj plik do narzędzia Artifact (ten sam URL przy redeployu w tej samej sesji).

## Slajd tytułowy
- Sage Flashcards — „Wklej notatki. AI drafuje fiszki. Ucz się w rytmie powtórek."
- Stack chips: Astro 7 · React 19 · Supabase · Cloudflare Workers
- Live: sage-flashcards.zasanski.workers.dev
- Motyw: odwracająca się fiszka (pytanie → odpowiedź)

## 01 — Biznesowo
- **Problem:** profesjonaliści (dev/lekarz/prawnik) uczący się pod deadline wiedzą, że powtórki działają, ale ręczne tworzenie fiszek jest zbyt czasochłonne → rezygnują z najskuteczniejszej metody, gdy najbardziej jej potrzebują.
- **Insight:** fiszki z AI przekroczyły próg „good enough" — kompromis „wolne ręczne vs. żadne" się odwrócił.
- **Wartość:** próg wejścia z godzin do minut — wklej tekst, zaakceptuj karty, ucz się.
- **Persona:** „upskilling professional" w oknie przed-deadline'owym z dużym backlogiem materiałów.
- **Metryki sukcesu:** 75% fiszek AI akceptowanych bez edycji · 75% wszystkich kart powstaje ścieżką AI · 7-dniowa retencja powrotu.
- **Guardraile:** prywatność tekstu źródłowego (nie logowany, nie do treningu) · brak utraty danych (karty i sesja w toku przeżywają refresh).

## 02 — Produktowo
- **Generacja AI** — wklejasz fragment, dostajesz kandydatów Q/A.
- **Review accept / edit / reject** — decyzja per-kandydat; nic nie wchodzi do talii bez zapisu; sesja przeżywa refresh.
- **Spaced repetition (FSRS)** — `ts-fsrs` v5 planuje powtórki przed zapomnieniem.
- **Konta i auth** — email/hasło, reset hasła, sesje cookie-based SSR (Supabase).
- **Dwujęzyczność EN/PL** — rozwiązywane server-side, bez migotania.
- **Pełne SSR** — wszystkie strony na serwerze; trasy chronione middleware'em.

## 03 — Technologie
- Framework: Astro 7, pełne SSR (`output: "server"`)
- Interaktywność: React 19 (islands)
- Styl: Tailwind CSS 4 + shadcn/ui (new-york), helper `cn()`
- Auth & dane: Supabase (`@supabase/ssr`, Postgres, RLS per-operacja/per-rola)
- Nauka: ts-fsrs (FSRS v5)
- LLM: endpoint zgodny z OpenAI (domyślnie gpt-5-mini, konfigurowalny)
- Język: TypeScript · Node 24 · zod (walidacja API)
- Jakość: ESLint 9 type-checked · Prettier · husky + lint-staged

## 04 — Infrastruktura
- Cloudflare Workers (workerd), adapter `@astrojs/cloudflare` v14 (auto IMAGES + SESSION), Worker `sage-flashcards`
- Supabase: Postgres + PostgREST + RLS; migracje w `supabase/migrations/`
- Sekrety: `astro:env/server` → Worker secrets (`wrangler secret put`); nigdy w repo
- Dev: Docker → Supabase + Mailpit, `.dev.vars`; Deploy: `build` → `wrangler deploy`
- Skala: mała, niski QPS — świadomie lean MVP

## 05 — Repo: automatyzacja, review, testy
- **CI (`ci.yml`) — pełna piramida na każdy push/PR do `master`:** `lint-unit-build` + `integration` (Vitest + `supabase start`) + `e2e` (Playwright + Mailpit); concurrency-cancel, cache Playwright, artefakty tylko przy porażce, `permissions: contents:read`
  - recepta e2e wyniesiona do reusable workflow (`e2e.yml`, `workflow_call`) współdzielonego z nocnym `nightly-e2e.yml` (cron) — jedno źródło, zero duplikacji
  - 3 niuanse, które zazieleniły gate: e2e potrzebuje lokalnych kluczy Supabase · `supabase/setup-cli` przypięty do wersji z lockfile (zgodność `config.toml`) · `.dev.vars` generowany w CI, bo `astro preview` na workerd ignoruje `process.env`
- **Piramida testów:** Unit (Vitest) · Integration (Vitest + Supabase, RLS) · E2E (Playwright + Mailpit) — wszystkie trzy gatekeepują PR; Mutation (Stryker) zainstalowany, jeszcze nie w CI
- **Workflow „10x":** plan → plan-review → implement → impl-review → archive; ślad decyzyjny w `context/`
- **AI code-review na PR-ach** (`@sage/code-reviewer`, Codex SDK):
  - 6 kryteriów: poprawność, idiomatyczność, złożoność, pokrycie testami, dokumentacja, bezpieczeństwo → werdykt pass/fail
  - efekty: komentarz + etykieta `ai-cr:passed`/`ai-cr:failed` + commit status; re-run etykietą `ai-cr:review`; advisory
  - **izolacja sekretu (2 fazy):** producer `pull_request` bez sekretu (diff→artefakt) → consumer `workflow_run` z gałęzi domyślnej z sekretem; PR-autor nie wykradnie `OPENAI_API_KEY`
- **Roadmapa CI/CD:** ✅ piramida testów → release-automation → CD migracje→deploy → Dependabot

## Podsumowanie
- Realny produkt z AI postawiony lean, z dyscypliną planowania, testów i automatycznego review na poziomie zespołowym.

## Backlog / pomysły do rozwoju
- [ ] Wersja dark pod rzutnik
- [ ] Zrzut ekranu appki na slajdzie produktowym (data-URI, bo CSP blokuje zewnętrzne zasoby)
- [ ] Autor / nazwisko na slajdzie tytułowym
- [ ] Slajd „demo" / architektura (diagram dwufazowego pipeline'u)
