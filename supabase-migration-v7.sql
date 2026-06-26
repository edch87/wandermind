-- Migration v7 (2026-06-26): null out legacy false values on accessibility fields.
--
-- Context: AddPlace previously offered a single toggle (true ↔ undefined) for
-- dog_friendly / wheelchair_accessible / stroller_friendly, so every `false`
-- in the database came from the inference layer reading OSM tags
-- (dog=no / wheelchair=no), not from a user. We've now switched to a
-- three-state Yes / Not sure / No pill group and stopped inference from
-- writing `false` at all — negative states are user-only signal going forward.
--
-- This one-shot UPDATE wipes the historical inferred `false` values so old
-- items behave like new ones (no spurious "Not dog-friendly" chips on the
-- detail page, no spurious exclusion in the recommend flow's strict filters).
-- Safe to run more than once.

UPDATE bucket_list_items
SET
  dog_friendly = NULL,
  wheelchair_accessible = NULL,
  stroller_friendly = NULL
WHERE
  dog_friendly IS FALSE
  OR wheelchair_accessible IS FALSE
  OR stroller_friendly IS FALSE;
