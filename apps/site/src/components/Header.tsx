import Link from "next/link";
import { Logo } from "./Logo";
import { GITHUB_REPO_URL, SITE_NAME } from "@/lib/seo";

const navLinks = [
  { href: "#problem", label: "Problem" },
  { href: "#packages", label: "Packages" },
  { href: "#recipes", label: "Recipes" },
  { href: "#faq", label: "FAQ" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
        <a href="#top" className="focus-ring flex items-center gap-2 rounded-sm">
          <Logo size={26} />
          <span className="font-mono text-sm font-medium text-ink">{SITE_NAME}</span>
        </a>
        <nav aria-label="Section" className="hidden items-center gap-6 text-sm sm:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="focus-ring rounded-sm text-ink-soft transition-colors hover:text-ink"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Link
            href={GITHUB_REPO_URL}
            className="focus-ring rounded-sm text-sm text-ink-soft transition-colors hover:text-ink"
          >
            GitHub
          </Link>
        </div>
      </div>
    </header>
  );
}
