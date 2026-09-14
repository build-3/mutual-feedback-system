"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  BrandPanel,
  Eyebrow,
  SectionHeading,
  buttonClasses,
  fieldClasses,
} from "@/components/ui/brand"
import { getAvatarColor, getInitials } from "@/lib/insights-helpers"
import type { Accent } from "@/lib/brand"

type Bucket = "needs_conversation" | "on_the_fence" | "doing_well" | "not_enough_signal"

type Note = {
  id: string
  text: string
  source: string
  status: "draft" | "sent" | "skipped" | "failed"
  sentAt: string | null
  error: string | null
}

type Person = {
  employeeId: string
  name: string
  email: string | null
  cohort: "full_timer" | "probation"
  bucket: Bucket
  composite: number | null
  prevComposite: number | null
  components: Record<string, number>
  reviewCount: number
  reviewScores: number[]
  coverageExpected: number
  coverageReceived: number
  selfReviewFiled: boolean
  probationEndDate: string | null
  probationOverdue: boolean
  note: Note | null
}

type Run = {
  id: string
  cycleKey: string
  runDate: string
  reportSentAt: string | null
  reportRecipients: string[]
}

type Config = {
  weights: Record<string, number>
  cut_lines: Record<"full_timer" | "probation", { doing_well: number; on_the_fence: number }>
  min_reviews: number
  window_cycles: number
  send_verbatim_to_llm: boolean
  exclude_emails: string[]
}

type Payload = {
  run: Run | null
  people: Person[]
  config: Config
  recipients: string[]
  runs: { id: string; cycle_key: string }[]
}

const BUCKETS: { key: Bucket; label: string; accent: Accent }[] = [
  { key: "needs_conversation", label: "🔴 needs a conversation", accent: "pink" },
  { key: "on_the_fence", label: "🟠 on the fence", accent: "peach" },
  { key: "doing_well", label: "🟢 doing well", accent: "sage" },
  { key: "not_enough_signal", label: "⚪ not enough signal", accent: "sky" },
]

const COMPONENT_LABELS: Record<string, string> = {
  trust_battery: "trust battery",
  teal: "teal principles",
  contribution: "contribution level",
  purpose: "purpose alignment",
  backing: "backing",
}

const STATUS_STYLE: Record<Note["status"], string> = {
  draft: "bg-black/5 text-muted",
  sent: "bg-[#79c0a6]/20 text-[#3f7f68]",
  skipped: "bg-black/5 text-muted line-through",
  failed: "bg-[#d35b52]/12 text-[#d35b52]",
}

