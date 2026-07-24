import { useState } from 'react'
import { Copy, ExternalLink, X, Check } from 'lucide-react'

export function ShareModal({title, url, onClose}:{
  title:string; url:string; onClose:()=>void
}){
  const [copied, setCopied] = useState(false)

  async function handleShare(){
    if(navigator.share){
      try{ await navigator.share({title, url}) }catch{}
    }
  }

  async function copyLink(){
    try{
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(()=>setCopied(false), 2000)
    }catch{
      const input = document.createElement('input')
      input.value = url
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(()=>setCopied(false), 2000)
    }
  }

  return <div className="share-overlay" onClick={onClose}>
    <div className="share-modal" onClick={e=>e.stopPropagation()}>
      <h3>Share {title}</h3>
      <div className="share-url">
        <input readOnly value={url} aria-label="Share link"/>
        <button className="share-btn primary" onClick={copyLink}>{copied ? <><Check size={14}/> Copied</> : <><Copy size={14}/> Copy</>}</button>
      </div>
      <div className="share-actions">
        {'share' in navigator && <button className="share-btn" onClick={handleShare}><ExternalLink size={14}/> Share…</button>}
        <button className="share-btn" onClick={onClose}>Close</button>
      </div>
    </div>
  </div>
}

export function ReportModal({title, onReport, onClose}:{
  title:string; onReport:(reason:string, details?:string)=>Promise<void>; onClose:()=>void
}){
  const [selectedReason, setSelectedReason] = useState('')
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const reasons = [
    'Inappropriate content',
    'Harassment or bullying',
    'Spam or misleading',
    'Violence or harm',
    'Privacy violation',
    'Other concern',
  ]

  async function handleSubmit(){
    if(!selectedReason || submitting) return
    setSubmitting(true)
    try{ await onReport(selectedReason, details || undefined); setSubmitted(true) }catch{ }
    setSubmitting(false)
  }

  if(submitted) return <div className="report-overlay" onClick={onClose}>
    <div className="report-modal" onClick={e=>e.stopPropagation()}>
      <h3>Report submitted</h3>
      <p>Thank you for helping keep our community safe. We will review your report.</p>
      <div className="report-actions"><button className="cancel" onClick={onClose}>Close</button></div>
    </div>
  </div>

  return <div className="report-overlay" onClick={onClose}>
    <div className="report-modal" onClick={e=>e.stopPropagation()}>
      <h3>Report {title}</h3>
      <p>Why are you reporting this content?</p>
      <div className="report-reasons">
        {reasons.map(r => <button key={r} className={`report-reason-btn ${selectedReason===r?'selected':''}`} onClick={()=>setSelectedReason(r)}>
          {r}
        </button>)}
      </div>
      <textarea className="report-details" placeholder="Additional details (optional)…" value={details} onChange={e=>setDetails(e.target.value)} aria-label="Additional details"/>
      <div className="report-actions">
        <button className="cancel" onClick={onClose}>Cancel</button>
        <button className="submit" disabled={!selectedReason || submitting} onClick={handleSubmit}>
          {submitting ? 'Submitting…' : 'Submit Report'}
        </button>
      </div>
    </div>
  </div>
}
