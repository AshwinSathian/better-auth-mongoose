import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Vite transforms .ts files with esbuild by default, regardless of other
  // plugins — esbuild doesn't support emitDecoratorMetadata, so it would
  // silently strip the decorator metadata unplugin-swc is supposed to
  // provide unless Vite's own built-in transform is turned off here.
  esbuild: false,
  test: {
    // Keep NestJS's own conventional *.e2e-spec.ts naming (what `nest new`
    // generates) rather than renaming to Vitest's default *.spec.ts pattern.
    include: ["**/*.e2e-spec.ts"],
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  plugins: [
    // Vitest's default esbuild transform doesn't emit the
    // design:paramtypes decorator metadata Nest's DI relies on — SWC (via
    // .swcrc's decoratorMetadata: true) does. Documented NestJS + Vitest
    // integration: https://docs.nestjs.com/recipes/swc#vitest
    swc.vite({ module: { type: "es6" } }),
  ],
});
