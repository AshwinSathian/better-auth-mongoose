---
"better-auth-mongoose": patch
"better-auth-mongoose-tenant": patch
---

Normalize the `repository.url` field to the canonical `git+https://...git` format npm expects, removing the "repository.url was normalized" warning `npm publish` emitted on every publish.
