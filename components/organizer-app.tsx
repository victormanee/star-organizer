'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import useSWR, { mutate } from 'swr'
import {
  AlarmClock, ArrowDownRight, ArrowUpRight, Bell, BookOpen, CalendarDays, Check, ChevronDown,
  ChevronLeft, ChevronRight, Clock3, Command, FileText, Flame, FolderOpen, GraduationCap, LayoutDashboard,
  LibraryBig, LoaderCircle, LogOut, Menu, MoreHorizontal, Plus, Search, Settings2, Sparkles,
  Upload, X, StickyNote, Pin, Maximize2, Minus, PlusCircle, type LucideIcon,
} from 'lucide-react'
import { AuthScreen, BrandMark, PoweredBy } from '@/components/auth-screen'
import { createClient } from '@/lib/supabase/client'

type View = 'Overview' | 'My library' | 'My study notes' | 'Timetable' | 'Reminders' | 'Study studio'
type StickyNoteRecord = { id: string; user_id: string; document_id: string | null; page_number: number; position_x: number; position_y: number; width: number; height: number; selected_text: string | null; title: string; content: string; colour: string; is_pinned: boolean; is_completed: boolean; created_at: string; updated_at: string; documents?: { file_name: string; unit_id: string | null; units?: { name: string } | null } | null }
type Unit = { id: string; name: string; unit_code: string; lecturer: string | null; description: string | null; created_at: string }
type Reminder = { id: string; title: string; description: string | null; reminder_datetime: string; is_completed: boolean; unit_id: string | null }
type TimetableEvent = { id: string; title: string; venue: string | null; start_time: string; end_time: string; day_of_week: number; unit_id: string | null }
type StudySession = { id: string; duration: number; started_at: string }
type Doc = { id: string; file_name: string; file_type: string | null; file_size: number; uploaded_at: string; unit_id: string | null; storage_path: string }
type User = { id: string; email?: string; user_metadata?: { full_name?: string } }

const supabase = createClient()
const encouragements = [
  ['You’ve got this!', 'One page at a time.'],
  ['Small steps count.', 'You are making progress.'],
  ['Take a little break.', 'Your mind will thank you.'],
]

const mainNav: { label: View; icon: LucideIcon }[] = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'My library', icon: LibraryBig },
  { label: 'My study notes', icon: StickyNote },
  { label: 'Timetable', icon: CalendarDays },
  { label: 'Reminders', icon: AlarmClock },
  { label: 'Study studio', icon: BookOpen },
]

async function getUser() {
  const { data } = await supabase.auth.getUser()
  return data.user as User | null
}

async function getDashboard(userId: string) {
  const [profile, units, docs, sessions, reminders, timetable] = await Promise.all([
    supabase.from('profiles').select('full_name,institution,course').eq('id', userId).maybeSingle(),
    supabase.from('units').select('id,name,unit_code,lecturer,description,created_at').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('documents').select('id,file_name,file_type,file_size,uploaded_at,unit_id,storage_path').eq('user_id', userId).order('uploaded_at', { ascending: false }),
    supabase.from('study_sessions').select('id,duration,started_at').eq('user_id', userId).order('started_at'),
    supabase.from('reminders').select('id,title,description,reminder_datetime,is_completed,unit_id').eq('user_id', userId).eq('is_completed', false).gte('reminder_datetime', new Date().toISOString()).order('reminder_datetime').limit(6),
    supabase.from('timetable_events').select('id,title,venue,start_time,end_time,day_of_week,unit_id').eq('user_id', userId).eq('day_of_week', new Date().getDay()).order('start_time'),
  ])
  for (const result of [profile, units, docs, sessions, reminders, timetable]) if (result.error) throw result.error
  return {
    profile: profile.data,
    units: (units.data || []) as Unit[],
    docs: (docs.data || []) as Doc[],
    sessions: (sessions.data || []) as StudySession[],
    reminders: (reminders.data || []) as Reminder[],
    timetable: (timetable.data || []) as TimetableEvent[],
  }
}

function startOfWeek() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  return date
}

