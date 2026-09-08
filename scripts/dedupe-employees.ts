/**
 * Merge duplicate employee rows that share an email address.
 *
 * Two insert paths let a roster grow a second row for an address already on it,
 * and once a second row existed the login handler's `maybeSingle()` guard broke
 * and every subsequent sign-in added another. Both paths are fixed; this cleans
 * up what they already created.
 *
 * The oldest row per address wins — it carries the real join date, probation
 * clock and authored history. Everything pointing at a younger duplicate is
 * repointed at the winner, except assignments the winner already has (the
 * (session, intern, reviewer) unique index would reject those, and they are
 * byte-for-byte the same rows), which are dropped.
 *
 * Run with --apply to write. Default is a dry run.
 */
import { readFileSync, writeFileSync } from "fs"
import { resolve } from "path"
import { createClient } from "@supabase/supabase-js"

const envFile = readFileSync(resolve(__dirname, "../.env.local"), "utf-8")
for (const line of envFile.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim()
}

const sb = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Every column that points at employees(id), from supabase/schema.sql.
const REFS: [string, string][] = [
  ["employees", "buddy_id"],
  ["employees", "sponsor_id"],
  ["feedback_submissions", "submitted_by_id"],
  ["feedback_submissions", "feedback_for_id"],
  ["feedback_responses", "responder_id"],
  ["session_assignments", "intern_id"],
  ["session_assignments", "reviewer_id"],
  ["probation_reviews", "reviewer_id"],
  ["kudos", "sender_id"],
  ["kudos_recipients", "recipient_id"],
  ["kudos_boosts", "booster_id"],
  ["mod_reviews", "employee_id"],
  ["mod_responses", "employee_id"],
]

type Emp = { id: string; name: string; email: string | null; is_active: boolean; created_at: string }

async function main() {
  const apply = process.argv.includes("--apply")

  const { data: all, error } = await sb
    .from("employees")
    .select("id, name, email, is_active, created_at")
    .not("email", "is", null)
  if (error) throw new Error(`employees query failed: ${error.message}`)

  const groups = new Map<string, Emp[]>()
  for (const e of (all ?? []) as Emp[]) {
    const key = e.email!.toLowerCase()
    groups.set(key, [...(groups.get(key) ?? []), e])
  }
  const dupes = [...groups.entries()].filter(([, rows]) => rows.length > 1)

  if (!dupes.length) {
    console.log("No duplicated emails. Nothing to do.")
    return
  }

  const backup: Record<string, unknown> = {}

  for (const [email, rows] of dupes) {
    rows.sort((a, b) => a.created_at.localeCompare(b.created_at))
    const [keep, ...drop] = rows
    console.log(`\n=== ${email} — ${rows.length} rows ===`)
    console.log(`KEEP  ${keep.created_at.slice(0, 10)}  ${keep.name}  ${keep.id}`)
    for (const d of drop) console.log(`DROP  ${d.created_at.slice(0, 10)}  ${d.name}  ${d.id}`)

    // Assignments the winner already holds; a duplicate's copy of one of these
    // cannot be repointed without tripping idx_assignment_unique.
    const { data: keepAssigns } = await sb
      .from("session_assignments")
      .select("session_id, reviewer_id")
      .eq("intern_id", keep.id)
    const held = new Set((keepAssigns ?? []).map((a) => `${a.session_id}|${a.reviewer_id}`))

    for (const d of drop) {
      // session_assignments: repoint what is new, delete what is a duplicate.
      const { data: mine } = await sb
        .from("session_assignments")
        .select("id, session_id, reviewer_id, submission_id")
        .eq("intern_id", d.id)
      const redundant = (mine ?? []).filter((a) => held.has(`${a.session_id}|${a.reviewer_id}`) && !a.submission_id)
      const movable = (mine ?? []).filter((a) => !redundant.includes(a))
      backup[`session_assignments:${d.id}`] = mine

      console.log(`  ${d.id.slice(0, 8)}  assignments: ${movable.length} repointed, ${redundant.length} deleted as duplicates`)
      if (apply) {
        if (redundant.length) {
          const { error: e1 } = await sb.from("session_assignments").delete().in("id", redundant.map((a) => a.id))
          if (e1) throw new Error(`assignment delete failed: ${e1.message}`)
        }
        if (movable.length) {
          const { error: e2 } = await sb.from("session_assignments").update({ intern_id: keep.id }).in("id", movable.map((a) => a.id))
          if (e2) throw new Error(`assignment repoint failed: ${e2.message}`)
        }
      }

      // probation_tracking: the winner's clock is the real one; the duplicates
      // restarted it on each accidental signup, so their rows go.
      const { data: prob } = await sb.from("probation_tracking").select("*").eq("employee_id", d.id)
      backup[`probation_tracking:${d.id}`] = prob
      console.log(`  ${d.id.slice(0, 8)}  probation rows deleted: ${prob?.length ?? 0}`)
      if (apply && prob?.length) {
        const { error: e3 } = await sb.from("probation_tracking").delete().eq("employee_id", d.id)
        if (e3) throw new Error(`probation delete failed: ${e3.message}`)
      }

      // Everything else simply moves to the winner.
      for (const [table, col] of REFS) {
        if (table === "session_assignments" && col === "intern_id") continue
        const { data: hits, error: hitErr } = await sb.from(table).select("*").eq(col, d.id)
        if (hitErr || !hits?.length) continue
        backup[`${table}.${col}:${d.id}`] = hits
        console.log(`  ${d.id.slice(0, 8)}  ${table}.${col}: ${hits.length} repointed`)
        if (apply) {
          const { error: e4 } = await sb.from(table).update({ [col]: keep.id }).eq(col, d.id)
          if (e4) throw new Error(`${table}.${col} repoint failed: ${e4.message}`)
        }
      }

      backup[`employees:${d.id}`] = d
      if (apply) {
        const { error: e5 } = await sb.from("employees").delete().eq("id", d.id)
        if (e5) throw new Error(`employee delete failed for ${d.id}: ${e5.message}`)
        console.log(`  ${d.id.slice(0, 8)}  row deleted`)
      }
    }
  }

  const path = resolve(__dirname, `../backups/dedupe-employees-${Date.now()}.json`)
  writeFileSync(path, JSON.stringify(backup, null, 2))
  console.log(`\nAffected rows saved to ${path}`)
  console.log(apply ? "\n=== APPLIED ===" : "\n=== DRY RUN — nothing written. Re-run with --apply ===")
}

main().catch((e) => { console.error(e); process.exit(1) })
