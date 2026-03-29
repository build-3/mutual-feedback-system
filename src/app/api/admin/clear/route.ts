import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/server/supabase-admin"
import { requireAdmin } from "@/lib/server/require-admin"

export async function DELETE(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const scope = body.scope as string

    if (scope !== "feedback" && scope !== "all") {
      return NextResponse.json(
        { error: "scope must be 'feedback' or 'all'" },
        { status: 400 }
      )
    }

    const supabaseAdmin = getSupabaseAdmin()

    // CASCADE handles answers + responses automatically
    const { error: subError } = await supabaseAdmin
      .from("feedback_submissions")
      .delete()
      .gte("id", "00000000-0000-0000-0000-000000000000")

    if (subError) {
      console.error("[admin/clear] Failed to delete submissions:", subError)
      return NextResponse.json(
        { error: "Failed to clear feedback data." },
        { status: 500 }
      )
    }

    const deleted: Record<string, string> = { submissions: "cleared" }

    if (scope === "all") {
      const { error: empError } = await supabaseAdmin
        .from("employees")
        .delete()
        .gte("id", "00000000-0000-0000-0000-000000000000")

      if (empError) {
        console.error("[admin/clear] Failed to delete employees:", empError)
        return NextResponse.json(
          { error: "Feedback cleared but failed to delete employees." },
          { status: 500 }
        )
      }

      deleted.employees = "cleared"
    }

    console.log(`[admin/clear] Cleared scope=${scope}:`, deleted)
    return NextResponse.json({ status: "cleared", deleted })
  } catch (error) {
    console.error("[admin/clear] Error:", error)
    return NextResponse.json(
      { error: "Failed to process clear request." },
      { status: 400 }
    )
  }
}