function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en', options || { month: 'short', day: 'numeric' }).format(new Date(date))
}
function formatTime(time: string) {
  const [hours = '0', minutes = '00'] = time.split(':')
  return new Date(2000, 0, 1, Number(hours), Number(minutes)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
function greeting() {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

async function getStickyNotes(userId: string) {
  const { data, error } = await supabase.from('sticky_notes').select('id,user_id,document_id,page_number,position_x,position_y,width,height,selected_text,title,content,colour,is_pinned,is_completed,created_at,updated_at,documents(file_name,unit_id,units(name))').eq('user_id', userId).order('created_at', { ascending: false })
  if (error) throw error
  return (data || []) as unknown as StickyNoteRecord[]
}

export function OrganizerApp() {
  const [view, setView] = useState<View>('Overview')
  const [openDocument, setOpenDocument] = useState<{ doc: Doc; url: string } | null>(null)
  const contentRef = useRef<HTMLElement>(null)
  const [modal, setModal] = useState<'unit' | 'reminder' | 'upload' | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [chartRange, setChartRange] = useState<'Day' | 'Week' | 'Month'>('Week')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [encouragement, setEncouragement] = useState(0)
  const [toast, setToast] = useState('')
  const { data: user, isLoading: userLoading, mutate: refreshUser } = useSWR('star-user', getUser)
  const { data, error, isLoading, mutate: refreshData } = useSWR(user ? ['star-dashboard', user.id] : null, ([, id]) => getDashboard(id as string))
  const { data: notes = [], mutate: refreshNotes } = useSWR(user ? ['star-notes', user.id] : null, ([, id]) => getStickyNotes(id as string))

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void refreshUser()
      void refreshData()
    })
    return () => subscription.unsubscribe()
  }, [refreshUser, refreshData])

  useEffect(() => {
    if (!user) return
    const interval = window.setInterval(() => setEncouragement((current) => (current + 1) % encouragements.length), 5200)
    return () => window.clearInterval(interval)
  }, [user])

  useEffect(() => {
    if (!contentRef.current || isLoading) return
    const motion = gsap.matchMedia()
    motion.add('(prefers-reduced-motion: no-preference)', () => {
      const context = gsap.context(() => {
        gsap.fromTo('.welcome-row > *, .metric-card, .dashboard-grid > *, .section-intro, .library-panel, .sticky-note-card, .insight-rail > *, .milestone-card', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.55, stagger: 0.065, ease: 'power2.out', clearProps: 'all' })
        gsap.fromTo('.nav-link.active', { x: -5, opacity: 0.75 }, { x: 0, opacity: 1, duration: 0.3, ease: 'power2.out', clearProps: 'all' })
        gsap.to('.mascot-orbit', { y: -7, rotation: 2, duration: 2.1, yoyo: true, repeat: -1, ease: 'sine.inOut' })
      }, contentRef)
      return () => context.revert()
    })
    return () => motion.revert()
  }, [view, isLoading])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(''), 4200)
    return () => window.clearTimeout(id)
  }, [toast])

  useEffect(() => {
    const motion = gsap.matchMedia()
    motion.add('(prefers-reduced-motion: no-preference)', () => {
      const context = gsap.context(() => {
        if (modal) gsap.fromTo('.action-modal', { opacity: 0, y: 14, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.24, ease: 'power2.out' })
        if (toast) gsap.fromTo('.toast-message', { opacity: 0, x: 18 }, { opacity: 1, x: 0, duration: 0.28, ease: 'power2.out' })
      })
      return () => context.revert()
    })
    return () => motion.revert()
  }, [modal, toast])

  const days = weekDays()
  const studyByDay = useMemo(() => days.map((day) => ({ ...day, minutes: data?.sessions.filter((session) => new Date(session.started_at).toDateString() === day.date.toDateString()).reduce((total, session) => total + session.duration, 0) || 0 })), [data?.sessions])
  const chartData = useMemo(() => {
    const sessions = data?.sessions || []
    if (chartRange === 'Day') return Array.from({ length: 6 }, (_, index) => {
      const hour = index * 4
      const minutes = sessions.filter((session) => { const date = new Date(session.started_at); return date.toDateString() === new Date().toDateString() && Math.floor(date.getHours() / 4) === index }).reduce((total, session) => total + session.duration, 0)
      return { label: `${String(hour).padStart(2, '0')}`, minutes }
    })
    if (chartRange === 'Month') return Array.from({ length: 4 }, (_, index) => {
      const end = Date.now() - index * 7 * 86400000
      const start = end - 7 * 86400000
      const minutes = sessions.filter((session) => new Date(session.started_at).getTime() >= start && new Date(session.started_at).getTime() < end).reduce((total, session) => total + session.duration, 0)
      return { label: `W${4 - index}`, minutes }
    }).reverse()
    return studyByDay.map(({ label, minutes }) => ({ label, minutes }))
  }, [chartRange, data?.sessions, studyByDay])

  if (userLoading) return <div className="loading-screen"><span className="loading-mark">S<span>.</span></span><LoaderCircle className="spin" size={20} /></div>
  if (!user) return <AuthScreen onMessage={setToast} notice={toast} />
  const currentUser = user

  async function signOut() {
    await supabase.auth.signOut()
    await refreshUser(null, { revalidate: true })
  }

  const displayName = data?.profile?.full_name || currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'Student'
  const firstName = displayName.trim().split(/\s+/)[0]
  const weekMinutes = data?.sessions.filter((session) => new Date(session.started_at) >= startOfWeek()).reduce((total, session) => total + session.duration, 0) || 0
  const streak = (() => {
    const studied = new Set((data?.sessions || []).map((session) => new Date(session.started_at).toDateString()))
    const cursor = new Date(); cursor.setHours(0, 0, 0, 0)
    if (!studied.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1)
    let count = 0
    while (studied.has(cursor.toDateString())) { count += 1; cursor.setDate(cursor.getDate() - 1) }
    return count
  })()
  const maxStudy = Math.max(...chartData.map(({ minutes }) => minutes), 60)
  const searchResults = searchQuery.trim() ? [...(data?.units || []).filter((item) => `${item.name} ${item.unit_code}`.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 3).map((item) => ({ label: item.name, detail: item.unit_code, kind: 'unit' as const })), ...(data?.docs || []).filter((item) => item.file_name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 3).map((item) => ({ label: item.file_name, detail: 'Study material', kind: 'document' as const, doc: item }))] : []

  async function addUnit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const { error } = await supabase.from('units').insert({ user_id: currentUser.id, name: String(form.get('name')).trim(), unit_code: String(form.get('code')).trim().toUpperCase(), lecturer: String(form.get('lecturer') || '').trim() || null, description: String(form.get('description') || '').trim() || null })
    if (error) { setToast('Could not add that unit. Please try again.'); return }
    setToast('Unit added to your library.')
    setModal(null)
    await refreshData()
  }

  async function addReminder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const dateTime = new Date(String(form.get('date')))
    if (Number.isNaN(dateTime.getTime()) || dateTime <= new Date()) { setToast('Choose a reminder time in the future.'); return }
    const unitId = String(form.get('unit_id') || '')
    const { error } = await supabase.from('reminders').insert({ user_id: currentUser.id, title: String(form.get('title')).trim(), description: String(form.get('description') || '').trim() || null, reminder_datetime: dateTime.toISOString(), unit_id: unitId || null })
    if (error) { setToast('Could not save your reminder. Please try again.'); return }
    setToast('Reminder saved.')
    setModal(null)
    await refreshData()
  }

  async function uploadFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || [])
    const allowed = new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'jpg', 'jpeg', 'png', 'webp', 'mp3', 'mp4', 'zip'])
    const unitId = document.querySelector<HTMLSelectElement>('#upload-unit')?.value || ''
    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase() || ''
      if (!allowed.has(ext) || file.size > 50 * 1024 * 1024) { setToast(`${file.name} is unsupported or larger than 50 MB.`); continue }
      const path = `${currentUser.id}/${crypto.randomUUID()}/${file.name.replace(/[^\w.-]/g, '_')}`
      const upload = await supabase.storage.from('academic-documents').upload(path, file, { upsert: false, contentType: file.type || undefined })
      if (upload.error) { setToast(`Could not upload ${file.name}.`); continue }
      const record = await supabase.from('documents').insert({ user_id: currentUser.id, unit_id: unitId || null, file_name: file.name, file_type: file.type || ext, file_size: file.size, storage_path: path })
      if (record.error) {
        await supabase.storage.from('academic-documents').remove([path])
        setToast(`Could not save ${file.name}.`)
      }
    }
    await refreshData()
    if (files.length) { setToast('Upload complete.'); setModal(null) }
    event.target.value = ''
  }

  async function toggleReminder(reminder: Reminder) {
    const { error } = await supabase.from('reminders').update({ is_completed: true }).eq('id', reminder.id).eq('user_id', currentUser.id)
    if (!error) { setToast('Reminder marked complete.'); await refreshData() }
  }

  async function openDocReader(doc: Doc, page = 1) {
    const { data: signed, error } = await supabase.storage.from('academic-documents').createSignedUrl(doc.storage_path, 60)
    if (error || !signed?.signedUrl) { setToast('This document could not be opened right now.'); return }
    setOpenDocument({ doc, url: signed.signedUrl + (doc.file_type?.includes('pdf') ? `#page=${page}&toolbar=1` : '') })
  }

  async function addStickyNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!openDocument) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const { error } = await supabase.from('sticky_notes').insert({ user_id: currentUser.id, document_id: openDocument.doc.id, page_number: Math.max(1, Number(form.get('page')) || 1), position_x: 0.72, position_y: 0.12, width: 0.22, height: 0.16, title: String(form.get('title')).trim(), content: String(form.get('content')).trim(), selected_text: String(form.get('selected_text') || '').trim() || null, colour: String(form.get('colour')), note_type: 'note' })
    if (error) { setToast('Your note could not be saved.'); return }
    setToast('Sticky note added to this page.')
    await refreshNotes()
    formElement.reset()
  }

  async function updateStickyNote(note: StickyNoteRecord, patch: Partial<StickyNoteRecord>) {
    const { error } = await supabase.from('sticky_notes').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', note.id).eq('user_id', currentUser.id)
    if (error) { setToast('Your note could not be updated.'); return }
    await refreshNotes()
  }

  async function finishStudy(minutes: number) {
    if (minutes < 1) { setToast('Start a study session first.'); return }
    const { error } = await supabase.from('study_sessions').insert({ user_id: currentUser.id, duration: minutes, session_type: 'focus', started_at: new Date(Date.now() - minutes * 60_000).toISOString(), completed_at: new Date().toISOString() })
    if (error) { setToast('Could not save your study session.'); return }
    setToast(`${minutes} focused minute${minutes === 1 ? '' : 's'} added to your week.`)
    await refreshData()
  }

  return (
    <div className="app-frame">
      <aside className={`sidebar${menuOpen ? ' sidebar-open' : ''}`}>
        <div className="sidebar-top"><BrandMark /><button className="icon-button sidebar-close" aria-label="Close navigation" onClick={() => setMenuOpen(false)}><X size={18} /></button></div>
        <div className="sidebar-section-label">MAIN</div>
        <nav className="side-nav" aria-label="Main navigation">
          {mainNav.slice(0, 3).map(({ label, icon: Icon }) => <button key={label} className={`nav-link${view === label ? ' active' : ''}`} onClick={() => { setView(label); setMenuOpen(false) }}><Icon size={18} strokeWidth={1.8} /><span>{label === 'My library' ? 'Academic library' : label === 'My study notes' ? 'My sticky notes' : 'Dashboard'}</span></button>)}
        </nav>
        <div className="sidebar-section-label sidebar-group-label">STUDY SPACE</div>
        <nav className="side-nav" aria-label="Study space navigation">
          {mainNav.slice(3).map(({ label, icon: Icon }) => <button key={label} className={`nav-link${view === label ? ' active' : ''}`} onClick={() => { setView(label); setMenuOpen(false) }}><Icon size={18} strokeWidth={1.8} /><span>{label}</span>{label === 'Reminders' && !!data?.reminders.length && <span className="nav-count">{data.reminders.length}</span>}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-mascot"><StARMascot /><div className="mascot-bubble" key={encouragements[encouragement][0]}>{encouragements[encouragement][0]}<span>{encouragements[encouragement][1]}</span></div></div>
          <div className="sidebar-tip"><div className="tip-icon"><Sparkles size={17} /></div><strong>A little progress<br />goes a long way.</strong><span>Your study space is ready when you are.</span></div>
          <button className="profile-row" onClick={signOut} aria-label="Sign out"><span className="avatar">{firstName.slice(0, 1).toUpperCase()}</span><span className="profile-copy"><strong>{displayName}</strong><span>{currentUser.email}</span></span><LogOut size={16} className="profile-logout" /></button>
          <PoweredBy />
        </div>
      </aside>

      <div className={`workspace${view === 'Overview' ? ' workspace-with-rail' : ''}`}>
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Menu size={20} /></button>
          <label className="top-search"><Search size={15} /><input aria-label="Search your study space" placeholder="Search units and materials" value={searchQuery} onFocus={() => setSearchOpen(true)} onBlur={() => window.setTimeout(() => setSearchOpen(false), 150)} onChange={(event) => setSearchQuery(event.target.value)} />{searchOpen && !!searchResults.length && <div className="search-results">{searchResults.map((result, index) => <button key={`${result.kind}-${index}`} onClick={() => { if (result.kind === 'document' && result.doc) void openDocReader(result.doc); else setView('My library'); setSearchQuery('') }}><span className="search-result-icon">{result.kind === 'document' ? <FileText size={15} /> : <BookOpen size={15} />}</span><span><strong>{result.label}</strong><small>{result.detail}</small></span></button>)}</div>}</label>
          <div className="topbar-actions"><span className="date-chip"><CalendarDays size={15} />{formatDate(new Date(), { weekday: 'short', month: 'short', day: 'numeric' })}</span><button className="icon-button notification-button" aria-label="Go to reminders" onClick={() => setView('Reminders')}><Bell size={18} />{!!data?.reminders.length && <span className="notification-dot" />}</button><button className="top-profile" onClick={signOut} aria-label={`Sign out ${displayName}`}><span className="avatar top-avatar">{firstName.slice(0, 1).toUpperCase()}</span><ChevronDown size={14} /></button></div>
        </header>

        <main className="page-content" ref={contentRef}>
          {error && <div className="inline-error" role="alert">Your workspace could not be refreshed. Please try again.</div>}
          {isLoading && <div className="data-loading"><LoaderCircle size={18} className="spin" /> Loading your workspace…</div>}
          {!isLoading && data && view === 'Overview' && <>
            <section className="welcome-row"><div className="welcome-copy"><p className="eyebrow">YOUR STUDY SPACE IS READY</p><h1>Welcome back, {firstName}!</h1><p className="welcome-subtitle">Ready to learn something new today?</p><button className="primary-button" onClick={() => setView('Study studio')}><BookOpen size={16} />Start studying</button></div><div className="welcome-actions"><div className="mascot-orbit" aria-hidden="true"><StARMascot /></div></div></section>
            <section className="academic-overview"><div className="dashboard-section-heading"><div><p className="eyebrow">A QUICK LOOK AT YOUR SPACE</p><h2>Your Academic World</h2></div><button className="text-button" onClick={() => setView('My library')}>Open library <ArrowUpRight size={14} /></button></div><div className="metric-grid" aria-label="Academic overview">
              <Metric label="REGISTERED UNITS" value={String(data.units.length).padStart(2, '0')} note="in your academic library" icon={GraduationCap} tone="blue" />
              <Metric label="UPLOADED FILES" value={String(data.docs.length).padStart(2, '0')} note="study materials" icon={FolderOpen} tone="sand" />
              <Metric label="STUDY HOURS" value={`${Math.floor(weekMinutes / 60)}h ${weekMinutes % 60}m`} note="focused this week" icon={Clock3} tone="sage" />
              <Metric label="STUDY STREAK" value={`${streak} ${streak === 1 ? 'day' : 'days'}`} note="keep the rhythm going" icon={Flame} tone="rose" />
            </div></section>
            <section className="dashboard-grid">
              <div className="panel activity-panel"><div className="panel-heading"><div><p className="eyebrow">YOUR ROUTINE</p><h2>Study activity</h2></div><span className="quiet-pill">THIS WEEK</span></div><div className="activity-total"><strong>{weekMinutes < 60 ? `${weekMinutes}m` : `${Math.floor(weekMinutes / 60)}h ${weekMinutes % 60 ? `${weekMinutes % 60}m` : ''}`}</strong><span>focused this week</span></div><div className="activity-chart" role="img" aria-label={`Study time this week. ${studyByDay.map(({ label, minutes }) => `${label}: ${minutes} minutes`).join(', ')}`}>
                {chartData.map(({ label, minutes }) => <div className="chart-column" key={label}><span className="chart-tooltip">{minutes}m</span><div className="chart-track"><div className="chart-bar" style={{ height: `${minutes ? Math.max(10, minutes / maxStudy * 100) : 3}%` }} /></div><span className="chart-day">{label}</span></div>)}
              </div><button className="panel-link" onClick={() => setView('Study studio')}>Open study studio <ArrowUpRight size={15} /></button></div>
              <div className="panel timetable-panel"><div className="panel-heading"><div><p className="eyebrow">ON THE AGENDA</p><h2>Today&apos;s timetable</h2></div><button className="icon-button" aria-label="Open timetable" onClick={() => setView('Timetable')}><ArrowUpRight size={16} /></button></div>
                {data.timetable.length ? <div className="agenda-list">{data.timetable.map((item, index) => <div className={`agenda-item${index === 0 ? ' agenda-next' : ''}`} key={item.id}><div className="agenda-time"><strong>{formatTime(item.start_time)}</strong><span>{formatTime(item.end_time)}</span></div><span className="agenda-rule" /><div className="agenda-details"><strong>{item.title}</strong><span>{item.venue || 'Venue not set'}</span></div>{index === 0 && <span className="next-tag">NEXT</span>}</div>)}</div> : <EmptyState icon={CalendarDays} title="A little room in your day" note="Add classes to see your timetable here." action="View timetable" onClick={() => setView('Timetable')} />}
              </div>
              <div className="panel units-panel"><div className="panel-heading"><div><p className="eyebrow">PICK UP WHERE YOU LEFT OFF</p><h2>Your units</h2></div><button className="quiet-action" onClick={() => setModal('unit')}><Plus size={15} />Add unit</button></div>
                {data.units.length ? <div className="unit-list">{data.units.slice(0, 4).map((unit, index) => <button className="unit-row" key={unit.id} onClick={() => setView('My library')}><span className={`unit-color unit-color-${index % 4}`}><BookOpen size={17} /></span><span className="unit-info"><strong>{unit.name}</strong><span>{unit.unit_code}{unit.lecturer ? ` · ${unit.lecturer}` : ''}</span></span><ChevronRight size={16} /></button>)}</div> : <EmptyState icon={GraduationCap} title="Start with one unit" note="Set up your first course to build your library." action="Add a unit" onClick={() => setModal('unit')} />}
                {data.units.length > 4 && <button className="panel-link" onClick={() => setView('My library')}>See all {data.units.length} units <ArrowUpRight size={15} /></button>}
              </div>
              <div className="panel reminder-panel"><div className="panel-heading"><div><p className="eyebrow">DON&apos;T LOSE THE THREAD</p><h2>Coming up</h2></div><button className="quiet-action" onClick={() => setModal('reminder')}><Plus size={15} />New reminder</button></div>
                {data.reminders.length ? <div className="reminder-list">{data.reminders.slice(0, 4).map((item) => <div className="reminder-row" key={item.id}><button className="check-button" aria-label={`Mark ${item.title} complete`} onClick={() => void toggleReminder(item)}><Check size={14} /></button><div className="reminder-info"><strong>{item.title}</strong><span>{formatDate(item.reminder_datetime, { month: 'short', day: 'numeric' })} · {formatTime(new Date(item.reminder_datetime).toTimeString())}</span></div></div>)}</div> : <EmptyState icon={AlarmClock} title="Nothing pressing" note="Add a reminder and we’ll keep it close." action="Create reminder" onClick={() => setModal('reminder')} />}
              </div>
            </section>
          </>}
          {!isLoading && data && view === 'My library' && <LibraryView data={data} openUpload={() => setModal('upload')} openUnit={() => setModal('unit')} openDocument={(doc) => void openDocReader(doc)} />}
          {!isLoading && data && view === 'My study notes' && <StudyNotesView notes={notes} onOpen={(note) => { const doc = data.docs.find((item) => item.id === note.document_id); if (doc) void openDocReader(doc, note.page_number); else setToast('Open the library to locate this document.') }} onUpdate={updateStickyNote} />}
          {!isLoading && data && view === 'Timetable' && <TimetableView data={data} />}
          {!isLoading && data && view === 'Reminders' && <RemindersView reminders={data.reminders} onAdd={() => setModal('reminder')} onComplete={toggleReminder} />}
          {!isLoading && data && view === 'Study studio' && <StudyStudio units={data.units} sessions={data.sessions} onFinish={finishStudy} />}
          <footer className="page-footer"><span className="footer-creator">Created by <a href="https://victormanee.vercel.app" target="_blank" rel="noopener noreferrer">victor manee</a></span><span className="footer-brand">StAR Organizer <i>·</i> Powered by NexTech.</span></footer>
        </main>
      </div>
      {view === 'Overview' && data && <aside className="insight-rail" aria-label="Academic overview and study plan">
        <button className="rail-profile" onClick={signOut}><span className="avatar">{firstName.slice(0, 1).toUpperCase()}</span><span><strong>{displayName}</strong><small>{data.profile?.course || 'Student'}</small></span><ChevronDown size={15} /></button>
        <section className="rail-section"><div className="rail-heading"><h2>Academic milestones</h2><Sparkles size={15} /></div><div className="milestone-grid"><Milestone value={String(data.units.length)} label="Units" tone="lavender" /><Milestone value={String(data.docs.length)} label="Materials" tone="pink" /><Milestone value={String((data?.sessions || []).filter((session) => new Date(session.started_at) >= startOfWeek()).length)} label="Sessions" tone="green" /><Milestone value={String(streak)} label="Day streak" tone="yellow" /></div></section>
        <section className="companion-card"><div className="companion-heading"><div><p className="eyebrow">YOUR STUDY BUDDY</p><h2>StAR says…</h2></div><span className="companion-sparkle"><Sparkles size={15} /></span></div><div className="companion-body"><StARMascot /><p>{data.units.length ? `You have ${data.units.length} ${data.units.length === 1 ? 'unit' : 'units'} ready for a little attention. Let’s make today count!` : 'Add your first unit and we’ll build your study space together!'}</p></div></section>
        <section className="rail-section today-plan"><div className="rail-heading"><h2>Today&apos;s study plan</h2><button onClick={() => setView('Timetable')}>View all</button></div>{data.timetable.length || data.reminders.length ? <div className="rail-plan-list">{data.timetable.slice(0, 2).map((item) => <div className="rail-plan-item" key={item.id}><span className="rail-plan-icon plan-purple"><CalendarDays size={15} /></span><span><strong>{item.title}</strong><small>{formatTime(item.start_time)} · Class</small></span></div>)}{data.reminders.slice(0, Math.max(0, 3 - data.timetable.length)).map((item) => <div className="rail-plan-item" key={item.id}><span className="rail-plan-icon plan-yellow"><AlarmClock size={15} /></span><span><strong>{item.title}</strong><small>{formatTime(new Date(item.reminder_datetime).toTimeString())} · Reminder</small></span></div>)}</div> : <p className="rail-empty">A clear day. Make room for a study session when you&apos;re ready.</p>}</section>
        <section className="rail-section consistency-section"><div className="rail-heading"><h2>Study consistency</h2></div><div className="range-switch" role="group" aria-label="Study chart range">{(['Day', 'Week', 'Month'] as const).map((range) => <button key={range} className={chartRange === range ? 'selected' : ''} onClick={() => setChartRange(range)}>{range}</button>)}</div><div className="consistency-chart" role="img" aria-label={`${chartRange} study minutes: ${chartData.map(({ label, minutes }) => `${label} ${minutes} minutes`).join(', ')}`}>{chartData.map(({ label, minutes }) => <div className="consistency-column" key={label}><div className="consistency-track"><span style={{ height: `${Math.max(4, minutes / maxStudy * 100)}%` }} /></div><small>{label}</small></div>)}</div><p className="chart-caption">Focused study time · minutes</p></section>
      </aside>}
      {openDocument && <DocumentViewer document={openDocument.doc} url={openDocument.url} notes={notes.filter((note) => note.document_id === openDocument.doc.id)} onClose={() => setOpenDocument(null)} onCreateNote={addStickyNote} onUpdateNote={updateStickyNote} />}
      {modal && <ActionModal type={modal} units={data?.units || []} onClose={() => setModal(null)} onAddUnit={addUnit} onAddReminder={addReminder} onUpload={uploadFiles} />}
      {toast && <div className="toast-message" role="status"><Check size={16} />{toast}<button aria-label="Dismiss" onClick={() => setToast('')}><X size={15} /></button></div>}
    </div>
  )
}

function weekDays() {
  const monday = startOfWeek()
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    return { date, label: new Intl.DateTimeFormat('en', { weekday: 'short' }).format(date).slice(0, 1) }
  })
}