export default function PulseReview() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [expanded, setExpanded] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [flash, setFlash] = useState("")
  /**
   * Bulk send is two clicks, never one. A note cannot be unsent, and this
   * button sits directly above the rows it fires for — one stray click on the
   * wrong element is enough to message someone about their performance.
   */
  const [confirmBulk, setConfirmBulk] = useState<Bucket | null>(null)
  const [showConfig, setShowConfig] = useState(false)
  const [draftConfig, setDraftConfig] = useState<Config | null>(null)
  const [draftRecipients, setDraftRecipients] = useState("")

  const load = useCallback(async (runId?: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/pulse${runId ? `?run=${runId}` : ""}`, {
        cache: "no-store",
      })
      if (!res.ok) throw new Error("could not load the pulse run")
      const payload: Payload = await res.json()
      setData(payload)
      setDraftConfig(payload.config)
      setDraftRecipients((payload.recipients ?? []).join(", "))
      setError("")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "something went wrong")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    void load(params.get("run") ?? undefined)
  }, [load])

  const textFor = useCallback(
    (person: Person) => edits[person.note?.id ?? ""] ?? person.note?.text ?? "",
    [edits]
  )

  const act = useCallback(
    async (path: string, body: Record<string, unknown>, label: string) => {
      setBusy(label)
      try {
        const res = await fetch(`/api/admin/pulse/${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? "that did not work")
        setFlash(
          path === "send"
            ? `sent ${json.sent} note${json.sent === 1 ? "" : "s"}`
            : path === "skip"
            ? "marked as skipped"
            : "redrafted"
        )
        await load(data?.run?.id)
      } catch (err: unknown) {
        setFlash(err instanceof Error ? err.message : "that did not work")
      } finally {
        setBusy(null)
      }
    },
    [data?.run?.id, load]
  )

  const saveConfig = useCallback(async () => {
    if (!draftConfig) return
    setBusy("config")
    try {
      const res = await fetch("/api/admin/pulse/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: draftConfig,
          recipients: draftRecipients
            .split(",")
            .map((e) => e.trim())
            .filter(Boolean),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "could not save those settings")
      setFlash("settings saved")
      await load(data?.run?.id)
    } catch (err: unknown) {
      setFlash(err instanceof Error ? err.message : "could not save those settings")
    } finally {
      setBusy(null)
    }
  }, [draftConfig, draftRecipients, data?.run?.id, load])

  const grouped = useMemo(() => {
    const out = new Map<Bucket, Person[]>()
    for (const bucket of BUCKETS) {
      out.set(
        bucket.key,
        (data?.people ?? []).filter((p) => p.bucket === bucket.key)
      )
    }
    return out
  }, [data])

  const overdue = useMemo(
    () => (data?.people ?? []).filter((p) => p.probationOverdue),
    [data]
  )

  if (loading) {
    return <div className="py-12 text-center text-sm text-muted">loading the latest run…</div>
  }

  if (error) {
    return (
      <BrandPanel accent="pink" tone="washed" className="p-6 text-sm text-[#d35b52]">
        {error}
      </BrandPanel>
    )
  }

  if (!data?.run) {
    return (
      <div className="space-y-6">
        <SectionHeading
          accent="sky"
          eyebrow="admin"
          title="pulse"
          description="no run yet. the pulse runs the morning after each session and reports on the cycle that just closed."
        />
        <BrandPanel accent="sky" tone="washed" className="p-6 text-sm text-muted">
          nothing to review. once a run lands, every teammate appears here in one of four
          groups with a drafted note you can read, edit, and send.
        </BrandPanel>
      </div>
    )
  }

  const pending = (data.people ?? []).filter((p) => p.note?.status === "draft").length

  return (
    <div className="space-y-6">
      <SectionHeading
        accent="sky"
        eyebrow="admin"
        title="pulse"
        description="every teammate, sorted by how this cycle read. notes are drafted but never sent on their own — read each one, edit it if you want, then send."
      />

      <BrandPanel accent="sky" tone="plain" className="p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <Eyebrow accent="sky">cycle</Eyebrow>
            <p className="mt-1 text-lg font-semibold text-ink">{data.run.cycleKey}</p>
          </div>
          <div className="text-right text-xs text-muted">
            <p>
              {data.run.reportSentAt
                ? `report sent ${new Date(data.run.reportSentAt).toLocaleString()}`
                : "report not sent"}
            </p>
            <p>{data.run.reportRecipients.join(", ") || "no recipients configured"}</p>
            <p className="mt-1 font-semibold text-ink">
              {pending} note{pending === 1 ? "" : "s"} still waiting on you
            </p>
          </div>
        </div>

        {data.runs.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
            {data.runs.map((r) => (
              <button
                key={r.id}
                onClick={() => void load(r.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  r.id === data.run?.id ? "bg-ink text-white" : "bg-black/5 text-muted hover:bg-black/10"
                }`}
              >
                {r.cycle_key}
              </button>
            ))}
          </div>
        )}
      </BrandPanel>

      {overdue.length > 0 && (
        <BrandPanel accent="peach" tone="washed" className="p-5">
          <Eyebrow accent="peach">probation ended, still open — {overdue.length}</Eyebrow>
          <p className="mt-2 text-sm text-ink">
            {overdue.map((p) => `${p.name} (${p.probationEndDate})`).join(", ")}
          </p>
          <p className="mt-1 text-xs text-muted">promote, extend, or close these.</p>
        </BrandPanel>
      )}

      {flash && (
        <BrandPanel accent="sage" tone="washed" className="p-4 text-sm text-ink">
          {flash}
        </BrandPanel>
      )}

      <BrandPanel accent="lavender" tone="plain" className="p-5">
        <button
          onClick={() => setShowConfig((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <Eyebrow accent="lavender">thresholds and recipients</Eyebrow>
          <span className="text-xs text-muted">{showConfig ? "hide" : "show"}</span>
        </button>

        {showConfig && draftConfig && (
          <div className="mt-5 space-y-5">
            <p className="text-xs text-muted">
              changing these does not rescore this run. the next run uses them — or hit
              redraft on a note to rescore that person now.
            </p>

            {(["full_timer", "probation"] as const).map((cohort) => (
              <div key={cohort} className="grid gap-4 sm:grid-cols-2">
                {(["doing_well", "on_the_fence"] as const).map((line) => (
                  <div key={line}>
                    <label
                      className="text-xs font-semibold tracking-[0.08em] text-muted"
                      htmlFor={`${cohort}-${line}`}
                    >
                      {cohort === "full_timer" ? "full-timer" : "on probation"} ·{" "}
                      {line === "doing_well" ? "doing well at or above" : "on the fence at or above"}
                    </label>
                    <div className="mt-2 flex items-center gap-3">
                      <input
                        id={`${cohort}-${line}`}
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={draftConfig.cut_lines[cohort][line]}
                        onChange={(e) =>
                          setDraftConfig({
                            ...draftConfig,
                            cut_lines: {
                              ...draftConfig.cut_lines,
                              [cohort]: {
                                ...draftConfig.cut_lines[cohort],
                                [line]: Number(e.target.value),
                              },
                            },
                          })
                        }
                        className="flex-1"
                      />
                      <span className="w-10 text-right text-lg font-semibold text-ink">
                        {draftConfig.cut_lines[cohort][line]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ))}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold tracking-[0.08em] text-muted" htmlFor="min-reviews">
                  minimum reviews before anyone is bucketed
                </label>
                <input
                  id="min-reviews"
                  type="number"
                  min={1}
                  max={10}
                  className={`${fieldClasses({ size: "sm" })} mt-2`}
                  value={draftConfig.min_reviews}
                  onChange={(e) =>
                    setDraftConfig({ ...draftConfig, min_reviews: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className="text-xs font-semibold tracking-[0.08em] text-muted" htmlFor="window-cycles">
                  cycles in the scoring window
                </label>
                <input
                  id="window-cycles"
                  type="number"
                  min={1}
                  max={12}
                  className={`${fieldClasses({ size: "sm" })} mt-2`}
                  value={draftConfig.window_cycles}
                  onChange={(e) =>
                    setDraftConfig({ ...draftConfig, window_cycles: Number(e.target.value) })
                  }
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold tracking-[0.08em] text-muted" htmlFor="recipients">
                report goes to (comma separated)
              </label>
              <input
                id="recipients"
                className={`${fieldClasses({ size: "sm" })} mt-2`}
                value={draftRecipients}
                onChange={(e) => setDraftRecipients(e.target.value)}
                placeholder="at@build3.org, br@build3.org"
              />
              <p className="mt-1.5 text-xs text-muted">
                leave this empty and the run sends nothing at all.
              </p>
            </div>

            <label className="flex items-center gap-2.5 text-sm text-ink">
              <input
                type="checkbox"
                checked={draftConfig.send_verbatim_to_llm}
                onChange={(e) =>
                  setDraftConfig({ ...draftConfig, send_verbatim_to_llm: e.target.checked })
                }
              />
              send written feedback to the model when drafting notes
            </label>
            <p className="-mt-3 text-xs text-muted">
              on, the notes can be specific about what to work on, and colleagues&apos; written
              feedback leaves our servers for openai. off, notes name the weak areas only.
            </p>

            <button
              {...buttonClasses({ accent: "lavender", size: "sm" })}
              disabled={busy !== null}
              onClick={() => void saveConfig()}
            >
              {busy === "config" ? "saving…" : "save settings"}
            </button>
          </div>
        )}
      </BrandPanel>

      {BUCKETS.map((bucket) => {
        const group = grouped.get(bucket.key) ?? []
        if (group.length === 0) return null

        const sendable = group.filter((p) => p.note?.status === "draft" && p.email)

        return (
          <div key={bucket.key} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold tracking-[-0.01em] text-ink">
                {bucket.label} — {group.length}
              </h3>
              {sendable.length > 0 &&
                (confirmBulk === bucket.key ? (
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-muted">
                      message {sendable.length} {sendable.length === 1 ? "person" : "people"}? this
                      cannot be undone.
                    </span>
                    <button
                      {...buttonClasses({ accent: bucket.accent, size: "sm" })}
                      disabled={busy !== null}
                      onClick={() => {
                        setConfirmBulk(null)
                        void act(
                          "send",
                          { noteIds: sendable.map((p) => p.note!.id), edits },
                          `bulk-${bucket.key}`
                        )
                      }}
                    >
                      {busy === `bulk-${bucket.key}` ? "sending…" : "yes, send"}
                    </button>
                    <button
                      {...buttonClasses({ variant: "ghost", size: "sm" })}
                      onClick={() => setConfirmBulk(null)}
                    >
                      cancel
                    </button>
                  </span>
                ) : (
                  <button
                    {...buttonClasses({ accent: bucket.accent, variant: "outline", size: "sm" })}
                    disabled={busy !== null}
                    onClick={() => setConfirmBulk(bucket.key)}
                  >
                    send all {sendable.length} draft{sendable.length === 1 ? "" : "s"}…
                  </button>
                ))}
            </div>

            <div className="overflow-hidden rounded-[22px] border border-line bg-white">
              {group.map((person) => {
                const isOpen = expanded === person.employeeId
                const delta =
                  person.composite !== null && person.prevComposite !== null
                    ? Math.round(person.composite - person.prevComposite)
                    : null

                return (
                  <div key={person.employeeId} className="border-b border-line last:border-0">
                    <button
                      onClick={() => setExpanded(isOpen ? null : person.employeeId)}
                      className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-black/[0.02]"
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                        style={{ backgroundColor: getAvatarColor(person.name) }}
                      >
                        {getInitials(person.name)}
                      </span>
                      <span className="flex-1 min-w-[8rem]">
                        <span className="block font-semibold text-ink">{person.name}</span>
                        <span className="block text-xs text-muted">
                          {person.cohort === "probation" ? "on probation" : "full-timer"}
                          {" · "}
                          {person.reviewCount} review{person.reviewCount === 1 ? "" : "s"}
                          {person.reviewScores.length > 0 && `: ${person.reviewScores.join(", ")}`}
                          {" · coverage "}
                          {person.coverageReceived}/{person.coverageExpected}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block text-lg font-bold tracking-[-0.03em] text-ink">
                          {person.composite === null ? "—" : Math.round(person.composite)}
                        </span>
                        {delta !== null && (
                          <span className="block text-[11px] text-muted">
                            {delta === 0 ? "→" : delta > 0 ? `↑${delta}` : `↓${Math.abs(delta)}`}
                          </span>
                        )}
                      </span>
                      {person.note && (
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLE[person.note.status]}`}
                        >
                          {person.note.status}
                        </span>
                      )}
                    </button>

                    {isOpen && (
                      <div className="space-y-4 border-t border-line bg-black/[0.015] px-4 py-4">
                        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                          {Object.entries(person.components).map(([key, value]) => (
                            <span key={key}>
                              {COMPONENT_LABELS[key] ?? key}{" "}
                              <span className="font-semibold text-ink">{Math.round(value)}</span>
                            </span>
                          ))}
                          <span>
                            self review{" "}
                            <span className="font-semibold text-ink">
                              {person.selfReviewFiled ? "filed" : "not filed"}
                            </span>
                          </span>
                          {person.probationEndDate && (
                            <span>
                              probation{" "}
                              <span className="font-semibold text-ink">
                                {person.probationOverdue ? "ended" : "ends"} {person.probationEndDate}
                              </span>
                            </span>
                          )}
                        </div>

                        {!person.note ? (
                          <p className="text-sm text-muted">no note was drafted for this run.</p>
                        ) : (
                          <>
                            <div>
                              <label
                                className="text-[11px] font-semibold tracking-[0.08em] text-muted"
                                htmlFor={`note-${person.employeeId}`}
                              >
                                the note {person.name.split(" ")[0]} will receive
                                {person.note.source === "template" && " · template fallback"}
                              </label>
                              <textarea
                                id={`note-${person.employeeId}`}
                                className={`${fieldClasses({ size: "sm" })} mt-2 min-h-[10rem] font-normal`}
                                value={textFor(person)}
                                disabled={person.note.status === "sent"}
                                onChange={(e) =>
                                  setEdits((prev) => ({
                                    ...prev,
                                    [person.note!.id]: e.target.value,
                                  }))
                                }
                              />
                            </div>

                            {person.note.error && (
                              <p className="text-xs text-[#d35b52]">{person.note.error}</p>
                            )}

                            {person.note.status === "sent" ? (
                              <p className="text-xs text-muted">
                                sent{" "}
                                {person.note.sentAt
                                  ? new Date(person.note.sentAt).toLocaleString()
                                  : ""}{" "}
                                — this cannot be unsent.
                              </p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                <button
                                  {...buttonClasses({ accent: bucket.accent, size: "sm" })}
                                  disabled={busy !== null || !person.email}
                                  onClick={() =>
                                    void act(
                                      "send",
                                      {
                                        noteIds: [person.note!.id],
                                        edits: { [person.note!.id]: textFor(person) },
                                      },
                                      person.employeeId
                                    )
                                  }
                                >
                                  {busy === person.employeeId
                                    ? "sending…"
                                    : person.email
                                    ? `send to ${person.email}`
                                    : "no email on the roster"}
                                </button>
                                <button
                                  {...buttonClasses({ variant: "ghost", size: "sm" })}
                                  disabled={busy !== null}
                                  onClick={() =>
                                    void act(
                                      "skip",
                                      {
                                        noteIds: [person.note!.id],
                                        undo: person.note!.status === "skipped",
                                      },
                                      person.employeeId
                                    )
                                  }
                                >
                                  {person.note.status === "skipped" ? "un-skip" : "skip"}
                                </button>
                                <button
                                  {...buttonClasses({ variant: "ghost", size: "sm" })}
                                  disabled={busy !== null}
                                  onClick={() =>
                                    void act("redraft", { noteId: person.note!.id }, person.employeeId)
                                  }
                                >
                                  redraft
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
