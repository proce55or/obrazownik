import js from "@eslint/js";
import ts from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
export default ts.config(
  {
    ignores: ["dist/**", "node_modules/**", "output/**", ".playwright-cli/**"],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ["tests/e2e/*.js"],
    languageOptions: {
      globals: {
        console: "readonly",
        document: "readonly",
        innerWidth: "readonly",
        fetch: "readonly", URL:"readonly", Buffer:"readonly", window:"readonly",
        HTMLButtonElement:"readonly", HTMLAnchorElement:"readonly", HTMLSelectElement:"readonly", getComputedStyle:"readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { varsIgnorePattern: "^scenario$" },
      ],
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      globals: { process: "readonly", console: "readonly", fetch: "readonly" },
    },
  },
  {
    files: ["src/client/**/*.{ts,tsx}"],
    plugins: { "react-hooks": hooks },
    rules: { ...hooks.configs.recommended.rules },
  },
);
