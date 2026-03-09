import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!

// Client-side Supabase (limited permissions)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Server-side Supabase (full permissions for inserts/RPC)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
