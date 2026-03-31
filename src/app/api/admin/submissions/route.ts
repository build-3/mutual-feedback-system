import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/server/supabase-admin"
import { requireAdmin } from "@/lib/server/require-admin"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function DELETE(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const ids = body.submissionIds as string[]

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "submissionIds must be a non-empty array" },
        { status: 400 }
      )
    }

    if (ids.length > 100) {
      return NextResponse.json(
        { error: "Cannot delete more than 100 submissions at once" },
        { status: 400 }
      )
    }

    for (const id of ids) {
      if (typeof id !== "string" || !UUID_RE.test(id)) {
        return NextResponse.json(
          { error: `Invalid submission ID: ${id}` },
          { status: 400 }
        )
      }
    }

    const supabaseAdmin = getSupabaseAdmin()

    // CASCADE handles answers + responses automatically
    const { error } = await supabaseAdmin
      .from("feedback_submissions")
      .delete()
      .in("id", ids)

    if (error) {
      console.error("[admin/submissions] Delete failed:", error)
      return NextResponse.json(
        { error: "Failed to delete submissions." },
        { status: 500 }
      )
    }

    return NextResponse.json({ status: "deleted", deleted: ids.length })
  } catch (error) {
    console.error("[admin/submissions] Error:", error)
    return NextResponse.json(
      { error: "Failed to process delete request." },
      { status: 400 }
    )
  }
}
