'use client'

import { useState } from 'react'
import { ArrowRight, BookOpen, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const redirectUrl = () => process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || `${window.location.origin}/auth/callback`

type Props = { onMessage: (message: string) => void; notice: string }

export function AuthScreen({ onMessage, notice }: Props) {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', email: '', password: '', institution: '', course: '' })
  const supabase = createClient()

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(form.email, { redirectTo: redirectUrl() })
        if (error) throw error
        onMessage('If there is an account for that address, a reset link is on its way.')
        setMode('login')
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: {
            emailRedirectTo: redirectUrl(),
            data: { full_name: form.name.trim(), institution: form.institution.trim(), course: form.course.trim() },
          },
        })
        if (error) throw error
        if (!data.session) onMessage('Check your inbox to verify your email and finish creating your account.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password })
        if (error) {
          const message = error.message.toLowerCase()
          throw new Error(message.includes('confirm') ? 'Please verify your email address before signing in.' : 'Invalid email or password. Please try again.')
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const signup = mode === 'signup'
  const reset = mode === 'reset'

  return (
    <main className="auth-layout">
      <section className="auth-story" aria-label="About StAR Organizer">
        <div className="auth-story-top"><BrandMark /><span className="eyebrow">YOUR ACADEMIC SPACE</span></div>
        <div className="story-copy">
          <div className="story-symbol"><BookOpen size={23} strokeWidth={1.6} /></div>
          <p className="eyebrow">MAKE ROOM TO THINK</p>
          <h1>Your semester,<br />in good order.</h1>
          <p className="story-description">A calmer place for everything you&apos;re learning — from the first lecture to the final page of revision.</p>
          <div className="story-note"><Sparkles size={16} /><span>One thoughtful step at a time.</span></div>
        </div>
        <div className="story-foot"><span>STUDY WITH INTENTION</span><span>01 — 03</span></div>
      </section>

      <section className="auth-panel">
        <div className="auth-panel-brand"><BrandMark /></div>
        <div className="auth-form-wrap">
          <p className="eyebrow">{reset ? 'ACCOUNT RECOVERY' : signup ? 'A FRESH START' : 'WELCOME BACK'}</p>
          <h2>{reset ? 'Reset your password' : signup ? 'Create your space' : 'Pick up where you left off.'}</h2>
          <p className="auth-subtitle">{reset ? 'We’ll send a secure reset link to your email.' : signup ? 'Your academic workspace begins here.' : 'Sign in to your personal study space.'}</p>
          {notice && <p className="auth-notice" role="status">{notice}</p>}

          <form className="auth-form" onSubmit={submit}>
            {signup && <label className="form-field">Full name<input autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jordan Lee" required /></label>}
            <label className="form-field">Email address<span className="input-wrap"><Mail size={17} /><input type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@university.edu" required /></span></label>
            {signup && <div className="form-row"><label className="form-field">Institution <span className="optional">OPTIONAL</span><input autoComplete="organization" value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} placeholder="Your university" /></label><label className="form-field">Course <span className="optional">OPTIONAL</span><input value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} placeholder="Your program" /></label></div>}
            {!reset && <label className="form-field">Password<span className="input-wrap"><LockKeyhole size={17} /><input type={showPassword ? 'text' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'} minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" required /><button type="button" className="icon-button password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>}
            {error && <p className="form-error" role="alert">{error}</p>}
            {!signup && !reset && <button type="button" className="text-button forgot-button" onClick={() => { setMode('reset'); setError('') }}>Forgot password?</button>}
            <button className="submit-button" type="submit" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin" /> : null}{busy ? 'Please wait…' : reset ? 'Send reset link' : signup ? 'Create account' : 'Sign in'}{!busy && <ArrowRight size={17} />}</button>
          </form>
          <p className="auth-switch">{reset ? 'Remembered it?' : signup ? 'Already have an account?' : 'New to StAR Organizer?'} <button className="text-button" onClick={() => { setMode(reset ? 'login' : signup ? 'login' : 'signup'); setError('') }}>{reset ? 'Back to sign in' : signup ? 'Sign in' : 'Create an account'}</button></p>
        </div>
        <PoweredBy />
      </section>
    </main>
  )
}

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return <div className={`brand-lockup${compact ? ' brand-lockup-compact' : ''}`}><img className="brand-logo" src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/StAR%20Organizer%20Logo%20on%20Black-BNUGAsB6OeegwO0ox6jrWfuVKlHVcU.png" alt="StAR Organizer logo" /></div>
}

export function PoweredBy() {
  return <div className="powered-by"><span>POWERED BY</span><a href="https://nextech-consortium.vercel.app" target="_blank" rel="noopener noreferrer" aria-label="Visit NexTech Consortium"><img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/nextech%20logo-8eNojq1yqHq5mYO9DCG3YwWbBXqMqX.png" alt="NexTech logo" /></a><strong>NexTech</strong></div>
}
