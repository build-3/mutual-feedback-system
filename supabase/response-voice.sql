-- Per-reply voice for feedback responses.
-- ────────────────────────────────────────────────────────────────────
-- Until now, whether a reply spoke as the studio ("build3 mod") or as the person
-- was DERIVED at render time from three things: the submission is build3, the
-- responder is in MOD_EMAILS, and the responder is not the author. Nothing was
-- stored, so a moderator had no way to reply in their own name on org feedback —
-- the system could not represent the choice.
--
-- as_org stores the choice per reply. Default false: replying as yourself is the
-- normal case, and speaking for the studio should be a deliberate act rather
-- than something that happens because of who you are.
--
-- The server still validates the choice on write (a mod, on build3 feedback,
-- that they did not author). This column records the decision; it does not grant
-- the right to make it.

ALTER TABLE feedback_responses
  ADD COLUMN IF NOT EXISTS as_org BOOLEAN NOT NULL DEFAULT false;

-- Backfill: reproduce exactly what each existing reply already renders as, so no
-- historical reply changes voice when the code starts reading the column.
-- Expected to set exactly 2 of 65 rows as of 2026-08-10.
UPDATE feedback_responses r
SET as_org = true
WHERE r.as_org = false
  AND EXISTS (
    SELECT 1
    FROM feedback_answers a
    JOIN feedback_submissions s ON s.id = a.submission_id
    JOIN employees e ON e.id = r.responder_id
    WHERE a.id = r.answer_id
      AND s.feedback_type = 'build3'
      AND r.responder_id <> s.submitted_by_id
      AND lower(e.email) IN ('at@build3.org', 'vc@build3.org', 'br@build3.org')
  );

COMMENT ON COLUMN feedback_responses.as_org IS
  'True when this reply was published in the org''s voice ("build3 mod") rather than the responder''s own name. Validated server-side at write time; MOD_EMAILS is the authority on who may set it.';

-- Verify: should report the backfilled count and leave everything else false.
-- SELECT as_org, count(*) FROM feedback_responses GROUP BY as_org;
