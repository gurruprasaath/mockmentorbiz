import { useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import Footer from '../../components/Footer'
import {
  Upload, FileText, ArrowLeft, CheckCircle2,
  Wifi, Mic, Clock, Zap, X, Brain, MessageSquare,
  BarChart3, ChevronRight, Shield,
} from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { studentApi, getApiErrorMessage } from '../../utils/api'

/* ─────────────────────────── constants ─────────────────────────── */

const DIFFICULTIES = [
  {
    value: 'beginner' as const,
    label: 'Beginner',
    shortDesc: 'Fundamentals',
    longDesc: 'Core concepts and foundational knowledge',
    emoji: '🌱',
    ring: 'ring-emerald-400',
    pill: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    active: 'bg-emerald-500',
  },
  {
    value: 'intermediate' as const,
    label: 'Intermediate',
    shortDesc: 'Balanced',
    longDesc: 'Practical depth and real-world scenarios',
    emoji: '⚡',
    ring: 'ring-blue-400',
    pill: 'bg-blue-50 text-blue-700 border-blue-200',
    active: 'bg-primary-600',
  },
  {
    value: 'expert' as const,
    label: 'Expert',
    shortDesc: 'Deep dive',
    longDesc: 'System design, tradeoffs and edge cases',
    emoji: '🔥',
    ring: 'ring-violet-400',
    pill: 'bg-violet-50 text-violet-700 border-violet-200',
    active: 'bg-violet-600',
  },
] as const

type DiffValue = typeof DIFFICULTIES[number]['value']

const STEPS = [
  { icon: Upload,        label: 'Upload',   desc: 'Attach your resume (PDF / DOCX)' },
  { icon: Brain,         label: 'Analyse',  desc: 'AI extracts skills & experience'  },
  { icon: MessageSquare, label: 'Interview', desc: 'Answer by voice or text'          },
  { icon: BarChart3,     label: 'Feedback', desc: 'Detailed score & improvement tips' },
]

const PREREQS = [
  { icon: Wifi,    text: 'Stable internet connection'   },
  { icon: Mic,     text: 'Microphone access enabled'    },
  { icon: Clock,   text: '20 – 45 minutes of free time' },
  { icon: Shield,  text: 'Quiet, distraction-free room' },
]

const QUESTION_PRESETS = [5, 10, 15, 20, 25]
const DURATION_OPTIONS  = [10, 15, 20, 30, 45, 60]

/* ─────────────────────────── component ─────────────────────────── */

export default function ResumeInterview() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const scheduledId = searchParams.get('scheduledInterviewId')

  const [file, setFile]               = useState<File | null>(null)
  const [isStarting, setIsStarting]   = useState(false)
  const [numQ, setNumQ]               = useState(10)
  const [mode, setMode]               = useState<DiffValue>('intermediate')
  const [followups, setFollowups]     = useState(false)
  const [duration, setDuration]       = useState(30)

  /* ── dropzone ── */
  const onDrop = useCallback((accepted: File[]) => {
    const f = accepted[0]
    if (!f) return
    if (f.size > 10 * 1024 * 1024) { toast.error('File must be under 10 MB'); return }
    const ok = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    if (!ok.includes(f.type)) { toast.error('Only PDF and DOCX allowed'); return }
    setFile(f)
    toast.success(`Uploaded: ${f.name}`)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    multiple: false,
  })

  /* ── mutation ── */
  const mutation = useMutation({
    mutationFn: () => {
      if (scheduledId)
        return studentApi.startScheduledResumeInterview(scheduledId, file!, mode)
      return studentApi.startInterview(
        {
          interview_type: 'resume_based',
          mode,
          num_questions: followups ? 25 : numQ,
          enable_followups: followups,
          duration_minutes: followups ? duration : undefined,
        },
        file!
      )
    },
    onSuccess: (res) => {
      const id = res.data.id ?? res.data.interview_id
      navigate(`/student/interview/room/${id}`)
    },
    onError: (err: any) => {
      toast.error(getApiErrorMessage(err, 'Failed to start interview'))
      setIsStarting(false)
    },
  })

  const handleStart = () => {
    if (!file) { toast.error('Please upload your resume first'); return }
    setIsStarting(true)
    mutation.mutate()
  }

  const diff = DIFFICULTIES.find((d) => d.value === mode)!

  /* ══════════════════════════ render ══════════════════════════ */
  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f8fafc' }}>

      {/* ══ HEADER ══ */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-20 shadow-[0_1px_3px_rgba(0,0,0,.06)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-3">
          <button
            onClick={() => navigate('/student')}
            className="group flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
            <span className="hidden sm:inline">Back to Dashboard</span>
            <span className="sm:hidden">Back</span>
          </button>

          <ChevronRight className="h-3.5 w-3.5 text-gray-300" />

          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary-600 text-white">
              <FileText className="h-3.5 w-3.5" />
            </span>
            <h1 className="text-sm font-semibold text-gray-800">Resume-Based Interview</h1>
          </div>
        </div>
      </header>

      {/* ══ PAGE HERO ══ */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary-600 mb-2">AI-Powered</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              Resume-Based<br className="hidden sm:block" /> Interview Session
            </h2>
            <p className="mt-2 text-sm text-gray-500 leading-relaxed">
              Upload your resume and our AI will craft personalised, role-relevant questions in seconds.
            </p>
          </div>

          {/* Progress steps */}
          <div className="mt-8 flex items-start gap-0">
            {STEPS.map(({ icon: Icon, label, desc }, i) => (
              <div key={i} className="flex items-start flex-1 min-w-0">
                <div className="flex flex-col items-center flex-1 min-w-0">
                  <div className="flex items-center w-full">
                    {/* circle */}
                    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary-600 flex items-center justify-center shadow-sm">
                      <Icon className="h-4 w-4 text-white" />
                    </div>
                    {/* connector */}
                    {i < STEPS.length - 1 && (
                      <div className="flex-1 h-px bg-gray-200 mx-2" />
                    )}
                  </div>
                  <div className="mt-2 pr-4 hidden sm:block">
                    <p className="text-xs font-semibold text-gray-800">{label}</p>
                    <p className="text-[11px] text-gray-400 leading-snug mt-0.5">{desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══ BODY ══ */}
      <div className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 items-start">

          {/* ─────────────── LEFT ─────────────── */}
          <div className="space-y-5">

            {/* Settings */}
            {!scheduledId && (
              <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* section header */}
                <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/60">
                  <h3 className="text-sm font-semibold text-gray-800">Interview Configuration</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Customise before you begin</p>
                </div>

                <div className="px-6 py-5 space-y-6">

                  {/* ── Questions / Duration ── */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
                      {followups ? 'Session Duration' : 'Number of Questions'}
                    </label>

                    {!followups ? (
                      <div className="space-y-3">
                        {/* stepper */}
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setNumQ((v) => Math.max(1, v - 1))}
                            className="h-9 w-9 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center text-gray-500 hover:text-gray-900 transition-all text-lg font-semibold leading-none shadow-sm"
                          >−</button>
                          <div className="text-center w-12">
                            <span className="text-3xl font-black text-gray-900 tabular-nums">{numQ}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setNumQ((v) => Math.min(25, v + 1))}
                            className="h-9 w-9 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center text-gray-500 hover:text-gray-900 transition-all text-lg font-semibold leading-none shadow-sm"
                          >+</button>
                          <span className="text-xs text-gray-400">of 25 max</span>
                        </div>
                        {/* presets */}
                        <div className="flex gap-2 flex-wrap">
                          {QUESTION_PRESETS.map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setNumQ(n)}
                              className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                                numQ === n
                                  ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                              }`}
                            >{n} Q</button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2 flex-wrap">
                        {DURATION_OPTIONS.map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setDuration(m)}
                            className={`px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                              duration === m
                                ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                          >{m} min</button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── Difficulty ── */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
                      Difficulty Level
                    </label>
                    <div className="grid grid-cols-3 gap-2.5">
                      {DIFFICULTIES.map((d) => {
                        const active = mode === d.value
                        return (
                          <button
                            key={d.value}
                            type="button"
                            onClick={() => setMode(d.value)}
                            className={`relative flex flex-col items-center gap-1.5 py-3.5 px-2 rounded-xl border-2 text-center transition-all duration-150 ${
                              active
                                ? `${d.pill} border-current shadow-sm ring-2 ${d.ring} ring-offset-1`
                                : 'bg-white border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            <span className="text-xl leading-none">{d.emoji}</span>
                            <span className={`text-xs font-bold ${active ? '' : 'text-gray-700'}`}>{d.label}</span>
                            <span className={`text-[10px] leading-tight ${active ? 'opacity-80' : 'text-gray-400'}`}>{d.longDesc}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* ── Follow-up toggle ── */}
                  <div className={`flex items-center justify-between rounded-xl border p-4 transition-all duration-200 ${
                    followups
                      ? 'bg-primary-50 border-primary-200'
                      : 'bg-gray-50 border-gray-100'
                  }`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-800">Follow-up Mode</p>
                        {followups && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-primary-100 text-primary-700 text-[10px] font-bold uppercase tracking-wide">ON</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 leading-snug">
                        AI asks deeper contextual questions based on your answers
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFollowups((v) => !v)}
                      className={`ml-4 relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                        followups ? 'bg-primary-600' : 'bg-gray-300'
                      }`}
                      aria-pressed={followups}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-200 ${
                        followups ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>

                </div>
              </section>
            )}

            {/* Before you begin */}
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/60">
                <h3 className="text-sm font-semibold text-gray-800">Before You Begin</h3>
                <p className="text-xs text-gray-400 mt-0.5">Make sure you're set up for success</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-gray-100">
                {PREREQS.map(({ icon: Icon, text }) => (
                  <div key={text} className="bg-white px-5 py-4 flex items-center gap-3">
                    <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center">
                      <Icon className="h-4 w-4 text-amber-500" />
                    </div>
                    <span className="text-sm text-gray-700 leading-snug">{text}</span>
                  </div>
                ))}
              </div>
            </section>

          </div>

          {/* ─────────────── RIGHT ─────────────── */}
          <div className="space-y-5">

            {/* Upload */}
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/60">
                <h3 className="text-sm font-semibold text-gray-800">Your Resume</h3>
                <p className="text-xs text-gray-400 mt-0.5">PDF or DOCX · max 10 MB</p>
              </div>

              <div className="p-5">
                {!file ? (
                  /* ── drop zone ── */
                  <div
                    {...getRootProps()}
                    className={`relative rounded-xl cursor-pointer transition-all duration-200 overflow-hidden ${
                      isDragActive
                        ? 'ring-2 ring-primary-400 ring-offset-0 bg-primary-50'
                        : 'hover:bg-gray-50'
                    }`}
                    style={{
                      border: isDragActive ? '2px solid #2563eb' : '2px dashed #e2e8f0',
                    }}
                  >
                    <input {...getInputProps()} />

                    {/* subtle grid pattern */}
                    <div
                      className="absolute inset-0 opacity-[0.03] pointer-events-none"
                      style={{
                        backgroundImage: 'radial-gradient(#000 1px, transparent 1px)',
                        backgroundSize: '20px 20px',
                      }}
                    />

                    <div className="relative flex flex-col items-center justify-center py-10 px-6 text-center">
                      {/* animated icon wrapper */}
                      <div className={`mb-5 h-16 w-16 rounded-2xl flex items-center justify-center transition-all duration-200 shadow-sm ${
                        isDragActive
                          ? 'bg-primary-100 scale-110'
                          : 'bg-gray-100'
                      }`}>
                        <Upload className={`h-7 w-7 transition-colors ${isDragActive ? 'text-primary-600' : 'text-gray-400'}`} />
                      </div>

                      <p className="text-base font-semibold text-gray-800 mb-1">
                        {isDragActive ? 'Release to upload' : 'Drop your resume here'}
                      </p>
                      <p className="text-xs text-gray-400 mb-5">
                        or click the button below to browse
                      </p>

                      <span className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors shadow-sm">
                        <Upload className="h-4 w-4" />
                        Choose File
                      </span>

                      <p className="mt-4 text-[11px] text-gray-300">PDF · DOCX · Max 10 MB</p>
                    </div>
                  </div>
                ) : (
                  /* ── file selected ── */
                  <div className="space-y-3">
                    {/* file card */}
                    <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-50 p-4">
                      <div className="flex items-center gap-3">
                        <div className="h-11 w-11 rounded-xl bg-white border border-emerald-200 flex items-center justify-center flex-shrink-0 shadow-sm">
                          <FileText className="h-5 w-5 text-emerald-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{file.name}</p>
                          <p className="text-xs text-emerald-600 mt-0.5">
                            {(file.size / 1024 / 1024).toFixed(2)} MB &nbsp;·&nbsp; Ready to analyse
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                          <button
                            onClick={() => setFile(null)}
                            className="h-7 w-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-danger-500 hover:bg-danger-50 transition-colors"
                            aria-label="Remove file"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* replace zone */}
                    <div
                      {...getRootProps()}
                      className="rounded-xl border border-dashed border-gray-200 py-3 flex items-center justify-center cursor-pointer hover:border-primary-300 hover:bg-primary-50/40 transition-all"
                    >
                      <input {...getInputProps()} />
                      <Upload className="h-3.5 w-3.5 text-gray-400 mr-1.5" />
                      <p className="text-xs text-gray-400">Replace with a different file</p>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Live summary — appears only when file is ready */}
            {file && !scheduledId && (
              <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Session Summary</p>
                <div className="space-y-2.5">
                  {/* row */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Questions</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {followups ? `${duration} min session` : `${numQ} questions`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Difficulty</span>
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border ${diff.pill}`}>
                      <span>{diff.emoji}</span>
                      {diff.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Follow-ups</span>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${
                      followups
                        ? 'bg-primary-50 text-primary-700 border-primary-200'
                        : 'bg-gray-50 text-gray-400 border-gray-200'
                    }`}>
                      {followups ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>
              </section>
            )}

            {/* CTA */}
            <div className="space-y-2">
              <button
                onClick={handleStart}
                disabled={!file || isStarting}
                className={`w-full flex items-center justify-center gap-2.5 font-semibold text-[15px] py-3.5 rounded-2xl transition-all duration-200 shadow-sm ${
                  file && !isStarting
                    ? 'bg-primary-600 hover:bg-primary-700 text-white hover:shadow-md active:scale-[0.99]'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'
                }`}
              >
                {isStarting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Preparing your interview…
                  </>
                ) : (
                  <>
                    <Zap className="h-5 w-5" />
                    {scheduledId ? 'Start Scheduled Interview' : 'Start Interview'}
                  </>
                )}
              </button>

              {!file && (
                <p className="text-center text-xs text-gray-400">
                  Upload your resume above to unlock this button
                </p>
              )}
            </div>

          </div>
          {/* end right column */}

        </div>
      </div>

      <Footer />
    </div>
  )
}
