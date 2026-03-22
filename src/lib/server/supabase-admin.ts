import "server-only"

import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/types"

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const isDev = process.env.NODE_ENV !== "production"
const effectiveKey = supabaseServiceRoleKey || (isDev ? supabaseAnonKey : undefined)

export const SERVER_SETUP_ERROR =
  "Server configuration is incomplete. Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY."

let adminClient:
  | ReturnType<typeof createClient<Database, "public">>
  | null = null

export function hasServerSupabaseConfig() {
  return Boolean(supabaseUrl && effectiveKey)
}

export function getSupabaseAdmin() {
  if (!supabaseUrl || !effectiveKey) {
    throw new Error(SERVER_SETUP_ERROR)
  }

  if (!adminClient) {
    if (!supabaseServiceRoleKey && isDev && supabaseAnonKey) {
      console.warn(
        "SUPABASE_SERVICE_ROLE_KEY is not set. Falling back to NEXT_PUBLIC_SUPABASE_ANON_KEY for local development only."
      )
    }

    adminClient = createClient<Database, "public">(
      supabaseUrl,
      effectiveKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )
  }

  return adminClient
}
