import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/server/require-admin"
import { getSupabaseAdmin } from "@/lib/server/supabase-admin"
import { buildPulseRun, loadPulseConfig } from "@/lib/server/pulse"
import { draftNote } from "@/lib/server/pulse-notes"
import { MOD_EMAILS } from "@/lib/server/require-admin"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://mutualfeedback.build3.online"

/**
 * Redraft one note.
 *
 * Recomputes the person's scores from scratch rather than reusing the stored
 * ones, so a redraft after a threshold change reflects the change instead of
 * re-wording a stale bucket.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  let body: { noteId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
  }
  if (typeof body.noteId !== "string") {
    return NextResponse.json({ error: "No note selected." }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data: noteData } = await supabaseAdmin
    .from("pulse_notes" as never)
    .select("id, employee_id, status")
    .eq("id", body.noteId)
    .maybeSingle()

  const note = noteData as { id: string; employee_id: string; status: string } | null
  if (!note) return NextResponse.json({ error: "Note not found." }, { status: 404 })
  if (note.status === "sent") {
    return NextResponse.json(
      { error: "That note has already gone out, so it cannot be redrafted." },
      { status: 409 }
    )
  }

  const [run, config] = await Promise.all([buildPulseRun(), loadPulseConfig()])
  const person = run.people.find((p) => p.employeeId === note.employee_id)
  if (!person) {
    return NextResponse.json(
      { error: "That teammate is no longer in the current scoring window." },
      { status: 409 }
    )
  }

  const drafted = await draftNote(person, config, {
    appUrl: APP_URL,
    rosterNames: run.people.map((p) => p.name),
    leadershipNames: run.people
      .filter((p) => p.email && MOD_EMAILS.includes(p.email.toLowerCase()))
      .map((p) => p.name),
  })

  await supabaseAdmin
    .from("pulse_notes" as never)
    .update({
      draft_text: drafted.text,
      // A redraft replaces the approver's edit, so clearing it keeps the
      // record honest about what is on screen.
      edited_text: null,
      source: drafted.source,
      bucket: person.bucket,
      status: "draft",
      error: null,
    } as never)
    .eq("id", note.id)

  return NextResponse.json({
    text: drafted.text,
    source: drafted.source,
    bucket: person.bucket,
    fallbackReason: drafted.fallbackReason ?? null,
  })
}
