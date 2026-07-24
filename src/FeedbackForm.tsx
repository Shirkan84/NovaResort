import { FormEvent, useState } from 'react'
import { Bug, Lightbulb, MessageCircleQuestion, Send, Star, Upload, X, CheckCircle2, Loader2, Flag } from 'lucide-react'
import { supabase, supabaseUrl } from './supabase'

const CATEGORIES = [
  { value: 'bug_report', label: 'Bug Report', icon: Bug },
  { value: 'feature_request', label: 'Feature Request', icon: Lightbulb },
  { value: 'improvement', label: 'Improvement Suggestion', icon: Star },
  { value: 'question', label: 'Question', icon: MessageCircleQuestion },
  { value: 'general', label: 'General Feedback', icon: Send },
  { value: 'other', label: 'Other', icon: Flag },
] as const

type Category = typeof CATEGORIES[number]['value']
type Priority = 'low' | 'medium' | 'high'
type SubmitState = 'idle' | 'uploading' | 'submitting' | 'success' | 'error'

function getBrowserInfo() {
  const ua = navigator.userAgent
  let browser = 'Unknown'
  if (ua.includes('Firefox/')) browser = 'Firefox ' + ua.split('Firefox/')[1]?.split(' ')[0]
  else if (ua.includes('Edg/')) browser = 'Edge ' + ua.split('Edg/')[1]?.split(' ')[0]
  else if (ua.includes('Chrome/')) browser = 'Chrome ' + ua.split('Chrome/')[1]?.split(' ')[0]
  else if (ua.includes('Safari/')) browser = 'Safari ' + ua.split('Version/')[1]?.split(' ')[0]
  let os = 'Unknown'
  if (ua.includes('Windows')) os = 'Windows'
  else if (ua.includes('Mac OS')) os = 'macOS'
  else if (ua.includes('Linux')) os = 'Linux'
  else if (ua.includes('Android')) os = 'Android'
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS'
  return { browser, os }
}

