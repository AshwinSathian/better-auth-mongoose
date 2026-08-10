/* eslint-disable @next/next/no-img-element -- these are live third-party status
   badges (GitHub Actions, shields.io), not local assets next/image can optimize. */
import { CopyButton } from "./CopyButton";
import { GITHUB_REPO_URL, NPM_ADAPTER_URL } from "@/lib/seo";

const INSTALL_COMMAND = "pnpm add better-auth-mongoose mongoose better-auth";

export function Hero() {
  return (
    <section id="top" className="mx-auto max-w-5xl px-6 pt-16 pb-14 sm:pt-20 sm:pb-16">
      <p className="mb-5 font-mono text-xs tracking-wide text-ink-faint uppercase">
        Unofficial · community-maintained · not affiliated with Better Auth
      </p>

      <h1 className="max-w-3xl text-4xl leading-[1.1] font-semibold tracking-tight text-balance text-ink sm:text-5xl">
        Better Auth&rsquo;s tables, as real Mongoose models.
      </h1>

      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft">
        Better Auth&rsquo;s official MongoDB adapter talks to the raw{" "}
        <code className="rounded bg-code px-1.5 py-0.5 font-mono text-base text-ink">mongodb</code>{" "}
        driver, not Mongoose. This one doesn&rsquo;t. Your{" "}
        <code className="rounded bg-code px-1.5 py-0.5 font-mono text-base text-ink">user</code>,{" "}
        <code className="rounded bg-code px-1.5 py-0.5 font-mono text-base text-ink">session</code>,
        and{" "}
        <code className="rounded bg-code px-1.5 py-0.5 font-mono text-base text-ink">account</code>{" "}
        collections become real, registered Mongoose models.{" "}
        <code className="rounded bg-code px-1.5 py-0.5 font-mono text-base text-ink">
          .populate()
        </code>
        , schema validation, and hooks work the way they already do everywhere else in your app.
      </p>

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas-raised py-2.5 pr-2.5 pl-4">
          <code className="font-mono text-sm text-ink">{INSTALL_COMMAND}</code>
          <CopyButton text={INSTALL_COMMAND} label="Copy" />
        </div>
        <div className="flex items-center gap-3">
          <a
            href={GITHUB_REPO_URL}
            className="focus-ring rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-canvas transition-opacity hover:opacity-85"
          >
            View on GitHub
          </a>
          <a
            href={NPM_ADAPTER_URL}
            className="focus-ring rounded-md border border-line px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-accent"
          >
            npm
          </a>
        </div>
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-3" aria-label="Project status badges">
        <img
          src="https://github.com/AshwinSathian/better-auth-mongoose/actions/workflows/ci.yml/badge.svg"
          alt="CI status"
          width={90}
          height={20}
          referrerPolicy="no-referrer"
        />
        <img
          src="https://img.shields.io/npm/v/better-auth-mongoose.svg?label=better-auth-mongoose"
          alt="better-auth-mongoose version on npm"
          width={180}
          height={20}
          referrerPolicy="no-referrer"
        />
        <img
          src="https://img.shields.io/npm/v/better-auth-mongoose-tenant.svg?label=better-auth-mongoose-tenant"
          alt="better-auth-mongoose-tenant version on npm"
          width={220}
          height={20}
          referrerPolicy="no-referrer"
        />
        <img
          src="https://img.shields.io/badge/License-MIT-blue.svg"
          alt="MIT License"
          width={82}
          height={20}
          referrerPolicy="no-referrer"
        />
      </div>
    </section>
  );
}
