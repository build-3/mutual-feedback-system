#!/usr/bin/env node
/**
 * Import CSV feedback data into Supabase.
 * Only imports rows from August 2025 onwards.
 * Outputs JSON arrays for batch SQL execution.
 */
import fs from 'fs'
import crypto from 'crypto'

const CSV_PATH = '/Users/arjun/Pictures/Monthly Feedback Response Sheet (2025) (June onwards) - build3 Mutual Feedback Session.csv'
const CUTOFF = new Date('2025-08-01T00:00:00+05:30')

const EMPLOYEE_MAP = {
  'Allya Srivastava': '138bcabf-9440-4e8a-8c38-130269437e56',
  'Aniket Kislay': '4a421a19-156c-4b0d-a6e6-446d67653184',
  'Arjun': '5e334cee-a68b-4cf8-aa6b-5ed17881db4f',
  'Ashwini Kaskar': 'f3e1ea6c-5b0c-4cf1-9016-ab073494cd8c',
  'Astha Goyal': '5e9d82da-57ee-413d-8b94-d3ffd1573f9f',
  'Bikram Jha': 'b6605dbf-6307-4058-9130-6229b5a1c77f',
  'Charlez Kurian John': '863a05aa-cd0c-4a3f-bf29-15cd7e86fe26',
  'Girish Sampath': '0af122e1-37de-4a0c-9a31-1d889409114d',
  'Karan Murada': '57c9d700-4444-4588-9896-69a9eff45544',
  'Kaustubh Mankar': 'ede8e7cd-579a-4108-b7e4-c0ecee448f00',
  'Nadim G': '1a305ff4-4029-4db2-9132-78e7148765f7',
  'Naman': '54757a64-93a9-4b53-afae-9907b109efa6',
  'Neha': 'e7f919ab-9445-43e9-9f61-080ae63dc140',
  'Omprakash Muddaiah': 'c2a673fb-952c-492e-a0f9-319bed659641',
  'Prajwal': 'ee162d6b-7c4a-4858-b1b7-dd141aa8333d',
  'Ronak Vora': '116da7bc-f9f5-44e8-a426-6bf1d1eb5852',
  'Sanya': 'd62629a4-6928-4746-afad-24db92f187aa',
  'Sarthak': '376f9caa-259a-408f-9a01-dbe67b6b56ca',
  'Shubhaam Chandak': '093503d4-6e42-485f-9a29-70f76259a74f',
  'Shyamal Majumdar': 'bdb0ee0a-8ca9-484f-aa69-7078297b1479',
  'Umair Tariq': '9ee7c3c0-8067-4b30-8c65-47170873df7a',
  'Varun': '68226c00-8011-472c-bd1b-aceac98e1d02',
  'Vijay Relwani': '67b7da7f-db9c-40a6-9b56-59839acab2ee',
  'Nadim Gavandi': '1a305ff4-4029-4db2-9132-78e7148765f7',
  'Naman Pandey': '54757a64-93a9-4b53-afae-9907b109efa6',
  'Neha Bansil': 'e7f919ab-9445-43e9-9f61-080ae63dc140',
  'Prajwal Parab': 'ee162d6b-7c4a-4858-b1b7-dd141aa8333d',
  'Arjun T': '5e334cee-a68b-4cf8-aa6b-5ed17881db4f',
  'T Arjun': '5e334cee-a68b-4cf8-aa6b-5ed17881db4f',
  'Varun Chawla': '68226c00-8011-472c-bd1b-aceac98e1d02',
  'Varun chawla': '68226c00-8011-472c-bd1b-aceac98e1d02',
  'Girish': '0af122e1-37de-4a0c-9a31-1d889409114d',
  'Girish sampath': '0af122e1-37de-4a0c-9a31-1d889409114d',
  'Umair': '9ee7c3c0-8067-4b30-8c65-47170873df7a',
  'UT': '9ee7c3c0-8067-4b30-8c65-47170873df7a',
  'Charlez': '863a05aa-cd0c-4a3f-bf29-15cd7e86fe26',
  'charlez': '863a05aa-cd0c-4a3f-bf29-15cd7e86fe26',
  'CKJ': '863a05aa-cd0c-4a3f-bf29-15cd7e86fe26',
  'Kaustubh': 'ede8e7cd-579a-4108-b7e4-c0ecee448f00',
  'kaustubh': 'ede8e7cd-579a-4108-b7e4-c0ecee448f00',
  'Aniket': '4a421a19-156c-4b0d-a6e6-446d67653184',
  'omprakash': 'c2a673fb-952c-492e-a0f9-319bed659641',
  'Omprakash': 'c2a673fb-952c-492e-a0f9-319bed659641',
  'Vijay': '67b7da7f-db9c-40a6-9b56-59839acab2ee',
  'vijay': '67b7da7f-db9c-40a6-9b56-59839acab2ee',
  'Vijay relwani': '67b7da7f-db9c-40a6-9b56-59839acab2ee',
  'Shyamal': 'bdb0ee0a-8ca9-484f-aa69-7078297b1479',
  'Ashwini': 'f3e1ea6c-5b0c-4cf1-9016-ab073494cd8c',
  'ashwini kaskar': 'f3e1ea6c-5b0c-4cf1-9016-ab073494cd8c',
  'Ashwini kaskar': 'f3e1ea6c-5b0c-4cf1-9016-ab073494cd8c',
  'Ashwini K': 'f3e1ea6c-5b0c-4cf1-9016-ab073494cd8c',
  'Shubhaam': '093503d4-6e42-485f-9a29-70f76259a74f',
  'Ronak': '116da7bc-f9f5-44e8-a426-6bf1d1eb5852',
  'Bikram': 'b6605dbf-6307-4058-9130-6229b5a1c77f',
  'Bikram jha': 'b6605dbf-6307-4058-9130-6229b5a1c77f',
  'Astha': '5e9d82da-57ee-413d-8b94-d3ffd1573f9f',
  'Karan': '57c9d700-4444-4588-9896-69a9eff45544',
  'Sanya Kalani': 'd62629a4-6928-4746-afad-24db92f187aa',
  'Nadim': '1a305ff4-4029-4db2-9132-78e7148765f7',
  'prajwal parab': 'ee162d6b-7c4a-4858-b1b7-dd141aa8333d',
  'Prajwal Parab': 'ee162d6b-7c4a-4858-b1b7-dd141aa8333d',
  'Sarthak': '376f9caa-259a-408f-9a01-dbe67b6b56ca',
  'Naman Pandey': '54757a64-93a9-4b53-afae-9907b109efa6',
  'Neha Bansil': 'e7f919ab-9445-43e9-9f61-080ae63dc140',
}

