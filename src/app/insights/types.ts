import { FeedbackSubmission, FeedbackAnswer } from '@/lib/types'

export interface SubmissionWithDetails {
  submission: FeedbackSubmission
  submitterName: string
  answers: FeedbackAnswer[]
}
