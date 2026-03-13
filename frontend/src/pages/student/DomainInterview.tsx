import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Target, BookOpen, Code, Briefcase, Heart, Zap,
  GitBranch, ChevronRight, CheckCircle2, Wifi, Mic, Clock,
  Shield, BarChart3, MessageSquare, Search, Layers,
} from 'lucide-react'
import Footer from '../../components/Footer'
import { useQuery, useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { studentApi } from '../../utils/api'

/* ─────────────────────────── constants ─────────────────────────── */

const STEPS = [
  { icon: Target,        label: 'Choose Domain',  desc: 'Pick your field of expertise'       },
  { icon: Layers,        label: 'Configure',      desc: 'Set questions & follow-up mode'     },
  { icon: MessageSquare, label: 'Interview',       desc: 'Answer by voice or text'            },
  { icon: BarChart3,     label: 'Feedback',        desc: 'Domain-focused score & tips'        },
]

const PREREQS = [
  { icon: Wifi,   text: 'Stable internet connection'   },
  { icon: Mic,    text: 'Microphone access enabled'    },
  { icon: Clock,  text: '15 – 30 minutes of free time' },
  { icon: Shield, text: 'Quiet, distraction-free room' },
]

const QUESTION_PRESETS = [5, 8, 10, 15, 20, 25]
const DURATION_OPTIONS  = [15, 20, 30, 45, 60]

// Domain icon resolver
function getDomainIcon(name: string) {
  const n = name.toLowerCase()
  if (n.includes('software') || n.includes('computer') || n.includes('it') || n.includes('web')) return Code
  if (n.includes('business') || n.includes('management') || n.includes('mba')) return Briefcase
  if (n.includes('data') || n.includes('analytics') || n.includes('science')) return Target
  if (n.includes('mechanical') || n.includes('engineering') || n.includes('electrical')) return Zap
  if (n.includes('medical') || n.includes('health') || n.includes('bio')) return Heart
  return BookOpen
}

// Deterministic pastel colour per domain card
const DOMAIN_PALETTES = [
  { bg: 'bg-blue-50',   border: 'border-blue-200',   icon: 'text-blue-500',   sel: 'bg-blue-600'   },
  { bg: 'bg-violet-50', border: 'border-violet-200', icon: 'text-violet-500', sel: 'bg-violet-600' },
  { bg: 'bg-emerald-50',border: 'border-emerald-200',icon: 'text-emerald-500',sel: 'bg-emerald-600'},
  { bg: 'bg-amber-50',  border: 'border-amber-200',  icon: 'text-amber-500',  sel: 'bg-amber-600'  },
  { bg: 'bg-rose-50',   border: 'border-rose-200',   icon: 'text-rose-500',   sel: 'bg-rose-600'   },
  { bg: 'bg-cyan-50',   border: 'border-cyan-200',   icon: 'text-cyan-500',   sel: 'bg-cyan-600'   },
]

/* ─────────────────────────── component ─────────────────────────── */

export default function DomainInterview() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preselected        = searchParams.get('domain') || ''
  const scheduledId        = searchParams.get('scheduledInterviewId')

  const [selectedDomain, setSelectedDomain] = useState(preselected)
  const [isStarting, setIsStarting]         = useState(false)
  const [followups, setFollowups]           = useState(false)
  const [numQ, setNumQ]                     = useState(10)
  const [duration, setDuration]             = useState(30)
  const [search, setSearch]                 = useState('')

  const { data: domainsData, isLoading } = useQuery({
    queryKey: ['domains'],
    queryFn: studentApi.getDomains,
  })

  const mutation = useMutation({
    mutationFn: () => {
      if (scheduledId) return studentApi.startScheduledDomainInterview(scheduledId)
      return studentApi.startInterview({
        interview_type: 'domain_based',
        domain: selectedDomain,
        enable_followups: followups,
        num_questions: numQ,
        duration_minutes: followups ? duration : undefined,
      })
    },
    onSuccess: (res) => {
      const id = res.data.id ?? res.data.interview_id
      navigate(`/student/interview/room/${id}`)
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to start interview')
      setIsStarting(false)
    },
  })

  const handleStart = () => {
    if (!selectedDomain) { toast.error('Please select a domain first'); return }
    setIsStarting(true)
    mutation.mutate()
  }

  const allDomains: any[] = domainsData?.data || []
  const filteredDomains = search.trim()
    ? allDomains.filter((d: any) => d.name.toLowerCase().includes(search.toLowerCase()))
    : allDomains

  const selectedMeta = allDomains.find((d: any) => d.name === selectedDomain)

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
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-600 text-white">
              <Target className="h-3.5 w-3.5" />
            </span>
            <h1 className="text-sm font-semibold text-gray-800">Domain-Specific Interview</h1>
          </div>
        </div>
      </header>

      {/* ══ PAGE HERO ══ */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 mb-2">Domain-Targeted</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
              Domain-Specific<br className="hidden sm:block" /> Interview Session
            </h2>
            <p className="mt-2 text-sm text-gray-500 leading-relaxed">
              Select your field and get precisely targeted questions — technical, conceptual, and scenario-based — crafted for that domain.
            </p>
          </div>

          {/* Progress steps */}
          <div className="mt-8 flex items-start gap-0">
            {STEPS.map(({ icon: Icon, label, desc }, i) => (
              <div key={i} className="flex items-start flex-1 min-w-0">
                <div className="flex flex-col items-center flex-1 min-w-0">
                  <div className="flex items-center w-full">
                    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-emerald-600 flex items-center justify-center shadow-sm">
                      <Icon className="h-4 w-4 text-white" />
                    </div>
                    {i < STEPS.length - 1 && <div className="flex-1 h-px bg-gray-200 mx-2" />}
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
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">

          {/* ─────────────── LEFT — Domain picker ─────────────── */}
          <div className="space-y-5">

            {/* Scheduled notice */}
            {scheduledId && (
              <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-2xl px-5 py-4">
                <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Target className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-blue-900">Scheduled Interview</p>
                  <p className="text-xs text-blue-700 mt-0.5">
                    This is a scheduled domain interview. The domain has been pre-selected by your admin.
                  </p>
                </div>
              </div>
            )}

            {/* Domain picker card */}
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/60 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">Select Your Domain</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {allDomains.length} domains available
                  </p>
                </div>
                {/* Search */}
                {!scheduledId && allDomains.length > 6 && (
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search domains…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent w-44"
                    />
                  </div>
                )}
              </div>

              <div className="p-5">
                {isLoading ? (
                  /* skeleton */
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="animate-pulse rounded-xl bg-gray-100 h-20" />
                    ))}
                  </div>
                ) : filteredDomains.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filteredDomains.map((domain: any, idx: number) => {
                      const Icon     = getDomainIcon(domain.name)
                      const palette  = DOMAIN_PALETTES[idx % DOMAIN_PALETTES.length]
                      const isSelected = selectedDomain === domain.name
                      const isLocked   = !!scheduledId

                      return (
                        <button
                          key={domain.id}
                          type="button"
                          disabled={isLocked}
                          onClick={() => !isLocked && setSelectedDomain(domain.name)}
                          className={`relative w-full text-left rounded-xl border-2 p-4 transition-all duration-150 focus:outline-none ${
                            isSelected
                              ? `border-emerald-400 bg-emerald-50 ring-2 ring-emerald-300 ring-offset-1 shadow-sm`
                              : isLocked
                              ? `${palette.border} ${palette.bg} opacity-60 cursor-not-allowed`
                              : `border-gray-100 bg-gray-50 hover:border-emerald-200 hover:bg-emerald-50/40 hover:shadow-sm cursor-pointer`
                          }`}
                        >
                          {/* Selected checkmark */}
                          {isSelected && (
                            <span className="absolute top-2.5 right-2.5">
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            </span>
                          )}

                          <div className="flex items-start gap-3">
                            <div className={`flex-shrink-0 h-9 w-9 rounded-xl flex items-center justify-center transition-colors ${
                              isSelected ? 'bg-emerald-100' : palette.bg
                            }`}>
                              <Icon className={`h-5 w-5 ${isSelected ? 'text-emerald-600' : palette.icon}`} />
                            </div>
                            <div className="flex-1 min-w-0 pr-5">
                              <p className={`text-sm font-semibold leading-tight truncate ${
                                isSelected ? 'text-emerald-900' : 'text-gray-800'
                              }`}>
                                {domain.name}
                              </p>
                              <p className={`text-xs mt-1 leading-snug line-clamp-2 ${
                                isSelected ? 'text-emerald-700' : 'text-gray-500'
                              }`}>
                                {domain.description || 'Specialised questions for this domain'}
                              </p>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  /* empty */
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="h-14 w-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                      <BookOpen className="h-7 w-7 text-gray-400" />
                    </div>
                    <p className="text-sm font-semibold text-gray-700 mb-1">
                      {search ? 'No matching domains' : 'No domains available'}
                    </p>
                    <p className="text-xs text-gray-400">
                      {search ? 'Try a different search term' : 'Check back later or contact your admin'}
                    </p>
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        className="mt-3 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                      >
                        Clear search
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Selected domain — what to expect */}
            {selectedDomain && (
              <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/60 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <h3 className="text-sm font-semibold text-gray-800">
                    What to expect in <span className="text-emerald-700">{selectedDomain}</span>
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-gray-100">
                  {[
                    {
                      color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100',
                      title: 'Technical Questions',
                      desc:  `Core concepts, tools, and methodologies specific to ${selectedDomain}`,
                    },
                    {
                      color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100',
                      title: 'Practical Scenarios',
                      desc:  'Real-world problems and case studies from the industry',
                    },
                    {
                      color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100',
                      title: 'Industry Insights',
                      desc:  `Current trends and best practices in ${selectedDomain}`,
                    },
                  ].map(({ color, bg, border, title, desc }) => (
                    <div key={title} className={`bg-white px-5 py-4`}>
                      <div className={`h-7 w-7 rounded-lg ${bg} border ${border} flex items-center justify-center mb-3`}>
                        <div className={`h-2 w-2 rounded-full ${bg.replace('50', '500')}`} />
                      </div>
                      <p className={`text-xs font-bold ${color} mb-1`}>{title}</p>
                      <p className="text-xs text-gray-500 leading-snug">{desc}</p>
                    </div>
                  ))}
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

          {/* ─────────────── RIGHT — Settings + CTA ─────────────── */}
          <div className="space-y-5">

            {/* Settings */}
            {!scheduledId && (
              <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/60">
                  <h3 className="text-sm font-semibold text-gray-800">Interview Configuration</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Customise before you begin</p>
                </div>

                <div className="px-6 py-5 space-y-6">

                  {/* Questions / Duration */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
                      {followups ? 'Session Duration' : 'Number of Questions'}
                    </label>

                    {!followups ? (
                      <div className="space-y-3">
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
                        <div className="flex gap-2 flex-wrap">
                          {QUESTION_PRESETS.map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setNumQ(n)}
                              className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                                numQ === n
                                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
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
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                          >{m} min</button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Follow-up toggle */}
                  <div className={`rounded-xl border p-4 transition-all duration-200 ${
                    followups ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-100'
                  }`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-2.5">
                        <div className={`flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center mt-0.5 transition-colors ${
                          followups ? 'bg-emerald-100' : 'bg-white border border-gray-200'
                        }`}>
                          <GitBranch className={`h-4 w-4 ${followups ? 'text-emerald-600' : 'text-gray-400'}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-gray-800">Follow-up Mode</p>
                            {followups && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wide">ON</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 leading-snug">
                            AI probes deeper based on your answers
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFollowups((v) => !v)}
                        className={`mt-0.5 relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                          followups ? 'bg-emerald-500' : 'bg-gray-300'
                        }`}
                        aria-pressed={followups}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-200 ${
                          followups ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>

                    {/* Follow-up controls (expanded) */}
                    {followups && (
                      <div className="mt-4 pt-4 border-t border-emerald-200 grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-emerald-800 uppercase tracking-wide mb-1.5">Max Questions</label>
                          <div className="flex gap-1.5 flex-wrap">
                            {[5, 10, 15, 20].map((n) => (
                              <button
                                key={n}
                                type="button"
                                onClick={() => setNumQ(n)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                                  numQ === n
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'bg-white text-gray-500 border-gray-200 hover:border-emerald-300'
                                }`}
                              >{n}</button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-emerald-800 uppercase tracking-wide mb-1.5">Time Budget</label>
                          <div className="flex gap-1.5 flex-wrap">
                            {[15, 30, 45].map((m) => (
                              <button
                                key={m}
                                type="button"
                                onClick={() => setDuration(m)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                                  duration === m
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'bg-white text-gray-500 border-gray-200 hover:border-emerald-300'
                                }`}
                              >{m}m</button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              </section>
            )}

            {/* Session summary — only when domain picked */}
            {selectedDomain && (
              <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Session Summary</p>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Domain</span>
                    <span className="text-sm font-semibold text-gray-900 truncate max-w-[160px] text-right">{selectedDomain}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Length</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {followups ? `${duration} min session` : `${numQ} questions`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Follow-ups</span>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${
                      followups
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
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
                disabled={!selectedDomain || isStarting}
                className={`w-full flex items-center justify-center gap-2.5 font-semibold text-[15px] py-3.5 rounded-2xl transition-all duration-200 shadow-sm ${
                  selectedDomain && !isStarting
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white hover:shadow-md active:scale-[0.99]'
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
                    <Target className="h-5 w-5" />
                    {selectedDomain
                      ? `Start ${selectedDomain} Interview`
                      : 'Start Interview'}
                  </>
                )}
              </button>
              {!selectedDomain && (
                <p className="text-center text-xs text-gray-400">
                  Select a domain above to unlock this button
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