function Metric({ label, value, note, icon: Icon, tone }: { label: string; value: string; note: string; icon: LucideIcon; tone: string }) {
  return <article className="metric-card"><div className="metric-top"><span className="metric-label">{label}</span><span className={`metric-icon metric-icon-${tone}`}><Icon size={17} strokeWidth={1.8} /></span></div><strong className="metric-value">{value}</strong><span className="metric-note">{note}</span></article>
}

function Milestone({ value, label, tone }: { value: string; label: string; tone: string }) {
  return <article className={`milestone-card milestone-${tone}`}><strong>{value}</strong><span>{label}</span></article>
}

function StARMascot() {
  return <svg viewBox="0 0 128 128" role="img" aria-label="A cheerful StAR study companion">
    <path d="m62 9 13 22 25-7-7 25 22 14-22 13 7 25-25-7-13 22-13-22-25 7 7-25L9 63l22-14-7-25 25 7z" fill="#ffd977" stroke="#37236f" strokeWidth="4" strokeLinejoin="round" />
    <path d="M42 55c0-12 9-21 22-21s22 9 22 21v26c0 13-9 20-22 20S42 94 42 81z" fill="#fffaf0" stroke="#37236f" strokeWidth="4" />
    <ellipse cx="55" cy="64" rx="3.5" ry="5" fill="#282044" /><ellipse cx="73" cy="64" rx="3.5" ry="5" fill="#282044" />
    <path d="M56 77q8 9 16 0" fill="none" stroke="#282044" strokeWidth="3" strokeLinecap="round" />
    <circle cx="47" cy="73" r="4" fill="#f3a9b9" /><circle cx="81" cy="73" r="4" fill="#f3a9b9" />
    <path d="M52 108 45 119m31-11 7 11" stroke="#37236f" strokeWidth="4" strokeLinecap="round" />
    <path d="M22 39l4-4m76 6 4-4" stroke="#7c64c6" strokeWidth="3" strokeLinecap="round" />
  </svg>
}

