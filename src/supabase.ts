import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ytdkpbuzycvspexnkeci.supabase.co'
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Zu5t4GsdcE3Kbw2Ztt-PwQ_yNoH3yvQ'

export const supabase = createClient(supabaseUrl, supabasePublishableKey)
export { supabaseUrl, supabasePublishableKey }
