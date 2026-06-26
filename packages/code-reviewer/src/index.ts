import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { reviewDiff } from "./reviewer";

const here = dirname(fileURLToPath(import.meta.url));

// Wczytaj packages/code-reviewer/.env (Node 24). Brak pliku jest OK — klucz może być w shellu.
try {
  process.loadEnvFile(join(here, "..", ".env"));
} catch {
  /* brak .env */
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

let diff = await readStdin();

if (!diff.trim()) {
  const sample = join(here, "..", "fixtures", "sample.diff");
  if (existsSync(sample)) {
    diff = readFileSync(sample, "utf8");
    console.error("ℹ️  Brak diffa na stdin — używam fixtures/sample.diff (symulowany diff).\n");
  } else {
    console.error("Użycie: git diff | npm run review");
    process.exit(1);
  }
}

// Kontekst PR-a wpada przez env, żeby nie mieszać go z kanałem stdin (diff).
const { review, usage } = await reviewDiff(diff, {
  prTitle: process.env.PR_TITLE,
  prBody: process.env.PR_BODY,
});
console.log(JSON.stringify(review, null, 2));
if (usage) console.error("\n📊 usage:", JSON.stringify(usage));

// Bramka dla CI: gdy REVIEW_FAIL_ON_VERDICT=1, werdykt "fail" kończy proces kodem 2
// (odrębnym od kodu 1 dla braku wejścia powyżej). Domyślnie wyłączone — lokalne
// uruchomienia i evale promptfoo pozostają niebramkujące. Akcja CI tego NIE ustawia
// (gejtuje na sparsowanym `verdict`), patrz plan Phase 2/3.
if (process.env.REVIEW_FAIL_ON_VERDICT === "1" && review.verdict === "fail") {
  console.error("❌ verdict=fail — kończę kodem 2 (REVIEW_FAIL_ON_VERDICT=1).");
  process.exit(2);
}
