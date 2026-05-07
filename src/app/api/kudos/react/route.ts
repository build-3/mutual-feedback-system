import { NextResponse } from "next/server"

const MAX_NAMES_SHOWN = 3

interface ActionParameter {
  key: string
  value: string
}

interface ChatEvent {
  type?: string
  message?: {
    name?: string
    cardsV2?: Array<{
      cardId?: string
      card?: Record<string, unknown>
    }>
    text?: string
  }
  user?: {
    displayName?: string
    email?: string
  }
  common?: {
    invokedFunction?: string
    parameters?: Record<string, string>
  }
}

function formatNamesText(names: string[]): string {
  if (names.length === 0) return ""
  if (names.length <= MAX_NAMES_SHOWN) {
    const bold = names.map((n) => `*${n}*`)
    return bold.length <= 2
      ? bold.join(" and ")
      : `${bold.slice(0, -1).join(", ")} and ${bold[bold.length - 1]}`
  }
  const shown = names.slice(0, MAX_NAMES_SHOWN).map((n) => `*${n}*`)
  const remaining = names.length - MAX_NAMES_SHOWN
  return `${shown.join(", ")} and ${remaining} other${remaining > 1 ? "s" : ""}`
}

export async function POST(request: Request) {
  let event: ChatEvent
  try {
    event = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 })
  }

  if (event.common?.invokedFunction !== "kudos_react") {
    return NextResponse.json({})
  }

  const reactorName = event.user?.displayName
  const reactorEmail = event.user?.email
  if (!reactorName || !reactorEmail) {
    return NextResponse.json({ text: "Missing user info." })
  }

  const originalCards = event.message?.cardsV2
  if (!originalCards || originalCards.length === 0) {
    return NextResponse.json({ text: "Could not update card." })
  }

  // Read existing reactors from action parameters
  const params = event.common?.parameters ?? {}
  const existingReactors = params.reactors ? params.reactors.split("|") : []
  const existingEmails = params.reactor_emails ? params.reactor_emails.split("|") : []

  // Deduplicate by email — clicking again is a no-op
  if (existingEmails.includes(reactorEmail)) {
    return NextResponse.json({
      actionResponse: { type: "UPDATE_MESSAGE" },
      cardsV2: originalCards,
    })
  }

  const allNames = [...existingReactors, reactorName]
  const allEmails = [...existingEmails, reactorEmail]
  const namesText = formatNamesText(allNames)

  // Clone cards and update last card's final section
  const updatedCards = JSON.parse(JSON.stringify(originalCards))
  const lastCard = updatedCards[updatedCards.length - 1]
  const sections = lastCard?.card?.sections as Array<{ widgets: unknown[] }> | undefined

  if (sections && sections.length > 0) {
    const buttonSection = sections[sections.length - 1]
    const actionParams: ActionParameter[] = [
      { key: "action", value: "kudos_react" },
      { key: "reactors", value: allNames.join("|") },
      { key: "reactor_emails", value: allEmails.join("|") },
    ]

    buttonSection.widgets = [
      {
        decoratedText: {
          text: "Celebrate with your team!",
          button: {
            text: "Kudos ++",
            onClick: {
              action: {
                function: "kudos_react",
                parameters: actionParams,
              },
            },
          },
        },
      },
      {
        decoratedText: {
          text: `${namesText} ha${allNames.length === 1 ? "s" : "ve"} given kudos too.`,
          wrapText: true,
        },
      },
    ]
  }

  return NextResponse.json({
    actionResponse: { type: "UPDATE_MESSAGE" },
    cardsV2: updatedCards,
  })
}