function EmptyState({ icon: Icon, title, note, action, onClick }: { icon: LucideIcon; title: string; note: string; action: string; onClick: () => void }) {
  return <div className="empty-state"><span className="empty-mascot" aria-hidden="true"><StARMascot /></span><span className="empty-icon"><Icon size={18} /></span><div><strong>{title}</strong><p>{note}</p></div><button onClick={onClick}>{action}<ArrowUpRight size={14} /></button></div>
}

function LibraryView({ data, openUpload, openUnit, openDocument }: { data: Awaited<ReturnType<typeof getDashboard>>; openUpload: () => void; openUnit: () => void; openDocument: (doc: Doc) => void }) {
  const [query, setQuery] = useState('')
  const [selectedUnit, setSelectedUnit] = useState('')
  const filtered = data.docs.filter((doc) => doc.file_name.toLowerCase().includes(query.toLowerCase()) && (!selectedUnit || doc.unit_id === selectedUnit))
  return <><section className="section-intro"><p className="eyebrow">YOUR DIGITAL SHELF</p><div className="section-title-row"><div><h1>My library</h1><p>All your learning materials, kept in one place.</p></div><div className="button-row"><button className="secondary-button" onClick={openUnit}><Plus size={16} />Add unit</button><button className="primary-button" onClick={openUpload}><Upload size={16} />Upload files</button></div></div></section><div className="library-stats"><span><strong>{data.units.length}</strong> units</span><span><strong>{data.docs.length}</strong> recent files</span><span><strong>{data.units.length}</strong> study spaces</span></div>{data.units.length > 0 && <section className="unit-shelf" aria-label="Your units"><div className="shelf-heading"><h2>Your colourful shelf</h2><button onClick={() => setSelectedUnit('')}>Show everything</button></div><div className="unit-books-grid">{data.units.map((unit, index) => <button key={unit.id} className={`unit-book unit-book-${index % 5}${selectedUnit === unit.id ? ' unit-book-selected' : ''}`} onClick={() => setSelectedUnit(selectedUnit === unit.id ? '' : unit.id)}><span className="unit-book-icon"><BookOpen size={22} /></span><span className="unit-book-code">{unit.unit_code}</span><strong>{unit.name}</strong><span className="unit-book-count">{data.docs.filter((doc) => doc.unit_id === unit.id).length} materials</span></button>)}</div></section>}<div className="panel library-panel"><div className="library-toolbar"><div><p className="eyebrow">RECENT MATERIALS</p><h2>Recently added</h2></div><label className="search-field"><Search size={16} /><input aria-label="Search materials" placeholder="Search files" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>{filtered.length ? <div className="file-list">{filtered.map((doc) => <div className="file-row" key={doc.id}><span className="file-type"><FileText size={18} /></span><span className="file-info"><strong>{doc.file_name}</strong><span>{doc.file_type?.split('/').pop()?.toUpperCase() || 'FILE'} · {formatBytes(doc.file_size)}</span></span><time>{formatDate(doc.uploaded_at)}</time><button type="button" className="icon-button" aria-label={`Open ${doc.file_name}`} onClick={() => openDocument(doc)}><ArrowUpRight size={16} /></button></div>)}</div> : <EmptyState icon={FolderOpen} title={query ? 'No matching files' : 'Your shelf is ready'} note={query ? 'Try another search term.' : 'Upload lecture notes, slides, or past papers to get started.'} action={query ? 'Clear search' : 'Upload material'} onClick={() => query ? setQuery('') : openUpload()} />}</div>{!data.units.length && <div className="library-callout"><div className="callout-icon"><GraduationCap size={20} /></div><div><strong>Give your materials a home</strong><p>Create a unit to keep notes, readings, and revision materials together.</p></div><button className="quiet-action" onClick={openUnit}><Plus size={15} />Add your first unit</button></div>}</>
}

