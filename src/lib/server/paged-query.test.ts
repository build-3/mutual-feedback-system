import { describe, expect, it } from "vitest"

import { fetchPaged, fetchPagedByIds } from "./paged-query"

/**
 * These guard a bug that does not announce itself: PostgREST caps a select at
 * 1000 rows and returns a normal 200 with a short array. The first pulse run
 * scored everyone on a third of their feedback because of it.
 */

type Row = { id: number }

/** A fake builder that serves `total` rows, 1000 at a time, like PostgREST. */
function fakeTable(total: number) {
  let builds = 0
  const build = () => {
    builds++
    return {
      range: async (from: number, to: number) => ({
        data: Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => ({
          id: from + i,
        })),
        error: null,
      }),
    }
  }
  return { build, calls: () => builds }
}

describe("fetchPaged", () => {
  it("returns every row when the table exceeds one page", async () => {
    const table = fakeTable(2874)
    const rows = await fetchPaged<Row>(table.build)
    expect(rows).toHaveLength(2874)
    expect(rows[0].id).toBe(0)
    expect(rows[2873].id).toBe(2873)
  })

  it("stops after one request when the result fits in a page", async () => {
    const table = fakeTable(42)
    expect(await fetchPaged<Row>(table.build)).toHaveLength(42)
    expect(table.calls()).toBe(1)
  })

  it("makes one more request when the total is an exact multiple of the page size", async () => {
    // 1000 rows look identical to "there may be more", so a second, empty page
    // is required to know the read is finished.
    const table = fakeTable(1000)
    expect(await fetchPaged<Row>(table.build)).toHaveLength(1000)
    expect(table.calls()).toBe(2)
  })

  it("handles an empty table", async () => {
    expect(await fetchPaged<Row>(fakeTable(0).build)).toHaveLength(0)
  })

  it("builds a fresh query per page rather than reusing one", async () => {
    // A Supabase builder cannot be re-executed; reusing one returns page 1
    // forever, which would loop until the process died.
    const table = fakeTable(2500)
    await fetchPaged<Row>(table.build)
    expect(table.calls()).toBe(3)
  })

  it("throws rather than silently returning a partial read", async () => {
    await expect(
      fetchPaged<Row>(() => ({
        range: async () => ({ data: null, error: { message: "boom" } }),
      }))
    ).rejects.toThrow(/paged read failed/)
  })
})

describe("fetchPagedByIds", () => {
  it("chunks the id list and returns the union", async () => {
    const seen: string[][] = []
    const ids = Array.from({ length: 380 }, (_, i) => `id-${i}`)

    const rows = await fetchPagedByIds<{ id: string }>((chunk) => {
      seen.push(chunk)
      return {
        range: async (from: number, to: number) => ({
          data: chunk.slice(from, to + 1).map((id) => ({ id })),
          error: null,
        }),
      }
    }, ids)

    // 380 ids at 150 per chunk — three requests, not one 380-id URL.
    expect(seen.map((c) => c.length)).toEqual([150, 150, 80])
    expect(rows).toHaveLength(380)
    expect(new Set(rows.map((r) => r.id)).size).toBe(380)
  })

  it("issues no request for an empty id list", async () => {
    let called = false
    const rows = await fetchPagedByIds<Row>(() => {
      called = true
      return { range: async () => ({ data: [], error: null }) }
    }, [])
    expect(rows).toHaveLength(0)
    expect(called).toBe(false)
  })
})
