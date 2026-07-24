import { FormEvent, useEffect, useState } from 'react'
import {
  Leaf, Sparkles, ShieldCheck, ChevronRight, ChevronLeft, Mail, User, Briefcase,
  Heart, Languages, CheckCircle2, Loader2, AlertTriangle
} from 'lucide-react'
import { supabase } from './supabase'
import { getLanguage, switchLanguage } from './i18n'

const EMAIL_REDIRECT_TO = import.meta.env.VITE_BASE_URL || `${window.location.origin}/`

const TREATMENT_AREAS = [
  'Anxiety','Depression','Trauma','PTSD','Grief','Relationships','Marriage Counseling',
  'Family Therapy','Parenting','ADHD','Addiction Recovery','Stress Management','Burnout',
  'Mindfulness','Meditation','Self-Esteem','Personal Growth','Emotional Healing',
  'Spiritual Guidance','Sleep',"Women's Health","Men's Health",'Teen Support',
  'Career Coaching','Life Coaching','Wellness','Nutrition','Breathwork','Yoga'
]
const MODALITIES = [
  'Cognitive Behavioral Therapy','Mindfulness-Based Therapy','EMDR','Somatic Experiencing',
  'Psychodynamic Therapy','Dialectical Behavior Therapy','Acceptance & Commitment Therapy',
  'Art Therapy','Music Therapy','Coaching','Mentoring','Group Therapy',
  'Breathwork','Yoga Therapy','Energy Healing','Reiki','Sound Healing',
  'Guided Meditation','Holistic Therapy','Integrative Therapy'
]
const LANGUAGES = ['English','Hebrew','Arabic','Spanish','French','Russian','German','Portuguese','Italian','Other']
const WELLNESS_INTERESTS = [
  'Meditation','Mindfulness','Breathwork','Yoga','Stress Management','Emotional Healing',
  'Personal Growth','Sleep Improvement','Self-Esteem','Relationships','Grief Support',
  'Spiritual Growth','Physical Wellness','Nutrition','Nature Therapy','Creative Expression'
]
const WELLNESS_GOALS = [
  'Reduce stress','Improve sleep','Manage anxiety','Process grief','Build confidence',
  'Strengthen relationships','Develop mindfulness practice','Heal from trauma',
  'Find community support','Explore spiritual growth','Improve work-life balance',
  'Build healthy habits'
]
const PROFESSIONAL_TITLES = [
  'Psychologist','Therapist','Life Coach','Mental Health Counselor','Meditation Teacher',
  'Mindfulness Coach','Holistic Therapist','Social Worker','Wellness Practitioner',
  'Yoga Instructor','Breathwork Facilitator','Energy Healer','Other'
]

function Logo() {
  return <div className="logo"><div className="logo-mark"><Leaf size={20}/><Sparkles size={10}/></div><div><b>nova</b><span>resort</span></div></div>
}

function setRoute(path: string) {
  const normalized = path.startsWith('/') ? path : `/${path}`
  const next = `#${normalized}`
  if (window.location.hash !== next) window.location.hash = next
}

function setAuthRoute(path: string) {
  setRoute(path)
}

function ErrorIcon() { return <AlertTriangle size={17}/> }