function TimetableView({ data }: { data: Awaited<ReturnType<typeof getDashboard>> }) {
  const today = new Date().getDay()
  const todays = data.timetable
  return <><section className="section-intro"><p className="eyebrow">MAKE SPACE FOR WHAT MATTERS</p><div className="section-title-row"><div><h1>Timetable</h1><p>Your weekly classes at a glance.</p></div><span className="quiet-pill">{formatDate(new Date(), { weekday: 'long', month: 'long', day: 'numeric' })}</span></div></section><div className="panel timetable-full"><div className="panel-heading"><div><p className="eyebrow">TODAY</p><h2>Classes &amp; activities</h2></div><span className="quiet-pill">{todays.length} {todays.length === 1 ? 'CLASS' : 'CLASSES'}</span></div>{todays.length ? <div className="full-agenda">{todays.map((event, index) => <div className={`agenda-item${index === 0 ? ' agenda-next' : ''}`} key={event.id}><div className="agenda-time"><strong>{formatTime(event.start_time)}</strong><span>{formatTime(event.end_time)}</span></div><span className="agenda-rule" /><div className="agenda-details"><strong>{event.title}</strong><span>{event.venue || 'Venue not set'}</span></div>{index === 0 && <span className="next-tag">NEXT</span>}</div>)}</div> : <EmptyState icon={CalendarDays} title="Your week is yours" note="No class blocks scheduled for today. A good time to plan ahead." action="Add a class" onClick={() => alert('Class scheduling is coming soon.')} />}<div className="week-strip">{weekDays().map(({ date, label }) => <div key={label} className={`week-day${date.getDay() === today ? ' week-day-current' : ''}`}><span>{label}</span><strong>{date.getDate()}</strong><i>{date.getDay() === today && todays.length ? todays.length : ''}</i></div>)}</div></div><div className="feature-note"><Sparkles size={17} /><span>Weekly class editing and conflict checks are next in your academic planner.</span></div></>
}

