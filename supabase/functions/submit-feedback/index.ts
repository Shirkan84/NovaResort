import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''
const ADMIN_EMAIL = 'shir.kanevsky@gmail.com'

const CATEGORY_LABELS: Record<string, string> = {
  bug_report: 'Bug Report',
  feature_request: 'Feature Request',
  improvement: 'Improvement Suggestion',
  question: 'Question',
  general: 'General Feedback',
  other: 'Other'
}

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High'
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

    // Authenticate user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Authentication failed' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Parse body
    const body = await req.json()
    const { category, subject, description, priority, screenshot_url, browser, os, current_page } = body

    // Validate inputs
    if (!category || !['bug_report', 'feature_request', 'improvement', 'question', 'general', 'other'].includes(category)) {
      return new Response(JSON.stringify({ error: 'Invalid category' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!subject || subject.trim().length < 3 || subject.length > 200) {
      return new Response(JSON.stringify({ error: 'Subject must be 3-200 characters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!description || description.trim().length < 10 || description.length > 5000) {
      return new Response(JSON.stringify({ error: 'Description must be 10-5000 characters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const safePriority = priority && ['low', 'medium', 'high'].includes(priority) ? priority : 'medium'

    // Sanitize text inputs
    const sanitize = (s: string) => s.replace(/<[^>]*>/g, '').trim()
    const safeSubject = sanitize(subject)
    const safeDescription = sanitize(description)

    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, display_name, profile_type')
      .eq('id', user.id)
      .single()

    const userName = profile?.display_name || profile?.full_name || user.email || 'Unknown'
    const userRole = profile?.profile_type || 'member'
    const userEmail = user.email || 'unknown'

    // Insert into database
    const { data: feedback, error: insertError } = await supabase
      .from('feedback_reports')
      .insert({
        user_id: user.id,
        category,
        subject: safeSubject,
        description: safeDescription,
        priority: safePriority,
        screenshot_url: screenshot_url || null,
        browser: browser || null,
        os: os || null,
        current_page: current_page || null,
        status: 'new'
      })
      .select()
      .single()

    if (insertError) {
      console.error('Insert error:', insertError)
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Send email via Resend (if API key is configured)
    let emailSent = false
    if (RESEND_API_KEY) {
      try {
        const categoryLabel = CATEGORY_LABELS[category] || category
        const priorityLabel = PRIORITY_LABELS[safePriority] || safePriority
        const timestamp = new Date().toISOString()
        const screenshotSection = screenshot_url
          ? `\n\nScreenshot: ${screenshot_url}`
          : ''

        const emailHtml = `
          <div style="font-family:system-ui,-apple-system,sans-serif;max-width:640px;margin:0 auto;padding:32px;">
            <div style="background:#526f62;color:white;padding:20px 24px;border-radius:12px 12px 0 0;">
              <h1 style="margin:0;font-size:18px;">Nova Resort — New Feedback</h1>
              <p style="margin:6px 0 0;font-size:13px;opacity:0.85;">${categoryLabel} · ${priorityLabel} priority</p>
            </div>
            <div style="border:1px solid #e4e9e3;border-top:none;padding:24px;border-radius:0 0 12px 12px;">
              <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <tr><td style="padding:8px 0;color:#718078;width:120px;">Category</td><td style="padding:8px 0;font-weight:600;">${categoryLabel}</td></tr>
                <tr><td style="padding:8px 0;color:#718078;">Priority</td><td style="padding:8px 0;font-weight:600;">${priorityLabel}</td></tr>
                <tr><td style="padding:8px 0;color:#718078;">Subject</td><td style="padding:8px 0;font-weight:600;">${safeSubject}</td></tr>
                <tr><td style="padding:8px 0;color:#718078;vertical-align:top;">Description</td><td style="padding:8px 0;white-space:pre-wrap;line-height:1.6;">${safeDescription}</td></tr>
                ${screenshotSection ? `<tr><td style="padding:8px 0;color:#718078;">Screenshot</td><td style="padding:8px 0;"><a href="${screenshot_url}" style="color:#526f62;">View Screenshot</a></td></tr>` : ''}
              </table>
              <hr style="border:none;border-top:1px solid #e4e9e3;margin:16px 0;"/>
              <table style="width:100%;border-collapse:collapse;font-size:11px;color:#718078;">
                <tr><td style="padding:4px 0;">User: ${userName} (${userEmail})</td></tr>
                <tr><td style="padding:4px 0;">Role: ${userRole}</td></tr>
                <tr><td style="padding:4px 0;">User ID: ${user.id}</td></tr>
                <tr><td style="padding:4px 0;">Browser: ${browser || 'Unknown'}</td></tr>
                <tr><td style="padding:4px 0;">OS: ${os || 'Unknown'}</td></tr>
                <tr><td style="padding:4px 0;">Page: ${current_page || 'Unknown'}</td></tr>
                <tr><td style="padding:4px 0;">Time: ${timestamp}</td></tr>
              </table>
            </div>
          </div>
        `

        const resendResp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'Nova Resort Feedback <onboarding@resend.dev>',
            to: [ADMIN_EMAIL],
            subject: `[Nova Resort] ${categoryLabel} - ${safeSubject}`,
            html: emailHtml,
            reply_to: userEmail
          })
        })

        emailSent = resendResp.ok
        if (!emailSent) {
          const errText = await resendResp.text()
          console.error('Resend error:', errText)
        }
      } catch (emailErr) {
        console.error('Email send failed:', emailErr)
      }
    }

    return new Response(JSON.stringify({
      success: true,
      feedback_id: feedback.id,
      email_sent: emailSent,
      message: emailSent
        ? 'Feedback submitted and email sent successfully.'
        : 'Feedback submitted successfully. Email delivery was not configured.'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('Feedback submission error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