export function FeedbackForm({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<Category | ''>('')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null)
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!category) e.category = 'Please select a category'
    if (subject.trim().length < 3) e.subject = 'Subject must be at least 3 characters'
    if (subject.length > 200) e.subject = 'Subject must be 200 characters or fewer'
    if (description.trim().length < 10) e.description = 'Description must be at least 10 characters'
    if (description.length > 5000) e.description = 'Description must be 5000 characters or fewer'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleScreenshot(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
      setErrors(prev => ({ ...prev, screenshot: 'Please select a PNG, JPG, WebP, or GIF image' }))
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrors(prev => ({ ...prev, screenshot: 'Screenshot must be under 5 MB' }))
      return
    }
    setScreenshotFile(file)
    setErrors(prev => { const { screenshot, ...rest } = prev; return rest })
    const reader = new FileReader()
    reader.onload = () => setScreenshotPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!validate()) return

    setSubmitState('uploading')
    setErrorMsg('')

    try {
      let screenshotUrl: string | null = null

      if (screenshotFile) {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error('Not authenticated')

        const path = `${session.user.id}/${Date.now()}-${screenshotFile.name}`
        const { error: uploadError } = await supabase.storage
          .from('feedback-screenshots')
          .upload(path, screenshotFile, { contentType: screenshotFile.type })

        if (uploadError) throw new Error('Failed to upload screenshot: ' + uploadError.message)

        const { data: urlData } = supabase.storage
          .from('feedback-screenshots')
          .getPublicUrl(path)
        screenshotUrl = urlData.publicUrl
      }

      setSubmitState('submitting')

      const { browser, os } = getBrowserInfo()
      const currentPage = window.location.href

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

        const functionUrl = `${supabaseUrl}/functions/v1/submit-feedback`
      const resp = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category,
          subject: subject.trim(),
          description: description.trim(),
          priority,
          screenshot_url: screenshotUrl,
          browser,
          os,
          current_page: currentPage,
        })
      })

      const result = await resp.json()

      if (!resp.ok) throw new Error(result.error || 'Submission failed')

      setSubmitState('success')
    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong. Please try again.')
      setSubmitState('error')
    }
  }

  if (submitState === 'success') {
    return (
      <div className="feature-overlay">
        <section className="feedback-form" role="dialog" aria-modal="true" aria-label="Feedback">
          <header>
            <div>
              <h2>Feedback Sent</h2>
              <p>Thank you for helping us improve Nova Resort.</p>
            </div>
            <button onClick={onClose}><X /></button>
          </header>
          <div className="feedback-success">
            <CheckCircle2 size={48} />
            <h3>Thank you for your feedback!</h3>
            <p>Your report has been received. We review every submission and will get back to you if needed.</p>
            <button className="feedback-close-btn" onClick={onClose}>Close</button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="feature-overlay">
      <section className="feedback-form" role="dialog" aria-modal="true" aria-label="Feedback">
        <header>
          <div>
            <h2>Send Feedback</h2>
            <p>Report a bug, suggest a feature, or share your thoughts.</p>
          </div>
          <button onClick={onClose}><X /></button>
        </header>

        <form onSubmit={handleSubmit} className="feedback-body">
          <div className="feedback-field">
            <label>Category <span className="required">*</span></label>
            <div className="feedback-categories">
              {CATEGORIES.map(cat => {
                const Icon = cat.icon
                return (
                  <button
                    key={cat.value}
                    type="button"
                    className={category === cat.value ? 'feedback-cat active' : 'feedback-cat'}
                    onClick={() => { setCategory(cat.value); setErrors(prev => { const { category, ...rest } = prev; return rest }) }}
                  >
                    <Icon size={16} />
                    <span>{cat.label}</span>
                  </button>
                )
              })}
            </div>
            {errors.category && <span className="feedback-error">{errors.category}</span>}
          </div>

          <div className="feedback-field">
            <label htmlFor="feedback-subject">Subject <span className="required">*</span></label>
            <input
              id="feedback-subject"
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Brief summary of your feedback"
              maxLength={200}
              className={errors.subject ? 'input-error' : ''}
            />
            <div className="feedback-char-count">{subject.length}/200</div>
            {errors.subject && <span className="feedback-error">{errors.subject}</span>}
          </div>

          <div className="feedback-field">
            <label htmlFor="feedback-description">Description <span className="required">*</span></label>
            <textarea
              id="feedback-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Please describe your feedback in detail. Include steps to reproduce if reporting a bug."
              rows={8}
              maxLength={5000}
              className={errors.description ? 'input-error' : ''}
            />
            <div className="feedback-char-count">{description.length}/5000</div>
            {errors.description && <span className="feedback-error">{errors.description}</span>}
          </div>

          <div className="feedback-field">
            <label htmlFor="feedback-priority">Priority</label>
            <select
              id="feedback-priority"
              value={priority}
              onChange={e => setPriority(e.target.value as Priority)}
            >
              <option value="low">Low — Nice to have</option>
              <option value="medium">Medium — Affects experience</option>
              <option value="high">High — Blocks core functionality</option>
            </select>
          </div>

          <div className="feedback-field">
            <label>Screenshot (optional)</label>
            {screenshotPreview ? (
              <div className="feedback-screenshot-preview">
                <img src={screenshotPreview} alt="Screenshot preview" />
                <button type="button" className="feedback-remove-screenshot" onClick={() => { setScreenshotFile(null); setScreenshotPreview(null) }}>
                  <X size={14} /> Remove
                </button>
              </div>
            ) : (
              <label className="feedback-upload">
                <Upload size={18} />
                <span>Click to upload an image</span>
                <span className="feedback-upload-hint">PNG, JPG, WebP, or GIF · Max 5 MB</span>
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleScreenshot} hidden />
              </label>
            )}
            {errors.screenshot && <span className="feedback-error">{errors.screenshot}</span>}
          </div>

          {errorMsg && <div className="feedback-error-banner">{errorMsg}</div>}

          <div className="feedback-actions">
            <button type="button" className="feedback-cancel" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              className="feedback-submit"
              disabled={submitState === 'uploading' || submitState === 'submitting'}
            >
              {submitState === 'uploading' ? (
                <><Loader2 size={15} className="spin" /> Uploading…</>
              ) : submitState === 'submitting' ? (
                <><Loader2 size={15} className="spin" /> Sending…</>
              ) : (
                <><Send size={15} /> Send Feedback</>
              )}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
