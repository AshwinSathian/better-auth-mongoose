---
"better-auth-mongoose-tenant": patch
---

Guard bulkWrite() against running unscoped: calling it directly on a scoped model now throws the same way estimatedDocumentCount() does, rather than silently offering zero protection, while bulkSave() (which is scoped) keeps working since it calls the true, unguarded implementation internally through a private stand-in object instead of a shared flag a concurrent call could race. Also closes real, empirically-verified gaps on Mongoose 6 and 7: count(), findOneAndRemove(), findByIdAndRemove(), remove(), and update() (all dropped by Mongoose 9, still present on older majors) are now scoped the same way their modern equivalents are, and mapReduce() is documented as a deliberate exclusion since it never constructs a Query at all. CI now runs the full test suite against real Mongoose 6, 7, 8, and 9 installs, so the package's claimed ^6.0.0-^9.0.0 peer range is verified, not assumed.
