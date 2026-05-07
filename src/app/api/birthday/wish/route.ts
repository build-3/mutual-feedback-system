import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/server/require-admin"
import { getSupabaseAdmin, hasServerSupabaseConfig } from "@/lib/server/supabase-admin"
import { sendCardToSpace, getProfilePhotoUrl } from "@/lib/server/google-chat"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const KUDOS_SPACE_ID = process.env.GOOGLE_CHAT_KUDOS_SPACE_ID ?? ""
const DEFAULT_AVATAR = "https://build3.online/apple-icon.png"

const BIRTHDAY_MESSAGES = [
  "Happy Birthday! 🎂 Hope your day is filled with joy and cake!",
  "It's your special day! 🎉 Wishing you an amazing birthday!",
  "Happy Birthday! 🥳 May this year bring you incredible things!",
  "Birthday vibes only! 🎈 Have the best day ever!",
  "Cheers to another trip around the sun! 🌟 Happy Birthday!",
]

function buildBirthdayCard(
  name: string,
  photoUrl: string | null,
  message: string
) {
  return {
    text: `🎂 Happy Birthday, *${name}*! 🎉`,
    cardsV2: [
      {
        cardId: `birthday-${Date.now()}`,
        card: {
          header: {
            title: `🎂 Happy Birthday, ${name}!`,
            subtitle: "🎉 From the build3 team",
            imageUrl: photoUrl || DEFAULT_AVATAR,
            imageType: "CIRCLE" as const,
          },
          sections: [
            {
              widgets: [
                {
                  decoratedText: {
                    text: `<b>${message}</b>`,
                    wrapText: true,
                  },
                },
              ],
            },
            {
              widgets: [
                {
                  decoratedText: {
                    text: "🎈🎁🎊 Have an amazing day! 🎊🎁🎈",
                    wrapText: true,
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  if (!hasServerSupabaseConfig()) {
    return NextResponse.json({ error: "Server configuration is incomplete." }, { status: 503 })
  }

  if (!KUDOS_SPACE_ID) {
    return NextResponse.json({ error: "Kudos chat space not configured." }, { status: 503 })
  }

  let body: { employeeId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 })
  }

  const { employeeId } = body
  if (!employeeId || !UUID_RE.test(employeeId)) {
    return NextResponse.json({ error: "Valid employee ID required." }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data: employee, error } = await supabaseAdmin
    .from("employees")
    .select("id, name, email")
    .eq("id", employeeId)
    .single()

  if (error || !employee) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 })
  }

  const photoUrl = employee.email ? await getProfilePhotoUrl(employee.email) : null
  const message = BIRTHDAY_MESSAGES[Math.floor(Math.random() * BIRTHDAY_MESSAGES.length)]
  const card = buildBirthdayCard(employee.name, photoUrl, message)

  try {
    await sendCardToSpace(KUDOS_SPACE_ID, card)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: `Failed to send birthday wish: ${msg}` }, { status: 502 })
  }

  return NextResponse.json({ success: true, name: employee.name })
}
