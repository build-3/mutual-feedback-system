import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/server/supabase-admin"
import { requireAdmin } from "@/lib/server/require-admin"
import { getNextSecondTuesday, getActiveSession, calculateSessionNumber } from "@/lib/server/session-utils"

export async function GET() {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const supabaseAdmin = getSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from("probation_tracking")
    .select("*")
    .order("probation_end_date", { ascending: true })

  if (error) {
    return NextResponse.json(
      { error: "Could not load probation records." },
      { status: 500 }
    )
  }

  const employeeIds = Array.from(new Set((data ?? []).map((r) => r.employee_id)))
  const { data: emps } = employeeIds.length > 0
    ? await supabaseAdmin
        .from("employees")
        .select("id, name, email, role")
        .in("id", employeeIds)
    : { data: [] }

  const empMap = new Map((emps ?? []).map((e) => [e.id, e]))

  // Get session completion data for active probations
  const activeProbations = (data ?? []).filter(
    (r) => r.probation_status === "active" || r.probation_status === "extended"
  )
  const activeEmployeeIds = activeProbations.map((r) => r.employee_id)

  const sessionCompletionMap: Record<string, {
    sessionNumber: number
    sessionDate: string
    totalAssignments: number
    completedAssignments: number
    reviewers: { name: string; submitted: boolean }[]
  }[]> = {}

  if (activeEmployeeIds.length > 0) {
    // Get all session assignments for active interns
    const { data: assignments } = await supabaseAdmin
      .from("session_assignments")
      .select("session_id, intern_id, reviewer_id, submission_id")
      .in("intern_id", activeEmployeeIds)

    // Get session details
    const assignmentSessionIds = Array.from(
      new Set((assignments ?? []).map((a) => a.session_id))
    )

    if (assignmentSessionIds.length > 0) {
      const { data: sessions } = await supabaseAdmin
        .from("feedback_sessions")
        .select("id, session_date, status")
        .in("id", assignmentSessionIds)
        .order("session_date", { ascending: true })

      const sessionInfoMap = new Map<string, { session_date: string; status: string }>()
      for (const s of sessions ?? []) {
        sessionInfoMap.set(s.id, { session_date: s.session_date, status: s.status })
      }

      // Get reviewer names
      const reviewerIds = Array.from(
        new Set((assignments ?? []).map((a) => a.reviewer_id))
      )
      const { data: reviewerEmps } = reviewerIds.length > 0
        ? await supabaseAdmin.from("employees").select("id, name").in("id", reviewerIds)
        : { data: [] }
      const reviewerNameMap = new Map((reviewerEmps ?? []).map((e) => [e.id, e.name]))

      // Build completion data per intern per session
      for (const internId of activeEmployeeIds) {
        const internAssignments = (assignments ?? []).filter((a) => a.intern_id === internId)
        const bySession = new Map<string, typeof internAssignments>()
        for (const a of internAssignments) {
          const group = bySession.get(a.session_id) ?? []
          group.push(a)
          bySession.set(a.session_id, group)
        }

        const prob = activeProbations.find((p) => p.employee_id === internId)
        const joinDate = prob?.join_date ?? ""

        const sessionData: typeof sessionCompletionMap[string] = []
        for (const [sessionId, sessAssignments] of Array.from(bySession.entries())) {
          const sessionInfo = sessionInfoMap.get(sessionId)
          if (!sessionInfo) continue

          const sessionNum = joinDate
            ? calculateSessionNumber(joinDate, sessionInfo.session_date)
            : 0

          sessionData.push({
            sessionNumber: sessionNum,
            sessionDate: sessionInfo.session_date,
            totalAssignments: sessAssignments.length,
            completedAssignments: sessAssignments.filter((a) => a.submission_id !== null).length,
            reviewers: sessAssignments.map((a) => ({
              name: reviewerNameMap.get(a.reviewer_id) ?? "Unknown",
              submitted: a.submission_id !== null,
            })),
          })
        }

        sessionData.sort((a, b) => a.sessionNumber - b.sessionNumber)
        sessionCompletionMap[internId] = sessionData
      }
    }
  }

  const probations = (data ?? []).map((r) => ({
    ...r,
    employees: empMap.get(r.employee_id) ?? null,
    sessionCompletion: sessionCompletionMap[r.employee_id] ?? [],
  }))

  // Session info
  const nextSessionDate = getNextSecondTuesday()
  const activeSession = await getActiveSession()

  return NextResponse.json({
    probations,
    nextSessionDate: nextSessionDate.toISOString().split("T")[0],
    activeSession: activeSession ?? null,
  })
}