// ============================================================
// REGISTRATION CHOOSER
// ============================================================
export function RegistrationChooser() {
  const [hovered, setHovered] = useState<string|null>(null)
  return <div className="auth-page"><button className="language-toggle auth-language" onClick={()=>switchLanguage(getLanguage()==='en'?'he':'en')}><Languages/>{getLanguage()==='en'?'\u05E2\u05D1\u05E8\u05D9\u05EA':'English'}</button>
    <div className="auth-brand"><Logo/><div className="auth-hero-copy"><span className="auth-kicker"><Sparkles size={13}/> JOIN NOVA RESORT</span><h1>How would you like<br/>to <em>join us?</em></h1><p>Choose the path that feels right for you. Both roles give you full access to our caring community.</p><div className="auth-values"><span><Heart/>Kind connection</span><span><ShieldCheck/>Safety first</span><span><Leaf/>Space to grow</span></div></div><p className="auth-disclaimer">Nova Resort is a peer-support community and is not a substitute for professional or emergency services.</p></div>
    <div className="auth-panel"><div className="auth-mobile-logo"><Logo/></div><div className="auth-form-wrap">      <span className="welcome-icon"><Leaf size={22}/></span>
      <h2>Create Your Account</h2>
      <p>Choose the profile you would like to use when registering for Nova Resort.</p>
      <div className="registration-chooser">
        <button
          className={`chooser-card ${hovered === 'member' ? 'hovered' : ''}`}
          onMouseEnter={() => setHovered('member')}
          onMouseLeave={() => setHovered(null)}
          onClick={() => setAuthRoute('register/member')}
        >
          <div className="chooser-icon member"><User size={28}/></div>
          <h3>Member Profile</h3>
          <p>Connect with healers, join sessions, and be part of a caring community.</p>
          <ul>
            <li>Discover healers and wellness professionals</li>
            <li>Join live sessions and workshops</li>
            <li>Access podcasts and wellness content</li>
            <li>Connect with community members</li>
          </ul>
          <span className="chooser-cta">Create member account <ChevronRight size={14}/></span>
        </button>
        <button
          className={`chooser-card ${hovered === 'healer' ? 'hovered' : ''}`}
          onMouseEnter={() => setHovered('healer')}
          onMouseLeave={() => setHovered(null)}
          onClick={() => setAuthRoute('register/healer')}
        >
          <div className="chooser-icon healer"><Briefcase size={28}/></div>
          <h3>Healer Profile</h3>
          <p>Share your expertise, host sessions, and create wellness content.</p>
          <ul>
            <li>Host live sessions and workshops</li>
            <li>Create and publish podcasts</li>
            <li>Build your professional profile</li>
            <li>Connect with people who need support</li>
          </ul>
          <span className="chooser-cta">Create healer account <ChevronRight size={14}/></span>
        </button>
      </div>
      <div className="auth-switch">Already have an account? <button onClick={() => setAuthRoute('login')}>Sign in</button></div>
    </div>
    <footer className="auth-footer">&copy; 2026 Nova Resort. Created and designed by Shir Kanevsky. All rights reserved.</footer>
  </div></div>
}

