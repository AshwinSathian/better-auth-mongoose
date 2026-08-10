---
"better-auth-mongoose-tenant": patch
---

Close two tenant-isolation gaps found in an external review. findById(), findByIdAndUpdate(), and findByIdAndDelete() now delegate to the already-scoped findOne-family methods instead of bypassing tenant scoping entirely, so a caller-supplied id from another tenant returns null instead of that tenant's document. tenantScoped() also accepts an optional connection option, so apps using mongoose.createConnection() (instead of the global default connection) can use it. applyTenantScope() is now idempotent: calling it twice on the same model no longer stacks a second layer of wrapping.
