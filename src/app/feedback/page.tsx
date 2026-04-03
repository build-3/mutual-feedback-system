"use client"

import { KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import Navbar from "@/components/Navbar"
import SearchableDropdown from "@/components/SearchableDropdown"
const MatrixRating = dynamic(() => import("@/components/MatrixRating"), { ssr: false })
const NpsScale = dynamic(() => import("@/components/NpsScale"), { ssr: false })
const StarRating = dynamic(() => import("@/components/StarRating"), { ssr: false })
const ValuesCard = dynamic(() => import("@/components/ValuesCard"), { ssr: false })
import {
  BrandPanel,
  NoticeCard,
  PillarMark,
  SectionHeading,
  StatPill,
  buttonClasses,
  fieldClasses,
} from "@/components/ui/brand"
import { SCREEN_ACCENTS, getFeedbackPathOptions, type FeedbackPath } from "@/lib/brand"
import {
  Question,
  getQuestionsForPath,
} from "@/lib/questions"
import { Employee, FeedbackType } from "@/lib/types"
import VoiceRecorderBar from "@/components/VoiceRecorderBar"

const VOICE_ENABLED = process.env.NEXT_PUBLIC_VOICE_ENABLED === "true"

type Phase = "identify" | "route" | "questions" | "submitting" | "done"

const feedbackAccent = SCREEN_ACCENTS.feedback

export default function FeedbackPage() {
  const [phase, setPhase] = useState<Phase>("identify")
  const [submitter, setSubmitter] = useState<Employee | null>(null)
  const [feedbackPath, setFeedbackPath] = useState<FeedbackPath | null>(null)
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [feedbackFor, setFeedbackFor] = useState<Employee | null>(null)
  const [animClass, setAnimClass] = useState("slide-enter-active")
  const [error, setError] = useState("")
  const submittingRef = useRef(false)
  const timeoutRefs = useRef<NodeJS.Timeout[]>([])
  const mountedRef = useRef(true)
  const skipNextPush = useRef(false)
  const isAnimating = useRef(false)
  const pendingPopState = useRef<(() => void) | null>(null)
  const matrixAdvanceTimer = useRef<NodeJS.Timeout | null>(null)

  // Voice recorder — track which question key the recorder targets
  const voiceQuestionKeyRef = useRef<string>("")
  const voiceAnswersRef = useRef(answers)
  voiceAnswersRef.current = answers
  const handleVoiceTranscript = useCallback(
    (text: string) => {
      const key = voiceQuestionKeyRef.current
      if (!key) return
      const current = voiceAnswersRef.current[key] || ""
      const separator = current && !current.endsWith(" ") ? " " : ""
      const updated = current + separator + text
      setAnswers((prev) => ({ ...prev, [key]: updated }))
    },
    []
  )

  const safeTimeout = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms)
    timeoutRefs.current.push(id)
    return id
  }, [])

  useEffect(() => {
    mountedRef.current = true
    const pendingTimeouts = timeoutRefs.current
    return () => {
      mountedRef.current = false
      pendingTimeouts.forEach(clearTimeout)
    }
  }, [])

  // Pre-fill the signed-in user as submitter — stay on identify screen for confirmation
  const autoSelectedRef = useRef(false)
  useEffect(() => {
    if (autoSelectedRef.current) return
    autoSelectedRef.current = true

    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!mountedRef.current || !data?.employee) return
        const me: Employee = {
          id: data.employee.id,
          name: data.employee.name,
          role: data.employee.role,
          email: null,
          created_at: "",
        }
        setSubmitter(me)
        // Stay on identify phase — user confirms or switches before moving on
      })
      .catch(() => {
        // Silently fall back to manual name selection
      })
  }, [])

  const questions: Question[] = useMemo(
    () => (feedbackPath ? getQuestionsForPath(feedbackPath) : []),
    [feedbackPath]
  )

  // Progress: identify & route are setup steps, then questions fill the rest.
  // Before a path is chosen, questions.length is 0 — clamp progress so it
  // doesn't jump to 100% on the route screen.
  const totalSteps = 2 + questions.length
  const currentStep =
    phase === "identify" ? 1 : phase === "route" ? 2 : 2 + currentQ + 1
  const progress =
    totalSteps <= 2
      ? Math.round((currentStep / totalSteps) * 30)   // cap at ~30% during setup
      : Math.round((currentStep / totalSteps) * 100)
  const pathOptions = getFeedbackPathOptions()

  const animateTransition = useCallback(
    (forward: boolean, cb: () => void, historyState?: { formPhase: string; formQ: number }) => {
      if (isAnimating.current) {
        skipNextPush.current = false
        return
      }
      isAnimating.current = true
      setAnimClass(forward ? "slide-exit-active" : "slide-enter")
      safeTimeout(() => {
        if (!mountedRef.current) return
        cb()
        if (historyState && !skipNextPush.current) {
          window.history.pushState(historyState, "")
        }
        skipNextPush.current = false
        window.scrollTo({ top: 0, behavior: "instant" })
        setAnimClass("slide-enter")
        safeTimeout(() => {
          if (!mountedRef.current) return
          setAnimClass("slide-enter-active")
          isAnimating.current = false
          const queued = pendingPopState.current
          if (queued) {
            pendingPopState.current = null
            queued()
          }
        }, 10)
      }, 130)
    },
    [safeTimeout]
  )

  // Browser history integration: back/forward navigates between questions
  useEffect(() => {
    window.history.replaceState({ formPhase: "identify", formQ: 0 }, "")

    const handlePopState = (event: PopStateEvent) => {
      const state = event.state as { formPhase?: Phase; formQ?: number } | null
      if (!state?.formPhase) return

      const navigate = () => {
        skipNextPush.current = true
        animateTransition(false, () => {
          setPhase(state.formPhase as Phase)
          setCurrentQ(state.formQ ?? 0)
          setError("")
        })
      }

      if (isAnimating.current) {
        // Queue this navigation — it will run when current animation finishes
        pendingPopState.current = navigate
      } else {
        navigate()
      }
    }

    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [animateTransition])

  const resetForm = useCallback(() => {
    setPhase("identify")
    setSubmitter(null)
    setFeedbackPath(null)
    setCurrentQ(0)
    setAnswers({})
    setFeedbackFor(null)
    setError("")
    window.history.replaceState({ formPhase: "identify", formQ: 0 }, "")
  }, [])

  function goNext() {
    setError("")

    if (phase === "identify") {
      if (!submitter) {
        setError("we need your name before we can route this.")
        return
      }

      animateTransition(true, () => setPhase("route"), { formPhase: "route", formQ: 0 })
      return
    }

    if (phase === "route") {
      if (!feedbackPath) {
        setError("pick the kind of feedback you want to share.")
        return
      }

      animateTransition(
        true,
        () => {
          setCurrentQ(0)
          setPhase("questions")
        },
        { formPhase: "questions", formQ: 0 }
      )
      return
    }

    if (phase === "questions") {
      const question = questions[currentQ]
      if (!validateAnswer(question)) return

      if (currentQ < questions.length - 1) {
        animateTransition(true, () => setCurrentQ((previous) => previous + 1), {
          formPhase: "questions",
          formQ: currentQ + 1,
        })
      } else {
        void handleSubmit()
      }
    }
  }

  function goBack() {
    setError("")

    if (phase === "route" || phase === "questions") {
      window.history.back()
      return
    }
  }

  function validateAnswer(question: Question) {
    if (question.type === "employee_search") {
      if (!feedbackFor) {
        setError("choose the person this feedback is about.")
        return false
      }
      if (submitter && feedbackFor.id === submitter.id) {
        setError("use the self reflection path if you want to review yourself.")
        return false
      }
      return true
    }

    if (question.type === "matrix_rating") {
      const items = question.matrixItems || []
      for (const item of items) {
        if (!answers[item.key]) {
          setError("give each item a quick score before you move on.")
          return false
        }
      }
      return true
    }

    if (question.type === "number_input") {
      const rawValue = answers[question.key]
      const numericValue = rawValue ? Number(rawValue) : Number.NaN
      if (!Number.isFinite(numericValue)) {
        setError("add a valid number so we can keep going.")
        return false
      }
      if (
        (question.min !== undefined && numericValue < question.min) ||
        (question.max !== undefined && numericValue > question.max)
      ) {
        setError(`keep this between ${question.min ?? 0} and ${question.max ?? 100}.`)
        return false
      }
      return true
    }

    const value = answers[question.key]
    if (!value || !value.trim()) {
      setError("add a response so we can keep going.")
      return false
    }

    return true
  }

  async function handleSubmit() {
    if (submittingRef.current) return
    submittingRef.current = true

    // Build payload synchronously
    const answerRows: Array<{
      question_key: string
      question_text: string
      answer_value: string
    }> = []

    for (const question of questions) {
      if (question.type === "employee_search") continue

      if (question.type === "matrix_rating" && question.matrixItems) {
        for (const item of question.matrixItems) {
          const value = answers[item.key]?.trim()
          if (value) {
            answerRows.push({
              question_key: item.key,
              question_text: `${question.text} - ${item.label}`,
              answer_value: value,
            })
          }
        }
      } else {
        const value = answers[question.key]?.trim()
        if (value) {
          answerRows.push({
            question_key: question.key,
            question_text: question.text,
            answer_value: value,
          })
        }
      }
    }

    // Optimistic: show success immediately, submit in background
    setPhase("done")
    window.history.replaceState({ formPhase: "done", formQ: 0 }, "")

    try {
      const res = await fetch("/api/feedback-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedbackForId:
            feedbackPath === "build3" || feedbackPath === "self"
              ? null
              : feedbackFor?.id || null,
          feedbackType: feedbackPath as FeedbackType,
          answers: answerRows,
        }),
      })

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        console.error("Submit failed:", payload.error)
        // Show error on the done screen — don't yank user back to form
        if (mountedRef.current) {
          setError(payload.error || "your feedback may not have saved. try sending another one.")
        }
      }
    } catch (submissionError) {
      console.error("Submit error:", submissionError)
      if (mountedRef.current) {
        setError("your feedback may not have saved. check your connection and try again.")
      }
    } finally {
      submittingRef.current = false
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" && phase !== "submitting" && phase !== "done") {
      const question = phase === "questions" ? questions[currentQ] : null
      if (question && question.type === "long_text") return
      event.preventDefault()
      goNext()
    }
  }

  // Global Enter key listener — works even when no input is focused
  useEffect(() => {
    function handleGlobalKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Enter") return
      if (phase === "submitting" || phase === "done") return
      // Don't intercept if user is typing in an input/textarea/select
      const tag = (event.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
      const question = phase === "questions" ? questions[currentQ] : null
      if (question && question.type === "long_text") return
      event.preventDefault()
      goNext()
    }
    window.addEventListener("keydown", handleGlobalKeyDown)
    return () => window.removeEventListener("keydown", handleGlobalKeyDown)
  })

  // Pending answers ref so goNext() can validate against the latest value
  // even before React flushes the state update.
  const pendingAnswers = useRef<Record<string, string>>({})

  function setAnswer(key: string, value: string) {
    pendingAnswers.current[key] = value
    setAnswers((previous) => {
      const next = { ...previous, [key]: value }
      pendingAnswers.current = next
      return next
    })
    setError("")
  }

  /** Set the answer and auto-advance after a short visual delay (like Typeform). */
  function setAnswerAndAdvance(key: string, value: string) {
    setAnswer(key, value)
    safeTimeout(() => {
      if (!mountedRef.current) return
      goNextWithAnswers()
    }, 200)
  }

  /**
   * Like goNext, but reads from pendingAnswers ref instead of `answers` state
   * so it works even when called right after setAnswer (before React flushes).
   */
  function goNextWithAnswers() {
    setError("")

    if (phase === "questions") {
      const question = questions[currentQ]
      if (!validateAnswerFromRef(question)) return

      if (currentQ < questions.length - 1) {
        animateTransition(true, () => setCurrentQ((previous) => previous + 1), {
          formPhase: "questions",
          formQ: currentQ + 1,
        })
      } else {
        void handleSubmit()
      }
    }
  }

  /** Validate using pendingAnswers ref for immediate reads. */
  function validateAnswerFromRef(question: Question) {
    if (question.type === "employee_search") {
      return !!feedbackFor && (!submitter || feedbackFor.id !== submitter.id)
    }
    if (question.type === "matrix_rating") {
      const items = question.matrixItems || []
      return items.every((item) => !!pendingAnswers.current[item.key])
    }
    if (question.type === "number_input") {
      const numericValue = Number(pendingAnswers.current[question.key])
      if (!Number.isFinite(numericValue)) return false
      if (question.min !== undefined && numericValue < question.min) return false
      if (question.max !== undefined && numericValue > question.max) return false
      return true
    }
    const value = pendingAnswers.current[question.key]
    return !!(value && value.trim())
  }

  function renderQuestion(question: Question) {
    switch (question.type) {
      case "employee_search":
        return (
          <SearchableDropdown
            value={feedbackFor}
            onChange={(employee) => {
              setFeedbackFor(employee)
              if (employee && (!submitter || employee.id !== submitter.id)) {
                safeTimeout(() => {
                  if (!mountedRef.current) return
                  if (currentQ < questions.length - 1) {
                    animateTransition(true, () => setCurrentQ((prev) => prev + 1), {
                      formPhase: "questions",
                      formQ: currentQ + 1,
                    })
                  }
                }, 200)
              }
            }}
            filterRole={question.employeeRole}
            excludeEmployeeId={submitter?.id}
            placeholder="search for a teammate..."
          />
        )
      case "star_rating":
        return (
          <StarRating
            value={Number(answers[question.key]) || 0}
            onChange={(value) => setAnswerAndAdvance(question.key, String(value))}
          />
        )
      case "matrix_rating":
        return (
          <MatrixRating
            items={question.matrixItems || []}
            values={Object.fromEntries(
              (question.matrixItems || []).map((item) => [
                item.key,
                Number(answers[item.key]) || 0,
              ])
            )}
            onChange={(key, value) => {
              setAnswer(key, String(value))
              if (matrixAdvanceTimer.current) {
                clearTimeout(matrixAdvanceTimer.current)
                matrixAdvanceTimer.current = null
              }
              const items = question.matrixItems || []
              const allScored = items.every((item) =>
                item.key === key ? value > 0 : Number(pendingAnswers.current[item.key]) > 0
              )
              if (allScored) {
                matrixAdvanceTimer.current = safeTimeout(() => {
                  if (mountedRef.current) goNextWithAnswers()
                  matrixAdvanceTimer.current = null
                }, 200)
              }
            }}
          />
        )
      case "long_text": {
        // Track which question the voice recorder targets
        voiceQuestionKeyRef.current = question.key
        return (
          <>
            {question.showValues && <ValuesCard />}
            <textarea
              value={answers[question.key] || ""}
              onChange={(event) => setAnswer(question.key, event.target.value)}
              rows={5}
              className={fieldClasses({ size: "lg" })}
              placeholder="write it how you would say it."
            />
            {VOICE_ENABLED && (
              <div className="mt-3">
                <VoiceRecorderBar onTranscript={handleVoiceTranscript} />
              </div>
            )}
          </>
        )
      }
      case "single_select":
        return (
          <div className="space-y-3">
            {question.options?.map((option) => {
              const active = answers[question.key] === option.key

              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setAnswerAndAdvance(question.key, option.key)}
                  className={[
                    "w-full rounded-[24px] border px-5 py-4 text-left transition-all",
                    active
                      ? "border-brand-peach bg-brand-peach text-ink shadow-brand"
                      : "border-line bg-white text-ink hover:-translate-y-0.5 hover:border-black/15",
                  ].join(" ")}
                >
                  <div className="text-base font-semibold">{option.label}</div>
                  {option.description && (
                    <div className="mt-1 text-sm leading-6 text-muted">
                      {option.description}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )
      case "nps":
        return (
          <NpsScale
            value={answers[question.key] ? Number(answers[question.key]) : null}
            onChange={(value) => setAnswerAndAdvance(question.key, String(value))}
          />
        )
      case "number_input":
        return (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
            <input
              type="number"
              min={question.min}
              max={question.max}
              value={answers[question.key] || ""}
              onChange={(event) => setAnswer(question.key, event.target.value)}
              className={`${fieldClasses({ size: "lg" })} w-full max-w-[11rem] text-center text-3xl font-semibold tracking-[-0.06em] placeholder:text-gray-300 placeholder:font-light`}
              placeholder="50"
            />
            <div className="flex gap-2 text-sm text-muted sm:flex-col sm:gap-0 sm:pb-2">
              <span className="text-xs text-gray-400">50 by default ·</span>
              <span>out of 100</span>
            </div>
          </div>
        )
      case "dropdown":
        return (
          <select
            value={answers[question.key] || ""}
            onChange={(event) => {
              if (event.target.value) {
                setAnswerAndAdvance(question.key, event.target.value)
              } else {
                setAnswer(question.key, event.target.value)
              }
            }}
            className={fieldClasses({ size: "lg" })}
          >
            <option value="">choose one</option>
            {question.options?.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        )
      default:
        return null
    }
  }

  if (phase === "done") {
    const restartButton = buttonClasses({ accent: feedbackAccent, variant: "solid", size: "lg" })

    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="mx-auto flex min-h-[calc(100vh-76px)] max-w-4xl items-center px-4 py-6 pb-safe sm:px-6 sm:py-12">
          <BrandPanel accent={feedbackAccent} tone="plain" className="w-full p-8 sm:p-12">
            <div className="mx-auto max-w-xl text-center">
              <div className="mb-5 inline-flex h-16 w-16 items-center justify-center rounded-full border border-brand-peach/50 bg-brand-peach/25">
                <PillarMark accent={feedbackAccent} className="scale-125" />
              </div>
              <SectionHeading
                accent={feedbackAccent}
                eyebrow="all set"
                title="we have your feedback"
                description="thanks. clear notes make the next step easier for all of us."
                align="center"
              />
              {error && (
                <div className="mt-4 rounded-[18px] border border-brand-danger/30 bg-brand-danger/10 px-4 py-3 text-sm text-brand-danger">
                  {error}
                </div>
              )}
              <div className="mt-8 flex justify-center">
                <button type="button" className={restartButton.className} style={restartButton.style} onClick={resetForm}>
                  send another one
                </button>
              </div>
            </div>
          </BrandPanel>
        </main>
      </div>
    )
  }

  const nextButton = buttonClasses({ accent: feedbackAccent, variant: "solid", size: "lg" })
  const backButton = buttonClasses({ accent: "ink", variant: "ghost", size: "sm" })

  return (
    <div className="min-h-screen" onKeyDown={handleKeyDown}>
      <Navbar />

      <div className="sticky top-[52px] sm:top-[64px] z-40 border-b border-line bg-canvas/95 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4 py-3 sm:py-3 sm:px-6">
          <div className="flex items-center justify-between gap-3 sm:gap-4">
            <div className="text-xs font-semibold tracking-[0.08em] text-muted whitespace-nowrap">
              {Math.min(currentStep, totalSteps)}/{totalSteps}
            </div>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/[0.06]">
              <div
                className="h-full rounded-full bg-brand-peach transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-sm font-semibold tracking-[-0.03em] text-ink">{progress}%</div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-4 pb-safe sm:px-6 sm:py-12">
        <div className="grid gap-5 sm:gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
          <div className={`space-y-6 ${animClass}`}>
            {phase !== "identify" && phase !== "submitting" && (
              <button type="button" className={backButton.className} style={backButton.style} onClick={goBack}>
                go back
              </button>
            )}

            {phase === "identify" && (
              <BrandPanel accent={feedbackAccent} tone="plain" className="p-6 sm:p-8">
                <SectionHeading
                  accent={feedbackAccent}
                  eyebrow="who are we hearing from?"
                  title={submitter ? `hey, ${submitter.name.split(" ")[0]}` : "start with your name"}
                  description={submitter
                    ? "this is you, right? hit keep going to start, or switch below."
                    : "we keep it simple. pick yourself first, then we will route the rest."}
                />
                <div className="mt-8">
                  {submitter ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 rounded-[24px] border border-brand-peach/40 bg-brand-peach/10 px-5 py-4">
                        <span className="text-lg font-semibold text-ink">{submitter.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSubmitter(null)}
                        className="text-sm text-muted underline decoration-line underline-offset-4 hover:text-ink"
                      >
                        not you? pick someone else
                      </button>
                    </div>
                  ) : (
                    <SearchableDropdown
                      value={submitter}
                      onChange={(employee) => {
                        setSubmitter(employee)
                        if (employee) {
                          safeTimeout(() => {
                            if (!mountedRef.current) return
                            animateTransition(true, () => setPhase("route"), { formPhase: "route", formQ: 0 })
                          }, 200)
                        }
                      }}
                      placeholder="search for your name..."
                    />
                  )}
                </div>
              </BrandPanel>
            )}

            {phase === "route" && (
              <BrandPanel accent={feedbackAccent} tone="plain" className="p-6 sm:p-8">
                <SectionHeading
                  accent={feedbackAccent}
                  eyebrow="what are we writing?"
                  title="pick the lane"
                  description="each route keeps the questions short and relevant."
                />
                <div className="mt-8 space-y-3">
                  {pathOptions.map((option) => {
                    const active = feedbackPath === option.key
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => {
                          setFeedbackPath(option.key)
                          setFeedbackFor(null)
                          setAnswers({})
                          pendingAnswers.current = {}
                          setError("")
                          safeTimeout(() => {
                            if (!mountedRef.current) return
                            animateTransition(
                              true,
                              () => {
                                setCurrentQ(0)
                                setPhase("questions")
                              },
                              { formPhase: "questions", formQ: 0 }
                            )
                          }, 200)
                        }}
                        className={[
                          "w-full rounded-[26px] border px-5 py-5 text-left transition-all",
                          active
                            ? "border-brand-peach bg-brand-peach text-ink shadow-brand"
                            : "border-line bg-white/86 hover:-translate-y-0.5 hover:border-black/15",
                        ].join(" ")}
                      >
                        <div className="text-lg font-semibold tracking-[-0.04em] text-ink">
                          {option.label}
                        </div>
                        <div className="mt-1 text-sm leading-6 text-muted">{option.blurb}</div>
                      </button>
                    )
                  })}
                </div>
              </BrandPanel>
            )}

            {phase === "questions" && questions[currentQ] && (
              <BrandPanel accent={feedbackAccent} tone="plain" className="p-6 sm:p-8">
                <SectionHeading
                  accent={feedbackAccent}
                  eyebrow={`question ${currentQ + 1} of ${questions.length}`}
                  title={questions[currentQ].text}
                  description={questions[currentQ].subtext}
                />
                <div className="mt-8">{renderQuestion(questions[currentQ])}</div>
              </BrandPanel>
            )}

            {phase === "submitting" && (
              <BrandPanel accent={feedbackAccent} tone="soft" className="p-8 text-center">
                <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-[3px] border-brand-peach border-t-transparent" />
                <div className="text-lg font-semibold tracking-[-0.03em] text-ink">
                  sending it through
                </div>
                <p className="mt-2 text-sm leading-6 text-muted">
                  we are packaging your answers and handing them off.
                </p>
              </BrandPanel>
            )}

            {error && (
              <NoticeCard accent={feedbackAccent} title="one quick fix">
                {error}
              </NoticeCard>
            )}

            {/* Spacer for sticky bottom bar on mobile */}
            {phase !== "submitting" && <div className="h-20 sm:hidden" />}

            {/* Desktop inline action bar */}
            {phase !== "submitting" && (
              <div className="hidden sm:flex flex-wrap items-center gap-3">
                <button type="button" className={nextButton.className} style={nextButton.style} onClick={goNext}>
                  {phase === "questions" && currentQ === questions.length - 1
                    ? "send it"
                    : "keep going"}
                </button>
                <div className="rounded-full border border-line bg-white/86 px-3 py-2 text-xs font-semibold tracking-[0.08em] text-muted">
                  press enter to keep moving
                </div>
              </div>
            )}
          </div>

          <div className="hidden lg:block space-y-4 lg:sticky lg:top-[142px] lg:self-start">
            <BrandPanel accent={feedbackAccent} tone="soft" className="brand-lines brand-pillars p-6">
              <div className="flex items-center gap-2">
                <PillarMark accent={feedbackAccent} />
                <h2 className="text-sm font-semibold text-ink">how we keep this useful</h2>
              </div>
              <div className="mt-5 grid gap-3">
                <StatPill
                  accent={feedbackAccent}
                  label="voice"
                  value="direct, warm, human"
                  detail="short answers beat vague essays every time."
                />
                <StatPill
                  accent={feedbackAccent}
                  label="pace"
                  value="one step at a time"
                  detail="we keep each question focused so it does not feel like homework."
                />
                <StatPill
                  accent={feedbackAccent}
                  label="use"
                  value="feedback that moves"
                  detail="we are after clarity, not fluff. slightly quirky is welcome."
                />
              </div>
            </BrandPanel>

            <BrandPanel accent={feedbackAccent} tone="washed" className="brand-lines p-6">
              <div className="text-xs font-semibold tracking-[0.08em] text-muted">
                current route
              </div>
              <div className="mt-2 text-2xl font-bold tracking-[-0.05em] text-ink">
                {feedbackPath ? pathOptions.find((option) => option.key === feedbackPath)?.label : "not picked yet"}
              </div>
              <p className="mt-2 text-sm leading-6 text-muted">
                {feedbackPath
                  ? pathOptions.find((option) => option.key === feedbackPath)?.blurb
                  : "choose the route first and we will tailor the rest."}
              </p>
              <div className="mt-5 h-px w-full bg-black/[0.08]" />
              <div className="mt-5 text-sm leading-6 text-muted">
                we speak plainly here: kind, clear, and not too polished for our own good.
              </div>
            </BrandPanel>
          </div>
        </div>
      </main>

      {/* Mobile sticky bottom action bar */}
      {phase !== "submitting" && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-line bg-canvas/95 backdrop-blur-xl px-4 py-3 pb-safe sm:hidden">
          <button
            type="button"
            className={`${nextButton.className} w-full !py-3.5 !text-base`}
            style={nextButton.style}
            onClick={goNext}
          >
            {phase === "questions" && currentQ === questions.length - 1
              ? "send it"
              : "keep going"}
          </button>
        </div>
      )}
    </div>
  )
}
