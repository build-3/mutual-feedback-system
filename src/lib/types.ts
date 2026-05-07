export type EmployeeRole = "intern" | "full_timer" | "admin"

export type Employee = {
  id: string
  name: string
  role: EmployeeRole
  email?: string | null
  birthday?: string | null
  created_at: string
}

export type FeedbackType = "intern" | "build3" | "full_timer" | "self" | "adhoc"

export type FeedbackSubmission = {
  id: string
  submitted_by_id: string
  feedback_for_id: string | null
  feedback_type: FeedbackType
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
          notified_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          submitted_by_id?: string
          feedback_for_id?: string | null
          feedback_type?: FeedbackType
          notified_at?: string | null
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
