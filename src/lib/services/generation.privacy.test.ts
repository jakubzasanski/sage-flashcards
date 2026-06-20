import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { GenerationError, generateCandidates } from "@/lib/services/generation";
import {
  captureError,
  cardsContent,
  chatResponse,
  stubFetch,
  stubRejectingFetch,
} from "../../../test/helpers/provider";

// Risk #2 — source-text privacy leak.
//
// The pasted `sourceText` must never reach an operator-readable surface: not a thrown error
// message, not a `console.*` line. Privacy is currently enforced by construction (every throw
// uses a static string; the module has zero `console.*`). This suite turns that construction into
// a contract: we pass a unique sentinel embedded in `sourceText` through every code path and prove
// it never surfaces — guarding against a future maintainer who interpolates `sourceText` into a
// throw or adds a `console.error(sourceText)`.
//
// Kept separate from generation.test.ts so the privacy invariant reads as one focused contract.

// A unique, grep-able canary. If it appears anywhere operator-visible, the source text leaked.
const SENTINEL = "SOURCE-LEAK-CANARY-7f3a9c2e";

// sourceText that carries the canary — every call below feeds this in.
const SOURCE_WITH_SENTINEL = `Lecture notes about photosynthesis ${SENTINEL} and the Calvin cycle.`;

// Provider-mock helpers (chatResponse / cardsContent / stubFetch / stubRejectingFetch / captureError)
// are shared from test/helpers/provider.ts so this suite and generation.test.ts can't drift apart.

// --- console spies ------------------------------------------------------------------------------

let consoleSpies: MockInstance[];

beforeEach(() => {
  // Spy on every operator-visible console channel and suppress real output. The module logs
  // nothing today; these guard a future addition that might interpolate sourceText.
  consoleSpies = [
    vi.spyOn(console, "error").mockImplementation(() => undefined),
    vi.spyOn(console, "warn").mockImplementation(() => undefined),
    vi.spyOn(console, "log").mockImplementation(() => undefined),
  ];
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function expectConsoleNeverLeaked(): void {
  for (const spy of consoleSpies) {
    for (const call of spy.mock.calls) {
      for (const arg of call) {
        expect(String(arg)).not.toContain(SENTINEL);
      }
    }
  }
}

// --- the contract -------------------------------------------------------------------------------

describe("generateCandidates — source-text privacy on failure (risk #2)", () => {
  const failureBranches: { name: string; install: () => void }[] = [
    {
      name: "transient 500 upstream error",
      install: () => {
        stubFetch(() => new Response("err", { status: 500 }));
      },
    },
    {
      name: "deterministic 401 upstream error",
      install: () => {
        stubFetch(() => new Response("err", { status: 401 }));
      },
    },
    {
      name: "network-level rejection",
      install: () => {
        stubRejectingFetch();
      },
    },
    {
      name: "non-JSON response body",
      install: () => {
        stubFetch(() => new Response("<<<not json>>>", { status: 200 }));
      },
    },
    {
      name: "missing message content",
      install: () => {
        stubFetch(() => new Response(JSON.stringify({ choices: [{ message: {} }] }), { status: 200 }));
      },
    },
    {
      name: "schema-mismatched content",
      install: () => {
        stubFetch(() => chatResponse(JSON.stringify({ cards: [{ question: "Q" }] })));
      },
    },
  ];

  it.each(failureBranches)(
    "throws a GenerationError whose message omits the sentinel, and logs nothing leaky: $name",
    async ({ install }) => {
      install();

      const err = await captureError(generateCandidates(SOURCE_WITH_SENTINEL));

      expect(err).toBeInstanceOf(GenerationError);
      expect((err as GenerationError).message).not.toContain(SENTINEL);
      expectConsoleNeverLeaked();
    },
  );
});

describe("generateCandidates — source-text privacy on success (risk #2)", () => {
  const successBranches: { name: string; install: () => void }[] = [
    {
      name: "valid cards",
      install: () => {
        stubFetch(() => chatResponse(cardsContent([{ question: "Q", answer: "A" }])));
      },
    },
    {
      name: "empty cards",
      install: () => {
        stubFetch(() => chatResponse(cardsContent([])));
      },
    },
  ];

  it.each(successBranches)("returns cards free of the sentinel, and logs nothing leaky: $name", async ({ install }) => {
    // The mocked provider response is sentinel-free, so any sentinel in the result could only
    // have come from sourceText being echoed into output — i.e. a genuine leak.
    install();

    const cards = await generateCandidates(SOURCE_WITH_SENTINEL);

    expect(JSON.stringify(cards)).not.toContain(SENTINEL);
    expectConsoleNeverLeaked();
  });
});

describe("generateCandidates — privacy assertion is sensitive (positive control)", () => {
  it("surfaces the sentinel in the result when the provider itself echoes it", async () => {
    // Here the canary originates from the provider's own card content, NOT from sourceText. The
    // service faithfully returns provider output, so it appears — proving the success-branch
    // assertion above is not vacuous: a sentinel in output IS detectable when one is really there.
    stubFetch(() => chatResponse(cardsContent([{ question: `What is ${SENTINEL}?`, answer: "A canary." }])));

    const cards = await generateCandidates("plain source text with no canary");

    expect(JSON.stringify(cards)).toContain(SENTINEL);
  });

  it("expectConsoleNeverLeaked throws when a console spy actually sees the sentinel", () => {
    // Proves the console guard is not vacuous: the service logs nothing today, so the guard's loop
    // body never runs in the real tests. Feed the sentinel to a spy directly and assert the guard
    // catches it — otherwise a refactor that neutralized expectConsoleNeverLeaked would go unnoticed.
    // eslint-disable-next-line no-console -- deliberately feeding the spied console to test the guard
    console.error(`leaked: ${SENTINEL}`);

    expect(() => {
      expectConsoleNeverLeaked();
    }).toThrow();
  });
});
