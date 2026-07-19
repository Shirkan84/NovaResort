import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ytdkpbuzycvspexnkeci.supabase.co'
const supabasePublishableKey = 'sb_publishable_Zu5t4GsdcE3Kbw2Ztt-PwQ_yNoH3yvQ'

export const supabase = createClient(supabaseUrl, supabasePublishableKey)
export { supabaseUrl, supabasePublishableKey }
