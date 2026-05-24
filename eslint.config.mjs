import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // OpenNext for Cloudflare emits a vendored bundle into .open-next/
    // — generated, not authored.
    ".open-next/**",
    // Wrangler stages a deploy bundle in .wrangler/tmp/ during
    // `cf:deploy`. Same situation: generated, not authored, re-emits
    // on every deploy.
    ".wrangler/**",
    // Vendor / one-off scripts that don't need the full Next ruleset.
    "scripts/**",
  ]),
]);

export default eslintConfig;
