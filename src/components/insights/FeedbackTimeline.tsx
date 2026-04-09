"use client"

import { memo, useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { formatDate, timeAgo } from "@/lib/date-utils"
import { SubmissionWithDetails } from "@/app/insights/types"
import { FEEDBACK_TYPE_LABELS, getFeedbackAccent } from "@/lib/brand"
import { QUESTION_LABELS, parseNumericAnswer, getInitials, getAvatarColor } from "@/lib/insights-helpers"
import { BrandPanel, Eyebrow, badgeClasses, buttonClasses } from "@/components/ui/brand"
import type { Employee, FeedbackResponse } from "@/lib/types"
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder"

const VOICE_ENABLED = process.env.NEXT_PUBLIC_VOICE_ENABLED === "true"

/** Text question keys that support responses (intern + full_timer paths) */
const RESPONDABLE_KEYS = new Set([
  "excellence_area",
  "upskill_ability",
  "upcoming_projects",
  "advice",
  "value_strength",
  "value_improvement",
  "constructive_feedback",
  "adhoc_positive",
  "adhoc_improve",
])

const NUMERIC_DISPLAY = new Set([
  "recommend_rating",
  "teal_self_management",
  "teal_wholeness",
  "teal_evolutionary_purpose",
  "purpose_alignment",
  "itp_humble",
  "itp_hungry",
  "itp_smart",
  "nps_score",
  "trust_battery",
  "adhoc_rating",
])

interface Props {
  submissions: SubmissionWithDetails[]
  title: string
  emptyText?: string
  responsesByAnswer?: Record<string, (FeedbackResponse & { responderName: string })[]>
  /** All employees — used for the "respond as" picker */
  employees?: Employee[]
  /** Default responder (the profile being viewed) */
  defaultResponderId?: string | null
  onResponseSaved?: () => void
}

function ResponseThread({
  responses,
}: {
  responses: (FeedbackResponse & { responderName: string })[]
}) {
  if (responses.length === 0) return null

  return (
    <div className="mt-3 space-y-2 border-l-2 border-brand-sky/30 pl-4">
      {responses.map((r) => (
        <div key={r.id} className="flex gap-3">
          <div
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{ backgroundColor: getAvatarColor(r.responderName) }}
          >
            {getInitials(r.responderName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-semibold text-ink">{r.responderName}</span>
              <span className="text-[10px] tracking-[0.08em] text-muted">
                {timeAgo(new Date(r.created_at))}
              </span>
            </div>
            <p className="mt-0.5 whitespace-pre-wrap text-sm leading-6 text-ink/80">
              {r.response_text}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

function ReplyBox({
  answerId,
  employees,
  defaultResponderId,
  onSaved,
}: {
  answerId: string
  employees: Employee[]
  defaultResponderId: string | null
  onSaved?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [responderId, setResponderId] = useState<string>(defaultResponderId || "")
  const [pickerOpen, setPickerOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submittingRef = useRef(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  const handleTranscript = useCallback((transcript: string) => {
    setText((prev) => {
      const separator = prev && !prev.endsWith(" ") ? " " : ""
      return prev + separator + transcript
    })
  }, [])

  const voice = useVoiceRecorder(handleTranscript)

  const selectedEmployee = employees.find((e) => e.id === responderId)

  // Click-outside handler for the person picker
  useEffect(() => {
    if (!pickerOpen) return
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [pickerOpen])

  const handleSubmit = useCallback(async () => {
    if (submittingRef.current || !text.trim() || !responderId) return
    submittingRef.current = true
    setSending(true)
    setError(null)

    try {
      const res = await fetch("/api/feedback-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answerId,
          responderId,
          responseText: text.trim(),
        }),
      })

      if (res.ok) {
        setText("")
        setOpen(false)
        onSaved?.()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || "something went wrong. try again.")
      }
    } catch {
      setError("could not reach the server. check your connection.")
    } finally {
      submittingRef.current = false
      setSending(false)
    }
  }, [answerId, responderId, text, onSaved])

  const btn = buttonClasses({ accent: "sky", variant: "ghost", size: "sm" })
  const sendBtn = buttonClasses({ accent: "sky", variant: "solid", size: "sm" })

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${btn.className} mt-2`}
        style={btn.style}
      >
        respond
      </button>
    )
  }

  return (
    <div className="mt-3 space-y-2">
      {/* Respond-as identity row */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold tracking-[0.08em] text-muted">
          responding as
        </span>
        <div className="relative" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-xs font-semibold text-ink hover:border-brand-sky/50 transition-colors"
          >
            {selectedEmployee ? (
              <>
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold text-white"
                  style={{ backgroundColor: getAvatarColor(selectedEmployee.name) }}
                >
                  {getInitials(selectedEmployee.name)}
                </span>
                {selectedEmployee.name}
              </>
            ) : (
              "pick someone"
            )}
            <svg className="h-3 w-3 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {pickerOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 max-h-48 w-52 overflow-y-auto rounded-2xl border border-line bg-white py-1 shadow-lg">
              {employees.map((emp) => (
                <button
                  key={emp.id}
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-black/[0.04] transition-colors"
                  onClick={() => {
                    setResponderId(emp.id)
                    setPickerOpen(false)
                  }}
                >
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white"
                    style={{ backgroundColor: getAvatarColor(emp.name) }}
                  >
                    {getInitials(emp.name)}
                  </span>
                  <span className={emp.id === responderId ? "font-semibold" : ""}>
                    {emp.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="write your response..."
          rows={3}
          className={`w-full resize-none rounded-2xl border border-line bg-white p-3 text-sm leading-6 text-ink placeholder:text-muted/50 focus:border-brand-sky focus:outline-none focus:ring-1 focus:ring-brand-sky${VOICE_ENABLED ? " pr-12" : ""}`}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              handleSubmit()
            }
          }}
        />
        {VOICE_ENABLED && (
          <button
            type="button"
            onClick={voice.toggle}
            disabled={voice.state === "transcribing"}
            aria-label={voice.state === "recording" ? "Stop recording" : "Start voice recording"}
            className={`absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full transition-all ${
              voice.state === "recording"
                ? "bg-[#d35b52] text-white animate-pulse"
                : voice.state === "transcribing"
                ? "bg-gray-100 text-muted"
                : "bg-white/60 border border-line text-muted hover:text-ink hover:border-black/20"
            }`}
          >
            {voice.state === "transcribing" ? (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            ) : voice.state === "recording" ? (
              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 01-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </button>
        )}
      </div>
      {voice.error && (
        <p className="text-xs text-[#d35b52]">
          {voice.error}
          <button type="button" onClick={voice.clearError} className="ml-2 text-xs text-muted underline">dismiss</button>
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!text.trim() || !responderId || sending}
          className={sendBtn.className}
          style={sendBtn.style}
        >
          {sending ? "sending..." : "send"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setText(""); setPickerOpen(false) }}
          className={btn.className}
          style={btn.style}
        >
          cancel
        </button>
        <span className="ml-auto text-[10px] text-muted">cmd + enter to send</span>
      </div>
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
    </div>
  )
}

const AnswerDisplay = memo(function AnswerDisplay({
  questionKey,
  questionText,
  value,
  answerId,
  responses,
  employees,
  defaultResponderId,
  onResponseSaved,
}: {
  questionKey: string
  questionText: string
  value: string
  answerId: string
  responses: (FeedbackResponse & { responderName: string })[]
  employees: Employee[]
  defaultResponderId: string | null
  onResponseSaved?: () => void
}) {
  const label = QUESTION_LABELS[questionKey] || questionText || questionKey
  const numericValue = parseNumericAnswer(value)
  const isRespondable = RESPONDABLE_KEYS.has(questionKey) && employees.length > 0

  if (NUMERIC_DISPLAY.has(questionKey) && numericValue !== null) {
    return (
      <div className="rounded-[20px] border border-line bg-black/[0.02] p-4">
        <div className="text-[11px] font-semibold tracking-[0.08em] text-muted">
          {label}
        </div>
        <div className="mt-2 text-lg font-semibold tracking-[-0.04em] text-ink">
          {questionKey === "trust_battery"
            ? `${numericValue}%`
            : questionKey === "nps_score"
            ? `${numericValue}/10`
            : `${numericValue}/5`}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-[20px] border border-line bg-black/[0.02] p-4">
      <div className="text-[11px] font-semibold tracking-[0.08em] text-muted">
        {label}
      </div>
      <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink">
        {value}
      </div>

      <ResponseThread responses={responses} />

      {isRespondable && (
        <ReplyBox
          answerId={answerId}
          employees={employees}
          defaultResponderId={defaultResponderId}
          onSaved={onResponseSaved}
        />
      )}
    </div>
  )
})

const TimelineItem = memo(function TimelineItem({
  submission,
  responsesByAnswer,
  employees,
  defaultResponderId,
  onResponseSaved,
}: {
  submission: SubmissionWithDetails
  responsesByAnswer: Record<string, (FeedbackResponse & { responderName: string })[]>
  employees: Employee[]
  defaultResponderId: string | null
  onResponseSaved?: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const accent = getFeedbackAccent(submission.submission.feedback_type)
  const badge = badgeClasses({ accent, tone: "soft" })
  const threadParticipants = employees.filter(
    (employee) =>
      employee.id === submission.submission.submitted_by_id ||
      employee.id === submission.submission.feedback_for_id
  )

  return (
    <div className="flex gap-2 sm:gap-3.5">
      <div className="flex flex-col items-center pt-0.5">
        <div className="mt-2 h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0 rounded-full bg-brand-sky" />
        <div className="mt-2 min-h-[3.5rem] w-px flex-1 bg-black/[0.08]" />
      </div>

      <div className="flex-1 pb-2.5 sm:pb-4 min-w-0">
        <BrandPanel accent={accent} tone="washed" className="brand-lines overflow-hidden">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full flex-wrap items-center gap-2 sm:gap-3 px-3.5 py-3 sm:px-5 sm:py-4 text-left"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-ink">
                  {submission.submitterName}
                </span>
                <span className={badge.className} style={badge.style}>
                  {FEEDBACK_TYPE_LABELS[submission.submission.feedback_type]}
                </span>
              </div>
              <div className="mt-1 text-xs tracking-[0.08em] text-muted">
                {timeAgo(new Date(submission.submission.created_at))}{" "}
                · {formatDate(new Date(submission.submission.created_at), "MMM d, yyyy")}
              </div>
            </div>
            <span className="text-xs font-semibold tracking-[0.08em] text-muted">
              {expanded ? "hide details" : "see details"}
            </span>
          </button>

          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="overflow-hidden border-t border-line"
              >
                <div className="grid gap-3 px-3.5 py-3.5 sm:px-5 sm:py-5">
                  {submission.answers.map((answer) => (
                    <AnswerDisplay
                      key={answer.id}
                      answerId={answer.id}
                      questionKey={answer.question_key}
                      questionText={answer.question_text}
                      value={answer.answer_value}
                      responses={responsesByAnswer[answer.id] || []}
                      employees={threadParticipants}
                      defaultResponderId={defaultResponderId}
                      onResponseSaved={onResponseSaved}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </BrandPanel>
      </div>
    </div>
  )
})

type FilterKey = "all" | "peer" | "adhoc" | "build3"

const FILTER_TABS: { key: FilterKey; label: string; types: string[] }[] = [
  { key: "all", label: "all", types: [] },
  { key: "peer", label: "peer", types: ["intern", "full_timer"] },
  { key: "adhoc", label: "adhoc", types: ["adhoc"] },
  { key: "build3", label: "build3", types: ["build3"] },
]

export default function FeedbackTimeline({
  submissions,
  title,
  emptyText,
  responsesByAnswer = {},
  employees = [],
  defaultResponderId = null,
  onResponseSaved,
}: Props) {
  const [filter, setFilter] = useState<FilterKey>("all")

  if (submissions.length === 0 && emptyText) {
    return (
      <BrandPanel accent="sky" tone="washed" className="p-6">
        <Eyebrow accent="sky">{title}</Eyebrow>
        <p className="mt-3 text-sm leading-7 text-muted">{emptyText}</p>
      </BrandPanel>
    )
  }

  if (submissions.length === 0) return null

  // Count per filter — only show tabs that have data
  const counts: Record<FilterKey, number> = {
    all: submissions.length,
    peer: submissions.filter((s) => s.submission.feedback_type === "intern" || s.submission.feedback_type === "full_timer").length,
    adhoc: submissions.filter((s) => s.submission.feedback_type === "adhoc").length,
    build3: submissions.filter((s) => s.submission.feedback_type === "build3").length,
  }

  const visibleTabs = FILTER_TABS.filter((tab) => tab.key === "all" || counts[tab.key] > 0)
  const showTabs = visibleTabs.length > 2 // Only show tabs if there are at least 2 types

  const filtered = filter === "all"
    ? submissions
    : submissions.filter((s) => FILTER_TABS.find((t) => t.key === filter)?.types.includes(s.submission.feedback_type))

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <Eyebrow accent="sky">{title}</Eyebrow>
        {showTabs && (
          <div className="sm:ml-auto flex gap-0.5 sm:gap-1 rounded-full border border-line bg-white/60 p-0.5 overflow-x-auto">
            {visibleTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] sm:text-[11px] font-semibold tracking-[0.06em] transition-colors ${
                  filter === tab.key
                    ? "bg-brand-black text-white"
                    : "text-muted hover:text-ink"
                }`}
              >
                {tab.label} ({counts[tab.key]})
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        {filtered.map((submission) => (
          <TimelineItem
            key={submission.submission.id}
            submission={submission}
            responsesByAnswer={responsesByAnswer}
            employees={employees}
            defaultResponderId={defaultResponderId}
            onResponseSaved={onResponseSaved}
          />
        ))}
        {filtered.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">no {filter} feedback in this range</p>
        )}
      </div>
    </div>
  )
}