function RemindersView({ reminders, onAdd, onComplete }: { reminders: Reminder[]; onAdd: () => void; onComplete: (item: Reminder) => void }) {
  return <><section className="section-intro"><p className="eyebrow">A GENTLE NUDGE, RIGHT ON TIME</p><div className="section-title-row"><div><h1>Reminders</h1><p>Keep the important things close. The rest can wait.</p></div><button className="primary-button" onClick={onAdd}><Plus size={16} />New reminder</button></div></section><div className="panel reminder-page-panel"><div className="panel-heading"><div><p className="eyebrow">UP NEXT</p><h2>On your horizon</h2></div><span className="quiet-pill">{reminders.length} OPEN</span></div>{reminders.length ? <div className="reminder-list reminder-list-page">{reminders.map((item) => <div className="reminder-row" key={item.id}><button className="check-button" aria-label={`Mark ${item.title} complete`} onClick={() => onComplete(item)}><Check size={14} /></button><div className="reminder-info"><strong>{item.title}</strong><span>{item.description || 'Academic reminder'}</span></div><time>{formatDate(item.reminder_datetime, { weekday: 'short', month: 'short', day: 'numeric' })} · {formatTime(new Date(item.reminder_datetime).toTimeString())}</time></div>)}</div> : <EmptyState icon={AlarmClock} title="No reminders on the horizon" note="Set one for a reading session, assignment, or anything you want to remember." action="Create a reminder" onClick={onAdd} />}</div></>
}

