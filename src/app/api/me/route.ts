import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/server/require-admin"

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  if (!auth.employee) {
    return NextResponse.json({ employee: null })
  }

  return NextResponse.json({
    employee: {
      id: auth.employee.id,
      name: auth.employee.name,
      role: auth.employee.role,
      birthday: auth.employee.birthday,
      buddy_id: auth.employee.buddy_id,
      sponsor_id: auth.employee.sponsor_id,
    },
  })
}
