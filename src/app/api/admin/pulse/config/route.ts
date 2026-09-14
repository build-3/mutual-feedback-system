import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/server/require-admin"
import { getSupabaseAdmin } from "@/lib/server/supabase-admin"
import { loadPulseConfig, loadPulseRecipients } from "@/lib/server/pulse"
import { DEFAULT_PULSE_CONFIG } from "@/lib/pulse-scoring"

export async function GET() {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const [config, recipients] = await Promise.all([loadPulseConfig(), loadPulseRecipients()])
  return NextResponse.json({ config, recipients, defaults: DEFAULT_PULSE_CONFIG })
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function num(value: unknown, lo: number, hi: number, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(hi, Math.max(lo, n))
}

/**
 * Update thresholds, weights, or recipients.
 *
 * Every field is clamped to a sane range on the way in. A weight set that sums
 * to zero, or a doing-well line below the on-the-fence line, would not error —
 * it would quietly produce a nonsense report, and the first anyone would know
 * is a teammate receiving the wrong note.
 */
export async function PATCH(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const current = await loadPulseConfig()

  if (body.recipients !== undefined) {
    if (!Array.isArray(body.recipients)) {
      return NextResponse.json({ error: "Recipients must be a list." }, { status: 400 })
    }
    const cleaned = Array.from(
      new Set(
        body.recipients
          .filter((e): e is string => typeof e === "string")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean)
      )
    )
    const bad = cleaned.filter((e) => !EMAIL.test(e))
    if (bad.length > 0) {
      return NextResponse.json(
        { error: `Not an email address: ${bad.join(", ")}` },
        { status: 400 }
      )
    }
    await supabaseAdmin
      .from("site_settings" as never)
      .upsert({ key: "pulse_recipients", value: JSON.stringify(cleaned), updated_at: new Date().toISOString() } as never)
  }

  if (body.config !== undefined) {
    const incoming = body.config as Record<string, unknown>
    const weightsIn = (incoming.weights ?? {}) as Record<string, unknown>
    const cutsIn = (incoming.cut_lines ?? {}) as Record<string, Record<string, unknown>>

    const weights = {
      trust_battery: num(weightsIn.trust_battery, 0, 1, current.weights.trust_battery),
      teal: num(weightsIn.teal, 0, 1, current.weights.teal),
      contribution: num(weightsIn.contribution, 0, 1, current.weights.contribution),
      purpose: num(weightsIn.purpose, 0, 1, current.weights.purpose),
      backing: num(weightsIn.backing, 0, 1, current.weights.backing),
    }
    const weightTotal = Object.values(weights).reduce((a, b) => a + b, 0)
    if (weightTotal <= 0) {
      return NextResponse.json(
        { error: "At least one weight has to be above zero." },
        { status: 400 }
      )
    }

    const cutLines = {
      full_timer: {
        doing_well: num(cutsIn.full_timer?.doing_well, 0, 100, current.cut_lines.full_timer.doing_well),
        on_the_fence: num(cutsIn.full_timer?.on_the_fence, 0, 100, current.cut_lines.full_timer.on_the_fence),
      },
      probation: {
        doing_well: num(cutsIn.probation?.doing_well, 0, 100, current.cut_lines.probation.doing_well),
        on_the_fence: num(cutsIn.probation?.on_the_fence, 0, 100, current.cut_lines.probation.on_the_fence),
      },
    }
    for (const [cohort, lines] of Object.entries(cutLines)) {
      if (lines.doing_well <= lines.on_the_fence) {
        return NextResponse.json(
          { error: `The ${cohort} doing-well line has to sit above its on-the-fence line.` },
          { status: 400 }
        )
      }
    }

    const next = {
      weights,
      cut_lines: cutLines,
      min_reviews: Math.round(num(incoming.min_reviews, 1, 10, current.min_reviews)),
      window_cycles: Math.round(num(incoming.window_cycles, 1, 12, current.window_cycles)),
      send_verbatim_to_llm:
        typeof incoming.send_verbatim_to_llm === "boolean"
          ? incoming.send_verbatim_to_llm
          : current.send_verbatim_to_llm,
      exclude_emails: Array.isArray(incoming.exclude_emails)
        ? incoming.exclude_emails
            .filter((e): e is string => typeof e === "string")
            .map((e) => e.trim().toLowerCase())
            .filter(Boolean)
        : current.exclude_emails,
    }

    await supabaseAdmin
      .from("site_settings" as never)
      .upsert({ key: "pulse_config", value: JSON.stringify(next), updated_at: new Date().toISOString() } as never)
  }

  const [config, recipients] = await Promise.all([loadPulseConfig(), loadPulseRecipients()])
  return NextResponse.json({ config, recipients })
}
