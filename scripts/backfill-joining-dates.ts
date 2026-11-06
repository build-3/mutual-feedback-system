/**
 * One-time backfill of real joining dates onto probation clocks.
 *
 * Probation currently starts on the day someone first opened the platform, not
 * the day they joined. Bikram holds the real dates. Give this his list as a CSV
 * (header: email,name,joined_on with dates as YYYY-MM-DD) and it shows exactly
 * what would change.
 *
 *   npx tsx scripts/backfill-joining-dates.ts dates.csv            # dry run, writes nothing
 *   npx tsx scripts/backfill-joining-dates.ts dates.csv --apply    # writes, with an audit row each
 *
 * Rules, all enforced in src/lib/joining-date-backfill.ts:
 *  - a row applies only if its email AND full name both match one active person;
 *  - nothing is guessed: bad dates, unknown emails, name mismatches and people
 *    with no open probation are listed and left alone;
 *  - the end date is recomputed from the stored period (3 or 6 months);
 *  - every applied change is recorded in probation_date_changes first, so if
 *    that table is missing (supabase/probation-alerts-and-dates.sql not applied)
 *    nothing is written.
 *
 * Needs .env.local with SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and
 * SUPABASE_SERVICE_ROLE_KEY. Run it against the database you mean to change.
 */
import { readFileSync } from "fs"
import { basename, resolve } from "path"
import { createClient } from "@supabase/supabase-js"
import {
  parseBackfillCsv,
  planBackfill,
  type BackfillEmployee,
  type BackfillProbation,
} from "../src/lib/joining-date-backfill"

try {
  const envFile = readFileSync(resolve(__dirname, "../.env.local"), "utf-8")
  for (const line of envFile.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, "")
  }
} catch {
  // env may already be set in the shell
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const sb = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY || "", {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  const file = process.argv[2]
  const apply = process.argv.includes("--apply")
  if (!file || file.startsWith("--")) {
    console.error("usage: npx tsx scripts/backfill-joining-dates.ts <dates.csv> [--apply]")
    process.exit(1)
  }
  if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Supabase URL or service role key is missing from the environment.")
    process.exit(1)
  }

  const { rows, error: csvError } = parseBackfillCsv(readFileSync(resolve(file), "utf-8"))
  if (csvError) {
    console.error(`Cannot read ${file}: ${csvError}`)
    process.exit(1)
  }

  const [{ data: emps, error: e1 }, { data: probs, error: e2 }] = await Promise.all([
    sb.from("employees").select("id, name, email").eq("is_active", true),
    sb
      .from("probation_tracking")
      .select("id, employee_id, start_date, end_date, duration_months, status")
      .in("status", ["active", "extended"]),
  ])
  if (e1 || e2) throw new Error(`read failed: ${e1?.message ?? e2?.message}`)

  const employees: BackfillEmployee[] = (emps ?? []) as BackfillEmployee[]
  const probations: BackfillProbation[] = (probs ?? []).map((p) => ({
    id: p.id,
    employeeId: p.employee_id,
    startDate: p.start_date,
    endDate: p.end_date,
    durationMonths: p.duration_months,
    status: p.status,
  }))

  const items = planBackfill({ inputs: rows, employees, probations })
  const changes = items.flatMap((i) => (i.kind === "change" ? [i] : []))
  const unchanged = items.filter((i) => i.kind === "unchanged")
  const problems = items.flatMap((i) => (i.kind === "problem" ? [i] : []))

  console.log(`\n${rows.length} rows in ${file}. ${apply ? "APPLYING" : "DRY RUN (nothing is written)"}\n`)

  console.log(`WILL CHANGE (${changes.length})`)
  for (const c of changes) {
    console.log(`  ${c.name.padEnd(28)} start ${c.oldStart} -> ${c.newStart}   end ${c.oldEnd} -> ${c.newEnd}`)
  }
  console.log(`\nALREADY CORRECT (${unchanged.length})`)
  for (const u of unchanged) console.log(`  ${u.name}  ${u.date}`)
  console.log(`\nNOT APPLIED, NEEDS A HUMAN (${problems.length})`)
  for (const p of problems) console.log(`  ${(p.name || "(no name)").padEnd(28)} ${p.email || "(no email)"}  ${p.reason}`)

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to write the changes above.")
    return
  }

  const source = `backfill: ${basename(file)}`
  let done = 0
  for (const c of changes) {
    // Audit first. If this fails, the date is not touched.
    const { error: auditError } = await sb.from("probation_date_changes" as never).insert({
      probation_id: c.probationId,
      old_start_date: c.oldStart,
      new_start_date: c.newStart,
      old_end_date: c.oldEnd,
      new_end_date: c.newEnd,
      source,
      changed_by: null,
    } as never)
    if (auditError) {
      console.error(`\nStopped at ${c.name}: could not write the audit row (${auditError.message}).`)
      console.error("Has supabase/probation-alerts-and-dates.sql been applied? Nothing further was changed.")
      process.exit(1)
    }
    const { error } = await sb
      .from("probation_tracking")
      .update({ start_date: c.newStart, end_date: c.newEnd, updated_at: new Date().toISOString() })
      .eq("id", c.probationId)
      .in("status", ["active", "extended"])
    if (error) {
      console.error(`\nFailed for ${c.name}: ${error.message}. Stopping.`)
      process.exit(1)
    }
    done++
  }
  console.log(`\nApplied ${done} of ${changes.length} changes. ${problems.length} rows still need a human.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
