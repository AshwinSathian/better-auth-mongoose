import { compatibilityMatrix } from "@/lib/content";

export function Compatibility() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-14">
      <h2 className="text-2xl font-semibold tracking-tight text-ink">Compatibility</h2>
      <p className="mt-4 max-w-2xl leading-relaxed text-ink-soft">
        Peer ranges, and where CI actually exercises them. Nothing here is a claim without a
        workflow run behind it.
      </p>

      <div className="mt-8 overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[560px] border-collapse text-left text-sm">
          <caption className="sr-only">
            Compatibility matrix for better-auth-mongoose and better-auth-mongoose-tenant
          </caption>
          <thead>
            <tr className="border-b border-line bg-canvas-raised">
              <th scope="col" className="px-4 py-3 font-medium text-ink">
                Dependency
              </th>
              <th scope="col" className="px-4 py-3 font-medium text-ink">
                Versions
              </th>
              <th scope="col" className="px-4 py-3 font-medium text-ink">
                Verified by
              </th>
            </tr>
          </thead>
          <tbody>
            {compatibilityMatrix.map((row) => (
              <tr key={row.dimension} className="border-b border-line last:border-0">
                <th scope="row" className="px-4 py-3 font-mono text-xs font-normal text-ink">
                  {row.dimension}
                </th>
                <td className="px-4 py-3 text-ink-soft">{row.values}</td>
                <td className="px-4 py-3 text-ink-soft">{row.verifiedBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
