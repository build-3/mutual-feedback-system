import "server-only"

import { getProfilePhotoUrl } from "./google-chat"

const DEFAULT_AVATAR = "https://build3.online/apple-icon.png"

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

function formatDay(dd: string): string {
  const n = parseInt(dd, 10)
  if (n >= 11 && n <= 13) return `${n}th`
  const s = ["th", "st", "nd", "rd"]
  return `${n}${s[n % 10] || s[0]}`
}

type BirthdayPerson = { id: string; name: string; email?: string | null; birthday?: string | null }

export async function buildMonthlyRoundupCard(
  people: BirthdayPerson[],
  nextMonthIndex: number,
): Promise<Record<string, unknown>> {
  const nextMonthName = MONTH_NAMES[nextMonthIndex % 12]
  const count = people.length

  const photoResults = await Promise.all(
    people.map(async (p) => {
      const photo = p.email ? await getProfilePhotoUrl(p.email) : null
      return { ...p, photoUrl: photo }
    })
  )

  const names = photoResults.map((r) => r.name)
  const namesBold = names.map((n) => `*${n}*`)
  const namesText = namesBold.length <= 2
    ? namesBold.join(" and ")
    : `${namesBold.slice(0, -1).join(", ")} and ${namesBold[namesBold.length - 1]}`

  const isLast = (i: number) => i === photoResults.length - 1

  const cards = photoResults.map((r, i) => {
    const dd = r.birthday?.split("-")[1] ?? "?"
    const card: Record<string, unknown> = {
      header: {
        title: `🎈 ${r.name}`,
        subtitle: `${nextMonthName} ${formatDay(dd)}`,
        imageUrl: r.photoUrl || DEFAULT_AVATAR,
        imageType: "CIRCLE",
      },
    }
    if (isLast(i)) {
      card.sections = [
        {
          widgets: [
            {
              decoratedText: {
                text: "Mark your calendars and make them feel special! 🎉",
                wrapText: true,
              },
            },
          ],
        },
      ]
    }
    return { cardId: `birthday-monthly-${Date.now()}-${i}`, card }
  })

  return {
    text: `🎂 Birthdays coming up in ${nextMonthName}! ${namesText} — ${count} birthday${count === 1 ? "" : "s"} next month.`,
    cardsV2: cards,
  }
}

export async function buildEveReminderCard(
  people: BirthdayPerson[],
): Promise<Record<string, unknown>> {
  const count = people.length

  const photoResults = await Promise.all(
    people.map(async (p) => {
      const photo = p.email ? await getProfilePhotoUrl(p.email) : null
      return { ...p, photoUrl: photo }
    })
  )

  const names = photoResults.map((r) => r.name)
  const namesBold = names.map((n) => `*${n}*`)
  const namesText = namesBold.length <= 2
    ? namesBold.join(" and ")
    : `${namesBold.slice(0, -1).join(", ")} and ${namesBold[namesBold.length - 1]}`

  const isLast = (i: number) => i === photoResults.length - 1

  const cards = photoResults.map((r, i) => {
    const card: Record<string, unknown> = {
      header: {
        title: `🎉 ${r.name}`,
        subtitle: "Birthday tomorrow!",
        imageUrl: r.photoUrl || DEFAULT_AVATAR,
        imageType: "CIRCLE",
      },
    }
    if (isLast(i)) {
      card.sections = [
        {
          widgets: [
            {
              decoratedText: {
                text: count === 1
                  ? "Don't forget to wish them! Send some kudos or drop a message in chat. 🎂"
                  : "Don't forget to wish them! 🎂",
                wrapText: true,
              },
            },
          ],
        },
      ]
    }
    return { cardId: `birthday-eve-${Date.now()}-${i}`, card }
  })

  const textLine = count === 1
    ? `🎉 Tomorrow is ${namesText}'s birthday! 🥳`
    : `🎉 Tomorrow we're celebrating ${count} birthdays! ${namesText} 🥳`

  return {
    text: textLine,
    cardsV2: cards,
  }
}
