#!/usr/bin/env node

// Stress test: 50 submitters x 5 targets = 250 concurrent full_timer feedback submissions
// Usage: node scripts/stress-test.mjs [base_url]

const BASE = process.argv[2] || "http://localhost:3000"
const API = `${BASE}/api/public/feedback-submit`

// 5 targets (Arjun + 4 others)
const TARGETS = [
  { id: "5e334cee-a68b-4cf8-aa6b-5ed17881db4f", name: "Arjun" },
  { id: "68226c00-8011-472c-bd1b-aceac98e1d02", name: "Varun" },
  { id: "ee162d6b-7c4a-4858-b1b7-dd141aa8333d", name: "Prajwal" },
  { id: "e7f919ab-9445-43e9-9f61-080ae63dc140", name: "Neha" },
  { id: "0af122e1-37de-4a0c-9a31-1d889409114d", name: "Girish Sampath" },
]

// 18 employees as submitters — we'll cycle through them
const SUBMITTERS = [
  "138bcabf-9440-4e8a-8c38-130269437e56", // Allya
  "4a421a19-156c-4b0d-a6e6-446d67653184", // Aniket
  "5e334cee-a68b-4cf8-aa6b-5ed17881db4f", // Arjun
  "f3e1ea6c-5b0c-4cf1-9016-ab073494cd8c", // Ashwini
  "863a05aa-cd0c-4a3f-bf29-15cd7e86fe26", // Charlez
  "0af122e1-37de-4a0c-9a31-1d889409114d", // Girish
  "ede8e7cd-579a-4108-b7e4-c0ecee448f00", // Kaustubh
  "1a305ff4-4029-4db2-9132-78e7148765f7", // Nadim
  "54757a64-93a9-4b53-afae-9907b109efa6", // Naman
  "e7f919ab-9445-43e9-9f61-080ae63dc140", // Neha
  "c2a673fb-952c-492e-a0f9-319bed659641", // Omprakash
  "ee162d6b-7c4a-4858-b1b7-dd141aa8333d", // Prajwal
  "d62629a4-6928-4746-afad-24db92f187aa", // Sanya
  "376f9caa-259a-408f-9a01-dbe67b6b56ca", // Sarthak
  "bdb0ee0a-8ca9-484f-aa69-7078297b1479", // Shyamal
  "9ee7c3c0-8067-4b30-8c65-47170873df7a", // Umair
  "68226c00-8011-472c-bd1b-aceac98e1d02", // Varun
  "67b7da7f-db9c-40a6-9b56-59839acab2ee", // Vijay
]

const TEAL_SCORES = ["3", "4", "5", "4", "3"]
const CONTRIB_LEVELS = ["A", "B", "C", "D"]
const VALUES = [
  "We build big, beautiful things and we do it with care.",
  "Community is gold. We mine it together.",
  "We back builders who want to make a real dent.",
  "We stay curious so we can keep growing.",
]
const FEEDBACK_TEXTS = [
  "Shows great initiative and follow-through on projects.",
  "Solid communicator, keeps the team aligned.",
  "Strong technical skills, always willing to help others.",
  "Brings energy to every standup, keeps morale high.",
  "Needs to delegate more but otherwise excellent.",
  "Reliable and consistent, a real team anchor.",
  "Great at breaking down complex problems.",
  "Could improve on documentation but delivers well.",
]

function buildFullTimerAnswers(i) {
  return [
    { question_key: "teal_self_management", question_text: "Teal - Self-Management", answer_value: TEAL_SCORES[i % 5] },
    { question_key: "teal_wholeness", question_text: "Teal - Wholeness", answer_value: TEAL_SCORES[(i + 1) % 5] },
    { question_key: "teal_evolutionary_purpose", question_text: "Teal - Evolutionary Purpose", answer_value: TEAL_SCORES[(i + 2) % 5] },
    { question_key: "purpose_alignment", question_text: "Purpose alignment", answer_value: String((i % 5) + 1) },
    { question_key: "trust_battery", question_text: "Trust battery", answer_value: String(40 + (i % 6) * 10) },
    { question_key: "contribution_level", question_text: "Contribution level", answer_value: CONTRIB_LEVELS[i % 4] },
    { question_key: "value_strength", question_text: "Value strength", answer_value: VALUES[i % 4] },
    { question_key: "value_improvement", question_text: "Value improvement", answer_value: VALUES[(i + 2) % 4] },
    { question_key: "constructive_feedback", question_text: "Constructive feedback", answer_value: FEEDBACK_TEXTS[i % 8] },
  ]
}

async function submitOne(submitterId, targetId, index) {
  const start = Date.now()
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        submittedById: submitterId,
        feedbackForId: targetId,
        feedbackType: "full_timer",
        answers: buildFullTimerAnswers(index),
      }),
    })
    const elapsed = Date.now() - start
    const body = await res.json()
    return { index, status: res.status, ok: res.ok, elapsed, error: body.error || null }
  } catch (err) {
    return { index, status: 0, ok: false, elapsed: Date.now() - start, error: err.message }
  }
}