function parseCSV(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i+1] === '"') { field += '"'; i++ }
      else if (c === '"') { inQuotes = false }
      else { field += c }
    } else {
      if (c === '"') { inQuotes = true }
      else if (c === ',') { row.push(field.trim()); field = '' }
      else if (c === '\n' || (c === '\r' && text[i+1] === '\n')) {
        if (c === '\r') i++
        row.push(field.trim())
        if (row.length > 1) rows.push(row)
        row = []; field = ''
      }
      else { field += c }
    }
  }
  if (field || row.length) { row.push(field.trim()); rows.push(row) }
  return rows
}

function parseDate(d) {
  if (!d) return null
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/)
  if (!m) return null
  const [, month, day, year, hour, min, sec] = m
  return new Date(`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}T${hour.padStart(2,'0')}:${min}:${sec}+05:30`)
}

function resolveId(name) {
  if (!name) return null
  const direct = EMPLOYEE_MAP[name]
  if (direct !== undefined) return direct
  const lower = name.toLowerCase()
  for (const [k, v] of Object.entries(EMPLOYEE_MAP)) {
    if (k.toLowerCase() === lower) return v
  }
  return undefined
}

const csv = fs.readFileSync(CSV_PATH, 'utf8')
const rows = parseCSV(csv)
const data = rows.slice(1)

const results = [] // { submission, answers[] }
let skipped = 0

