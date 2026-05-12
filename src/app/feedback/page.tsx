"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import dynamic from "next/dynamic"
import Navbar from "@/components/Navbar"
import KudosCard from "@/components/KudosCard"
import SearchableDropdown from "@/components/SearchableDropdown"
const MatrixRating = dynamic(() => import("@/components/MatrixRating"), { ssr: false })
const NpsScale = dynamic(() => import("@/components/NpsScale"), { ssr: false })
const StarRating = dynamic(() => import("@/components/StarRating"), { ssr: false })
const TrustSlider = dynamic(() => import("@/components/TrustSlider"), { ssr: false })
const ValuesMultiSelect = dynamic(() => import("@/components/ValuesMultiSelect"), { ssr: false })
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
  SELF_REVIEW_KEYS,
} from "@/lib/questions"
import { Employee, FeedbackType } from "@/lib/types"
import VoiceRecorderBar, {
  type VoiceBarState,
  type VoiceRecorderBarHandle,
} from "@/components/VoiceRecorderBar"
import SelfReviewStep, { SelfReviewSidebar } from "@/components/SelfReviewStep"
import BirthdayDialog from "@/components/BirthdayDialog"

type SelfFeedbackAnswer = {
  question_key: string
  question_text: string
  answer_value: string
}

type SelfFeedbackData = {
  answers: SelfFeedbackAnswer[]
}

const VOICE_ENABLED = process.env.NEXT_PUBLIC_VOICE_ENABLED === "true"

const VALID_PATHS = new Set<FeedbackPath>(["intern", "build3", "full_timer", "self", "adhoc"])

type Phase = "identify" | "route" | "questions" | "self_review" | "stage_complete" | "submitting" | "done"

/** Human-readable labels for stage pills in the stepper */
const STAGE_LABELS: Record<FeedbackPath, string> = {
  self: "self-reflection",
  build3: "build3 feedback",
  full_timer: "full timer review",
  intern: "intern review",
  adhoc: "quick note",
}

const feedbackAccent = SCREEN_ACCENTS.feedback

