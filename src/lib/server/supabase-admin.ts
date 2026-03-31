import "server-only"

import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/types"

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const SERVER_SETUP_ERROR =
  "Server configuration is incomplete. Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY."

let adminClient:
  | ReturnType<typeof createClient<Database, "public">>
  | null = null

export function hasServerSupabaseConfig() {
  return Boolean(supabaseUrl && supabaseServiceRoleKey)
}

export function getSupabaseAdmin() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(SERVER_SETUP_ERROR)
  }

  if (!adminClient) {
    adminClient = createClient<Database, "public">(
      supabaseUrl,
      supabaseServiceRoleKey,
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
