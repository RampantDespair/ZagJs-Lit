# Changelog

## Unreleased

- Add a Lit reactive controller with a package-owned Zag runtime.
- Add a Lit spread directive with listener cleanup and reconnection.
- Implement bindables, refs, tracking, prop normalization, merging, and DOM binding.
- Use public Zag core/store/types/utils packages with compatible version ranges.
- Add browser coverage for lifecycle, prop watchers, transitions, controlled
  values, DOM bindings, and checkbox form integration.
- Honor Zag event replacement keys when processing queued events.
- Preserve effect-owned CSS properties when reconciling object styles and restore
  live input properties after browser edits.
- Keep spread listeners isolated between bindings and disconnected during detached
  Lit updates.
- Export `toStyleString` for explicit serialization; normalized and merged object
  styles remain objects for property-level reconciliation.
- Build automatically before packing and publishing; document npm development.
