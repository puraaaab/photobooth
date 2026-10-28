/**
 * Booth personality microcopy system.
 * Used sparingly — in small moments, not constantly.
 * The application should feel like a cool photobooth, not a chatbot.
 */

export const boothCopy = {
  photoSelection: {
    first:    '1 picked.',
    fewMore:  "Keep going.",
    getting:  "Okay, we're getting somewhere.",
    nicePicks: "Nice picks.",
    allIn:    "That's the whole roll.",
  },

  editing: {
    filterChanged: "That works.",
    monoApplied:   "Oh, classy.",
    vintageApplied: "Okay, film nerd.",
    filmApplied:   "Little film moment.",
    originalReset: "Back to basics.",
    adjusted:      "Dial it in.",
    textAdded:     "Make it yours.",
  },

  completion: [
    "Yep. That's the one.",
    "That's a wrap.",
    "Ready to print.",
  ],

  loading: {
    developing:  "Developing...",
    exporting:   "Making the final one...",
    printing:    "Printer's warming up...",
    waiting:     "Waiting for the camera...",
    connecting:  "Looking for the camera...",
  },

  empty: {
    noPhotos:    "No shots yet.",
    noSelection: "Pick a few.\nThe good stuff is waiting.",
    noPrinter:   "Printer's missing.\nCheck the connection.",
  },

  final: {
    wrapHeading: "THAT'S A WRAP.",
    newSession:  "Fresh roll.",
    grabStrips:  "Go grab your strips.",
  },

  actions: {
    print:       "PRINT THIS",
    useThese:    "USE THESE",
    loadMore:    "Load demo",
    selectPhotos: "SELECT PHOTOS",
  },
} as const