function StudyStudio({ units, sessions, onFinish }: { units: Unit[]; sessions: StudySession[]; onFinish: (minutes: number) => Promise<void> }) {
  const [selectedUnit, setSelectedUnit] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [running])
  const totalMins = sessions.reduce((sum, session) => sum + session.duration, 0)
  const sessionMins = Math.floor(elapsed / 60)
  return <><section className="section-intro"><p className="eyebrow">FOCUS, WITHOUT THE FUSS</p><div className="section-title-row"><div><h1>Study studio</h1><p>A quiet little corner for focused work.</p></div><span className="quiet-pill"><Sparkles size={13} /> STUDY SESSION</span></div></section><div className="studio-layout"><section className="studio-card"><div className="studio-orbit"><span /><span /><div className="studio-clock"><strong>{String(Math.floor(elapsed / 3600)).padStart(2, '0')}:{String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}</strong><span>FOCUSED TIME</span></div></div><p className="studio-quote">Small, steady effort adds up.</p><label className="form-field studio-select-label">Focus on a unit<select value={selectedUnit} onChange={(event) => setSelectedUnit(event.target.value)}><option value="">Choose a unit (optional)</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.unit_code} · {unit.name}</option>)}</select></label><div className="studio-controls"><button className="primary-button" onClick={() => setRunning(!running)}>{running ? 'Pause session' : elapsed ? 'Resume session' : 'Start studying'}</button>{elapsed > 0 && !running && <button className="secondary-button" onClick={() => { void onFinish(sessionMins); setElapsed(0) }}>Finish &amp; save</button>}</div>{running && <button className="quiet-action studio-save" onClick={() => { setRunning(false); void onFinish(sessionMins); setElapsed(0) }}><Check size={15} />End and save session</button>}</section><aside className="studio-aside"><div className="panel studio-side-panel"><p className="eyebrow">THIS WEEK</p><strong className="studio-total">{Math.floor(totalMins / 60)}h {totalMins % 60}m</strong><span className="metric-note">of recorded focus time</span><div className="mini-progress"><span style={{ width: `${Math.min(100, totalMins / 600 * 100)}%` }} /></div><p className="metric-note">Keep showing up for yourself.</p></div><div className="panel studio-side-panel"><p className="eyebrow">YOUR LIBRARY</p><strong className="side-title">{units.length ? `${units.length} study ${units.length === 1 ? 'space' : 'spaces'}` : 'No units yet'}</strong><p className="metric-note">Organize a unit to keep your study materials nearby.</p></div></aside></div><div className="feature-note"><BookOpen size={17} /><span>Document reading, annotation, and study guides will live here as your library grows.</span></div></>
}

function ActionModal({ type, units, onClose, onAddUnit, onAddReminder, onUpload }: { type: 'unit' | 'reminder' | 'upload'; units: Unit[]; onClose: () => void; onAddUnit: (event: React.FormEvent<HTMLFormElement>) => void; onAddReminder: (event: React.FormEvent<HTMLFormElement>) => void; onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="action-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><p className="eyebrow">{type === 'unit' ? 'BUILD YOUR LIBRARY' : type === 'reminder' ? 'MAKE IT MEMORABLE' : 'ADD TO YOUR SHELF'}</p><h2 id="modal-title">{type === 'unit' ? 'Add a unit' : type === 'reminder' ? 'Create a reminder' : 'Upload study materials'}</h2></div><button className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></div>{type === 'unit' ? <form className="modal-form" onSubmit={onAddUnit}><label className="form-field">Unit name<input name="name" placeholder="Introduction to Psychology" required maxLength={120} /></label><div className="form-row"><label className="form-field">Unit code<input name="code" placeholder="PSY101" required maxLength={20} /></label><label className="form-field">Lecturer <span className="optional">OPTIONAL</span><input name="lecturer" placeholder="Name" maxLength={120} /></label></div><label className="form-field">A note about this unit <span className="optional">OPTIONAL</span><textarea name="description" placeholder="What are you exploring?" rows={3} maxLength={500} /></label><button className="submit-button" type="submit">Add to my library <ArrowUpRight size={16} /></button></form> : type === 'reminder' ? <form className="modal-form" onSubmit={onAddReminder}><label className="form-field">What do you need to remember?<input name="title" placeholder="Read chapter three" required maxLength={150} /></label><label className="form-field">When<input name="date" type="datetime-local" required min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)} /></label><label className="form-field">Connect it to a unit <span className="optional">OPTIONAL</span><select name="unit_id"><option value="">No unit selected</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.unit_code} · {unit.name}</option>)}</select></label><label className="form-field">A few details <span className="optional">OPTIONAL</span><textarea name="description" placeholder="Add context for later" rows={2} maxLength={500} /></label><button className="submit-button" type="submit">Save reminder <ArrowUpRight size={16} /></button></form> : <div className="modal-form"><label className="form-field">Organize this with a unit <span className="optional">OPTIONAL</span><select id="upload-unit"><option value="">My general library</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.unit_code} · {unit.name}</option>)}</select></label><label className="upload-drop"><Upload size={21} /><strong>Choose files from your device</strong><span>PDF, Office docs, images, audio, video, ZIP · Up to 50 MB each</span><input type="file" multiple accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.webp,.mp3,.mp4,.zip" onChange={onUpload} /></label><p className="privacy-note">Your files are private to your account and stored securely.</p></div>}</section></div>
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 KB'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`
}

