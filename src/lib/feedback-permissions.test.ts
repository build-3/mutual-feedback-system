import { describe, it, expect } from "vitest"
import {
  canRespondToFeedback,
  isNonParticipantReply,
} from "./feedback-permissions"

const AUTHOR = "11111111-1111-1111-1111-111111111111"
const TARGET = "22222222-2222-2222-2222-222222222222"
const MOD = "33333333-3333-3333-3333-333333333333"
const STRANGER = "44444444-4444-4444-4444-444444444444"

/** A peer submission: author reviews target. */
const peer = {
  submittedById: AUTHOR,
  feedbackForId: TARGET,
  feedbackType: "full_timer" as const,
}

/** An org submission: the studio is the subject, so feedback_for_id is NULL. */
const org = {
  submittedById: AUTHOR,
  feedbackForId: null,
  feedbackType: "build3" as const,
}

describe("canRespondToFeedback — participants", () => {
  it("lets the author reply to their own submission", () => {
    expect(canRespondToFeedback({ ...peer, responderId: AUTHOR })).toBe(true)
    expect(canRespondToFeedback({ ...org, responderId: AUTHOR })).toBe(true)
  })

  it("lets the person the feedback is about reply", () => {
    expect(canRespondToFeedback({ ...peer, responderId: TARGET })).toBe(true)
  })

  it("refuses an unrelated employee", () => {
    expect(canRespondToFeedback({ ...peer, responderId: STRANGER })).toBe(false)
    expect(canRespondToFeedback({ ...org, responderId: STRANGER })).toBe(false)
  })

  it("does not treat a null feedback_for_id as a match", () => {
    // The bug this guards: `responderId === feedbackForId` is false for a real
    // id, but a null-vs-null comparison would hand every org submission to
    // anyone at all.
    expect(
      canRespondToFeedback({
        submittedById: AUTHOR,
        feedbackForId: null,
        feedbackType: "build3",
        responderId: null as unknown as string,
      })
    ).toBe(false)
  })
})

describe("canRespondToFeedback — org moderator scope", () => {
  it("lets a moderator reply to build3 feedback", () => {
    expect(
      canRespondToFeedback({ ...org, responderId: MOD, isOrgModerator: true })
    ).toBe(true)
  })

  it("does NOT let a moderator into peer feedback", () => {
    // The whole point of the scope: br@ is an intern with console access, not a
    // licence to join private one-to-one threads.
    expect(
      canRespondToFeedback({ ...peer, responderId: MOD, isOrgModerator: true })
    ).toBe(false)
  })

  it("does NOT let a moderator into self-reflections", () => {
    expect(
      canRespondToFeedback({
        submittedById: AUTHOR,
        feedbackForId: null,
        feedbackType: "self",
        responderId: MOD,
        isOrgModerator: true,
      })
    ).toBe(false)
  })

  it("does NOT let a moderator into adhoc notes", () => {
    expect(
      canRespondToFeedback({
        submittedById: AUTHOR,
        feedbackForId: TARGET,
        feedbackType: "adhoc",
        responderId: MOD,
        isOrgModerator: true,
      })
    ).toBe(false)
  })

  it("grants nothing when the moderator flag is absent", () => {
    expect(canRespondToFeedback({ ...org, responderId: MOD })).toBe(false)
  })
})

describe("canRespondToFeedback — admin", () => {
  it("lets an admin reply to any type", () => {
    for (const feedbackType of ["full_timer", "intern", "build3", "self", "adhoc"]) {
      expect(
        canRespondToFeedback({
          submittedById: AUTHOR,
          feedbackForId: TARGET,
          feedbackType,
          responderId: STRANGER,
          isAdmin: true,
        }),
        feedbackType
      ).toBe(true)
    }
  })
})

describe("isNonParticipantReply", () => {
  it("is false for either participant", () => {
    expect(isNonParticipantReply({ responderId: AUTHOR, ...peer })).toBe(false)
    expect(isNonParticipantReply({ responderId: TARGET, ...peer })).toBe(false)
  })

  it("is true for a moderator or admin acting officially", () => {
    expect(isNonParticipantReply({ responderId: MOD, ...org })).toBe(true)
    expect(isNonParticipantReply({ responderId: STRANGER, ...peer })).toBe(true)
  })
})
