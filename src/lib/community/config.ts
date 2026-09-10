/**
 * Community ecosystem tuning — every threshold lives here.
 *
 * The self-sustaining loop:
 *   submit (needs answer + explanation) → 3 peer approvals → drill pool
 *   report a bad question → flagged → fix proposed → 3 peer approvals → applied
 *   ...or 3 "looks correct" votes → flag cleared
 *
 * Raise thresholds as the community grows; all review logic reads these
 * constants so no UI changes are needed.
 */
export const COMMUNITY_CONFIG = {
  /** Approvals needed for a submission to join the drill pool. */
  approvalsToPublish: 3,
  /** Rejections needed to decline a submission. */
  rejectionsToDecline: 3,
  /** Approvals needed to apply a correction to a live question. */
  approvalsToApplyFix: 3,
  /** Rejections needed to decline a correction. */
  rejectionsToDeclineFix: 3,
  /** "Looks correct" votes needed to clear a flag / dismiss reports. */
  keepVotesToClearFlag: 3,
  /** Open reports needed before a question shows as flagged. */
  reportsToFlag: 1,

  /** Option-count bounds enforced by the submission template. */
  minOptions: 2,
  maxOptions: 6,

  /** Minimum lengths that keep submissions useful (not essays). */
  minPromptLength: 12,
  minExplanationLength: 12,
  minCorrectionReasonLength: 8,
  minRejectionNoteLength: 4,

  /** Local-account rules (mirrors the future hosted-auth rules). */
  usernameMin: 3,
  usernameMax: 16,
  passwordMin: 6,
} as const;
