// Read recovery emails from the local mail server (Mailpit/Inbucket, supabase/config.toml
// [inbucket] port 54324) via its REST API. There is no production-safe way to click an emailed
// link in a test; the e2e reads it from the LOCAL mail server, so this is local/CI-with-Supabase
// only. Requires `npx supabase start` (Docker). Polls the API for the message — never a fixed sleep
// keyed to "the email should have arrived by now".
import { SUPABASE_URL } from "../../../test/support/config";

// Mailpit shares the Supabase API host but on the inbucket port. Derive it from SUPABASE_URL so an
// env override (different host) keeps both in sync.
const MAILPIT_URL = (process.env.MAILPIT_URL ?? SUPABASE_URL.replace(/:\d+$/, ":54324")).replace(/\/$/, "");

interface MailpitListItem {
  ID: string;
  To: { Address: string }[];
  Created: string;
}

interface MailpitMessage {
  Text: string;
  HTML: string;
}

// The customized recovery template links to /auth/reset-password?token_hash=...&type=recovery.
// HTML emails may entity-encode the ampersand, so normalize &amp; back to & before returning.
const RESET_LINK_RE = /https?:\/\/[^\s"'<>]+\/auth\/reset-password[^\s"'<>]*/;

async function findLatestRecoveryLink(email: string): Promise<string | null> {
  const listRes = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=50`);
  if (!listRes.ok) throw new Error(`Mailpit list failed: ${listRes.status}`);
  const { messages } = (await listRes.json()) as { messages: MailpitListItem[] };

  // Mailpit returns newest first; take the first message addressed to this user.
  const match = messages.find((m) => m.To.some((t) => t.Address.toLowerCase() === email.toLowerCase()));
  if (!match) return null;

  const msgRes = await fetch(`${MAILPIT_URL}/api/v1/message/${match.ID}`);
  if (!msgRes.ok) throw new Error(`Mailpit fetch failed: ${msgRes.status}`);
  const msg = (await msgRes.json()) as MailpitMessage;

  const body = msg.HTML || msg.Text;
  const found = RESET_LINK_RE.exec(body);
  return found ? found[0].replace(/&amp;/g, "&") : null;
}

// Poll the mail API until the recovery email for `email` arrives, then return its reset link.
// Polls on a fixed interval up to a deadline — the wait is on STATE (email present), not a guess.
export async function getLatestRecoveryLink(
  email: string,
  { timeoutMs = 15_000, intervalMs = 500 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const link = await findLatestRecoveryLink(email);
    if (link) return link;
    if (Date.now() >= deadline) {
      throw new Error(
        `No recovery email for ${email} within ${timeoutMs}ms. ` +
          `If running repeatedly, check the [auth.rate_limit] email_sent = 2/hour cap.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
