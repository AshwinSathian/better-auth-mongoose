// Every fact here traces back to packages/*/README.md or .github/workflows/ci.yml
// in this repo. Nothing below is invented — if it's not true, don't add it here.

export interface Recipe {
  id: string;
  title: string;
  description: string;
  code: string;
  lang: "ts";
}

export const recipes: Recipe[] = [
  {
    id: "quick-start",
    title: "Quick start",
    description: "Point the adapter at a connection you already opened. Nothing else changes.",
    lang: "ts",
    code: `import { betterAuth } from "better-auth";
import { mongooseAdapter } from "better-auth-mongoose";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI!);

export const auth = betterAuth({
  database: mongooseAdapter(mongoose.connection),
  emailAndPassword: { enabled: true },
});`,
  },
  {
    id: "extend-schema",
    title: "Extend the user schema",
    description:
      "Add your own fields to Better Auth's \"user\" model. Your fields merge in; Better Auth's required fields stay required.",
    lang: "ts",
    code: `export const auth = betterAuth({
  database: mongooseAdapter(mongoose.connection, {
    schemas: {
      user: new Schema({
        role: { type: String, default: "member" },
        tenantId: { type: Schema.Types.ObjectId, ref: "Tenant" },
      }),
    },
  }),
});

// Your own code queries the same collection directly:
const User = mongoose.model("user"); // already registered by mongooseAdapter()
const admins = await User.find({ role: "admin" }).lean();`,
  },
  {
    id: "populate",
    title: "Populate a reference to a Better Auth document",
    description:
      "A real ObjectId ref field on your own model, resolved with plain Mongoose .populate() against a user Better Auth created.",
    lang: "ts",
    code: `const Post = mongoose.model(
  "Post",
  new Schema({
    title: String,
    author: { type: Schema.Types.ObjectId, ref: "user", required: true },
  }),
);

const post = await Post.findOne({ title: "..." })
  .populate("author")
  .lean()
  .exec();

post.author.email; // resolved, no manual workaround`,
  },
  {
    id: "transactions",
    title: "Transactions",
    description:
      "On by default, using real Mongoose sessions. Falls back to non-transactional writes automatically on a standalone mongod (common in local dev) instead of crashing on boot.",
    lang: "ts",
    code: `// Default: transactions on, with automatic standalone-instance fallback.
mongooseAdapter(mongoose.connection);

// Opt out entirely:
mongooseAdapter(mongoose.connection, { transactions: false });`,
  },
  {
    id: "joins",
    title: "Adapter-level joins",
    description:
      "Better Auth 1.4+ can push joins down to the adapter for a documented 2-3x latency improvement on endpoints like get-session. This adapter turns that straight into .populate() calls.",
    lang: "ts",
    code: `export const auth = betterAuth({
  database: mongooseAdapter(mongoose.connection),
  experimental: { joins: true },
});`,
  },
  {
    id: "tenant-scoping",
    title: "Tenant-scoped queries",
    description:
      "better-auth-mongoose-tenant scopes your own app models to Better Auth's organization plugin. Every read and write gets the active organization's id merged in; a caller can't override it.",
    lang: "ts",
    code: `import { organization } from "better-auth/plugins";
import { tenantScoped } from "better-auth-mongoose-tenant";

const Project = mongoose.model(
  "Project",
  new mongoose.Schema({ name: String, organizationId: String }),
);

export const auth = betterAuth({
  database: mongooseAdapter(mongoose.connection),
  plugins: [
    organization(),
    tenantScoped({
      scopedModels: ["Project"],
      getActiveTenantId: () => getCurrentSession()?.activeOrganizationId,
    }),
  ],
});`,
  },
  {
    id: "tenant-aggregate",
    title: "Scope an aggregate() pipeline by tenant",
    description:
      "applyTenantScope() deliberately never touches aggregate() — a pipeline's semantics are too specific to guess at. tenantMatchStage() builds the correct $match stage yourself, wherever your pipeline needs it.",
    lang: "ts",
    code: `import { tenantMatchStage } from "better-auth-mongoose-tenant";

const byStatus = await Project.aggregate([
  tenantMatchStage(Project), // { $match: { organizationId: <active tenant> } }
  { $group: { _id: "$status", count: { $sum: 1 } } },
]);`,
  },
];

