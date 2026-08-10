import { packages } from "@/lib/content";
import { CopyButton } from "./CopyButton";

/* eslint-disable @next/next/no-img-element -- live npm version badges, see Hero.tsx */

export function Packages() {
  return (
    <section id="packages" className="mx-auto max-w-5xl px-6 py-14">
      <h2 className="text-2xl font-semibold tracking-tight text-ink">Two packages</h2>
      <p className="mt-4 max-w-2xl leading-relaxed text-ink-soft">
        The adapter stands on its own. The tenant plugin is optional, and only useful if
        you&rsquo;re already using Better Auth&rsquo;s organization plugin.
      </p>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {packages.map((pkg) => (
          <div key={pkg.name} className="flex flex-col rounded-lg border border-line p-6">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-mono text-lg font-medium text-ink">{pkg.name}</h3>
              <img
                src={pkg.npmVersionBadge}
                alt={`${pkg.name} version on npm`}
                width={80}
                height={20}
                referrerPolicy="no-referrer"
              />
            </div>
            <p className="mt-1 text-sm font-medium text-accent">{pkg.tagline}</p>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-soft">{pkg.description}</p>

            <div className="mt-5 flex items-center justify-between gap-2 rounded-md bg-code px-3 py-2">
              <code className="overflow-x-auto font-mono text-xs text-ink">
                {pkg.installCommand}
              </code>
              <CopyButton text={pkg.installCommand} label="Copy" />
            </div>

            <div className="mt-4 flex gap-4 text-sm">
              <a
                href={pkg.npmUrl}
                className="focus-ring rounded-sm text-ink underline decoration-line underline-offset-4 hover:decoration-accent"
              >
                npm
              </a>
              <a
                href={pkg.readmeUrl}
                className="focus-ring rounded-sm text-ink underline decoration-line underline-offset-4 hover:decoration-accent"
              >
                README
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