// ============================================================
// MEMBER REGISTRATION
// ============================================================
export function MemberRegistration() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string,string>>({})

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const firstName = String(form.get('first_name') || '').trim()
    const lastName = String(form.get('last_name') || '').trim()
    const email = String(form.get('email') || '').trim().toLowerCase()
    const password = String(form.get('password') || '')
    const confirmPassword = String(form.get('confirm_password') || '')
    const preferredLanguage = String(form.get('preferred_language') || 'English')
    const location = String(form.get('location') || '').trim()
    const agreed = Boolean(form.get('terms'))
    const privacy = Boolean(form.get('privacy'))

    const errors: Record<string,string> = {}
    if (!firstName) errors.first_name = 'First name is required.'
    if (!lastName) errors.last_name = 'Last name is required.'
    if (!email) errors.email = 'Email is required.'
    if (password.length < 8) errors.password = 'Password must be at least 8 characters.'
    if (password !== confirmPassword) errors.confirm_password = 'Passwords do not match.'
    if (!agreed) errors.terms = 'You must agree to the Community Guidelines.'
    if (!privacy) errors.privacy = 'You must consent to data processing.'

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setError('Please fix the highlighted fields.')
      return
    }
    setFieldErrors({})
    setError('')
    setLoading(true)

    try {
      const interests = form.getAll('interests').map(String).filter(Boolean)
      const goals = form.getAll('goals').map(String).filter(Boolean)

      const registrationData = {
        first_name: firstName,
        last_name: lastName,
        preferred_language: preferredLanguage,
        location: location || null,
        interests,
        wellness_goals: goals
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: EMAIL_REDIRECT_TO,
          data: {
            display_name: `${firstName} ${lastName}`,
            role: 'member',
            registration_data: registrationData
          }
        }
      })
      if (signUpError) throw signUpError

      if (data.session) {
        sessionStorage.removeItem('nova_reg_email')
        setRoute('home')
      } else {
        sessionStorage.setItem('nova_reg_email', email)
        setAuthRoute('check-email')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Registration failed. Please try again.'
      if (msg.includes('already registered') || msg.includes('already been registered')) {
        setError('An account with this email already exists. Please sign in instead.')
      } else {
        setError(msg)
      }
    } finally { setLoading(false) }
  }

  return <div className="auth-page"><button className="language-toggle auth-language" onClick={()=>setAuthRoute('register')}>🌐 EN</button>
    <div className="auth-brand"><Logo/><div className="auth-hero-copy"><span className="auth-kicker"><Sparkles size={13}/> MEMBER REGISTRATION</span><h1>Join as a<br/><em>community member</em></h1><p>Connect with wellness professionals, join sessions, and be part of a caring community built around emotional wellbeing.</p><div className="auth-values"><span><Heart/>Kind connection</span><span><ShieldCheck/>Safety first</span><span><Leaf/>Space to grow</span></div></div></div>
    <div className="auth-panel"><div className="auth-mobile-logo"><Logo/></div><div className="auth-form-wrap"><span className="welcome-icon member-icon"><User size={22}/></span>
      <h2>Create your member account</h2>
      <p>Join a community where you can feel seen and supported.</p>
      {error && <div className="form-message error"><ErrorIcon/>{error}</div>}
      <form onSubmit={handleSubmit} noValidate>
        <div className="form-row">
          <label className={fieldErrors.first_name ? 'field-error' : ''}>First name<input name="first_name" required placeholder="First name" autoComplete="given-name"/></label>
          <label className={fieldErrors.last_name ? 'field-error' : ''}>Last name<input name="last_name" required placeholder="Last name" autoComplete="family-name"/></label>
        </div>
        <label className={fieldErrors.email ? 'field-error' : ''}>Email address<input type="email" name="email" required placeholder="you@example.com" autoComplete="email"/></label>
        <label className={fieldErrors.password ? 'field-error' : ''}>Password<input type="password" name="password" required minLength={8} placeholder="At least 8 characters" autoComplete="new-password"/></label>
        <label className={fieldErrors.confirm_password ? 'field-error' : ''}>Confirm password<input type="password" name="confirm_password" required minLength={8} placeholder="Repeat your password" autoComplete="new-password"/></label>
        <div className="form-row">
          <label>Preferred language<select name="preferred_language" defaultValue="English">{LANGUAGES.map(l=><option key={l}>{l}</option>)}</select></label>
          <label>Location (optional)<input name="location" placeholder="City, Country"/></label>
        </div>
        <fieldset className="checkbox-group"><legend>Wellness interests <small>Optional</small></legend>
          <div className="option-grid">{WELLNESS_INTERESTS.map(item=><label key={item} className="check-label"><input type="checkbox" name="interests" value={item}/>{item}</label>)}</div>
        </fieldset>
        <fieldset className="checkbox-group"><legend>Wellness goals <small>Optional</small></legend>
          <div className="option-grid">{WELLNESS_GOALS.map(item=><label key={item} className="check-label"><input type="checkbox" name="goals" value={item}/>{item}</label>)}</div>
        </fieldset>
        <label className={`check-label ${fieldErrors.terms ? 'field-error' : ''}`}><input type="checkbox" name="terms" required/>I agree to the Community Guidelines and Privacy Policy.</label>
        <label className={`check-label ${fieldErrors.privacy ? 'field-error' : ''}`}><input type="checkbox" name="privacy" required/>I consent to the processing of my personal data as described in the Privacy Policy.</label>
        <button className="auth-submit" type="submit" disabled={loading}>{loading ? <><Loader2 size={16} className="spin"/> Creating account…</> : <><span>Create member account</span><ChevronRight size={17}/></>}</button>
      </form>
      <div className="auth-switch">Already have an account? <button onClick={() => setAuthRoute('login')}>Sign in</button></div>
    </div>
    <footer className="auth-footer">&copy; 2026 Nova Resort. Created and designed by Shir Kanevsky. All rights reserved.</footer>
  </div></div>
}

