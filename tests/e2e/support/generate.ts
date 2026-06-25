import { type Page, expect } from "@playwright/test";

// Fill the source textbox on /generate robustly.
//
// The generator is a `client:load` React island. In dev the island can attach its onChange
// handler a beat after navigation, so an early fill() sets the DOM value before React is
// listening — and because React's change-tracker then already holds that value, simply
// re-filling the same text is suppressed as "no change", leaving `sourceText` state empty and
// the Generate button disabled. So each attempt clears first, forcing a real ""→text transition
// React must observe, and retries until the app reflects it (button enabled). Waits on STATE,
// never a fixed timeout; once the island is hydrated it passes on the first attempt.
export async function fillSourceText(page: Page, text: string): Promise<void> {
  // The source textarea's accessible name is its aria-label (gen.title), which overrides the
  // "Paste…" placeholder text for the accessible name.
  const textbox = page.getByRole("textbox", { name: /turn your notes/i });
  const generateButton = page.getByRole("button", { name: "Generate cards" });
  await expect(async () => {
    await textbox.fill("");
    await textbox.fill(text);
    await expect(generateButton).toBeEnabled({ timeout: 1000 });
  }).toPass();
}
