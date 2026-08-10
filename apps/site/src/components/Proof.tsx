import { CodeBlock } from "./CodeBlock";
import { GITHUB_REPO_URL } from "@/lib/seo";

const PROOF_CODE = `const auth = betterAuth({ database: mongooseAdapter(connection) });

const { user } = await auth.api.signUpEmail({
  body: {
    email: "author@example.com",
    password: "correct-horse-battery-staple",
    name: "Post Author",
  },
});

// A consumer-defined model, with a real ObjectId ref to Better
// Auth's own "user" collection.
const Post = connection.model(
  "Post",
  new Schema({
    title: String,
    author: { type: Schema.Types.ObjectId, ref: "user", required: true },
  }),
);

await Post.create({ title: "Hello, populate()", author: coerceToObjectId(user.id) });

const post = await Post.findOne({ title: "Hello, populate()" })
  .populate("author")
  .lean()
  .exec();

post.author.email; // "author@example.com" — resolved by plain Mongoose .populate()`;

const proofLinks = [
  {
    label: "test/populate.test.ts",
    href: `${GITHUB_REPO_URL}/blob/main/packages/better-auth-mongoose/test/populate.test.ts`,
  },
  {
    label: "test/adapter.test.ts (the @better-auth/test-utils contract suite)",
    href: `${GITHUB_REPO_URL}/blob/main/packages/better-auth-mongoose/test/adapter.test.ts`,
  },
  {
    label: "examples/nestjs-mongoose — the same thing over real HTTP",
    href: `${GITHUB_REPO_URL}/tree/main/examples/nestjs-mongoose`,
  },
  {
    label: "CI workflow that runs all of it on every push",
    href: `${GITHUB_REPO_URL}/blob/main/.github/workflows/ci.yml`,
  },
];

export function Proof() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-14">
      <h2 className="text-2xl font-semibold tracking-tight text-ink">Proof, not claims</h2>
      <p className="mt-4 max-w-2xl leading-relaxed text-ink-soft">
        This isn&rsquo;t marketing copy. It&rsquo;s a real, CI-run test in the repo.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.3fr_1fr]">
        <CodeBlock code={PROOF_CODE} filename="test/populate.test.ts" />

        <ul className="flex flex-col gap-4 self-start rounded-lg border border-line bg-canvas-raised p-5">
          {proofLinks.map((link) => (
            <li key={link.href} className="text-sm leading-snug">
              <a
                href={link.href}
                className="focus-ring rounded-sm text-ink underline decoration-line underline-offset-4 hover:decoration-accent"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
