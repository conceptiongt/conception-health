import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://kezokphwwnedpcpcqzyk.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_BYuKHYvNTQEX6JgQVJeqhQ_d1U1KxiV'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
