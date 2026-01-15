import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env, hasSupabaseEnv } from './env'

export const supabase: SupabaseClient | null = hasSupabaseEnv()
  ? createClient(env.supabaseUrl!, env.supabaseAnonKey!)
  : null
