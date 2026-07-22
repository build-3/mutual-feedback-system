#!/usr/bin/env node
/**
 * Import the "Build3 review mastersheet 2026" spreadsheet into Supabase,
 * backing the hidden /mod dashboard.
 *
 *   node scripts/import-mastersheet.mjs "/path/to/Build3 review mastersheet_2026 .xlsm"
 *
 * Snapshot-replace: both mod_reviews and mod_responses are cleared and
 * re-inserted on every run, so re-running after the sheet changes yields a
 * clean refresh. Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL
 * in .env.local, and the mod_* tables to already exist (see supabase/mod-tables.sql).
 */
import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"
import { createRequire } from "module"
import { createClient } from "@supabase/supabase-js"

const require = createRequire(import.meta.url)
const XLSX = require("xlsx") // CommonJS module — namespace import doesn't expose readFile
const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env.local (same minimal loader as scripts/announce-broadcast.ts)
const envFile = readFileSync(resolve(__dirname, "../.env.local"), "utf-8")
for (const line of envFile.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match && !process.env[match[1].trim()]) process.env[match[1].trim()] = match[2].trim()
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""

const DEFAULT_PATH = "/Users/arjun/Downloads/Build3 review mastersheet_2026 .xlsm"
const XLSX_PATH = process.argv[2] || DEFAULT_PATH

// The 8 categorized department sheets (Summary + Raw Data handled separately)
const DEPARTMENT_SHEETS = [
  "Poshan & CoHub",
  "Hiring & Team",
  "Equipment & Tools",
  "Ownership",
  "KT & Onboarding",
  "Fundraising",
  "Culture & Alignment",
  "Meetings & Systems",
]

const clean = (v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : v)
const isRealName = (v) => typeof v === "string" && clean(v).length > 0
const normName = (v) => (typeof v === "string" ? v.toLowerCase().replace(/\s+/g, " ").trim() : "")

function toNumber(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ""))
    return Number.isFinite(n) ? n : null
  }
  return null
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")
    process.exit(1)
  }

  const wb = XLSX.readFile(XLSX_PATH, { cellDates: true })
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  // Best-effort name -> employee_id map (nullable; leave null on miss)
  const { data: employees, error: empErr } = await supabase
    .from("employees")
    .select("id, name")
  if (empErr) {
    console.error("Could not read employees:", empErr.message)
    process.exit(1)
  }
  const empByName = new Map((employees ?? []).map((e) => [normName(e.name), e.id]))
  const resolveEmp = (name) => empByName.get(normName(name)) ?? null

  // ── mod_reviews: 8 category sheets ────────────────────────────────
  const reviews = []
  for (const dept of DEPARTMENT_SHEETS) {
    const ws = wb.Sheets[dept]
    if (!ws) {
      console.warn(`  ! sheet not found: ${dept}`)
      continue
    }
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
    // Header row is the one containing "Employee"; data follows it.
    const hdr = rows.findIndex((r) => Array.isArray(r) && r.some((c) => clean(c) === "Employee"))
    if (hdr === -1) {
      console.warn(`  ! no header row in ${dept}`)
      continue
    }
    for (const r of rows.slice(hdr + 1)) {
      if (!Array.isArray(r) || !isRealName(r[0])) continue
      const name = clean(r[0])
      reviews.push({
        department: dept,
        employee_name: name,
        employee_id: resolveEmp(name),
        period: clean(r[1]) || null,
        topic: clean(r[2]) || null,
        review: clean(r[3]) || null,
        severity: toNumber(r[4]),
      })
    }
  }

  // ── mod_responses: Raw Data ───────────────────────────────────────
  const responses = []
  let npsAnomalies = 0
  let skippedRows = 0
  const rawWs = wb.Sheets["Raw Data"]
  const rawRows = XLSX.utils.sheet_to_json(rawWs, { header: 1, defval: null })
  // Row 0 is the header (Name, Policy clarity, Tools, Trust Battery %, ...)
  rawRows.slice(1).forEach((r, i) => {
    if (!Array.isArray(r)) return
    if (!isRealName(r[0])) {
      // Drops junk rows where Name is empty or a stray datetime cell.
      if (r[0] != null && r[0] !== "") skippedRows++
      return
    }
    // Column 5 ("NPS Score") is mostly dates in this sheet, not NPS numbers.
    let nps = null
    if (r[5] instanceof Date) {
      npsAnomalies++
    } else {
      const n = toNumber(r[5])
      if (n !== null && n >= 0 && n <= 100) nps = n
      else if (r[5] != null) npsAnomalies++
    }
    const name = clean(r[0])
    responses.push({
      employee_name: name,
      employee_id: resolveEmp(name),
      policy_clarity: clean(r[1]) || null,
      tools_resources: clean(r[2]) || null,
      trust_battery: toNumber(r[3]),
      trust_battery_details: clean(r[4]) || null,
      nps_score: nps,
      comments: clean(r[6]) || null,
      source_row: i + 2, // 1-based spreadsheet row (header is row 1)
    })
  })

  console.log(`Parsed ${reviews.length} reviews, ${responses.length} responses.`)
  console.log(`  NPS anomalies (non-numeric / dates, stored null): ${npsAnomalies}`)
  console.log(`  Skipped junk rows (invalid name): ${skippedRows}`)

  // ── Snapshot-replace ──────────────────────────────────────────────
  for (const [table, rowsToInsert] of [["mod_reviews", reviews], ["mod_responses", responses]]) {
    const { error: delErr } = await supabase.from(table).delete().not("id", "is", null)
    if (delErr) {
      console.error(`\nFailed to clear ${table}: ${delErr.message}`)
      if (/does not exist|relation/i.test(delErr.message)) {
        console.error(`\n>>> Run supabase/mod-tables.sql in the Supabase SQL editor first, then re-run this script.`)
      }
      process.exit(1)
    }
    const { error: insErr } = await supabase.from(table).insert(rowsToInsert)
    if (insErr) {
      console.error(`Failed to insert into ${table}: ${insErr.message}`)
      process.exit(1)
    }
    console.log(`  ✓ ${table}: ${rowsToInsert.length} rows`)
  }

  console.log("\nDone.")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
