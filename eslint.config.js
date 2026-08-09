import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/.turbo/**"],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    // Test files reach into loosely-typed Mongoose internals (SchemaDefinition's
    // index type, lean() query results) where narrowing every assertion isn't
    // worth the noise. Production src/ stays strict.
    files: ["**/test/**/*.ts", "**/*.test.ts", "**/*.e2e-spec.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
