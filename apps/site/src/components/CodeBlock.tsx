import { codeToHtml } from "shiki";
import { CopyButton } from "./CopyButton";

export async function CodeBlock({
  code,
  lang = "ts",
  filename,
}: {
  code: string;
  lang?: string;
  filename?: string;
}) {
  const html = await codeToHtml(code, {
    lang,
    themes: { light: "github-light", dark: "github-dark-dimmed" },
    defaultColor: false,
  });

  return (
    <div className="group relative overflow-hidden rounded-lg border border-line bg-code">
      {filename ? (
        <div className="flex items-center justify-between border-b border-line px-4 py-2">
          <span className="font-mono text-xs text-ink-faint">{filename}</span>
        </div>
      ) : null}
      <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <CopyButton text={code} />
      </div>
      <div
        className="shiki-container overflow-x-auto p-4 text-[13px] leading-relaxed [&_pre]:bg-transparent! [&_pre]:whitespace-pre-wrap"
        // Shiki's output is generated at build time from our own source strings
        // in src/lib/content.ts, never from user input, so this is safe.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
