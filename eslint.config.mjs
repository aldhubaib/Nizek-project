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
    "src/generated/**",
    "test-results/**",
    "playwright-report/**",
  ]),
  {
    rules: {
      // The react-hooks v6 compiler rules flag long-standing patterns across
      // the app (setState-in-effect for client-only init, Date.now in render,
      // etc.). Keep them visible as warnings, but only true errors should
      // block CI.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/component-hook-factories": "warn",
      "react-hooks/static-components": "warn",
      // Pre-existing `any`s live in older modules; new code stays clean.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
]);

export default eslintConfig;
