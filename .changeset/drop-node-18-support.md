---
"better-auth-mongoose": patch
"better-auth-mongoose-tenant": patch
---

Raise the minimum supported Node.js version to `>=20.19.0`, matching what Mongoose 9 and the `mongodb` driver it depends on already require. Node 18 was already broken at runtime (`crypto is not defined` — no global Web Crypto API) and reached EOL in April 2025; `engines.node` and the CI matrix now reflect that accurately.
