import { faqItems } from "@/lib/content";

export function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-5xl px-6 py-14">
      <h2 className="text-2xl font-semibold tracking-tight text-ink">Frequently asked</h2>

      <div className="mt-8 divide-y divide-line border-y border-line">
        {faqItems.map((item) => (
          <details key={item.question} className="group py-5">
            <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-4 rounded-sm text-left font-medium text-ink">
              {item.question}
              <span
                aria-hidden="true"
                className="shrink-0 text-ink-faint transition-transform group-open:rotate-45"
              >
                <PlusIcon />
              </span>
            </summary>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
