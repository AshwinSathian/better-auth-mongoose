# M6 investigation: issue #3695 ("Setting Active Organization not working with MongoDB")

**Status: already fixed upstream. Not reproducible against current `better-auth`. No PR needed.**

## Issue

[better-auth/better-auth#3695](https://github.com/better-auth/better-auth/issues/3695) — reported 2025-07-29 against `better-auth@1.3.4`. Setting a member's active organization failed with "member is not part of the organization" even for a legitimate member, when using the (raw-driver) MongoDB adapter with the `organization` plugin.

## Root cause (as diagnosed upstream)

A type mismatch between string IDs and MongoDB `ObjectId`s in the organization plugin's membership check: the plugin queried for a member row using one ID representation while the MongoDB adapter had stored (or returned) the other, so a real membership row never matched the query — exactly the class of bug this whole project exists to fix at the adapter layer (see the root [README](../README.md) and issue #6289 / discussion #9364 for the general pattern). Related: [issue #3233](https://github.com/better-auth/better-auth/issues/3233).

## Resolution

The maintainer closed the issue on 2025-08-03, referencing [PR #3757](https://github.com/better-auth/better-auth/pull/3757) ("fix(org): incorrect use of find org by slug"), confirmed merged to `main` the same day. Two other PRs referenced in the thread as related ID-handling fixes: [#3497](https://github.com/better-auth/better-auth/pull/3497), [#3509](https://github.com/better-auth/better-auth/pull/3509), [#3593](https://github.com/better-auth/better-auth/pull/3593).

`better-auth-mongoose` and `better-auth-mongoose-tenant` target `better-auth ^1.4.0 || ^1.5.0 || ^1.6.0` and are tested against `1.6.26` — all released well after the 2025-08-03 fix.

## Direct verification

Rather than rely on the issue thread alone, this was reproduced directly against this repo's own adapter: a `betterAuth()` instance using `mongooseAdapter()` and the `organization` plugin, sign up a user, create an organization as that user, then call `setActiveOrganization`. Result: succeeds without error — no "member is not part of the organization" failure. (This was a throwaway diagnostic test, not kept in the suite, since it's confirming the _absence_ of an already-fixed upstream bug rather than testing this package's own behavior — `better-auth-mongoose-tenant`'s own test suite covers what this package actually owns: tenant-scoped query middleware.)

## Conclusion

- **No fix needed in `better-auth-mongoose-tenant`** — the bug lived in `better-auth` core's organization plugin, not in any Mongoose-specific adapter behavior, and it's already resolved there.
- **No PR to `better-auth/better-auth` is warranted** for this issue.
- §7.1 of the original technical spec ("Bug fixes for documented Mongo-specific breakage") is satisfied by this finding: the documented breakage no longer exists on the versions this package supports. `better-auth-mongoose-tenant` ships as originally scoped for §7.2 only — tenant-scoped query helpers on top of the `organization` plugin, not a patch for a bug that isn't there.
- If a similar ID-mismatch symptom resurfaces against a _future_ `better-auth` version, it would be a regression worth reporting upstream directly (not something for this package to work around), since the fix belongs in core, not in any adapter.