function StudyNotesView({ notes, onOpen, onUpdate }: { notes: StickyNoteRecord[]; onOpen: (note: StickyNoteRecord) => void; onUpdate: (note: StickyNoteRecord, patch: Partial<StickyNoteRecord>) => void }) {
  const [colour, setColour] = useState('all')
  const [status, setStatus] = useState('all')
  const [layout, setLayout] = useState<'board' | 'list'>('board')
  const filtered = notes.filter((note) => (colour === 'all' || note.colour === colour) && (status === 'all' || (status === 'pinned' ? note.is_pinned : status === 'completed' ? note.is_completed : !note.is_completed)))
  return <><section className="section-intro"><p className="eyebrow">LITTLE THOUGHTS, BIG IDEAS</p><div className="section-title-row"><div><h1>My study notes</h1><p>Your page-by-page highlights, gathered in one cheerful place.</p></div><span className="quiet-pill"><StickyNote size={13} /> {notes.length} NOTES</span></div></section><div className="notes-toolbar"><label className="form-field">Colour<select value={colour} onChange={(event) => setColour(event.target.value)}><option value="all">Every colour</option>{['yellow','pink','purple','blue','green'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="form-field">Show<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All notes</option><option value="pinned">Pinned</option><option value="open">To review</option><option value="completed">Understood</option></select></label><div className="notes-layout-toggle"><button className={layout === 'board' ? 'selected' : ''} onClick={() => setLayout('board')}>Board</button><button className={layout === 'list' ? 'selected' : ''} onClick={() => setLayout('list')}>List</button></div></div>{filtered.length ? <div className={layout === 'board' ? 'sticky-board' : 'sticky-list'}>{filtered.map((note, index) => <article className={`sticky-note-card sticky-${note.colour}`} key={note.id} style={{ ['--note-tilt' as string]: `${(index % 3 - 1) * 1.7}deg` }}><button className="sticky-note-open" onClick={() => onOpen(note)}><span className="sticky-note-kicker">{note.documents?.units?.name || 'STUDY NOTE'} · PAGE {note.page_number}</span><h2>{note.title}</h2><p>{note.content || 'A thought to revisit…'}</p><span className="sticky-note-source">{note.documents?.file_name || 'Document'}</span></button><div className="sticky-note-actions"><button aria-label={note.is_pinned ? 'Unpin note' : 'Pin note'} onClick={() => onUpdate(note, { is_pinned: !note.is_pinned })}><Pin size={14} fill={note.is_pinned ? 'currentColor' : 'none'} /></button><button aria-label={note.is_completed ? 'Mark for review' : 'Mark understood'} onClick={() => onUpdate(note, { is_completed: !note.is_completed })}><Check size={14} />{note.is_completed ? 'Understood' : 'Review'}</button><button aria-label="Edit note" onClick={() => { const content = window.prompt('Edit your note', note.content); if (content !== null) onUpdate(note, { content }) }}>Edit</button></div></article>)}</div> : <div className="panel notes-empty"><div className="mascot-orbit" aria-hidden="true"><BookOpen size={36} /></div><h2>Your note board is waiting</h2><p>Add a sticky note while reading a PDF and it will find its way here.</p></div>}</>
}

function DocumentViewer({ document: doc, url, notes, onClose, onCreateNote, onUpdateNote }: { document: Doc; url: string; notes: StickyNoteRecord[]; onClose: () => void; onCreateNote: (event: React.FormEvent<HTMLFormElement>) => void; onUpdateNote: (note: StickyNoteRecord, patch: Partial<StickyNoteRecord>) => void }) {
  const [page, setPage] = useState(Number(url.match(/page=(\d+)/)?.[1] || 1))
  const pdf = doc.file_type?.includes('pdf') || doc.file_name.toLowerCase().endsWith('.pdf')
  const pageUrl = pdf ? `${url.split('#')[0]}#page=${page}&toolbar=1` : url
  return <div className="reader-backdrop"><section className="reader-shell" role="dialog" aria-modal="true" aria-label={`Reading ${doc.file_name}`}><header className="reader-toolbar"><button className="secondary-button" onClick={onClose}><ChevronLeft size={16} />Back to shelf</button><div className="reader-title"><FileText size={17} /><strong>{doc.file_name}</strong></div><a className="secondary-button" href={url.split('#')[0]} download={doc.file_name}><ArrowDownRight size={15} />Download</a><button className="icon-button" aria-label="Close reader" onClick={onClose}><X size={18} /></button></header><div className="reader-body"><div className="reader-canvas">{pdf ? <iframe title={`Document reader: ${doc.file_name}`} src={pageUrl} /> : <div className="reader-fallback"><FileText size={38} /><h2>Preview this material</h2><p>This file type is available to download and open in its associated application.</p><a href={url.split('#')[0]} download={doc.file_name} className="primary-button">Download file</a></div>}</div><aside className="reader-notes"><div className="panel-heading"><div><p className="eyebrow">ON THIS PAGE</p><h2>Sticky notes</h2></div><span className="quiet-pill">{notes.length}</span></div><div className="page-controls"><button className="icon-button" aria-label="Previous page" onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft size={17} /></button><label>Page <input aria-label="Current page" type="number" min="1" value={page} onChange={(event) => setPage(Math.max(1, Number(event.target.value) || 1))} /></label><button className="icon-button" aria-label="Next page" onClick={() => setPage((current) => current + 1)}><ChevronRight size={17} /></button></div><div className="reader-note-list">{notes.filter((note) => note.page_number === page).map((note) => <article className={`mini-sticky sticky-${note.colour}`} key={note.id}><strong>{note.title}</strong><p>{note.content}</p>{note.selected_text && <blockquote>{note.selected_text}</blockquote>}<button onClick={() => onUpdateNote(note, { is_completed: !note.is_completed })}>{note.is_completed ? 'Revisit note' : 'Mark understood'}</button></article>)}{!notes.some((note) => note.page_number === page) && <p className="reader-empty">No notes on this page yet. Add one while you read.</p>}</div>{pdf && <form className="note-compose" onSubmit={onCreateNote}><p className="eyebrow">PIN A THOUGHT TO PAGE {page}</p><input name="page" type="hidden" value={page} /><label className="form-field">Title<input name="title" required maxLength={120} placeholder="Key idea" /></label><label className="form-field">Note<textarea name="content" required maxLength={1200} rows={3} placeholder="Add a useful reminder…" /></label><label className="form-field">Selected text <span className="optional">OPTIONAL · PASTE A QUOTE</span><input name="selected_text" maxLength={800} placeholder="Quote or passage to remember" /></label><label className="form-field">Colour<select name="colour" defaultValue="yellow">{['yellow','pink','purple','blue','green'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><button className="primary-button" type="submit"><Plus size={15} />Add sticky note</button></form>}</aside></div></section></div>
}
