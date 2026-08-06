import { describe, expect, it } from "vitest"

import {
  IST_OFFSET_MS,
  cycleFor,
  cycleFromKey,
  cycleKeyOf,
  isInCycle,
  istDateKey,
  istParts,
  listCyclesSince,
  resolveWindow,
  secondTuesdayIstMs,
  secondTuesdayKey,
  shiftCycle,
  upcomingSecondTuesdayMs,
} from "./cycles"

/** Helper: an instant from an IST wall-clock string. */
const ist = (s: string) => Date.parse(`${s}+05:30`)

describe("secondTuesday — the 36-month table", () => {
  // Hand-verified against the real calendar. Covers the two edge shapes:
  //   day 8  (month starts on a Tuesday) — apr-25, jul-25, sep-26, dec-26, jun-27
  //   day 14 (month starts on a Wednesday) — jan-25, oct-25, apr-26, jul-26, sep-27, dec-27
  const TABLE: Record<number, number[]> = {
    2025: [14, 11, 11, 8, 13, 10, 8, 12, 9, 14, 11, 9],
    2026: [13, 10, 10, 14, 12, 9, 14, 11, 8, 13, 10, 8],
    2027: [12, 9, 9, 13, 11, 8, 13, 10, 14, 12, 9, 14],
  }

  for (const [year, days] of Object.entries(TABLE)) {
    it(`matches every month of ${year}`, () => {
      days.forEach((expectedDay, index) => {
        const month = index + 1
        expect(secondTuesdayKey(Number(year), month)).toBe(
          istDateKey(Number(year), month, expectedDay)
        )
      })
    })
  }

  it("always lands between the 8th and the 14th", () => {
    for (let year = 2020; year <= 2035; year++) {
      for (let month = 1; month <= 12; month++) {
        const day = istParts(secondTuesdayIstMs(year, month)).day
        expect(day).toBeGreaterThanOrEqual(8)
        expect(day).toBeLessThanOrEqual(14)
      }
    }
  })

  it("always lands on a Tuesday", () => {
    for (let year = 2020; year <= 2035; year++) {
      for (let month = 1; month <= 12; month++) {
        // Read the weekday back in IST, not host-local.
        const shifted = new Date(secondTuesdayIstMs(year, month) + IST_OFFSET_MS)
        expect(shifted.getUTCDay()).toBe(2)
      }
    }
  })
})

describe("cycleFor", () => {
  it("puts 6 aug 2026 in the 14 jul cycle", () => {
    const c = cycleFor(ist("2026-08-06T10:00:00"))
    expect(c.key).toBe("2026-07-14")
    expect(c.label).toBe("14 jul – 10 aug")
  })

  it("rolls to the new cycle on the 2nd tuesday itself", () => {
    const c = cycleFor(ist("2026-08-11T00:00:00"))
    expect(c.key).toBe("2026-08-11")
    expect(c.label).toBe("11 aug – 7 sep")
  })

  it("keeps early january in december's cycle", () => {
    // The case naive YYYY-MM bucketing always gets wrong.
    expect(cycleFor(ist("2027-01-05T12:00:00")).key).toBe("2026-12-08")
    expect(cycleFor(ist("2027-01-11T23:59:59")).key).toBe("2026-12-08")
    expect(cycleFor(ist("2027-01-12T00:00:00")).key).toBe("2027-01-12")
  })

  it("spans the december cycle across the year boundary", () => {
    const c = cycleFor(ist("2026-12-25T00:00:00"))
    expect(c.key).toBe("2026-12-08")
    expect(c.endMs).toBe(ist("2027-01-12T00:00:00"))
  })

  it("handles february", () => {
    expect(cycleFor(ist("2026-02-09T12:00:00")).key).toBe("2026-01-13")
    expect(cycleFor(ist("2026-02-10T00:00:00")).key).toBe("2026-02-10")
    expect(cycleFor(ist("2026-03-09T12:00:00")).key).toBe("2026-02-10")
  })
})

describe("the boundary instant", () => {
  it("is 18:30Z on the previous UTC day", () => {
    expect(ist("2026-08-11T00:00:00")).toBe(Date.parse("2026-08-10T18:30:00.000Z"))
  })

  it("flips at exactly IST midnight, not a millisecond before", () => {
    expect(cycleFor(Date.parse("2026-08-10T18:29:59.999Z")).key).toBe("2026-07-14")
    expect(cycleFor(Date.parse("2026-08-10T18:30:00.000Z")).key).toBe("2026-08-11")
  })

  it("is half-open — the boundary belongs to the later cycle only", () => {
    const boundary = "2026-08-10T18:30:00.000Z"
    const julyCycle = cycleFromKey("2026-07-14")!
    const augustCycle = cycleFromKey("2026-08-11")!

    expect(isInCycle(boundary, julyCycle)).toBe(false)
    expect(isInCycle(boundary, augustCycle)).toBe(true)

    // Never both, never neither, for any instant across the seam.
    for (let offset = -3; offset <= 3; offset++) {
      const iso = new Date(Date.parse(boundary) + offset).toISOString()
      const hits = [julyCycle, augustCycle].filter((c) => isInCycle(iso, c))
      expect(hits).toHaveLength(1)
    }
  })

  it("makes adjacent cycles exactly contiguous", () => {
    const july = cycleFromKey("2026-07-14")!
    expect(july.endMs).toBe(shiftCycle(july, 1).startMs)
  })
})

