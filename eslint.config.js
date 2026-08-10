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
  {
    // NestJS's DI resolves constructor parameters via reflect-metadata,
    // which needs a real runtime class reference — `import type` erases the
    // import entirely, silently breaking injection. consistent-type-imports
    // would "fix" exactly the pattern NestJS requires, so it's off here.
    files: ["examples/nestjs-mongoose/**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "off",
    },
  },
);
