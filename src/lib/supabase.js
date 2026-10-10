import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY, MODO_DEMO } from './config'
import { supabaseDemo } from './demo'

// In demo mode the whole app works on sample data and never touches the real accounts
export const supabase = MODO_DEMO ? supabaseDemo : createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