export default function FeedbackPage() {
  const searchParams = useSearchParams()
  const pathParam = searchParams.get("path")
  const isKudos = pathParam === "kudos"

  const typedPath = pathParam as FeedbackPath | null
  const deepLinkedPath = !isKudos && typedPath && VALID_PATHS.has(typedPath) ? typedPath : null

  const [phase, setPhase] = useState<Phase>("identify")
  const [submitter, setSubmitter] = useState<Employee | null>(null)
  const [feedbackPath, setFeedbackPath] = useState<FeedbackPath | null>(deepLinkedPath)
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [feedbackFor, setFeedbackFor] = useState<Employee | null>(null)
  const [hasSelfFeedback, setHasSelfFeedback] = useState<boolean | null>(null)
  const [hasBuild3Feedback, setHasBuild3Feedback] = useState<boolean | null>(null)
  // Multi-stage pipeline: when gates are required, stages lists the full journey
  // e.g. ["self", "build3", "full_timer"]. intendedPath is the user's original pick.
  const [intendedPath, setIntendedPath] = useState<FeedbackPath | null>(null)
  const [stages, setStages] = useState<FeedbackPath[]>([])
  const [currentStageIndex, setCurrentStageIndex] = useState(0)
  const [selfFeedbackForTarget, setSelfFeedbackForTarget] = useState<SelfFeedbackData | null>(null)
  const [reviewAnswers, setReviewAnswers] = useState<Record<string, string>>({})
  const [showBirthdayDialog, setShowBirthdayDialog] = useState(false)
  const [animClass, setAnimClass] = useState("slide-enter-active")
  const [error, setError] = useState("")
  const [sliderTouched, setSliderTouched] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const submittingRef = useRef(false)
  const timeoutRefs = useRef<NodeJS.Timeout[]>([])
  const mountedRef = useRef(true)
  const skipNextPush = useRef(false)
  const isAnimating = useRef(false)
  const pendingPopState = useRef<(() => void) | null>(null)
  const matrixAdvanceTimer = useRef<NodeJS.Timeout | null>(null)

  // Reset form when the URL path param changes (e.g. switching between
  // /feedback and /feedback?path=adhoc while the component stays mounted)
  const prevDeepLinkedPath = useRef(deepLinkedPath)
  useEffect(() => {
    if (prevDeepLinkedPath.current === deepLinkedPath) return
    prevDeepLinkedPath.current = deepLinkedPath
    setPhase("identify")
    setFeedbackPath(deepLinkedPath)
    setCurrentQ(0)
    setAnswers({})
    setFeedbackFor(null)
    setSelfFeedbackForTarget(null)
    setReviewAnswers({})
    setIntendedPath(null)
    setStages([])
    setCurrentStageIndex(0)
    setError("")
    window.history.replaceState({ formPhase: "identify", formQ: 0 }, "")
  }, [deepLinkedPath])

  // Check if the current user has completed self-feedback and build3 feedback
  const selfCheckFetchedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!submitter) return
    if (selfCheckFetchedFor.current === submitter.id) return
    selfCheckFetchedFor.current = submitter.id
    setHasSelfFeedback(null)
    setHasBuild3Feedback(null)

    fetch("/api/self-feedback-check")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!mountedRef.current) return
        setHasSelfFeedback(data?.hasSelfFeedback ?? false)
      })
      .catch(() => {
        if (mountedRef.current) setHasSelfFeedback(false)
      })

    fetch("/api/build3-feedback-check")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!mountedRef.current) return
        setHasBuild3Feedback(data?.hasBuild3Feedback ?? false)
      })
      .catch(() => {
        if (mountedRef.current) setHasBuild3Feedback(false)
      })

    // Fetch active feedback session (for tagging intern/full_timer submissions)
    fetch("/api/session/current")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!mountedRef.current) return
        setSessionId(data?.session?.id ?? null)
      })
      .catch(() => {
        if (mountedRef.current) setSessionId(null)
      })
  }, [submitter])

  // Voice recorder state — shared with parent for navigation gating
  const [voiceState, setVoiceState] = useState<VoiceBarState>("idle")
  const voiceBarRef = useRef<VoiceRecorderBarHandle>(null)

  // Reset voice state and slider interaction when question changes
  useEffect(() => {
    setVoiceState("idle")
    setSliderTouched(false)
  }, [currentQ])

  // Voice recorder — track which question key the recorder targets
  const voiceQuestionKeyRef = useRef<string>("")
  const voiceAnswersRef = useRef(answers)
  voiceAnswersRef.current = answers
  const handleVoiceTranscript = useCallback(
    (text: string) => {
      const key = voiceQuestionKeyRef.current
      if (!key) return
      const current = voiceAnswersRef.current[key] || ""

      // For values_with_text, append transcript to the text portion (after |||)
      const VALUES_SEP = "|||"
      if (current.includes(VALUES_SEP)) {
        const sepIdx = current.indexOf(VALUES_SEP)
        const indices = current.slice(0, sepIdx)
        const existingText = current.slice(sepIdx + VALUES_SEP.length)
        const spacer = existingText && !existingText.endsWith(" ") ? " " : ""
        const updated = `${indices}${VALUES_SEP}${existingText}${spacer}${text}`
        setAnswers((prev) => ({ ...prev, [key]: updated }))
        return
      }

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
          birthday: data.employee.birthday ?? null,
        }
        setSubmitter(me)
        if (!data.employee.birthday) {
          setShowBirthdayDialog(true)
        }
      })
      .catch(() => {
        // Silently fall back to manual name selection
      })
  }, [])

  const questions: Question[] = useMemo(
    () => (feedbackPath ? getQuestionsForPath(feedbackPath) : []),
    [feedbackPath]
  )

  // Progress: for multi-stage pipelines, compute total questions across all stages.
  // For single-stage, it's just the current path's questions + setup.
  const hasReviewStep = feedbackPath === "full_timer" && selfFeedbackForTarget != null
  const adhocSkipped = feedbackPath === "adhoc" ? 1 : 0
  const build3Skipped = 0

  const { progress } = useMemo(() => {
    if (phase === "identify" || phase === "route") {
      return { progress: phase === "identify" ? 5 : 10, totalSteps: 2, currentStep: phase === "identify" ? 1 : 2 }
    }

    const skipForStage = (path: FeedbackPath): number => {
      if (path === "adhoc") return 1
      return 0
    }

    if (stages.length > 1) {
      // Multi-stage: sum questions across all stages
      let total = 0
      let completed = 0
      for (let i = 0; i < stages.length; i++) {
        const stageQs = getQuestionsForPath(stages[i])
        const skip = skipForStage(stages[i])
        const count = stageQs.length - skip
        total += count
        if (i < currentStageIndex) {
          completed += count
        } else if (i === currentStageIndex) {
          completed += Math.min(currentQ + 1, count)
        }
      }
      // Add 1 for the review step if applicable
      if (hasReviewStep) total += 1
      if (phase === "self_review") completed += 0 // counted as part of the stage
      const pct = total > 0 ? Math.round((completed / total) * 100) : 0
      return { progress: Math.max(pct, 5), totalSteps: total, currentStep: completed }
    }

    // Single stage
    const qCount = questions.length - adhocSkipped - build3Skipped + (hasReviewStep ? 1 : 0)
    const step = phase === "self_review" ? 1 : currentQ + 1 + (hasReviewStep ? 1 : 0)
    const pct = qCount > 0 ? Math.round((step / qCount) * 100) : 0
    return { progress: Math.max(pct, 5), totalSteps: qCount, currentStep: step }
  }, [phase, stages, currentStageIndex, currentQ, questions.length, adhocSkipped, build3Skipped, hasReviewStep])
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
    setPhase("route")
    setFeedbackPath(deepLinkedPath)
    setCurrentQ(0)
    setAnswers({})
    setFeedbackFor(null)
    setSelfFeedbackForTarget(null)
    setReviewAnswers({})
    setIntendedPath(null)
    setStages([])
    setCurrentStageIndex(0)
    setError("")
    window.history.replaceState({ formPhase: "route", formQ: 0 }, "")
  }, [deepLinkedPath])

  /** Whether the gate checks (self-feedback, build3-feedback) have finished loading. */
  const gateChecksLoaded = hasSelfFeedback !== null && hasBuild3Feedback !== null

  /** Build the ordered pipeline of stages for a target path, given gate status.
   *  Only gates that are definitively not completed (false) are included.
   *  Must not be called until gateChecksLoaded is true. */
  function buildStages(targetPath: FeedbackPath): FeedbackPath[] {
    if (targetPath === "adhoc" || targetPath === "self") return [targetPath]
    const result: FeedbackPath[] = []
    if (hasSelfFeedback === false) result.push("self")
    if (targetPath !== "build3" && hasBuild3Feedback === false) result.push("build3")
    result.push(targetPath)
    return result
  }

  /** Start the pipeline for a chosen path — sets up stages and jumps to first question.
   *  For paths that need gates (full_timer, intern), waits for gate checks to load. */
  function startPipeline(targetPath: FeedbackPath) {
    // adhoc and self don't need gate checks
    const needsGates = targetPath !== "adhoc" && targetPath !== "self"
    if (needsGates && !gateChecksLoaded) return
    const pipeline = buildStages(targetPath)
    const firstStage = pipeline[0]
    const hasGates = pipeline.length > 1

    setStages(pipeline)
    setCurrentStageIndex(0)
    setIntendedPath(hasGates ? targetPath : null)
    setFeedbackPath(firstStage)
    setFeedbackFor(null)
    setAnswers({})
    pendingAnswers.current = {}
    setSelfFeedbackForTarget(null)
    setReviewAnswers({})

    animateTransition(true, () => {
      setCurrentQ(0)
      setPhase("questions")
    }, { formPhase: "questions", formQ: 0 })
  }

  function goNext() {
    setError("")

    if (phase === "identify") {
      if (!submitter) {
        setError("we need your name before we can route this.")
        return
      }

      // Check if submitter needs to provide birthday before routing
      if (!submitter.birthday) {
        setShowBirthdayDialog(true)
        return
      }

      if (deepLinkedPath && gateChecksLoaded) {
        startPipeline(deepLinkedPath)
      } else {
        animateTransition(true, () => setPhase("route"), { formPhase: "route", formQ: 0 })
      }
      return
    }

    if (phase === "route") {
      if (!feedbackPath) {
        setError("pick the kind of feedback you want to share.")
        return
      }
      startPipeline(feedbackPath)
      return
    }

    if (phase === "self_review") {
      // Validate all agreement radios are filled
      const missing = SELF_REVIEW_KEYS.some((key) => {
        const agreementKey = `review_${key}_agreement`
        const hasAnswer = selfFeedbackForTarget?.answers.find((a) => a.question_key === key)
        return hasAnswer && !reviewAnswers[agreementKey]
      })
      if (missing) {
        setError("share your view on each reflection before moving on.")
        return
      }
      // Continue to full_timer question index 1
      animateTransition(true, () => {
        setCurrentQ(1)
        setPhase("questions")
      }, { formPhase: "questions", formQ: 1 })
      return
    }

    if (phase === "questions") {
      // Gate navigation while voice is active
      if (voiceState === "recording") {
        void voiceBarRef.current?.stopAndTranscribe()
        return
      }
      if (voiceState === "transcribing") {
        setError("hang on — still transcribing your voice note.")
        return
      }

      const question = questions[currentQ]
      if (!validateAnswer(question)) return

      // Full-timer question 0 (feedback_for): auto-advance from SearchableDropdown
      // handles the self-review fetch. If the user clicks "keep going" instead,
      // skip if a fetch is already in-flight; otherwise trigger it here.
      if (feedbackPath === "full_timer" && currentQ === 0 && feedbackFor) {
        if (fetchingSelfFeedbackRef.current) return
        fetchSelfFeedbackAndAdvance(feedbackFor.id)
        return
      }

      const nextQ = getNextQ(currentQ, answers)
      if (nextQ !== null) {
        animateTransition(true, () => setCurrentQ(nextQ), {
          formPhase: "questions",
          formQ: nextQ,
        })
      } else {
        void handleSubmit()
      }
    }
  }

  /**
   * Conditional skip logic for feedback paths.
   * - adhoc: skip "what went well" when rating ≤ 3, skip "what could improve" when rating ≥ 4
   * Returns null when there are no more questions (should submit).
   */
  function getNextQ(
    fromQ: number,
    source: Record<string, string>
  ): number | null {
    let next = fromQ + 1

    if (feedbackPath === "adhoc") {
      const rating = Number(source["adhoc_rating"] || 0)
      if (next < questions.length && questions[next]?.key === "adhoc_positive" && rating <= 3) {
        next += 1
      }
      if (next < questions.length && questions[next]?.key === "adhoc_improve" && rating >= 4) {
        next += 1
      }
    }

    return next < questions.length ? next : null
  }

  function goBack() {
    setError("")

    if (phase === "self_review" || phase === "route" || phase === "questions") {
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

    if (question.type === "slider") {
      // Slider always has a numeric value (defaults to 50), so it's always valid
      return true
    }

    if (question.type === "slider_with_followup") {
      // Slider value is always valid (defaults to 50)
      // Follow-up text is optional — don't block progression
      return true
    }

    if (question.type === "values_with_text") {
      const raw = answers[question.key] || ""
      const sep = "|||"
      const parts = raw.split(sep)
      const indicesPart = parts[0] || ""
      const hasSelection = indicesPart.split(",").some((s) => {
        const n = parseInt(s, 10)
        return Number.isFinite(n) && n >= 0
      })
      if (!hasSelection) {
        setError("select at least one value before moving on.")
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
      } else if (question.type === "slider_with_followup") {
        // Emit the slider value
        const sliderValue = answers[question.key]?.trim()
        if (sliderValue) {
          answerRows.push({
            question_key: question.key,
            question_text: question.text,
            answer_value: sliderValue,
          })
        }
        // Emit the follow-up detail as a separate answer row
        const detailKey = question.followup?.detailKey || `${question.key}_detail`
        const detailValue = answers[detailKey]?.trim()
        if (detailValue) {
          const num = Number(sliderValue || 50)
          const threshold = question.followup?.threshold ?? 90
          const detailPrompt = num >= threshold
            ? (question.followup?.highPrompt || "follow-up")
            : (question.followup?.lowPrompt || "follow-up")
          answerRows.push({
            question_key: detailKey,
            question_text: detailPrompt,
            answer_value: detailValue,
          })
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

    // Inject self-review answers for full_timer submissions
    if (feedbackPath === "full_timer" && selfFeedbackForTarget) {
      for (const selfAnswer of selfFeedbackForTarget.answers) {
        const agreementKey = `review_${selfAnswer.question_key}_agreement`
        const agreementValue = reviewAnswers[agreementKey]?.trim()

        if (agreementValue) {
          answerRows.push({
            question_key: agreementKey,
            question_text: `Review of self-reflection: ${selfAnswer.question_text} — Agreement`,
            answer_value: agreementValue,
          })
        }
      }

      // Single overall comment for the entire self-review
      const overallComment = reviewAnswers["review_overall_comment"]?.trim()
      if (overallComment) {
        answerRows.push({
          question_key: "review_overall_comment",
          question_text: "Peer review — overall comment on self-reflection",
          answer_value: overallComment,
        })
      }
    }

    // If this was a gate stage in a multi-stage pipeline, show brief celebration then advance
    if (stages.length > 1 && currentStageIndex < stages.length - 1) {
      // Mark the completed gate as done
      if (feedbackPath === "self") setHasSelfFeedback(true)
      if (feedbackPath === "build3") setHasBuild3Feedback(true)

      // Submit in background, don't wait
      submittingRef.current = false
      fetch("/api/feedback-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedbackForId: feedbackPath === "build3" || feedbackPath === "self" ? null : feedbackFor?.id || null,
          feedbackType: feedbackPath as FeedbackType,
          answers: answerRows,
          sessionId: (feedbackPath === "intern" || feedbackPath === "full_timer") ? sessionId : null,
        }),
      }).catch(() => {})

      // Show stage_complete briefly, then auto-advance
      const nextIdx = currentStageIndex + 1
      const nextStagePath = stages[nextIdx]
      setPhase("stage_complete")
      window.history.replaceState({ formPhase: "stage_complete", formQ: 0 }, "")

      safeTimeout(() => {
        if (!mountedRef.current) return
        setCurrentStageIndex(nextIdx)
        setFeedbackPath(nextStagePath)
        setFeedbackFor(null)
        setAnswers({})
        pendingAnswers.current = {}
        setCurrentQ(0)
        if (nextIdx === stages.length - 1) {
          setIntendedPath(null)
        }
        animateTransition(true, () => {
          setPhase("questions")
        }, { formPhase: "questions", formQ: 0 })
      }, 1500)
      return
    }

    // Mark completed feedback type so gates don't re-ask on "send another"
    if (feedbackPath === "self") setHasSelfFeedback(true)
    if (feedbackPath === "build3") setHasBuild3Feedback(true)

    // Normal completion — show success
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
          sessionId: (feedbackPath === "intern" || feedbackPath === "full_timer") ? sessionId : null,
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

  // Global Enter key listener — works even when no input is focused
  useEffect(() => {
    function handleGlobalKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Enter") return
      if (phase === "submitting" || phase === "done" || phase === "stage_complete") return
      // Don't intercept if user is typing in a textarea, select, or combobox input (SearchableDropdown)
      const tag = (event.target as HTMLElement)?.tagName
      const el = event.target as HTMLElement
      if (tag === "TEXTAREA" || tag === "SELECT") return
      if (tag === "INPUT" && el.getAttribute("role") === "combobox") return
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
      // Gate navigation while voice is active
      if (voiceState === "recording" || voiceState === "transcribing") return

      const question = questions[currentQ]
      if (!validateAnswerFromRef(question)) return

      const nextQ = getNextQ(currentQ, pendingAnswers.current)
      if (nextQ !== null) {
        animateTransition(true, () => setCurrentQ(nextQ), {
          formPhase: "questions",
          formQ: nextQ,
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
    if (question.type === "slider") {
      return true
    }
    if (question.type === "slider_with_followup") {
      return true
    }
    if (question.type === "values_with_text") {
      const raw = pendingAnswers.current[question.key] || ""
      const sep = "|||"
      const indicesPart = raw.split(sep)[0] || ""
      return indicesPart.split(",").some((s) => {
        const n = parseInt(s, 10)
        return Number.isFinite(n) && n >= 0
      })
    }
    const value = pendingAnswers.current[question.key]
    return !!(value && value.trim())
  }

  /** Fetch target's self-feedback and transition to review or skip to next question */
  const fetchingSelfFeedbackRef = useRef(false)
  function fetchSelfFeedbackAndAdvance(employeeId: string) {
    if (fetchingSelfFeedbackRef.current) return
    fetchingSelfFeedbackRef.current = true
    fetch(`/api/self-feedback/${employeeId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!mountedRef.current) return
        fetchingSelfFeedbackRef.current = false
        if (data?.submission?.answers?.length > 0) {
          setSelfFeedbackForTarget({ answers: data.submission.answers })
          setReviewAnswers({})
          animateTransition(true, () => setPhase("self_review"), { formPhase: "self_review", formQ: 0 })
        } else {
          // No self-feedback — skip review, go to question 1
          setSelfFeedbackForTarget(null)
          animateTransition(true, () => setCurrentQ(1), {
            formPhase: "questions",
            formQ: 1,
          })
        }
      })
      .catch(() => {
        fetchingSelfFeedbackRef.current = false
        if (!mountedRef.current) return
        // On error, skip review
        setSelfFeedbackForTarget(null)
        animateTransition(true, () => setCurrentQ(1), {
          formPhase: "questions",
          formQ: 1,
        })
      })
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
                  // For full_timer path at question 0, fetch self-feedback and go to review
                  if (feedbackPath === "full_timer" && currentQ === 0) {
                    fetchSelfFeedbackAndAdvance(employee.id)
                    return
                  }
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
            <textarea
              value={answers[question.key] || ""}
              onChange={(event) => setAnswer(question.key, event.target.value)}
              rows={5}
              className={fieldClasses({ size: "lg" })}
              placeholder="write it how you would say it."
            />
            {VOICE_ENABLED && (
              <div className="mt-3">
                <VoiceRecorderBar
                  ref={voiceBarRef}
                  onTranscript={handleVoiceTranscript}
                  onStateChange={setVoiceState}
                />
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
                    "w-full rounded-[24px] border px-5 py-[18px] text-left transition-all",
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
      case "slider": {
        // Initialize default value so submission always has a number
        const sliderVal = answers[question.key]
        if (!sliderVal) {
          queueMicrotask(() => setAnswer(question.key, "50"))
        }
        return (
          <TrustSlider
            value={Number(answers[question.key]) || 50}
            min={question.min}
            max={question.max}
            onChange={(value) => setAnswer(question.key, String(value))}
          />
        )
      }
      case "slider_with_followup": {
        // Initialize default value so submission always has a number
        const compoundSliderVal = answers[question.key]
        if (!compoundSliderVal) {
          queueMicrotask(() => setAnswer(question.key, "50"))
        }
        const sliderNum = Number(answers[question.key]) || 50
        const fu = question.followup
        const isHigh = fu ? sliderNum >= fu.threshold : false
        const followupPrompt = fu ? (isHigh ? fu.highPrompt : fu.lowPrompt) : ""
        const followupPlaceholder = fu ? (isHigh ? (fu.highPlaceholder || "") : (fu.lowPlaceholder || "")) : ""
        const detailKey = fu?.detailKey || `${question.key}_detail`
        voiceQuestionKeyRef.current = detailKey
        return (
          <div className="space-y-6">
            <TrustSlider
              value={sliderNum}
              min={question.min}
              max={question.max}
              onChange={(value) => {
                if (!sliderTouched) setSliderTouched(true)
                setAnswer(question.key, String(value))
              }}
            />
            {/* Follow-up appears only after user drags the slider */}
            <div
              className={[
                "space-y-2 transition-all duration-300 overflow-hidden",
                sliderTouched
                  ? "opacity-100 max-h-[400px]"
                  : "opacity-0 max-h-0",
              ].join(" ")}
            >
              <p className="text-sm font-semibold text-ink">
                {followupPrompt}
              </p>
              <textarea
                value={answers[detailKey] || ""}
                onChange={(e) => setAnswer(detailKey, e.target.value)}
                rows={3}
                className={fieldClasses({ size: "lg" })}
                placeholder={followupPlaceholder}
              />
              {VOICE_ENABLED && (
                <div className="mt-1">
                  <VoiceRecorderBar
                    ref={voiceBarRef}
                    onTranscript={handleVoiceTranscript}
                    onStateChange={setVoiceState}
                  />
                </div>
              )}
            </div>
          </div>
        )
      }
      case "values_with_text": {
        voiceQuestionKeyRef.current = question.key
        return (
          <>
            <ValuesMultiSelect
              value={answers[question.key] || ""}
              onChange={(value) => setAnswer(question.key, value)}
            />
            {VOICE_ENABLED && (
              <div className="mt-3">
                <VoiceRecorderBar
                  ref={voiceBarRef}
                  onTranscript={handleVoiceTranscript}
                  onStateChange={setVoiceState}
                />
              </div>
            )}
          </>
        )
      }
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
        <main className="mx-auto flex min-h-[calc(100vh-76px)] max-w-4xl items-center px-4 py-6 pb-16 sm:px-6 sm:py-12 sm:pb-12">
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

  if (isKudos) {
    return (
      <div className="min-h-screen pb-24 sm:pb-0">
        <Navbar />
        {showBirthdayDialog && (
          <BirthdayDialog onSaved={() => {
            setShowBirthdayDialog(false)
            if (submitter) {
              setSubmitter({ ...submitter, birthday: new Date().toISOString().split('T')[0] })
            }
          }} />
        )}
        <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-12">
          <KudosCard />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      {showBirthdayDialog && (
        <BirthdayDialog onSaved={() => {
          setShowBirthdayDialog(false)
          if (submitter && phase === "identify") {
            const updated = { ...submitter, birthday: new Date().toISOString().split('T')[0] }
            setSubmitter(updated)
            safeTimeout(() => {
              if (!mountedRef.current) return
              if (deepLinkedPath && gateChecksLoaded) {
                startPipeline(deepLinkedPath)
              } else {
                animateTransition(true, () => setPhase("route"), { formPhase: "route", formQ: 0 })
              }
            }, 300)
          }
        }} />
      )}

      <div className="sticky top-[52px] sm:top-[64px] z-40 border-b border-line bg-canvas/95 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4 py-3 sm:py-3 sm:px-6">
          {/* Stage stepper pills — only when multi-stage pipeline */}
          {stages.length > 1 && (
            <div className="flex items-center gap-1.5 mb-2.5 overflow-x-auto">
              {stages.map((stage, idx) => {
                const isDone = idx < currentStageIndex
                const isCurrent = idx === currentStageIndex && phase !== "stage_complete"
                const isUpcoming = !isDone && !isCurrent
                return (
                  <div key={stage} className="flex items-center gap-1.5">
                    {idx > 0 && (
                      <div className={`h-px w-3 sm:w-5 transition-colors duration-300 ${isDone ? "bg-brand-peach" : "bg-black/10"}`} />
                    )}
                    <div
                      className={[
                        "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.04em] transition-all duration-300 whitespace-nowrap",
                        isDone
                          ? "bg-brand-peach/20 text-ink/70"
                          : isCurrent
                          ? "bg-brand-peach text-ink shadow-sm"
                          : "bg-black/[0.04] text-muted",
                      ].join(" ")}
                    >
                      {isDone && (
                        <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {isUpcoming && (
                        <span className="text-[10px] text-muted/60">{idx + 1}</span>
                      )}
                      {STAGE_LABELS[stage]}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div className="flex items-center justify-between gap-3 sm:gap-4">
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

      <main className="mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-12">
        <div className="grid gap-5 sm:gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
          <div className={`space-y-6 ${animClass}`}>
            {phase !== "identify" && phase !== "submitting" && phase !== "stage_complete" && (
              <button type="button" className={backButton.className} style={backButton.style} onClick={goBack}>
                go back
              </button>
            )}

            {phase === "identify" && (
              <>
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
              </>
            )}

            {phase === "route" && (
              <BrandPanel accent={feedbackAccent} tone="plain" className="p-6 sm:p-8">
                <SectionHeading
                  accent={feedbackAccent}
                  eyebrow="what are we writing?"
                  title="pick the lane"
                  description="we'll walk through each type in order. start with self-reflection, then build3, then review others. pick where you want to start."
                />
                <div className="mt-8 space-y-3">
                  {pathOptions.map((option) => {
                    const active = feedbackPath === option.key || intendedPath === option.key
                    const needsGates = option.key !== "self" && option.key !== "build3"
                    const waiting = needsGates && !gateChecksLoaded
                    return (
                      <button
                        key={option.key}
                        type="button"
                        disabled={waiting}
                        onClick={() => {
                          setFeedbackPath(option.key)
                          setError("")
                          safeTimeout(() => {
                            if (!mountedRef.current) return
                            startPipeline(option.key)
                          }, 200)
                        }}
                        className={[
                          "w-full rounded-[26px] border px-5 py-5 text-left transition-all",
                          waiting
                            ? "border-line bg-white/60 opacity-60 cursor-wait"
                            : active
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

            {/* Stage complete celebration — auto-transitions after 1.5s */}
            {phase === "stage_complete" && (() => {
              const completedLabel = STAGE_LABELS[feedbackPath || "self"]
              const nextIdx = currentStageIndex + 1
              const nextLabel = nextIdx < stages.length ? STAGE_LABELS[stages[nextIdx]] : ""
              return (
                <BrandPanel accent={feedbackAccent} tone="soft" className="p-8 sm:p-10 text-center">
                  <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full border border-brand-peach/50 bg-brand-peach/25">
                    <svg className="h-7 w-7 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="text-lg font-semibold tracking-[-0.03em] text-ink">
                    {completedLabel} done
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    nice one — moving to {nextLabel} now
                  </p>
                  <div className="mt-4 mx-auto h-1 w-16 overflow-hidden rounded-full bg-black/[0.06]">
                    <div className="h-full rounded-full bg-brand-peach animate-[progressFill_1.5s_ease-out_forwards]" />
                  </div>
                </BrandPanel>
              )
            })()}

            {phase === "self_review" && selfFeedbackForTarget && feedbackFor && (
              <SelfReviewStep
                feedbackForName={feedbackFor.name}
                answers={selfFeedbackForTarget.answers}
                reviewAnswers={reviewAnswers}
                onReviewChange={(key, value) =>
                  setReviewAnswers((prev) => ({ ...prev, [key]: value }))
                }
              />
            )}

            {phase === "questions" && questions[currentQ] && (
              <>
                {/* Inline context banner for gate stages */}
                {stages.length > 1 && currentQ === 0 && currentStageIndex < stages.length - 1 && (
                  <div className="rounded-[20px] border border-brand-peach/25 bg-brand-peach/8 px-5 py-3.5 text-sm text-ink/80">
                    <span className="font-semibold">{STAGE_LABELS[feedbackPath || "self"]}</span>
                    {" — "}
                    {currentStageIndex === 0
                      ? `quick step before your ${STAGE_LABELS[stages[stages.length - 1]]}`
                      : `almost there, then straight to ${STAGE_LABELS[stages[stages.length - 1]]}`
                    }
                  </div>
                )}
                <BrandPanel accent={feedbackAccent} tone="plain" className="p-6 sm:p-8">
                  <SectionHeading
                    accent={feedbackAccent}
                    eyebrow={stages.length > 1
                      ? `${STAGE_LABELS[feedbackPath || "self"]} · ${currentQ + 1} of ${questions.length}`
                      : `question ${currentQ + 1} of ${questions.length}`}
                    title={questions[currentQ].text}
                    description={questions[currentQ].subtext}
                  />
                  <div className="mt-8">{renderQuestion(questions[currentQ])}</div>
                </BrandPanel>
              </>
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

            {/* Spacer for sticky bottom bar + tab bar on mobile */}
            {phase !== "submitting" && phase !== "stage_complete" && <div className="h-24 sm:hidden" />}

            {/* Desktop inline action bar */}
            {phase !== "submitting" && phase !== "stage_complete" && (
              <div className="hidden sm:flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className={nextButton.className}
                  style={nextButton.style}
                  onClick={goNext}
                  disabled={voiceState === "transcribing"}
                >
                  {voiceState === "recording"
                    ? "finish recording"
                    : voiceState === "transcribing"
                    ? "transcribing..."
                    : phase === "questions" && currentQ === questions.length - 1
                    ? (stages.length > 1 && currentStageIndex < stages.length - 1 ? "next step" : "send it")
                    : "keep going"}
                </button>
                {voiceState === "idle" && (
                  <div className="rounded-full border border-line bg-white/86 px-3 py-2 text-xs font-semibold tracking-[0.08em] text-muted">
                    press enter to keep moving
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="hidden lg:block space-y-4 lg:sticky lg:top-[142px] lg:self-start">
            {phase === "self_review" && selfFeedbackForTarget && feedbackFor ? (
              <SelfReviewSidebar
                feedbackForName={feedbackFor.name}
                answers={selfFeedbackForTarget.answers}
              />
            ) : (
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
            )}

            <BrandPanel accent={feedbackAccent} tone="washed" className="brand-lines p-6">
              <div className="text-xs font-semibold tracking-[0.08em] text-muted">
                current route
              </div>
              <div className="mt-2 text-2xl font-bold tracking-[-0.05em] text-ink">
                {(intendedPath || feedbackPath) ? pathOptions.find((option) => option.key === (intendedPath || feedbackPath))?.label : "not picked yet"}
              </div>
              <p className="mt-2 text-sm leading-6 text-muted">
                {(intendedPath || feedbackPath)
                  ? pathOptions.find((option) => option.key === (intendedPath || feedbackPath))?.blurb
                  : "choose the route first and we will tailor the rest."}
              </p>
              {stages.length > 1 && currentStageIndex < stages.length - 1 && (
                <div className="mt-3 rounded-full border border-brand-peach/30 bg-brand-peach/10 px-3 py-1.5 text-[11px] font-semibold text-ink/70">
                  step {currentStageIndex + 1} of {stages.length} — {STAGE_LABELS[feedbackPath || "self"]}
                </div>
              )}
              <div className="mt-5 h-px w-full bg-black/[0.08]" />
              <div className="mt-5 text-sm leading-6 text-muted">
                we speak plainly here: kind, clear, and not too polished for our own good.
              </div>
            </BrandPanel>
          </div>
        </div>
      </main>

      {/* Mobile sticky bottom action bar — sits above the tab bar */}
      {phase !== "submitting" && phase !== "stage_complete" && (
        <div className="fixed bottom-[calc(44px+env(safe-area-inset-bottom,0px))] left-0 right-0 z-40 flex justify-center px-4 pb-1 sm:hidden">
          <button
            type="button"
            className={`${nextButton.className} !px-10 !py-2.5 !text-sm`}
            style={nextButton.style}
            onClick={goNext}
            disabled={voiceState === "transcribing"}
          >
            {voiceState === "recording"
              ? "finish recording"
              : voiceState === "transcribing"
              ? "transcribing..."
              : phase === "questions" && currentQ === questions.length - 1
              ? (stages.length > 1 && currentStageIndex < stages.length - 1 ? "next step" : "send it")
              : "keep going"}
          </button>
        </div>
      )}
    </div>
  )
}