// ============================================================
// HEALER REGISTRATION
// ============================================================
export function HealerRegistration() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string,string>>({})
  const [selectedAreas, setSelectedAreas] = useState<string[]>([])
  const [selectedModalities, setSelectedModalities] = useState<string[]>([])
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([])
  const [professionalTitle, setProfessionalTitle] = useState('')

  const toggle = (arr: string[], setArr: (v: string[]) => void, val: string) => {
    setArr(arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val])
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const firstName = String(form.get('first_name') || '').trim()
    const lastName = String(form.get('last_name') || '').trim()
    const email = String(form.get('email') || '').trim().toLowerCase()
    const password = String(form.get('password') || '')
    const confirmPassword = String(form.get('confirm_password') || '')
    const title = professionalTitle === 'Other' ? String(form.get('professional_title_other') || '').trim() : professionalTitle
    const summary = String(form.get('professional_summary') || '').trim()
    const location = String(form.get('location') || '').trim()
    const website = String(form.get('website') || '').trim()
    const agreed = Boolean(form.get('terms'))
    const privacy = Boolean(form.get('privacy'))
    const online = Boolean(form.get('online_available'))
    const inPerson = Boolean(form.get('in_person_available'))

    const errors: Record<string,string> = {}
    if (!firstName) errors.first_name = 'First name is required.'
    if (!lastName) errors.last_name = 'Last name is required.'
    if (!email) errors.email = 'Email is required.'
    if (password.length < 8) errors.password = 'Password must be at least 8 characters.'
    if (password !== confirmPassword) errors.confirm_password = 'Passwords do not match.'
    if (!title) errors.professional_title = 'Professional title is required.'
    if (!summary) errors.professional_summary = 'Professional summary is required.'
    if (selectedAreas.length === 0) errors.treatment_areas = 'Select at least one treatment area.'
    if (selectedModalities.length === 0) errors.modalities = 'Select at least one modality.'
    if (selectedLanguages.length === 0) errors.languages = 'Select at least one language.'
    if (!online && !inPerson) errors.availability = 'Select at least one availability option.'
    if (!agreed) errors.terms = 'You must agree to the Community Guidelines.'
    if (!privacy) errors.privacy = 'You must consent to data processing.'

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setError('Please fix the highlighted fields.')
      return
    }
    setFieldErrors({})
    setError('')
    setLoading(true)

    try {
      const qualifications = String(form.get('qualifications') || '').split('\n').map(s => s.trim()).filter(Boolean)
      const clientPopulations = form.getAll('client_populations').map(String).filter(Boolean)
      const sessionFormats = form.getAll('session_formats').map(String).filter(Boolean)

      const registrationData = {
        first_name: firstName,
        last_name: lastName,
        professional_title: title,
        professional_summary: summary,
        biography: String(form.get('biography') || '').trim() || null,
        years_experience: form.get('years_experience') ? Number(form.get('years_experience')) : null,
        languages: selectedLanguages,
        location: location || null,
        online_available: online,
        in_person_available: inPerson,
        qualifications,
        treatment_areas: selectedAreas,
        modalities: selectedModalities,
        client_populations: clientPopulations,
        session_formats: sessionFormats,
        website: website || null,
        profile_visibility: String(form.get('profile_visibility') || 'public'),
        social_links: {}
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: EMAIL_REDIRECT_TO,
          data: {
            display_name: `${firstName} ${lastName}`,
            role: 'healer',
            registration_data: registrationData
          }
        }
      })
      if (signUpError) throw signUpError

      if (data.session) {
        sessionStorage.removeItem('nova_reg_email')
        setRoute('home')
      } else {
        sessionStorage.setItem('nova_reg_email', email)
        setAuthRoute('check-email')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Registration failed. Please try again.'
      if (msg.includes('already registered') || msg.includes('already been registered')) {
        setError('An account with this email already exists. Please sign in instead.')
      } else {
        setError(msg)
      }
    } finally { setLoading(false) }
  }

  return <div className="auth-page"><button className="language-toggle auth-language" onClick={()=>setAuthRoute('register')}>🌐 EN</button>
    <div className="auth-brand"><Logo/><div className="auth-hero-copy"><span className="auth-kicker"><Sparkles size={13}/> HEALER REGISTRATION</span><h1>Share your<br/><em>healing gift</em></h1><p>Join as a wellness professional. Host sessions, create podcasts, and connect with people who need your support.</p><div className="auth-values"><span><Briefcase/>Professional profile</span><span><ShieldCheck/>Immediate access</span><span><Leaf/>Create & host</span></div></div></div>
    <div className="auth-panel"><div className="auth-mobile-logo"><Logo/></div><div className="auth-form-wrap reg-scroll"><span className="welcome-icon healer-icon"><Briefcase size={22}/></span>
      <h2>Create your healer account</h2>
      <p>Share your expertise and connect with our community.</p>
      {error && <div className="form-message error"><ErrorIcon/>{error}</div>}
      <form onSubmit={handleSubmit} noValidate>
        <h3 className="reg-section-title">Personal Information</h3>
        <div className="form-row">
          <label className={fieldErrors.first_name ? 'field-error' : ''}>First name<input name="first_name" required placeholder="First name" autoComplete="given-name"/></label>
          <label className={fieldErrors.last_name ? 'field-error' : ''}>Last name<input name="last_name" required placeholder="Last name" autoComplete="family-name"/></label>
        </div>
        <label className={fieldErrors.email ? 'field-error' : ''}>Email address<input type="email" name="email" required placeholder="you@example.com" autoComplete="email"/></label>
        <label className={fieldErrors.password ? 'field-error' : ''}>Password<input type="password" name="password" required minLength={8} placeholder="At least 8 characters" autoComplete="new-password"/></label>
        <label className={fieldErrors.confirm_password ? 'field-error' : ''}>Confirm password<input type="password" name="confirm_password" required minLength={8} placeholder="Repeat your password" autoComplete="new-password"/></label>

        <h3 className="reg-section-title">Professional Information</h3>
        <label className={fieldErrors.professional_title ? 'field-error' : ''}>Professional title
          <select name="professional_title_sel" value={professionalTitle} onChange={e => setProfessionalTitle(e.target.value)} required>
            <option value="">Choose title</option>
            {PROFESSIONAL_TITLES.map(t=><option key={t}>{t}</option>)}
          </select>
        </label>
        {professionalTitle === 'Other' && <label className={fieldErrors.professional_title ? 'field-error' : ''}>Custom professional title<input name="professional_title_other" required placeholder="Your professional title"/></label>}
        <label className={fieldErrors.professional_summary ? 'field-error' : ''}>Professional summary<small>A brief description of your practice and approach.</small><textarea name="professional_summary" required maxLength={500} placeholder="Describe your practice, approach, and how you help people."/></label>
        <label>Biography <small>Optional — detailed professional bio.</small><textarea name="biography" maxLength={2000} placeholder="Your full professional biography."/></label>

        <h3 className="reg-section-title">Expertise & Services</h3>
        <label className={fieldErrors.treatment_areas ? 'field-error' : ''}>Treatment areas<small>Select at least one.</small>
          <div className="option-grid">{TREATMENT_AREAS.map(item=><label key={item} className={`chip-select ${selectedAreas.includes(item)?'selected':''}`}><input type="checkbox" checked={selectedAreas.includes(item)} onChange={()=>toggle(selectedAreas,setSelectedAreas,item)}/>{item}</label>)}</div>
        </label>
        <label className={fieldErrors.modalities ? 'field-error' : ''}>Modalities <small>Select at least one.</small>
          <div className="option-grid">{MODALITIES.map(item=><label key={item} className={`chip-select ${selectedModalities.includes(item)?'selected':''}`}><input type="checkbox" checked={selectedModalities.includes(item)} onChange={()=>toggle(selectedModalities,setSelectedModalities,item)}/>{item}</label>)}</div>
        </label>
        <label className={fieldErrors.languages ? 'field-error' : ''}>Languages <small>Select at least one.</small>
          <div className="option-grid">{LANGUAGES.map(item=><label key={item} className={`chip-select ${selectedLanguages.includes(item)?'selected':''}`}><input type="checkbox" checked={selectedLanguages.includes(item)} onChange={()=>toggle(selectedLanguages,setSelectedLanguages,item)}/>{item}</label>)}</div>
        </label>

        <h3 className="reg-section-title">Availability</h3>
        <div className={fieldErrors.availability ? 'field-error' : ''}>
          <div className="form-row">
            <label className="check-label"><input type="checkbox" name="online_available" defaultChecked/> Online sessions</label>
            <label className="check-label"><input type="checkbox" name="in_person_available"/> In-person sessions</label>
          </div>
        </div>

        <h3 className="reg-section-title">Additional Details <small>Optional</small></h3>
        <div className="form-row">
          <label>Years of experience<input name="years_experience" type="number" min="0" max="60" placeholder="0"/></label>
          <label>Location<input name="location" placeholder="City, Country"/></label>
        </div>
        <label>Qualifications <small>One per line.</small><textarea name="qualifications" placeholder="e.g. Licensed Clinical Psychologist&#10;Certified Mindfulness Teacher" rows={3}/></label>
        <label>Website <small>Optional.</small><input name="website" type="url" placeholder="https://yoursite.com"/></label>
        <fieldset className="checkbox-group"><legend>Client populations <small>Optional</small></legend>
          <div className="option-grid">{['Adults','Teens','Children','Couples','Families','Groups','Seniors','Veterans'].map(item=><label key={item} className="check-label"><input type="checkbox" name="client_populations" value={item}/>{item}</label>)}</div>
        </fieldset>
        <fieldset className="checkbox-group"><legend>Session formats <small>Optional</small></legend>
          <div className="option-grid">{['Individual','Group','Workshop','Retreat','Intensive','Online Course'].map(item=><label key={item} className="check-label"><input type="checkbox" name="session_formats" value={item}/>{item}</label>)}</div>
        </fieldset>

        <h3 className="reg-section-title">Terms & Consent</h3>
        <label className={`check-label ${fieldErrors.terms ? 'field-error' : ''}`}><input type="checkbox" name="terms" required/>I agree to the Community Guidelines and Privacy Policy.</label>
        <label className={`check-label ${fieldErrors.privacy ? 'field-error' : ''}`}><input type="checkbox" name="privacy" required/>I consent to the processing of my personal data as described in the Privacy Policy.</label>

        <button className="auth-submit" type="submit" disabled={loading}>{loading ? <><Loader2 size={16} className="spin"/> Creating account…</> : <><span>Create healer account</span><ChevronRight size={17}/></>}</button>
      </form>
      <div className="auth-switch">Already have an account? <button onClick={() => setAuthRoute('login')}>Sign in</button></div>
    </div>
    <footer className="auth-footer">&copy; 2026 Nova Resort. Created and designed by Shir Kanevsky. All rights reserved.</footer>
  </div></div>
}

