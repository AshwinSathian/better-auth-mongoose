---
"better-auth-mongoose": patch
---

Fix a case-insensitive `in` where-clause with an empty value list matching every document instead of none. `whereToMongoFilter` built `{ $or: [] }` for this case (mapping zero values through the per-value regex branch), which MongoDB treats as vacuously true rather than false — the opposite of what an empty allow-list should mean, and a real data-exposure risk for any caller-built `in` filter that narrows to empty at runtime (e.g. filtering by a dynamically computed, possibly-empty list of allowed values). An empty `in`/`not_in` value list is now always resolved through native `$in: []`/`$nin: []` semantics regardless of `mode`, matching the (already-correct) non-insensitive path exactly. Found in an adversarial review; caught this specific case in a new regression test before it could reach a real deployment.
