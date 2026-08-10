import { CodeBlock } from "./CodeBlock";

const WORKAROUND = `import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI!);

export const auth = betterAuth({
  // Reach into Mongoose's own connection to hand Better Auth a raw
  // client. No schema, no validation, no hooks — and now two ways
  // to read the same collections.
  database: mongodbAdapter(mongoose.connection.getClient().db()),
});`;

const ADAPTER = `import { betterAuth } from "better-auth";
import { mongooseAdapter } from "better-auth-mongoose";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI!);

export const auth = betterAuth({
  database: mongooseAdapter(mongoose.connection),
});`;

export function Comparison() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-14">
      <h2 className="text-2xl font-semibold tracking-tight text-ink">
        The documented workaround, versus this
      </h2>
      <p className="mt-4 max-w-2xl leading-relaxed text-ink-soft">
        Both connect to the same database. Only one of them gives your own code a real, extensible
        model to work with afterward.
      </p>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <div>
          <p className="mb-3 font-mono text-xs text-ink-faint uppercase">
            The workaround everyone links to
          </p>
          <CodeBlock code={WORKAROUND} filename="auth.ts" />
        </div>
        <div>
          <p className="mb-3 font-mono text-xs text-accent uppercase">better-auth-mongoose</p>
          <CodeBlock code={ADAPTER} filename="auth.ts" />
        </div>
      </div>
    </section>
  );
}
