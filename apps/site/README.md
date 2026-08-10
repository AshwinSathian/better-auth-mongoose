# site

The landing page for `better-auth-mongoose` and `better-auth-mongoose-tenant`, deployed as a
static Cloudflare Pages site at `better-auth-mongoose.ashwinsathian.com`.

Next.js (App Router), Tailwind CSS v4, `output: "export"`. No server runtime — the build produces
plain HTML/CSS/JS in `out/`, and the whole site is one route.

## Develop

```bash
pnpm --filter site dev
```

## Build

```bash
pnpm --filter site build
```

Output goes to `apps/site/out/`. `pnpm --filter site typecheck` and `pnpm --filter site lint` run
the same checks CI runs.

## Content

All facts on the page (the problem statement, recipes, FAQ, compatibility matrix) live in
[`src/lib/content.ts`](./src/lib/content.ts) and trace back to the package READMEs or
[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml). If a package's behavior changes,
update the README first, then bring this page in line with it, not the other way around.

## Deploy

```bash
pnpm --filter site build
wrangler pages deploy apps/site/out --project-name=better-auth-mongoose-site
```
