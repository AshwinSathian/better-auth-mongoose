---
"better-auth-mongoose-tenant": patch
---

Close the whole class of tenant-scoping bypass, not just the two methods a second-pass review flagged. Model.where() and chaining .where('organizationId').equals(...) after an already-scoped call no longer bypass scoping: a new Query.prototype.exec patch enforces the tenant field on every query built against a scoped model at the last possible moment, regardless of how it was constructed, and also covers the standalone replaceOne(), distinct(), and exists() without needing separate wrappers. Update bodies can no longer reassign the tenant field via $set or strip it via $unset/$rename. Model.create() and Model.insertOne() now stamp the tenant field correctly (they call doc.$save(), a separate property from doc.save() that the previous fix didn't touch). insertMany() and bulkSave() are now scoped too. estimatedDocumentCount() throws instead of silently returning every tenant's count, since it has no filter to scope by.
