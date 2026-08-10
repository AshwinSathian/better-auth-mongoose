import { recipes } from "@/lib/content";
import { CodeBlock } from "./CodeBlock";
import { RecipeTabs } from "./RecipeTabs";

export function Recipes() {
  const tabs = recipes.map((recipe) => ({
    id: recipe.id,
    title: recipe.title,
    description: recipe.description,
    panel: <CodeBlock code={recipe.code} lang={recipe.lang} />,
  }));

  return (
    <section id="recipes" className="mx-auto max-w-5xl px-6 py-14">
      <h2 className="text-2xl font-semibold tracking-tight text-ink">Recipes</h2>
      <p className="mt-4 max-w-2xl leading-relaxed text-ink-soft">
        Every snippet here is lifted straight from the packages&rsquo; own READMEs and tests, not
        written for this page.
      </p>

      <RecipeTabs tabs={tabs} />
    </section>
  );
}
