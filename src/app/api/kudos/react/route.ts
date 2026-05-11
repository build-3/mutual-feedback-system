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
  // Legacy Hangouts Chat shape
  action?: {
    actionMethodName?: string
    parameters?: Array<{ key: string; value: string }>
  }
}

/** Read the invoked function name from either modern (common.invokedFunction)
 *  or legacy (action.actionMethodName) event shape. */
function getInvokedFunction(event: ChatEvent): string | undefined {
  return event.common?.invokedFunction ?? event.action?.actionMethodName
}

/** Read action parameters from either modern (common.parameters object) or
 *  legacy (action.parameters array of {key, value}) event shape. */
function getActionParameters(event: ChatEvent): Record<string, string> {
  if (event.common?.parameters) return event.common.parameters
  if (event.action?.parameters) {
    const out: Record<string, string> = {}
    for (const p of event.action.parameters) {
      if (p.key) out[p.key] = p.value ?? ""
    }
    return out
  }
  return {}
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

  const invokedFunction = getInvokedFunction(event)
  const params = getActionParameters(event)

  console.log("[kudos/react] event:", JSON.stringify({
    type: event.type,
    invokedFunction,
    user: event.user?.email,
    hasMessage: !!event.message,
    hasCards: !!event.message?.cardsV2,
    paramKeys: Object.keys(params),
  }))

  if (invokedFunction !== "kudos_react") {
    return NextResponse.json({})
  }

  const reactorName = event.user?.displayName
  const reactorEmail = event.user?.email
  if (!reactorName || !reactorEmail) {
    console.warn("[kudos/react] missing user info", event.user)
    return NextResponse.json({ text: "Missing user info." })
  }

  const originalCards = event.message?.cardsV2
  if (!originalCards || originalCards.length === 0) {
    console.warn("[kudos/react] no cards in message")
    return NextResponse.json({ text: "Could not update card." })
  }

  // Read existing reactors from action parameters
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
