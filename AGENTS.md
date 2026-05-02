<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This project runs Next.js 16 + React 19 + Turbopack. Agent training data
skews older — most defaults you remember are wrong here.

**Common landmines (these will compile but break or behave wrong):**
- `cookies()`, `headers()`, `draftMode()` are async — `await` them
- `params` and `searchParams` are async — type them as `Promise<...>` and `await`
- Edge interception lives in `proxy.ts`, NOT `middleware.ts` (renamed in 16)
- Don't add `--turbopack` to scripts — it's the default; use `--webpack` to opt out
- Parallel Routes require `default.js` (was optional)
- `next lint` is gone — `pnpm lint` runs ESLint directly

**For anything else** (caching APIs, image config, PPR, build adapters):
read `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`
before writing code.
<!-- END:nextjs-agent-rules -->

# Working principles

1. Don't assume. Don't hide confusion. Surface tradeoffs.
2. Minimum code that solves the problem. Nothing speculative.
3. Touch only what you must. Clean up only your own mess.
4. Define success criteria. Loop until verified.

# Cloudflare Workers deploy

This app deploys to Cloudflare Workers via `@opennextjs/cloudflare`. Two
non-obvious gotchas are easy to re-discover by accident — don't:

- **Do NOT add `export const runtime = "edge"` to route handlers.** The
  Cloudflare adapter bundles routes for the Node runtime (with
  `nodejs_compat`); declaring `runtime = "edge"` makes Next compile the
  route as an Edge Function that the adapter's loader can't find,
  surfacing as `TypeError: Cannot read properties of undefined (reading
  'default')` from `interopDefault` / `loadComponentsImpl` at runtime.
- **`__name is not defined`** runtime errors are fixed via
  `"keep_names": false` in `wrangler.jsonc` — the documented OpenNext
  fix (https://opennext.js.org/cloudflare/howtos/keep_names). Do NOT
  solve it by walking `.open-next/` and prepending polyfills, adding
  inline `<script>` to `app/layout.tsx`, or setting wrangler
  `define.__name`.

To reproduce a Workers issue locally: `pnpm cf:build && pnpm exec
wrangler dev --local --port <free-port>`, then probe with `curl`. The
Next dev server (`pnpm dev`) does NOT exercise the OpenNext bundle, so
a green dev run does not imply a green deploy.
