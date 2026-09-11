/** docs/DATABASE.md §19, §24 */
export const REVIEW_FEEDBACK_TYPES = ["COMMENT", "REVISION_REQUEST", "APPROVAL"] as const;

export type ReviewFeedbackType = (typeof REVIEW_FEEDBACK_TYPES)[number];