for (let i = 0; i < data.length; i++) {
  const row = data[i]
  const dateObj = parseDate(row[0])
  if (!dateObj || dateObj < CUTOFF) { skipped++; continue }

  const ts = dateObj.toISOString()
  const submitterId = resolveId(row[1])
  if (!submitterId) { skipped++; continue }

  const typeRaw = row[2]
  let feedbackType, feedbackForId = null

  if (typeRaw.includes('New Recruit') || typeRaw.includes('Intern')) {
    feedbackType = 'intern'
    feedbackForId = resolveId(row[3])
    if (!feedbackForId) { skipped++; continue }
  } else if (typeRaw.includes('full timer')) {
    feedbackType = 'full_timer'
    feedbackForId = resolveId(row[23])
    if (!feedbackForId) { skipped++; continue }
  } else if (typeRaw.includes('build3')) {
    feedbackType = 'build3'
  } else if (typeRaw.includes('Self')) {
    feedbackType = 'self'
  } else { skipped++; continue }

  if (submitterId === feedbackForId) { skipped++; continue }

  const answers = []
  const add = (key, text, val) => {
    if (val && val.trim().length > 0 && val.trim() !== '-' && val.trim().toLowerCase() !== 'na' && val.trim().toLowerCase() !== 'n/a')
      answers.push({ key, text, val: val.trim().substring(0, 4000) })
  }

  if (feedbackType === 'intern') {
    add('recommend_rating', 'How strongly would we back them for a full-time role?', row[4])
    add('contribution_example', 'Specific example of meaningful contribution', row[5] || row[6])
    add('teal_self_management', 'Teal - Self-Management', row[7])
    add('teal_wholeness', 'Teal - Wholeness', row[8])
    add('teal_evolutionary_purpose', 'Teal - Evolutionary Purpose', row[9])
    add('excellence_area', 'Where have they done especially strong work?', row[10])
    add('upskill_ability', 'Where have they stretched or upskilled?', row[11])
    add('contribution_level', 'What level of contribution are we seeing?', row[12])
    add('upcoming_projects', 'Where could their skills be useful?', row[13])
    add('advice', 'One piece of advice', row[14])
    add('purpose_alignment', 'Purpose alignment score', row[15])
    add('value_strength', 'Value representing their strengths', row[16])
    add('value_improvement', 'Value to improve upon', row[17])
    add('itp_humble', 'Humble', row[18])
    add('itp_hungry', 'Hungry', row[19])
    add('itp_smart', 'People-smart', row[20])
    add('ideal_team_player_type', 'Ideal team player archetype', row[21])
    add('trust_battery', 'Trust battery score', row[22]?.replace('%', ''))
  } else if (feedbackType === 'full_timer') {
    add('teal_self_management', 'Teal - Self-Management', row[24])
    add('teal_wholeness', 'Teal - Wholeness', row[25])
    add('teal_evolutionary_purpose', 'Teal - Evolutionary Purpose', row[26])
    add('purpose_alignment', 'Purpose alignment score', row[27])
    add('trust_battery', 'Trust battery score', row[28]?.replace('%', ''))
    add('contribution_level', 'Contribution level', row[29])
    add('value_strength', 'Value representing their strengths', row[30])
    add('value_improvement', 'Value to improve upon', row[31])
    add('constructive_feedback', 'Constructive feedback', row[32])
  } else if (feedbackType === 'build3') {
    add('nps_score', 'NPS score', row[33])
    add('overall_experience', 'Overall experience', row[34])
    add('enjoyed_most', 'What felt especially good?', row[35])
    add('missing_disappointing', 'What was missing or disappointing?', row[36])
    add('policies_unclear', 'Policies difficult to understand?', row[37])
    add('tools_resources', 'Tools and resources adequate?', row[38])
    add('issues_faced', 'Issues faced?', row[39])
    add('anything_else', 'Anything else?', row[40])
  } else if (feedbackType === 'self') {
    add('proud_contribution', 'What are you most proud of?', row[41])
    add('proactive_efforts', 'Proactive efforts', row[42])
    add('value_upheld', 'Value upheld best', row[43])
    add('value_to_improve', 'Value to improve', row[44])
    add('self_improvement', 'Self-improvement plan', row[45])
  }

  if (answers.length === 0) { skipped++; continue }

  results.push({
    id: crypto.randomUUID(),
    submitted_by_id: submitterId,
    feedback_for_id: feedbackForId,
    feedback_type: feedbackType,
    created_at: ts,
    answers,
  })
}

// Output as JSON
console.log(JSON.stringify({ total: results.length, skipped, results }, null, 0))
process.stderr.write(`Total: ${results.length}, Skipped: ${skipped}\n`)
