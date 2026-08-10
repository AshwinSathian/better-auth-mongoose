const issues = [
  {
    title: "An extra dependency you didn't ask for.",
    body: "Even a Mongoose-only project ends up with the raw mongodb package installed, just for Better Auth's own tables.",
    href: "https://github.com/better-auth/better-auth/issues/1492",
    label: "better-auth #1492",
  },
  {
    title: "Two connections, no shared schema.",
    body: "Better Auth writes user, session, and account documents straight through MongoClient. Your own Mongoose models never see those writes: no validation, no hooks, no virtuals.",
  },
  {
    title: "populate() breaks.",
    body: "Reference a Better-Auth-created document from your own schema, and .populate() silently fails, alongside _id type mismatches between Better Auth's ID handling and Mongoose's ObjectId.",
    href: "https://github.com/better-auth/better-auth/issues/6289",
    label: "better-auth #6289",
    secondaryHref: "https://github.com/better-auth/better-auth/discussions/9364",
    secondaryLabel: "discussion #9364",
  },
  {
    title: "The only fix on offer is a workaround.",
    body: "Every answer in Better Auth's own discussions comes down to reaching into mongoose.connection.getClient() and handing the raw client over. That sidesteps the schema and populate problems instead of solving them.",
    href: "https://github.com/better-auth/better-auth/discussions/1921",
    label: "discussion #1921",
  },
];

export function Problem() {
  return (
    <section id="problem" className="mx-auto max-w-5xl px-6 py-14">
      <h2 className="text-2xl font-semibold tracking-tight text-ink">The problem</h2>
      <p className="mt-4 max-w-2xl leading-relaxed text-ink-soft">
        Most Node backends already running MongoDB use Mongoose, not the raw driver. It&rsquo;s
        close to universal in NestJS and Express apps. Better Auth talking straight to{" "}
        <code className="rounded bg-code px-1.5 py-0.5 font-mono text-sm text-ink">mongodb</code>{" "}
        instead isn&rsquo;t just a style mismatch. It produces four specific problems, and
        they&rsquo;ve been open on Better Auth&rsquo;s own GitHub since February 2025.
      </p>

      <ol className="mt-10 grid gap-8 sm:grid-cols-2">
        {issues.map((issue, i) => (
          <li key={issue.title} className="border-l-2 border-line pl-5">
            <span className="font-mono text-xs text-ink-faint">0{i + 1}</span>
            <p className="mt-1 font-medium text-ink">{issue.title}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{issue.body}</p>
            {issue.href ? (
              <p className="mt-2 flex flex-wrap gap-x-3 text-sm">
                <a href={issue.href} className="focus-ring rounded-sm text-accent hover:underline">
                  {issue.label}
                </a>
                {issue.secondaryHref ? (
                  <a
                    href={issue.secondaryHref}
                    className="focus-ring rounded-sm text-accent hover:underline"
                  >
                    {issue.secondaryLabel}
                  </a>
                ) : null}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
