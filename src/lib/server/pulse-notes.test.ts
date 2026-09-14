import { describe, expect, it } from "vitest"

import { rejectionReason, templateNote, type SanitiseContext } from "./pulse-notes"

// The safety filters are the part that must not regress: they are the only
// thing standing between a model draft and an employee's inbox.

const ROSTER = ["Arjun T", "Ronak Vora", "Nishant S Kaushik", "Priya Menon", "Bo Li"]

function ctx(over: Partial<SanitiseContext> = {}): SanitiseContext {
  return {
    rosterNames: ROSTER,
    subjectName: "Ronak Vora",
    verbatim: [],
    // The leadership the note is meant to name.
    allowedNames: ["Arjun T", "Bhavesh Rajesh"],
    ...over,
  }
}

describe("rejectionReason — reviewer anonymity", () => {
  it("still rejects a leadership name when it is not on the allowed list", () => {
    expect(
      rejectionReason("hi ronak — arjun raised this.", ctx({ allowedNames: [] }))
    ).toMatch(/names another teammate/i)
  })

  it("allows a name the note is meant to mention", () => {
    expect(rejectionReason("arjun or bhavesh will reach out.", ctx())).toBeNull()
  })

  it("rejects a draft that names another teammate", () => {
    expect(rejectionReason("hi ronak — nishant mentioned this came up.", ctx())).toMatch(
      /names another teammate/i
    )
  })

  it("allows the subject's own name through", () => {
    expect(rejectionReason("hi ronak — a short heads-up about this cycle.", ctx())).toBeNull()
    expect(rejectionReason("hi Ronak Vora, here is where you stand.", ctx())).toBeNull()
  })

  it("catches a surname as well as a first name", () => {
    expect(rejectionReason("this echoes what menon raised.", ctx())).toMatch(/menon/i)
  })

  it("does not fire on short tokens that collide with ordinary words", () => {
    // "Bo" and "Li" are shorter than the 3-character floor; without it, a note
    // containing "below" or "list" would be rejected for naming Bo Li.
    expect(rejectionReason("your scores sit below the line on this list.", ctx())).toBeNull()
  })

  it("does not fire on a name appearing inside a longer word", () => {
    expect(rejectionReason("this is a voracious appetite for work.", ctx())).toBeNull()
  })
})

describe("rejectionReason — no verbatim quotation", () => {
  const feedback =
    "he often disappears mid sprint and the rest of us pick up the slack without being asked"

  it("rejects a long shared run with written feedback", () => {
    const draft = `a theme this cycle: you often disappears mid sprint and the rest of us pick up the slack.`
    expect(rejectionReason(draft, ctx({ verbatim: [feedback] }))).toMatch(/verbatim/i)
  })

  it("allows a genuine paraphrase", () => {
    const draft = "a couple of people felt follow-through tailed off partway through work."
    expect(rejectionReason(draft, ctx({ verbatim: [feedback] }))).toBeNull()
  })

  it("ignores punctuation and case when comparing", () => {
    const draft = "You Often Disappears, Mid-Sprint! And The Rest Of Us Pick Up the slack."
    expect(rejectionReason(draft, ctx({ verbatim: [feedback] }))).toMatch(/verbatim/i)
  })
})

describe("rejectionReason — shape", () => {
  it("rejects an empty draft", () => {
    expect(rejectionReason("   ", ctx())).toMatch(/empty/i)
  })

  it("rejects an over-long draft", () => {
    const long = Array.from({ length: 200 }, () => "word").join(" ")
    expect(rejectionReason(long, ctx())).toMatch(/too long/i)
  })
})

describe("templateNote — the fallback is always sendable", () => {
  const base = {
    firstName: "Ronak",
    reviewCount: 4,
    coverageExpected: 12,
    reviewsShort: 0,
    strongest: { label: "trust battery", value: 88 },
    weakest: [
      { label: "contribution level", value: 17 },
      { label: "purpose alignment", value: 50 },
    ],
    strengthThemes: ["Creativity"],
    improvementThemes: ["Collaboration"],
    selfReviewFiled: true,
    feedbackUrl: "https://example.test/feedback",
  }

  const buckets = [
    "doing_well",
    "on_the_fence",
    "needs_conversation",
    "not_enough_signal",
  ] as const

  it("produces non-empty prose for every bucket", () => {
    for (const bucket of buckets) {
      const text = templateNote({ ...base, bucket })
      expect(text.trim().length).toBeGreaterThan(40)
      expect(text).toContain("Ronak")
    }
  })

  it("passes its own safety filters for every bucket", () => {
    for (const bucket of buckets) {
      const text = templateNote({ ...base, bucket })
      expect(rejectionReason(text, ctx({ verbatim: ["something a reviewer wrote"] }))).toBeNull()
    }
  })

  it("makes no ask in the doing-well note", () => {
    const text = templateNote({ ...base, bucket: "doing_well" })
    expect(text).not.toMatch(/feedback\?|ask \d|before the next session/i)
    expect(text).toContain("nothing to action")
  })

  it("does not itemise in the needs-a-conversation note", () => {
    const text = templateNote({ ...base, bucket: "needs_conversation" })
    // A heads-up, not a verdict: it names areas but no scores and no counts.
    expect(text).not.toMatch(/\d/)
    expect(text.toLowerCase()).toContain("reach out")
  })

  it("asks for more feedback, not for improvement, when the signal is thin", () => {
    const text = templateNote({ ...base, bucket: "not_enough_signal", reviewCount: 0, reviewsShort: 2 })
    expect(text.toLowerCase()).toContain("not a judgement")
    expect(text).toContain(base.feedbackUrl)
  })

  it("asks for more reviews in the on-the-fence note only when coverage is short", () => {
    const short = templateNote({ ...base, bucket: "on_the_fence", reviewsShort: 2 })
    expect(short).toContain(base.feedbackUrl)
    const covered = templateNote({ ...base, bucket: "on_the_fence", reviewsShort: 0 })
    expect(covered).not.toContain(base.feedbackUrl)
  })
})
