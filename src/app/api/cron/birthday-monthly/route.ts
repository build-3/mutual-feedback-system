import { NextResponse } from "next/server"
import { getSupabaseAdmin, hasServerSupabaseConfig } from "@/lib/server/supabase-admin"
import { sendCardToSpace } from "@/lib/server/google-chat"
import { buildMonthlyRoundupCard } from "@/lib/server/birthday-cards"

const KUDOS_SPACE_ID = process.env.GOOGLE_CHAT_KUDOS_SPACE_ID ?? ""
const CRON_SECRET = process.env.CRON_SECRET ?? ""

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

export async function GET(request: Request) {
  if (!CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 })
  }

  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  if (!hasServerSupabaseConfig() || !KUDOS_SPACE_ID) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 })
  }

  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (tomorrow.getDate() !== 1) {
    return NextResponse.json({ skipped: true, reason: "Not the last day of the month." })
  }

  const nextMonth = now.getMonth() + 1
  const nextMonthMM = String((nextMonth % 12) + 1).padStart(2, "0")
  const nextMonthName = MONTH_NAMES[nextMonth % 12]

  const supabaseAdmin = getSupabaseAdmin()

  const { data: alreadySent } = await supabaseAdmin
    .from("birthday_notifications" as never)
    .select("id")
    .eq("notification_type", "monthly_roundup")
    .eq("target_month", nextMonthMM)
    .gte("sent_at", new Date(now.getFullYear(), now.getMonth(), 1).toISOString())
    .limit(1)

  if (alreadySent && alreadySent.length > 0) {
    return NextResponse.json({ skipped: true, reason: "Already sent this month's roundup." })
  }

  const { data: birthdayPeople, error } = await supabaseAdmin
    .from("employees")
    .select("id, name, email, birthday")
    .eq("is_active", true)
    .like("birthday", `${nextMonthMM}-%`)
    .order("birthday", { ascending: true })

  if (error) {
    return NextResponse.json({ error: "DB query failed." }, { status: 500 })
  }

  if (!birthdayPeople || birthdayPeople.length === 0) {
    return NextResponse.json({ sent: false, reason: "No birthdays next month.", nextMonth: nextMonthName })
  }

  try {
    const card = await buildMonthlyRoundupCard(birthdayPeople, nextMonth)
    const result = await sendCardToSpace(KUDOS_SPACE_ID, card)

    await supabaseAdmin.from("birthday_notifications" as never).insert({
      notification_type: "monthly_roundup",
      target_month: nextMonthMM,
      employee_ids: birthdayPeople.map((p) => p.id),
      employee_names: birthdayPeople.map((p) => p.name),
      chat_message_name: result.messageName,
    } as never)

    return NextResponse.json({
      sent: true,
      nextMonth: nextMonthName,
      count: birthdayPeople.length,
      people: birthdayPeople.map((p) => p.name),
      messageName: result.messageName,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
