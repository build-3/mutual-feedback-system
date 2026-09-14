import "server-only"

/**
 * Paged and chunked Supabase reads.
 *
 * PostgREST caps a select at 1000 rows and says nothing about it: the response
 * is an ordinary 200 carrying a short array. Nothing errors, nothing warns, and
 * the caller computes on whatever fraction arrived.
 *
 * This is not hypothetical here. The first pulse run scored 30 people on about
 * a third of their feedback — a three-cycle window needs ~2,900
 * `feedback_answers` rows — and reported the result as fact, including one
 * teammate shown as "not enough signal" who in truth had enough feedback and it
 * was bad. `getProbationOverview` had the same cap on the data behind promotion
 * and extension decisions.
 *
 * Any select on a table that grows with usage — feedback_answers,
 * feedback_submissions, session_assignments, feedback_responses — must go
 * through one of these rather than a bare `.select()`.
 */

const PAGE_SIZE = 1000

/**
 * Chunk size for `.in(column, ids)` filters. PostgREST reads them from the
 * query string, and 230 UUIDs already make an ~8KB URL.
 */
const ID_CHUNK = 150

type Rangeable = {
  range: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>
}

/**
 * Read every row a query matches, a page at a time.
 *
 * `build` is called once per page and must return a fresh builder — a Supabase
 * query builder cannot be re-executed, so reusing one silently returns the
 * first page forever.
 *
 * Give the query a stable `.order()`. Without one, row order between pages is
 * unspecified and paging can both duplicate and skip rows.
 */
export async function fetchPaged<T>(build: () => Rangeable): Promise<T[]> {
  const rows: T[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await build().range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(`paged read failed: ${JSON.stringify(error)}`)
    const page = (data ?? []) as T[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

/** `fetchPaged` for an `.in(column, ids)` filter, chunking the id list too. */
export async function fetchPagedByIds<T>(
  build: (ids: string[]) => Rangeable,
  ids: string[]
): Promise<T[]> {
  const rows: T[] = []
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    rows.push(...(await fetchPaged<T>(() => build(ids.slice(i, i + ID_CHUNK)))))
  }
  return rows
}