// ============================================================
// CHECK EMAIL SCREEN
// ============================================================
export function CheckEmail({ email: emailProp }: { email?: string | null }) {
  const [resendLoading, setResendLoading] = useState(false)
  const [resendMessage, setResendMessage] = useState('')
  const [resendError, setResendError] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const email = emailProp || sessionStorage.getItem('nova_reg_email') || null

  useEffect(() => {
    if (email && email !== emailProp) sessionStorage.removeItem('nova_reg_email')
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  async function handleResend() {
    if (cooldown > 0) return
    setResendLoading(true)
    setResendMessage('')
    setResendError('')
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email || '',
        options: { emailRedirectTo: EMAIL_REDIRECT_TO }
      })
      if (error) throw error
      setResendMessage('Confirmation email sent. Check your inbox and spam folder.')
      setCooldown(60)
    } catch (e) {
      setResendError(e instanceof Error ? e.message : 'Failed to resend. Please try again.')
    } finally { setResendLoading(false) }
  }

  return <div className="auth-page"><button className="language-toggle auth-language" onClick={()=>setAuthRoute('login')}>🌐 EN</button>
    <div className="auth-brand"><Logo/><div className="auth-hero-copy"><span className="auth-kicker"><Sparkles size={13}/> EMAIL CONFIRMATION</span><h1>Check your<br/><em>inbox</em></h1><p>We've sent a confirmation link to your email. Open it to activate your account and start using Nova Resort.</p><div className="auth-values"><span><Mail/>Confirmation link</span><span><ShieldCheck/>Secure verification</span><span><Leaf/>Quick activation</span></div></div></div>
    <div className="auth-panel"><div className="auth-mobile-logo"><Logo/></div><div className="auth-form-wrap check-email-wrap"><span className="welcome-icon"><Mail size={22}/></span>
      <h2>Check your email</h2>
      {email && <p>We sent a confirmation link to <strong>{email}</strong>.</p>}
      {!email && <p>We sent a confirmation link to your email address.</p>}
      <div className="check-email-instructions">
        <div className="check-email-step"><CheckCircle2 size={16}/><span>Open the confirmation link in the email</span></div>
        <div className="check-email-step"><CheckCircle2 size={16}/><span>Your account will be activated automatically</span></div>
        <div className="check-email-step"><CheckCircle2 size={16}/><span>Then sign in to access Nova Resort</span></div>
      </div>
      {resendMessage && <div className="form-message success"><CheckCircle2 size={17}/>{resendMessage}</div>}
      {resendError && <div className="form-message error"><ErrorIcon/>{resendError}</div>}
      <div className="check-email-actions">
        <button className="auth-submit secondary" onClick={handleResend} disabled={resendLoading || cooldown > 0}>
          {resendLoading ? <><Loader2 size={14} className="spin"/> Sending…</> : cooldown > 0 ? `Resend in ${cooldown}s` : <><Mail size={14}/> Resend confirmation email</>}
        </button>
      </div>
      <p className="check-email-spam">Didn't get it? Check your spam or junk folder, or contact support if the problem persists.</p>
      <div className="auth-switch"><button onClick={() => setAuthRoute('login')}><ChevronLeft size={14}/> Back to sign in</button></div>
    </div>
    <footer className="auth-footer">&copy; 2026 Nova Resort. Created and designed by Shir Kanevsky. All rights reserved.</footer>
  </div></div>
}