describe("istParts agrees with Intl", () => {
  it("matches Asia/Kolkata over thousands of instants", () => {
    // Proves the fixed-offset shortcut, and documents why the Intl round-trip
    // that getISTDate used was safe to drop.
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    const start = Date.parse("2020-01-01T00:00:00Z")
    const end = Date.parse("2030-01-01T00:00:00Z")
    const step = Math.floor((end - start) / 2000)

    for (let at = start; at < end; at += step) {
      const parts = fmt.formatToParts(new Date(at))
      const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
      const mine = istParts(at)
      expect([mine.year, mine.month, mine.day]).toEqual([
        get("year"),
        get("month"),
        get("day"),
      ])
    }
  })
})

describe("cycleFromKey", () => {
  it("round-trips a real cycle key", () => {
    const c = cycleFromKey("2026-07-14")
    expect(c?.startMs).toBe(ist("2026-07-14T00:00:00"))
    expect(c?.endMs).toBe(ist("2026-08-11T00:00:00"))
  })

  it("rejects malformed and non-cycle keys instead of returning NaN", () => {
    // A NaN window makes every comparison false, which silently filters out
    // everything while still looking like a success. Must be null, not NaN.
    for (const bad of [
      "not-a-date",
      "",
      "2026-07",
      "2026-07-1",
      "2026-13-14",
      "2026-07-15", // a real date, but a Wednesday — not a cycle boundary
      "2026-07-07",
    ]) {
      expect(cycleFromKey(bad), bad).toBeNull()
    }
  })
})

describe("resolveWindow", () => {
  const at = ist("2026-08-06T10:00:00")

  it("returns null for all-time", () => {
    expect(resolveWindow("all", null, at)).toBeNull()
  })

  it("scopes cycle to the containing cycle", () => {
    const w = resolveWindow("cycle", null, at)!
    expect(w.startMs).toBe(ist("2026-07-14T00:00:00"))
    expect(w.endMs).toBe(ist("2026-08-11T00:00:00"))
  })

  it("scopes 3cycles to the anchor plus the two before it", () => {
    const w = resolveWindow("3cycles", null, at)!
    expect(w.startMs).toBe(ist("2026-05-12T00:00:00"))
    expect(w.endMs).toBe(ist("2026-08-11T00:00:00"))
  })

  it("honours an explicit historical cycle key", () => {
    const w = resolveWindow("cycle", "2026-06-09", at)!
    expect(w.startMs).toBe(ist("2026-06-09T00:00:00"))
    expect(w.endMs).toBe(ist("2026-07-14T00:00:00"))
  })

  it("falls back to the current cycle on a bad key rather than NaN", () => {
    const w = resolveWindow("cycle", "not-a-date", at)!
    expect(Number.isNaN(w.startMs)).toBe(false)
    expect(w.startMs).toBe(ist("2026-07-14T00:00:00"))
  })

  it("is cycle-aligned, so the window does not drift day to day", () => {
    const a = resolveWindow("3cycles", null, ist("2026-08-06T10:00:00"))!
    const b = resolveWindow("3cycles", null, ist("2026-08-09T23:00:00"))!
    expect(a.startMs).toBe(b.startMs)
    expect(a.endMs).toBe(b.endMs)
  })
})

describe("shiftCycle", () => {
  it("steps back and forward without drifting", () => {
    const august = cycleFromKey("2026-08-11")!
    expect(shiftCycle(august, -1).key).toBe("2026-07-14")
    expect(shiftCycle(august, 1).key).toBe("2026-09-08")
    expect(shiftCycle(shiftCycle(august, -6), 6).key).toBe("2026-08-11")
  })

  it("crosses the year boundary in both directions", () => {
    expect(shiftCycle(cycleFromKey("2027-01-12")!, -1).key).toBe("2026-12-08")
    expect(shiftCycle(cycleFromKey("2026-12-08")!, 1).key).toBe("2027-01-12")
  })
})

describe("cycleKeyOf", () => {
  it("buckets stored UTC timestamps into cycles", () => {
    // A submission just after IST midnight is still the *previous* UTC day —
    // the exact case a created_at.slice(0,7) bucket gets wrong.
    expect(cycleKeyOf("2026-08-10T19:00:00.000Z")).toBe("2026-08-11")
    expect(cycleKeyOf("2026-08-10T18:00:00.000Z")).toBe("2026-07-14")
    expect(cycleKeyOf("2026-07-20T06:00:00.000Z")).toBe("2026-07-14")
  })
})

describe("upcomingSecondTuesdayMs", () => {
  it("returns today when today is the 2nd tuesday", () => {
    expect(upcomingSecondTuesdayMs(ist("2026-08-11T09:00:00"))).toBe(
      ist("2026-08-11T00:00:00")
    )
  })

  it("returns this month's when it is still ahead", () => {
    expect(upcomingSecondTuesdayMs(ist("2026-08-06T09:00:00"))).toBe(
      ist("2026-08-11T00:00:00")
    )
  })

  it("rolls to next month once it has passed", () => {
    expect(upcomingSecondTuesdayMs(ist("2026-08-12T09:00:00"))).toBe(
      ist("2026-09-08T00:00:00")
    )
  })

  it("crosses the year boundary", () => {
    expect(upcomingSecondTuesdayMs(ist("2026-12-20T09:00:00"))).toBe(
      ist("2027-01-12T00:00:00")
    )
  })
})

describe("listCyclesSince", () => {
  it("lists newest first, inclusive of both ends", () => {
    const keys = listCyclesSince(
      ist("2026-06-20T00:00:00"),
      ist("2026-08-06T00:00:00")
    ).map((c) => c.key)
    expect(keys).toEqual(["2026-07-14", "2026-06-09"])
  })

  it("terminates on a nonsense range instead of spinning", () => {
    expect(
      listCyclesSince(ist("2026-09-01T00:00:00"), ist("2026-08-06T00:00:00"))
    ).toEqual([])
  })
})