async function main() {
  console.log("=== STRESS TEST: 250 concurrent full_timer feedback submissions ===")
  console.log(`    5 targets x 50 submitters each`)
  console.log(`    Target: ${API}\n`)

  // Warm up
  console.log("Phase 1: Warm-up...")
  const warmStart = Date.now()
  const warmRes = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      submittedById: SUBMITTERS[0],
      feedbackForId: TARGETS[0].id,
      feedbackType: "full_timer",
      answers: buildFullTimerAnswers(0),
    }),
  })
  console.log(`  Warm-up: ${Date.now() - warmStart}ms (status ${warmRes.status})\n`)

  // Build all 250 requests: 50 submitters per target
  const jobs = []
  for (let t = 0; t < TARGETS.length; t++) {
    for (let s = 0; s < 50; s++) {
      const submitter = SUBMITTERS[s % SUBMITTERS.length]
      // Skip if submitter === target
      if (submitter === TARGETS[t].id) continue
      jobs.push({ submitterId: submitter, targetId: TARGETS[t].id, index: t * 50 + s })
    }
  }

  console.log(`Phase 2: Firing ${jobs.length} concurrent submissions...\n`)
  const allStart = Date.now()
  const results = await Promise.all(
    jobs.map((j) => submitOne(j.submitterId, j.targetId, j.index))
  )
  const wallClock = Date.now() - allStart

  // Stats
  const succeeded = results.filter((r) => r.ok)
  const failed = results.filter((r) => !r.ok)
  const rateLimited = results.filter((r) => r.status === 429)
  const serverErrors = results.filter((r) => r.status >= 500)
  const elapsed = succeeded.map((r) => r.elapsed).sort((a, b) => a - b)

  console.log("--- RESULTS ---")
  console.log(`  Total requests:     ${results.length}`)
  console.log(`  Succeeded:          ${succeeded.length}`)
  console.log(`  Failed:             ${failed.length}`)
  console.log(`  Rate limited (429): ${rateLimited.length}`)
  console.log(`  Server errors (5xx):${serverErrors.length}`)
  console.log(`  Wall clock time:    ${wallClock}ms`)
  console.log(`  Throughput:         ${(results.length / (wallClock / 1000)).toFixed(1)} req/s`)

  if (elapsed.length > 0) {
    console.log("\n--- LATENCY (successful) ---")
    console.log(`  Min:   ${elapsed[0]}ms`)
    console.log(`  Avg:   ${Math.round(elapsed.reduce((a, b) => a + b, 0) / elapsed.length)}ms`)
    console.log(`  P50:   ${elapsed[Math.floor(elapsed.length * 0.5)]}ms`)
    console.log(`  P95:   ${elapsed[Math.floor(elapsed.length * 0.95)]}ms`)
    console.log(`  P99:   ${elapsed[Math.floor(elapsed.length * 0.99)]}ms`)
    console.log(`  Max:   ${elapsed[elapsed.length - 1]}ms`)
  }

  if (failed.length > 0) {
    console.log("\n--- FAILURES ---")
    const errorCounts = {}
    for (const f of failed) {
      const key = `${f.status}: ${f.error}`
      errorCounts[key] = (errorCounts[key] || 0) + 1
    }
    for (const [err, count] of Object.entries(errorCounts)) {
      console.log(`  ${err} (x${count})`)
    }
  }

  // Per-target breakdown
  console.log("\n--- PER TARGET ---")
  for (const target of TARGETS) {
    const targetResults = results.filter((_, i) => jobs[i].targetId === target.id)
    const ok = targetResults.filter((r) => r.ok).length
    const fail = targetResults.filter((r) => !r.ok).length
    const avgMs = targetResults.filter((r) => r.ok).length > 0
      ? Math.round(targetResults.filter((r) => r.ok).reduce((a, r) => a + r.elapsed, 0) / ok)
      : 0
    console.log(`  ${target.name.padEnd(20)} ${ok} ok, ${fail} fail, avg ${avgMs}ms`)
  }

  // Dashboard load
  console.log("\nPhase 3: Dashboard load test (3 concurrent)...")
  const dashJobs = Array.from({ length: 3 }, async () => {
    const s = Date.now()
    const r = await fetch(`${BASE}/api/admin/dashboard`, {
      headers: { Authorization: "Basic " + btoa("admin:admin") },
    })
    const d = await r.json()
    return {
      elapsed: Date.now() - s,
      subs: d.submissions?.length || 0,
      answers: d.answers?.length || 0,
      status: r.status,
    }
  })
  const dashResults = await Promise.all(dashJobs)
  for (const d of dashResults) {
    console.log(`  Dashboard: ${d.elapsed}ms — ${d.subs} subs, ${d.answers} answers (status ${d.status})`)
  }

  console.log("\n=== DONE ===")
}

main().catch(console.error)
