import {
  AUTHOR_GITHUB_URL,
  AUTHOR_NAME,
  GITHUB_REPO_URL,
  NPM_ADAPTER_URL,
  NPM_TENANT_URL,
} from "@/lib/seo";

const links = [
  { label: "GitHub", href: GITHUB_REPO_URL },
  { label: "better-auth-mongoose on npm", href: NPM_ADAPTER_URL },
  { label: "better-auth-mongoose-tenant on npm", href: NPM_TENANT_URL },
  { label: "Issues", href: `${GITHUB_REPO_URL}/issues` },
  { label: "License (MIT)", href: `${GITHUB_REPO_URL}/blob/main/LICENSE` },
];

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-faint">
          MIT ©{" "}
          <a href={AUTHOR_GITHUB_URL} className="focus-ring rounded-sm hover:text-ink">
            {AUTHOR_NAME}
          </a>
          . Not affiliated with or endorsed by the Better Auth team.
        </p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="focus-ring rounded-sm text-ink-soft hover:text-ink"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
