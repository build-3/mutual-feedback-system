import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/server/require-admin"
import { getSupabaseAdmin, hasServerSupabaseConfig } from "@/lib/server/supabase-admin"
import { sendCardToSpace } from "@/lib/server/google-chat"
import { buildEveReminderCard } from "@/lib/server/birthday-cards"

const KUDOS_SPACE_ID = process.env.GOOGLE_CHAT_KUDOS_SPACE_ID ?? ""

export async function POST() {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  if (!hasServerSupabaseConfig() || !KUDOS_SPACE_ID) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 })
  }

  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const mm = String(tomorrow.getMonth() + 1).padStart(2, "0")
  const dd = String(tomorrow.getDate()).padStart(2, "0")
  const tomorrowMMDD = `${mm}-${dd}`

  const supabaseAdmin = getSupabaseAdmin()

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const { data: alreadySent } = await supabaseAdmin
    .from("birthday_notifications" as never)
    .select("id")
    .eq("notification_type", "eve_reminder")
    .eq("target_month", tomorrowMMDD)
    .gte("sent_at", todayStart)
    .limit(1)

  if (alreadySent && alreadySent.length > 0) {
    return NextResponse.json({ skipped: true, reason: "Already sent eve reminder for tomorrow." })
  }

  const { data: birthdayPeople, error } = await supabaseAdmin
    .from("employees")
    .select("id, name, email")
    .eq("is_active", true)
    .eq("birthday", tomorrowMMDD)

  if (error) {
    return NextResponse.json({ error: "DB query failed." }, { status: 500 })
  }

  if (!birthdayPeople || birthdayPeople.length === 0) {
    return NextResponse.json({ sent: false, reason: "No birthdays tomorrow." })
  }

  try {
    const card = await buildEveReminderCard(birthdayPeople)
    const result = await sendCardToSpace(KUDOS_SPACE_ID, card)

    await supabaseAdmin.from("birthday_notifications" as never).insert({
      notification_type: "eve_reminder",
      target_month: tomorrowMMDD,
      employee_ids: birthdayPeople.map((p) => p.id),
      employee_names: birthdayPeople.map((p) => p.name),
      chat_message_name: result.messageName,
    } as never)

    return NextResponse.json({
      sent: true,
      count: birthdayPeople.length,
      people: birthdayPeople.map((p) => p.name),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
