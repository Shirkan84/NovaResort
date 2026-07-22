import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const now = new Date()
    let totalSent = 0

    // Find sessions that need reminders
    // 24h reminder: sessions starting between now+23h and now+25h
    // 1h reminder: sessions starting between now+45m and now+75m
    // 15m reminder: sessions starting between now+5m and now+25m
    // start reminder: sessions starting between now-2m and now+5m
    const reminderWindows = [
      { type: '24h', startOffset: 23 * 60, endOffset: 25 * 60 },
      { type: '1h', startOffset: 45, endOffset: 75 },
      { type: '15m', startOffset: 5, endOffset: 25 },
      { type: 'start', startOffset: -2, endOffset: 5 },
    ]

    for (const window of reminderWindows) {
      const startTime = new Date(now.getTime() + window.startOffset * 60000)
      const endTime = new Date(now.getTime() + window.endOffset * 60000)

      // Find sessions starting in this window that are still published/live
      const { data: sessions } = await supabase
        .from('sessions')
        .select('id')
        .gte('starts_at', startTime.toISOString())
        .lte('starts_at', endTime.toISOString())
        .in('status', ['published', 'live'])

      if (!sessions || sessions.length === 0) continue

      for (const session of sessions) {
        const { data, error } = await supabase.rpc('send_session_reminders', {
          target_session: session.id,
          reminder_type: window.type
        })

        if (!error && data) {
          totalSent += data as number
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, remindersSent: totalSent }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
