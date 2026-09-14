import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/server/require-admin"
import { getSupabaseAdmin } from "@/lib/server/supabase-admin"

/** Mark notes as deliberately not sent. Reversible: a skipped note can be sent later. */
export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  let body: { noteIds?: unknown; undo?: unknown }
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

  const { error } = await getSupabaseAdmin()
    .from("pulse_notes" as never)
    .update({
      status: body.undo === true ? "draft" : "skipped",
      approved_by: auth.employee.id,
      approved_at: new Date().toISOString(),
    } as never)
    .in("id", noteIds)
    // A sent note cannot be un-sent, so it cannot be skipped either.
    .neq("status", "sent")

  if (error) {
    return NextResponse.json({ error: "Could not update those notes." }, { status: 500 })
  }

  return NextResponse.json({ updated: noteIds.length })
}
