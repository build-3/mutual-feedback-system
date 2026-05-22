export type EmployeeRole = "intern" | "full_timer" | "admin"
export type ProbationStatus = "active" | "extended" | "promoted"
export type ContributionLevel = "independent_contributor" | "leader"

export type Kudos = {
  id: string
  sender_id: string
  message: string
  gif_url: string | null
  created_at: string
}

export type KudosRecipient = {
  kudos_id: string
  recipient_id: string
}

export type KudosLeaderboardEntry = {
  employee_id: string
  employee_name: string
  count: number
}

export type SessionStatus = "upcoming" | "active" | "completed"

export type FeedbackSession = {
  id: string
  session_date: string
  status: SessionStatus
  created_at: string
}

export type SessionAssignment = {
  id: string
  session_id: string
  intern_id: string
  reviewer_id: string
  submission_id: string | null
  created_at: string
}

export type ProbationTracking = {
  id: string
  employee_id: string
  start_date: string
  duration_months: 3 | 6
  end_date: string
  status: ProbationStatus
  extended_at: string | null
  promoted_at: string | null
  created_at: string
  updated_at: string
}

export type ProbationReview = {
  id: string
  probation_id: string
  reviewer_id: string
  contribution_level: ContributionLevel
  backing_score: number
  created_at: string
}

export type Employee = {
  id: string
  name: string
  role: EmployeeRole
  email?: string | null
  birthday?: string | null
  is_active?: boolean
  buddy_id?: string | null
  sponsor_id?: string | null
  created_at: string
}

export type FeedbackType = "intern" | "build3" | "full_timer" | "self" | "adhoc"

export type FeedbackSubmission = {
  id: string
  submitted_by_id: string
  feedback_for_id: string | null
  feedback_type: FeedbackType
  session_id: string | null
  notified_at: string | null
  created_at: string
}

export type FeedbackAnswer = {
  id: string
  submission_id: string
  question_key: string
  question_text: string
  answer_value: string
  created_at: string
}

export type FeedbackResponse = {
  id: string
  answer_id: string
  responder_id: string
  response_text: string
  created_at: string
}

export type Database = {
  public: {
    Tables: {
      employees: {
        Row: Employee
        Insert: {
          id?: string
          name: string
          role: EmployeeRole
          email?: string | null
          birthday?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          role?: EmployeeRole
          email?: string | null
          birthday?: string | null
          created_at?: string
        }
        Relationships: []
      }
      feedback_submissions: {
        Row: FeedbackSubmission
        Insert: {
          id?: string
          submitted_by_id: string
          feedback_for_id?: string | null
          feedback_type: FeedbackType
          session_id?: string | null
          notified_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          submitted_by_id?: string
          feedback_for_id?: string | null
          feedback_type?: FeedbackType
          session_id?: string | null
          notified_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      feedback_sessions: {
        Row: FeedbackSession
        Insert: {
          id?: string
          session_date: string
          status?: SessionStatus
          created_at?: string
        }
        Update: {
          id?: string
          session_date?: string
          status?: SessionStatus
          created_at?: string
        }
        Relationships: []
      }
      session_assignments: {
        Row: SessionAssignment
        Insert: {
          id?: string
          session_id: string
          intern_id: string
          reviewer_id: string
          submission_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          intern_id?: string
          reviewer_id?: string
          submission_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      feedback_answers: {
        Row: FeedbackAnswer
        Insert: {
          id?: string
          submission_id: string
          question_key: string
          question_text: string
          answer_value: string
          created_at?: string
        }
        Update: {
          id?: string
          submission_id?: string
          question_key?: string
          question_text?: string
          answer_value?: string
          created_at?: string
        }
        Relationships: []
      }
      feedback_responses: {
        Row: FeedbackResponse
        Insert: {
          id?: string
          answer_id: string
          responder_id: string
          response_text: string
          created_at?: string
        }
        Update: {
          id?: string
          answer_id?: string
          responder_id?: string
          response_text?: string
          created_at?: string
        }
        Relationships: []
      }
      probation_tracking: {
        Row: ProbationTracking
        Insert: {
          id?: string
          employee_id: string
          start_date?: string
          duration_months?: 3 | 6
          end_date: string
          status?: ProbationStatus
          extended_at?: string | null
          promoted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          employee_id?: string
          start_date?: string
          duration_months?: 3 | 6
          end_date?: string
          status?: ProbationStatus
          extended_at?: string | null
          promoted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      probation_reviews: {
        Row: ProbationReview
        Insert: {
          id?: string
          probation_id: string
          reviewer_id: string
          contribution_level: ContributionLevel
          backing_score: number
          created_at?: string
        }
        Update: {
          id?: string
          probation_id?: string
          reviewer_id?: string
          contribution_level?: ContributionLevel
          backing_score?: number
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      submit_feedback_with_answers: {
        Args: {
          p_submitted_by_id: string
          p_feedback_for_id: string | null
          p_feedback_type: FeedbackType
          p_answers: Array<{
            question_key: string
            question_text: string
            answer_value: string
          }>
        }
        Returns: string
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