export interface FaqItem {
  question: string;
  answer: string;
}

export const faqItems: FaqItem[] = [
  {
    question: "Is this an official Better Auth package?",
    answer:
      "No. This is a community project, not affiliated with or endorsed by the Better Auth team. It exists because the gap between Better Auth and Mongoose has been open on Better Auth's own GitHub since February 2025 (issue #1492), with no first-party fix.",
  },
  {
    question: "Do I still need the mongodb driver installed?",
    answer:
      "No. better-auth-mongoose has zero direct dependencies of its own and never pulls in the raw mongodb driver. mongoose and better-auth are peer dependencies you already have.",
  },
  {
    question: "Which Mongoose and Better Auth versions are supported?",
    answer:
      "Mongoose 6 through 9, and Better Auth 1.4 through 1.6, per the packages' peer ranges. CI runs the full test suite on Node 20 and 22 against all three Better Auth minors, and separately runs the tenant package's version-sensitive internals against real Mongoose 6, 7, and 8 installs; Mongoose 9 is covered by the default dev install used everywhere else.",
  },
  {
    question: "How does better-auth-mongoose-tenant relate to the organization plugin?",
    answer:
      "It's built with the organization plugin, not instead of it. Organization gives you organizations, members, and an active organization on the session. It doesn't automatically scope your own app models (Project, Invoice, whatever you have) to that active organization — tenantScoped() is what makes that automatic instead of a .where() every service method has to remember.",
  },
  {
    question: "What's the current stability?",
    answer:
      "Still 0.x: the adapter is at 0.1.x and the tenant plugin at 0.2.x. The adapter passes the official @better-auth/test-utils adapter contract suite and the CI-run populate() test in the repo; the tenant plugin has its own CI suite covering the enforcement layers described in its README. Still young enough that you should read the changelog before bumping minor versions.",
  },
  {
    question: "What does it cost, and what's the license?",
    answer: "Free and open source, MIT licensed. Both packages, no paid tier.",
  },
];

export interface CompatRow {
  dimension: string;
  values: string;
  verifiedBy: string;
}

export const compatibilityMatrix: CompatRow[] = [
  { dimension: "Node.js", values: "20, 22", verifiedBy: "CI test matrix, every push" },
  {
    dimension: "Better Auth",
    values: "1.4, 1.5, 1.6",
    verifiedBy: "CI test matrix, every push",
  },
  {
    dimension: "Mongoose",
    values: "6, 7, 8, 9",
    verifiedBy:
      "6/7/8 via the tenant package's dedicated compat job; 9 via the default install used elsewhere",
  },
];

export interface PackageInfo {
  name: string;
  tagline: string;
  description: string;
  npmUrl: string;
  npmVersionBadge: string;
  readmeUrl: string;
  installCommand: string;
}

export const packages: PackageInfo[] = [
  {
    name: "better-auth-mongoose",
    tagline: "The adapter. Start here.",
    description:
      "Real, extensible Mongoose models for Better Auth's own tables. .populate(), schema validation, and hooks all work normally from your own application code.",
    npmUrl: "https://www.npmjs.com/package/better-auth-mongoose",
    npmVersionBadge: "https://img.shields.io/npm/v/better-auth-mongoose.svg",
    readmeUrl:
      "https://github.com/AshwinSathian/better-auth-mongoose/tree/main/packages/better-auth-mongoose#readme",
    installCommand: "pnpm add better-auth-mongoose mongoose better-auth",
  },
  {
    name: "better-auth-mongoose-tenant",
    tagline: "Optional. Automatic tenant isolation.",
    description:
      "Tenant-scoped query middleware on top of Better Auth's organization plugin. Every read and write on the models you name gets scoped to the active organization, with no .where() to forget.",
    npmUrl: "https://www.npmjs.com/package/better-auth-mongoose-tenant",
    npmVersionBadge: "https://img.shields.io/npm/v/better-auth-mongoose-tenant.svg",
    readmeUrl:
      "https://github.com/AshwinSathian/better-auth-mongoose/tree/main/packages/better-auth-mongoose-tenant#readme",
    installCommand: "pnpm add better-auth-mongoose-tenant",
  },
];
