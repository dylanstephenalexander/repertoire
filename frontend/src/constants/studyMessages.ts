export const STUDY_REJECTION_MESSAGES = {
  first_wrong_move: [
    "That's not quite right. Try again.",
    "Not the right move here.",
    "Hmm, not that one. Try again.",
  ],
  same_wrong_move: [
    "Nope. You tried that last time, remember?",
    "Still not that one.",
    "You played that already — it won't work.",
  ],
  distinct_wrong_move: [
    "Not that one either.",
    "Nope, try again.",
    "That's not it either.",
  ],
} as const;

export type RejectionMessageKey = keyof typeof STUDY_REJECTION_MESSAGES;
