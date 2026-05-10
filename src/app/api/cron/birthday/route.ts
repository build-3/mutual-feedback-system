import { NextResponse } from "next/server"
import { getSupabaseAdmin, hasServerSupabaseConfig } from "@/lib/server/supabase-admin"
import { sendCardToSpace, getProfilePhotoUrl } from "@/lib/server/google-chat"

const KUDOS_SPACE_ID = process.env.GOOGLE_CHAT_KUDOS_SPACE_ID ?? ""
const CRON_SECRET = process.env.CRON_SECRET ?? ""
const DEFAULT_AVATAR = "https://build3.online/apple-icon.png"

const BIRTHDAY_MESSAGES = [
  "Happy Birthday! 🎂 Hope your day is filled with joy and cake!",
  "It's your special day! 🎉 Wishing you an amazing birthday!",
  "Happy Birthday! 🥳 May this year bring you incredible things!",
  "Birthday vibes only! 🎈 Have the best day ever!",
  "Cheers to another trip around the sun! 🌟 Happy Birthday!",
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
  const mm = String(now.getMonth() + 1).padStart(2, "0")
  const dd = String(now.getDate()).padStart(2, "0")
  const today = `${mm}-${dd}`

  const supabaseAdmin = getSupabaseAdmin()
  const { data: birthdayPeople, error } = await supabaseAdmin
    .from("employees")
    .select("id, name, email")
    .eq("birthday", today)

  if (error) {
    return NextResponse.json({ error: "DB query failed." }, { status: 500 })
  }

  if (!birthdayPeople || birthdayPeople.length === 0) {
    return NextResponse.json({ wished: 0, today })
  }

  const results: { name: string; success: boolean; error?: string }[] = []

  for (const person of birthdayPeople) {
    try {
      const photoUrl = person.email ? await getProfilePhotoUrl(person.email) : null
      const message = BIRTHDAY_MESSAGES[Math.floor(Math.random() * BIRTHDAY_MESSAGES.length)]

      const card = {
        text: `🎂 Happy Birthday, *${person.name}*! 🎉`,
        cardsV2: [
          {
            cardId: `birthday-${Date.now()}-${person.id.slice(0, 8)}`,
            card: {
              header: {
                title: `🎂 Happy Birthday, ${person.name}!`,
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

      await sendCardToSpace(KUDOS_SPACE_ID, card)
      results.push({ name: person.name, success: true })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      results.push({ name: person.name, success: false, error: msg })
    }
  }

  return NextResponse.json({ wished: results.filter((r) => r.success).length, today, results })
}
