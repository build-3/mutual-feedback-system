import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/server/require-admin"
import { getSupabaseAdmin, hasServerSupabaseConfig } from "@/lib/server/supabase-admin"
import { consumeRateLimit, getRequestIp } from "@/lib/server/rate-limit"
import { sendCardToSpace, getProfilePhotoUrl } from "@/lib/server/google-chat"
import { persistKudos, getPreviousGiversForRecipient } from "@/lib/server/kudos"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ALLOWED_GIF_PREFIXES = ["https://media.giphy.com/", "https://i.giphy.com/", "https://media0.giphy.com/", "https://media1.giphy.com/", "https://media2.giphy.com/", "https://media3.giphy.com/", "https://media4.giphy.com/"]
const KUDOS_SPACE_ID = process.env.GOOGLE_CHAT_KUDOS_SPACE_ID ?? ""
const DEFAULT_AVATAR = "https://build3.online/apple-icon.png"
const MAX_RECIPIENTS = 20

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  if (!auth.employee) {
    return NextResponse.json({ error: "No employee record found." }, { status: 403 })
  }

  if (!hasServerSupabaseConfig()) {
    return NextResponse.json({ error: "Server configuration is incomplete." }, { status: 503 })
  }

  const ip = getRequestIp(request)
  const rl = consumeRateLimit({ bucket: "kudos-send", key: ip, limit: 5, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many kudos. Please slow down." }, { status: 429 })
  }

  let body: { recipientIds?: string[]; message?: string; gifUrl?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 })
  }

  const { recipientIds, message, gifUrl } = body

  if (!recipientIds || !Array.isArray(recipientIds) || recipientIds.length === 0) {
    return NextResponse.json({ error: "At least one recipient required." }, { status: 400 })
  }
  if (recipientIds.length > MAX_RECIPIENTS) {
    return NextResponse.json({ error: `Maximum ${MAX_RECIPIENTS} recipients.` }, { status: 400 })
  }
  if (recipientIds.some((id) => !UUID_RE.test(id))) {
    return NextResponse.json({ error: "Invalid recipient ID." }, { status: 400 })
  }
  if (!message || message.trim().length < 10 || message.trim().length > 500) {
    return NextResponse.json({ error: "Message must be 10-500 characters." }, { status: 400 })
  }
  if (!gifUrl || !ALLOWED_GIF_PREFIXES.some((p) => gifUrl.startsWith(p))) {
    return NextResponse.json({ error: "Invalid GIF URL." }, { status: 400 })
  }
  if (recipientIds.includes(auth.employee.id)) {
    return NextResponse.json({ error: "Cannot send kudos to yourself." }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data: recipients, error: recipientError } = await supabaseAdmin
    .from("employees")
    .select("id, name, email")
    .in("id", recipientIds)

  if (recipientError || !recipients || recipients.length === 0) {
    return NextResponse.json({ error: "Recipients not found." }, { status: 404 })
  }

  if (!KUDOS_SPACE_ID) {
    return NextResponse.json({ error: "Kudos chat space not configured." }, { status: 503 })
  }

  const senderName = auth.employee.name
  const trimmedMessage = message.trim()

  // Fetch profile photos in parallel
  const photoResults = await Promise.all(
    recipients.map(async (r) => {
      const photo = r.email ? await getProfilePhotoUrl(r.email) : null
      return { ...r, photoUrl: photo }
    })
  )

  // Build recipient name list for text fallback
  const names = photoResults.map((r) => r.name)
  const namesBold = names.map((n) => `*${n}*`)
  const namesText = namesBold.length <= 2
    ? namesBold.join(" and ")
    : `${namesBold.slice(0, -1).join(", ")} and ${namesBold[namesBold.length - 1]}`

  // Persist kudos to DB first so social-proof footer reflects this send too.
  // If persistence fails, fail the request — we never want a chat-only send.
  let persistedKudosId: string
  try {
    const persisted = await persistKudos(auth.employee.id, recipientIds, trimmedMessage, gifUrl)
    persistedKudosId = persisted.id
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: `Failed to save kudos: ${msg}` }, { status: 500 })
  }

  // Build "X, Y, Z and N more have given kudos too" footer.
  // We compute previous givers across all recipients combined (distinct senders,
  // excluding the current sender), so the social proof feels collective.
  const previousGivers = await Promise.all(
    photoResults.map((r) =>
      getPreviousGiversForRecipient(r.id, auth.employee!.id, 10).catch(() => ({
        names: [] as string[],
        extraCount: 0,
      }))
    )
  )
  const allPriorNames: string[] = []
  const seenNames = new Set<string>()
  for (const pg of previousGivers) {
    for (const n of pg.names) {
      if (!seenNames.has(n)) {
        seenNames.add(n)
        allPriorNames.push(n)
      }
    }
  }
  const topThree = allPriorNames.slice(0, 3)
  const extraCount = Math.max(0, allPriorNames.length - 3)
  const priorBlurb = topThree.length === 0
    ? null
    : `*${topThree.join(", ")}*${extraCount > 0 ? ` and ${extraCount} more` : ""} ${topThree.length === 1 && extraCount === 0 ? "has" : "have"} given kudos too.`

  // Build one card per recipient as separate cardsV2 entries (stacked in one message)
  const isLast = (i: number) => i === photoResults.length - 1
  const cards = photoResults.map((r, i) => {
    const card: Record<string, unknown> = {
      header: {
        title: r.name,
        subtitle: "✨ Congrats!",
        imageUrl: r.photoUrl || DEFAULT_AVATAR,
        imageType: "CIRCLE",
      },
    }
    if (isLast(i)) {
      const sections: Record<string, unknown>[] = [
        {
          widgets: [{ image: { imageUrl: gifUrl, altText: "Celebration" } }],
        },
        {
          widgets: [
            {
              decoratedText: {
                text: `<i>"${trimmedMessage}"</i>`,
                wrapText: true,
                bottomLabel: `Given by ${senderName}`,
              },
            },
            // "Kudos ++" button — opens our web app so the click is
            // attributed via the user's existing Supabase session. This
            // sidesteps the Chat interactive-callback flow which is
            // unreliable when the Chat app is in Workspace add-on mode.
            {
              buttonList: {
                buttons: [
                  {
                    text: "Kudos ++",
                    onClick: {
                      openLink: {
                        url: `https://build3.online/api/kudos/boost?id=${persistedKudosId}`,
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      ]
      if (priorBlurb) {
        sections.push({
          widgets: [
            {
              decoratedText: {
                text: priorBlurb,
                wrapText: true,
                startIcon: { knownIcon: "STAR" },
              },
            },
          ],
        })
      }
      card.sections = sections
    }
    return { cardId: `kudos-${Date.now()}-${i}`, card }
  })

  const cardPayload = {
    text: `Hey, ${namesText} got kudos! 👏`,
    cardsV2: cards,
  }

  try {
    await sendCardToSpace(KUDOS_SPACE_ID, cardPayload)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: `Failed to send kudos: ${msg}` }, { status: 502 })
  }

  return NextResponse.json({ success: true })
}
