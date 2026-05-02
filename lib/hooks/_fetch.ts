/**
 * Shared fetch helper used by every TanStack hook in this folder.
 *
 * The reason this exists: Route Handlers return structured error
 * bodies like `{ error: "TEMPEST_TOKEN not configured" }`, but a
 * naive `if (!res.ok) throw new Error(\`${name} ${res.status}\`)`
 * discards the body. That broke the ConfigError UX flow — the user
 * sees "observations 500" instead of the actionable message.
 *
 * `fetchOrThrow` parses the JSON body on `!ok`, lifts the `error`
 * field into the thrown Error's message, and falls back to the
 * "<label> <status>" string only when the body can't be parsed.
 * Downstream `extractConfigError` substring-matches the message,
 * so the original config-error pathway becomes live again.
 */

export async function fetchOrThrow<T>(
  url: string,
  label: string,
): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    let body: { error?: string } | null = null;
    try {
      body = (await res.json()) as { error?: string };
    } catch {
      body = null;
    }
    const message = body?.error ?? `${label} ${res.status}`;
    throw new Error(message);
  }
  return (await res.json()) as T;
}