// ============================================================
// AUTH CALLBACK HANDLER
// ============================================================
export function AuthCallbackHandler() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    async function handle() {
      try {
        const url = new URL(window.location.href)
        const code = url.searchParams.get('code')
        if (code) {
          window.history.replaceState({}, '', window.location.pathname + window.location.hash)
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) throw error
        }
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          if (!cancelled) { setStatus('error'); setErrorMsg('Could not establish session. Please try signing in.') }
          return
        }
        const { data: profile } = await supabase.from('profiles').select('profile_type,account_status').eq('id', session.user.id).single()
        if (!profile) {
          if (!cancelled) { setStatus('error'); setErrorMsg('Profile not found. Please contact support.') }
          return
        }
        if (profile.account_status !== 'active') {
          if (!cancelled) { setStatus('error'); setErrorMsg('Your account is still pending activation. Please check your email and confirm your account.') }
          return
        }
        if (!cancelled) {
          setStatus('success')
          if (profile.profile_type === 'healer') {
            setRoute('healer')
          } else {
            setRoute('home')
          }
        }
      } catch (e) {
        if (!cancelled) { setStatus('error'); setErrorMsg(e instanceof Error ? e.message : 'Confirmation link is invalid or has expired.') }
      }
    }
    handle()
    return () => { cancelled = true }
  }, [])

  return <div className="auth-page"><button className="language-toggle auth-language" onClick={()=>setAuthRoute('login')}>🌐 EN</button>
    <div className="auth-brand"><Logo/><div className="auth-hero-copy"><span className="auth-kicker"><Sparkles size={13}/> ACCOUNT ACTIVATION</span><h1>Activating<br/><em>your account</em></h1><p>We're setting up your Nova Resort account. This will only take a moment.</p></div></div>
    <div className="auth-panel"><div className="auth-mobile-logo"><Logo/></div><div className="auth-form-wrap check-email-wrap"><span className="welcome-icon"><ShieldCheck size={22}/></span>
      {status === 'loading' && <><h2>Activating your account…</h2><p>Please wait while we confirm your email.</p><div className="callback-loading"><Loader2 size={32} className="spin"/></div></>}
      {status === 'error' && <><h2>Activation issue</h2><div className="form-message error"><ErrorIcon/>{errorMsg}</div><div className="auth-switch"><button onClick={() => setAuthRoute('login')}><ChevronLeft size={14}/> Go to sign in</button></div></>}
      {status === 'success' && <><h2>Welcome to Nova Resort!</h2><p>Your account has been activated. Redirecting you now…</p><div className="callback-loading"><CheckCircle2 size={32} style={{color:'#587666'}}/></div></>}
    </div>
    <footer className="auth-footer">&copy; 2026 Nova Resort. Created and designed by Shir Kanevsky. All rights reserved.</footer>
  </div></div>
}
