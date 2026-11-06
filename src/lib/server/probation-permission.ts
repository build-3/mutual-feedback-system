import "server-only"

import { getSupabaseAdmin } from "./supabase-admin"
import { canActOnEmployee } from "@/lib/probation-access"

/**
 * May the signed-in person promote or extend this probation? Deciders may for
 * anyone; a sponsor only for the person they sponsor. Looked up on the server
 * from the probation id, never taken from the request.
 */
export async function mayActOnProbation(
  viewer: { email: string; employeeId: string | null },
  probationId: string
): Promise<boolean> {
  const supabaseAdmin = getSupabaseAdmin()
  const { data: record } = await supabaseAdmin
    .from("probation_tracking")
    .select("employee_id")
    .eq("id", probationId)
    .single()
  if (!record) return false

  const { data: employee } = await supabaseAdmin
    .from("employees")
    .select("sponsor_id")
    .eq("id", record.employee_id)
    .single()

  return canActOnEmployee({
    viewerEmail: viewer.email,
    viewerId: viewer.employeeId,
    employeeSponsorId: (employee?.sponsor_id as string | null | undefined) ?? null,
  })
}
