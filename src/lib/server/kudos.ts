import "server-only"

import { getSupabaseAdmin } from "./supabase-admin"

export type KudosRow = {
  id: string
  sender_id: string
  message: string
  gif_url: string | null
  created_at: string
}

/**
 * Persist a kudos and its recipients in a best-effort transaction.
 * Returns the inserted kudos row, or throws on failure.
 */
export async function persistKudos(
  senderId: string,
  recipientIds: string[],
  message: string,
  gifUrl: string | null,
): Promise<KudosRow> {
  const supabaseAdmin = getSupabaseAdmin()

  const { data: kudos, error: kudosError } = await supabaseAdmin
    .from("kudos" as never)
    .insert({ sender_id: senderId, message, gif_url: gifUrl } as never)
    .select("id, sender_id, message, gif_url, created_at")
    .single()

  if (kudosError || !kudos) {
    throw new Error(`Failed to insert kudos: ${kudosError?.message ?? "unknown"}`)
  }

  const row = kudos as unknown as KudosRow

  const recipientRows = recipientIds.map((id) => ({
    kudos_id: row.id,
    recipient_id: id,
  }))

  const { error: recError } = await supabaseAdmin
    .from("kudos_recipients" as never)
    .insert(recipientRows as never)

  if (recError) {
    // Best-effort cleanup if recipient insert fails.
    await supabaseAdmin.from("kudos" as never).delete().eq("id", row.id)
    throw new Error(`Failed to insert kudos recipients: ${recError.message}`)
  }

  return row
}

/**
 * For a given recipient, return up to `limit` names of other employees who
 * have *previously* sent kudos to them (most recent first, distinct),
 * plus the total count of distinct senders beyond `limit`.
 */
export async function getPreviousGiversForRecipient(
  recipientId: string,
  excludeSenderId: string,
  limit = 3,
): Promise<{ names: string[]; extraCount: number }> {
  const supabaseAdmin = getSupabaseAdmin()

  // Fetch kudos_id rows for this recipient
  const { data: links } = await supabaseAdmin
    .from("kudos_recipients" as never)
    .select("kudos_id")
    .eq("recipient_id", recipientId)

  const kudosIds = ((links as unknown as { kudos_id: string }[] | null) ?? []).map((l) => l.kudos_id)
  if (kudosIds.length === 0) return { names: [], extraCount: 0 }

  const { data: senders } = await supabaseAdmin
    .from("kudos" as never)
    .select("sender_id, created_at")
    .in("id", kudosIds)
    .order("created_at", { ascending: false })

  const senderRows = (senders as unknown as { sender_id: string; created_at: string }[] | null) ?? []

  // Distinct sender IDs in order, excluding the current sender
  const distinct: string[] = []
  const seen = new Set<string>()
  for (const r of senderRows) {
    if (r.sender_id === excludeSenderId) continue
    if (seen.has(r.sender_id)) continue
    seen.add(r.sender_id)
    distinct.push(r.sender_id)
  }

  if (distinct.length === 0) return { names: [], extraCount: 0 }

  const idsToFetch = distinct.slice(0, limit)
  const { data: emps } = await supabaseAdmin
    .from("employees")
    .select("id, name")
    .in("id", idsToFetch)

  const nameMap = new Map(((emps as unknown as { id: string; name: string }[] | null) ?? []).map((e) => [e.id, e.name]))
  const names = idsToFetch.map((id) => nameMap.get(id) ?? "someone")
  const extraCount = Math.max(0, distinct.length - limit)
  return { names, extraCount }
}

/**
 * Returns the top `limit` recipients by total kudos count.
 */
export async function getTopRecipients(
  limit = 3,
  sinceDays?: number,
): Promise<{ employee_id: string; employee_name: string; count: number }[]> {
  const supabaseAdmin = getSupabaseAdmin()

  let kudosIds: string[] | null = null
  if (sinceDays && sinceDays > 0) {
    const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString()
    const { data } = await supabaseAdmin
      .from("kudos" as never)
      .select("id")
      .gte("created_at", cutoff)
    kudosIds = ((data as unknown as { id: string }[] | null) ?? []).map((r) => r.id)
    if (kudosIds.length === 0) return []
  }

  let query = supabaseAdmin
    .from("kudos_recipients" as never)
    .select("recipient_id")

  if (kudosIds) query = query.in("kudos_id", kudosIds)

  const { data: links } = await query

  const rows = (links as unknown as { recipient_id: string }[] | null) ?? []
  const counts = new Map<string, number>()
  for (const r of rows) {
    counts.set(r.recipient_id, (counts.get(r.recipient_id) ?? 0) + 1)
  }

  const sorted = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)

  if (sorted.length === 0) return []

  const ids = sorted.map(([id]) => id)
  const { data: emps } = await supabaseAdmin
    .from("employees")
    .select("id, name")
    .in("id", ids)

  const nameMap = new Map(((emps as unknown as { id: string; name: string }[] | null) ?? []).map((e) => [e.id, e.name]))

  return sorted.map(([id, count]) => ({
    employee_id: id,
    employee_name: nameMap.get(id) ?? "Unknown",
    count,
  }))
}
