import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/server/require-admin"
import { getSupabaseAdmin } from "@/lib/server/supabase-admin"
import {
  sendDirectMessage,
  isGoogleChatConfigured,
  isNotificationsEnabled,
} from "@/lib/server/google-chat"

type NoteRow = {
  id: string
  employee_id: string
  draft_text: string
  edited_text: string | null
  status: string
}

/**
 * Send approved notes.
 *
 * This is the only path by which a pulse note reaches an employee. The cron
 * writes drafts and stops; a person has to read each one and click.
 *
 * `edits` carries any text the approver changed, saved before the send so the
 * record shows what actually went out rather than what was drafted.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  let body: { noteIds?: unknown; edits?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
  }

  const noteIds = Array.isArray(body.noteIds)
    ? body.noteIds.filter((id): id is string => typeof id === "string")
    : []
  if (noteIds.length === 0) {
    return NextResponse.json({ error: "No notes selected." }, { status: 400 })
  }

  const edits =
    body.edits && typeof body.edits === "object"
      ? (body.edits as Record<string, string>)
      : {}

  if (!isGoogleChatConfigured() || !(await isNotificationsEnabled())) {
    return NextResponse.json(
      { error: "Google Chat notifications are off, so nothing was sent." },
      { status: 409 }
    )
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: noteData } = await supabaseAdmin
    .from("pulse_notes" as never)
    .select("id, employee_id, draft_text, edited_text, status")
    .in("id", noteIds)

  const notes = (noteData ?? []) as NoteRow[]
  if (notes.length === 0) {
    return NextResponse.json({ error: "Notes not found." }, { status: 404 })
  }

  const { data: employeeData } = await supabaseAdmin
    .from("employees")
    .select("id, name, email, is_active")
    .in("id", notes.map((n) => n.employee_id))

  const employees = new Map(
    ((employeeData ?? []) as { id: string; name: string; email: string | null; is_active: boolean }[]).map(
      (e) => [e.id, e]
    )
  )

  const results: { noteId: string; name: string; sent: boolean; reason?: string }[] = []

  for (const note of notes) {
    const employee = employees.get(note.employee_id)
    const name = employee?.name ?? "unknown"

    // Re-sending is not idempotent from the recipient's side — they would get
    // the same note twice — so an already-sent note is refused, not repeated.
    if (note.status === "sent") {
      results.push({ noteId: note.id, name, sent: false, reason: "already sent" })
      continue
    }
    if (!employee?.email) {
      results.push({ noteId: note.id, name, sent: false, reason: "no email on the roster" })
      continue
    }
    if (employee.is_active === false) {
      results.push({ noteId: note.id, name, sent: false, reason: "no longer on the roster" })
      continue
    }

    const edited = typeof edits[note.id] === "string" ? edits[note.id].trim() : null
    const text = edited && edited.length > 0 ? edited : note.edited_text ?? note.draft_text

    try {
      await sendDirectMessage(employee.email, text)
      await supabaseAdmin
        .from("pulse_notes" as never)
        .update({
          status: "sent",
          edited_text: edited && edited !== note.draft_text ? edited : note.edited_text,
          approved_by: auth.employee.id,
          approved_at: new Date().toISOString(),
          sent_at: new Date().toISOString(),
          error: null,
        } as never)
        .eq("id", note.id)
      results.push({ noteId: note.id, name, sent: true })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error"
      await supabaseAdmin
        .from("pulse_notes" as never)
        .update({ status: "failed", error: message } as never)
        .eq("id", note.id)
      results.push({ noteId: note.id, name, sent: false, reason: message })
    }
  }

  return NextResponse.json({
    sent: results.filter((r) => r.sent).length,
    results,
  })
}
