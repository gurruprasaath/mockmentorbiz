import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Footer from '../../components/Footer'
import {
  Users,
  Calendar,
  Award,
  Clock,
  ArrowLeft,
  Download,
  TrendingUp,
  TrendingDown,
  Minus,
  Star,
  Activity,
  BookOpen,
  FileText,
  Video,
  ChevronRight,
  AlertCircle,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { adminApi } from '../../utils/api'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts'

// ─── Colour palette ───────────────────────────────────────────────────────────
const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b']
const AREA_COLOR = '#6366f1'

// ─── Grade helper ─────────────────────────────────────────────────────────────
function grade(score: number) {
  if (score >= 90) return { label: 'A+', color: 'text-emerald-600', bg: 'bg-emerald-50' }
  if (score >= 80) return { label: 'A',  color: 'text-green-600',   bg: 'bg-green-50'   }
  if (score >= 70) return { label: 'B',  color: 'text-blue-600',    bg: 'bg-blue-50'    }
  if (score >= 60) return { label: 'C',  color: 'text-yellow-600',  bg: 'bg-yellow-50'  }
  if (score >= 50) return { label: 'D',  color: 'text-orange-600',  bg: 'bg-orange-50'  }
  return               { label: 'F',  color: 'text-red-600',     bg: 'bg-red-50'     }
}

// ─── Trend arrow ──────────────────────────────────────────────────────────────
function Trend({ val }: { val: number }) {
  if (val > 0) return <span className="flex items-center gap-0.5 text-emerald-600 text-xs font-semibold"><TrendingUp className="h-3 w-3" />+{val.toFixed(1)}%</span>
  if (val < 0) return <span className="flex items-center gap-0.5 text-red-500 text-xs font-semibold"><TrendingDown className="h-3 w-3" />{val.toFixed(1)}%</span>
  return <span className="flex items-center gap-0.5 text-gray-400 text-xs"><Minus className="h-3 w-3" />0%</span>
}

// ─── Custom Pie label ─────────────────────────────────────────────────────────
const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  if (percent < 0.05) return null
  const RADIAN = Math.PI / 180
  const r = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + r * Math.cos(-midAngle * RADIAN)
  const y = cy + r * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className ?? ''}`} />
}

// ─── Score bar ────────────────────────────────────────────────────────────────
function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${Math.min(score, 100)}%` }} />
    </div>
  )
}

// ─── Report period helpers ─────────────────────────────────────────────────────
type ReportMode = 'weekly' | 'monthly'

function buildWeeklyRows(trends: any[]) {
  const weeks: Record<string, { label: string; values: number[]; count: number }> = {}
  trends.forEach(t => {
    const d = new Date(t.date)
    const jan1 = new Date(d.getFullYear(), 0, 1)
    const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
    const key = `${d.getFullYear()}-W${week}`
    if (!weeks[key]) weeks[key] = { label: `Week ${week}`, values: [], count: 0 }
    weeks[key].values.push(t.performance ?? 0)
    weeks[key].count++
  })
  return Object.entries(weeks).slice(-8).map(([k, v]) => ({
    period: v.label,
    avg: v.values.reduce((a, b) => a + b, 0) / (v.values.length || 1),
    count: v.count,
  }))
}

function buildMonthlyRows(trends: any[]) {
  const months: Record<string, { label: string; values: number[]; count: number }> = {}
  trends.forEach(t => {
    const d = new Date(t.date)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    if (!months[key]) months[key] = { label, values: [], count: 0 }
    months[key].values.push(t.performance ?? 0)
    months[key].count++
  })
  return Object.entries(months).slice(-12).map(([, v]) => ({
    period: v.label,
    avg: v.values.reduce((a, b) => a + b, 0) / (v.values.length || 1),
    count: v.count,
  }))
}

// ═══════════════════════════════════════════════════════════════════════════════
const AdminAnalytics = () => {
  const [dateRange, setDateRange]       = useState('30')
  const [selectedMetric, setSelectedMetric] = useState('performance')
  const [reportMode, setReportMode]     = useState<ReportMode>('weekly')
  const [activeTab, setActiveTab]       = useState<'overview' | 'reports'>('overview')

  // ── Data fetching ────────────────────────────────────────────────────────────
  const { data: analyticsData, isLoading } = useQuery({
    queryKey: ['admin-analytics', dateRange],
    queryFn: () => adminApi.getAnalytics({ days: parseInt(dateRange) }),
  })

  const { data: performanceData, isLoading: trendLoading } = useQuery({
    queryKey: ['admin-performance-trends', dateRange],
    queryFn: () => adminApi.getPerformanceTrends({ days: parseInt(dateRange) }),
  })

  const analytics      = analyticsData?.data  ?? {}
  const trendsRaw      = performanceData?.data?.daily_trends ?? []

  // ── Derived data ─────────────────────────────────────────────────────────────
  const typeTotal = useMemo(() => {
    const d = analytics.interview_type_distribution ?? {}
    return (d.resume_based ?? 0) + (d.domain_specific ?? 0) + (d.admin_scheduled ?? 0)
  }, [analytics])

  const pieData = useMemo(() => [
    { name: 'Resume Based',    value: analytics.interview_type_distribution?.resume_based    ?? 0 },
    { name: 'Domain Specific', value: analytics.interview_type_distribution?.domain_specific ?? 0 },
    { name: 'Admin Scheduled', value: analytics.interview_type_distribution?.admin_scheduled ?? 0 },
  ].filter(d => d.value > 0), [analytics])

  const trendChartData = useMemo(() =>
    trendsRaw.map((t: any) => ({
      ...t,
      label: new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    })),
  [trendsRaw])

  const weeklyRows  = useMemo(() => buildWeeklyRows(trendsRaw),  [trendsRaw])
  const monthlyRows = useMemo(() => buildMonthlyRows(trendsRaw), [trendsRaw])
  const reportRows  = reportMode === 'weekly' ? weeklyRows : monthlyRows

  const avgPerf = analytics.average_performance ?? 0
  const perfGrade = grade(avgPerf)

  // ── Metric options ────────────────────────────────────────────────────────────
  const metricOptions = [
    { value: 'performance',       label: 'Overall Performance' },
    { value: 'resume_performance', label: 'Resume Performance' },
    { value: 'domain_performance', label: 'Domain Performance' },
    { value: 'completion_rate',   label: 'Completion Rate'    },
    { value: 'average_duration',  label: 'Avg Duration (min)' },
  ]

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* ── Top Bar ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link to="/admin" className="flex items-center text-gray-500 hover:text-gray-700 text-sm gap-1">
                <ArrowLeft className="h-4 w-4" /> Back
              </Link>
              <div className="h-5 w-px bg-gray-300" />
              <h1 className="text-xl font-bold text-gray-900">Performance Analytics</h1>
            </div>

            <div className="flex items-center gap-3">
              {/* Tab switcher */}
              <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
                {(['overview', 'reports'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setActiveTab(t)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                      activeTab === t
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <select
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                value={dateRange}
                onChange={e => setDateRange(e.target.value)}
              >
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 3 months</option>
                <option value="365">Last year</option>
              </select>

              <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm transition-colors">
                <Download className="h-4 w-4" /> Export
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* ══ OVERVIEW TAB ══════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <>
            {/* ── KPI cards ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  title: 'Total Students',
                  value: analytics.total_students ?? 0,
                  change: analytics.student_growth ?? 0,
                  icon: Users,
                  iconBg: 'bg-indigo-100',
                  iconColor: 'text-indigo-600',
                  suffix: '',
                },
                {
                  title: 'Interviews Completed',
                  value: analytics.total_interviews ?? 0,
                  change: analytics.interview_growth ?? 0,
                  icon: Calendar,
                  iconBg: 'bg-emerald-100',
                  iconColor: 'text-emerald-600',
                  suffix: '',
                },
                {
                  title: 'Avg Performance',
                  value: avgPerf.toFixed(1),
                  change: analytics.performance_change ?? 0,
                  icon: Award,
                  iconBg: 'bg-amber-100',
                  iconColor: 'text-amber-600',
                  suffix: '%',
                },
                {
                  title: 'Avg Duration',
                  value: Math.round(analytics.average_duration ?? 0),
                  change: analytics.duration_change ?? 0,
                  icon: Clock,
                  iconBg: 'bg-rose-100',
                  iconColor: 'text-rose-600',
                  suffix: 'm',
                },
              ].map((card, i) => {
                const Icon = card.icon
                return (
                  <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className={`p-2.5 rounded-xl ${card.iconBg}`}>
                        <Icon className={`h-5 w-5 ${card.iconColor}`} />
                      </div>
                      <Trend val={card.change} />
                    </div>
                    {isLoading
                      ? <><Skeleton className="h-7 w-20 mb-1" /><Skeleton className="h-4 w-28" /></>
                      : <>
                          <p className="text-2xl font-bold text-gray-900">{card.value}{card.suffix}</p>
                          <p className="text-sm text-gray-500 mt-0.5">{card.title}</p>
                        </>
                    }
                  </div>
                )
              })}
            </div>

            {/* ── Grade banner ──────────────────────────────────────────── */}
            {!isLoading && avgPerf > 0 && (
              <div className={`rounded-2xl border p-4 flex items-center gap-4 ${perfGrade.bg} border-transparent`}>
                <div className={`text-3xl font-black ${perfGrade.color} w-12 text-center`}>{perfGrade.label}</div>
                <div>
                  <p className="font-semibold text-gray-800">Overall Grade</p>
                  <p className="text-sm text-gray-600">
                    Average score of <strong>{avgPerf.toFixed(1)}%</strong> across {analytics.total_interviews ?? 0} completed interviews
                    {analytics.completion_rate ? ` · ${(analytics.completion_rate).toFixed(0)}% completion rate` : ''}
                  </p>
                </div>
              </div>
            )}

            {/* ── Row 2: Performance breakdown + Pie chart ──────────────── */}
            <div className="grid lg:grid-cols-2 gap-6">

              {/* Performance breakdown bars */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h3 className="text-base font-semibold text-gray-900 mb-5">Performance Breakdown</h3>
                {isLoading
                  ? <div className="space-y-5">{[...Array(4)].map((_, i) => <div key={i} className="space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-2 w-full" /></div>)}</div>
                  : <div className="space-y-5">
                      {[
                        { name: 'Technical Skills',   key: 'technical',       color: 'bg-indigo-500' },
                        { name: 'Communication',       key: 'communication',   color: 'bg-emerald-500' },
                        { name: 'Problem Solving',     key: 'problem_solving', color: 'bg-amber-500' },
                        { name: 'Confidence',          key: 'confidence',      color: 'bg-rose-500' },
                      ].map(cat => {
                        const score: number = analytics.performance_breakdown?.[cat.key] ?? 0
                        const g = grade(score)
                        return (
                          <div key={cat.key}>
                            <div className="flex justify-between items-center mb-1.5">
                              <span className="text-sm font-medium text-gray-700">{cat.name}</span>
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${g.bg} ${g.color}`}>{g.label}</span>
                                <span className="text-sm font-semibold text-gray-900">{score.toFixed(1)}%</span>
                              </div>
                            </div>
                            <ScoreBar score={score} color={cat.color} />
                          </div>
                        )
                      })}
                    </div>
                }
              </div>

              {/* Pie chart: interview type distribution */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h3 className="text-base font-semibold text-gray-900 mb-1">Interview Type Distribution</h3>
                <p className="text-xs text-gray-500 mb-4">{typeTotal} total interviews</p>

                {isLoading
                  ? <div className="flex items-center justify-center h-56"><Skeleton className="h-40 w-40 rounded-full" /></div>
                  : pieData.length === 0
                    ? <div className="flex flex-col items-center justify-center h-56 text-gray-400 gap-2">
                        <AlertCircle className="h-8 w-8" />
                        <p className="text-sm">No interview data yet</p>
                      </div>
                    : <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={90}
                            paddingAngle={3}
                            dataKey="value"
                            labelLine={false}
                            label={renderPieLabel}
                          >
                            {pieData.map((_, idx) => (
                              <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(val: number, name: string) => [
                              `${val} (${typeTotal ? ((val / typeTotal) * 100).toFixed(1) : 0}%)`,
                              name,
                            ]}
                          />
                          <Legend iconType="circle" iconSize={8} />
                        </PieChart>
                      </ResponsiveContainer>
                }

                {/* Legend rows with counts */}
                {!isLoading && pieData.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {[
                      { name: 'Resume Based',    key: 'resume_based',    icon: FileText, color: PIE_COLORS[0] },
                      { name: 'Domain Specific', key: 'domain_specific', icon: BookOpen, color: PIE_COLORS[1] },
                      { name: 'Admin Scheduled', key: 'admin_scheduled', icon: Video,    color: PIE_COLORS[2] },
                    ].map(t => {
                      const count = analytics.interview_type_distribution?.[t.key] ?? 0
                      const pct   = typeTotal ? ((count / typeTotal) * 100).toFixed(1) : '0.0'
                      const Icon  = t.icon
                      return (
                        <div key={t.key} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full inline-block" style={{ backgroundColor: t.color }} />
                            <Icon className="h-3.5 w-3.5 text-gray-400" />
                            <span className="text-gray-700">{t.name}</span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-500">
                            <span className="font-semibold text-gray-900">{count}</span>
                            <span className="text-xs">({pct}%)</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ── Trend chart ───────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Performance Trends</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Score over time for the selected period</p>
                </div>
                <select
                  className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
                  value={selectedMetric}
                  onChange={e => setSelectedMetric(e.target.value)}
                >
                  {metricOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {trendLoading
                ? <Skeleton className="h-56 w-full" />
                : trendChartData.length === 0
                  ? <div className="flex items-center justify-center h-56 text-gray-400 text-sm gap-2"><AlertCircle className="h-5 w-5" /> No trend data for this period</div>
                  : <ResponsiveContainer width="100%" height={240}>
                      <AreaChart data={trendChartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                        <defs>
                          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor={AREA_COLOR} stopOpacity={0.2} />
                            <stop offset="95%" stopColor={AREA_COLOR} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} domain={[0, 100]} />
                        <Tooltip
                          contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                          formatter={(v: number) => [`${v.toFixed(1)}`, metricOptions.find(o => o.value === selectedMetric)?.label]}
                        />
                        <Area
                          type="monotone"
                          dataKey={selectedMetric}
                          stroke={AREA_COLOR}
                          strokeWidth={2.5}
                          fill="url(#areaGrad)"
                          dot={{ r: 3, fill: AREA_COLOR }}
                          activeDot={{ r: 5 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
              }
            </div>

            {/* ── Top performers + Recent activity ──────────────────────── */}
            <div className="grid lg:grid-cols-2 gap-6">

              {/* Top performers */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-base font-semibold text-gray-900">Top Performers</h3>
                  <Star className="h-4 w-4 text-amber-400" />
                </div>
                {isLoading
                  ? <div className="space-y-4">{[...Array(5)].map((_, i) => <div key={i} className="flex items-center gap-3"><Skeleton className="h-9 w-9 rounded-full" /><div className="flex-1 space-y-1"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div><Skeleton className="h-4 w-12" /></div>)}</div>
                  : (analytics.top_performers ?? []).length === 0
                    ? <p className="text-sm text-gray-400 text-center py-8">No performer data yet</p>
                    : <div className="space-y-3">
                        {(analytics.top_performers ?? []).map((s: any, i: number) => {
                          const medals = ['🥇', '🥈', '🥉']
                          const g = grade(s.average_score)
                          return (
                            <div key={s.student_id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 transition-colors">
                              <div className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold ${
                                i < 3 ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'
                              }`}>
                                {i < 3 ? medals[i] : i + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{s.student_name}</p>
                                <p className="text-xs text-gray-400">{s.total_interviews} interview{s.total_interviews !== 1 ? 's' : ''}</p>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${g.bg} ${g.color}`}>{g.label}</span>
                                <span className="text-sm font-bold text-gray-900">{s.average_score.toFixed(1)}%</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                }
              </div>

              {/* Recent activity */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-base font-semibold text-gray-900">Recent Activity</h3>
                  <Activity className="h-4 w-4 text-indigo-400" />
                </div>
                {isLoading
                  ? <div className="space-y-4">{[...Array(5)].map((_, i) => <div key={i} className="flex gap-3"><Skeleton className="h-2 w-2 rounded-full mt-2 flex-shrink-0" /><div className="flex-1 space-y-1"><Skeleton className="h-4 w-full" /><Skeleton className="h-3 w-2/3" /></div></div>)}</div>
                  : (analytics.recent_activities ?? []).length === 0
                    ? <p className="text-sm text-gray-400 text-center py-8">No recent activity</p>
                    : <div className="space-y-4">
                        {(analytics.recent_activities ?? []).map((a: any, i: number) => (
                          <div key={i} className="flex gap-3">
                            <div className="h-2 w-2 rounded-full bg-indigo-400 mt-2 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-800">{a.description}</p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {new Date(a.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                {' · '}
                                {new Date(a.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                }
              </div>
            </div>

            {/* ── Insights panel ────────────────────────────────────────── */}
            {!isLoading && (
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100 p-6">
                <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-indigo-600" /> Insights & Recommendations
                </h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-2">Performance Insights</p>
                    <ul className="text-sm text-gray-700 space-y-1.5">
                      <li className="flex gap-2"><ChevronRight className="h-4 w-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                        <span>{avgPerf > 75 ? 'Strong' : 'Moderate'} overall performance — average {avgPerf.toFixed(1)}%</span>
                      </li>
                      <li className="flex gap-2"><ChevronRight className="h-4 w-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                        <span>Technical skills are {(analytics.performance_breakdown?.technical ?? 0) > 70 ? 'above' : 'below'} the 70% benchmark</span>
                      </li>
                      <li className="flex gap-2"><ChevronRight className="h-4 w-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                        <span>Completion rate is {(analytics.completion_rate ?? 0) > 80 ? 'excellent' : 'needs attention'} at {(analytics.completion_rate ?? 0).toFixed(0)}%</span>
                      </li>
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-2">Recommendations</p>
                    <ul className="text-sm text-gray-700 space-y-1.5">
                      <li className="flex gap-2"><ChevronRight className="h-4 w-4 text-purple-400 flex-shrink-0 mt-0.5" />
                        <span>Focus on communication skills for higher interview scores</span>
                      </li>
                      <li className="flex gap-2"><ChevronRight className="h-4 w-4 text-purple-400 flex-shrink-0 mt-0.5" />
                        <span>Schedule more domain-specific interviews for technical roles</span>
                      </li>
                      <li className="flex gap-2"><ChevronRight className="h-4 w-4 text-purple-400 flex-shrink-0 mt-0.5" />
                        <span>Provide mock sessions for students scoring below 60%</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ══ REPORTS TAB ═══════════════════════════════════════════════════ */}
        {activeTab === 'reports' && (
          <>
            {/* Mode switcher */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600 font-medium">Report period:</span>
              <div className="flex bg-white border border-gray-200 rounded-lg p-1 gap-1">
                {(['weekly', 'monthly'] as ReportMode[]).map(m => (
                  <button
                    key={m}
                    onClick={() => setReportMode(m)}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                      reportMode === m
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Bar chart */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900">
                  {reportMode === 'weekly' ? 'Weekly' : 'Monthly'} Performance Report
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">Average interview score per {reportMode === 'weekly' ? 'week' : 'month'}</p>
              </div>

              {trendLoading
                ? <Skeleton className="h-56 w-full" />
                : reportRows.length === 0
                  ? <div className="flex items-center justify-center h-56 text-gray-400 text-sm gap-2"><AlertCircle className="h-5 w-5" /> Not enough data for {reportMode} report</div>
                  : <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={reportRows} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                        <XAxis dataKey="period" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} domain={[0, 100]} />
                        <Tooltip
                          contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                          formatter={(v: number) => [`${v.toFixed(1)}%`, 'Avg Score']}
                        />
                        <Bar dataKey="avg" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={56} />
                      </BarChart>
                    </ResponsiveContainer>
              }
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-base font-semibold text-gray-900">
                  {reportMode === 'weekly' ? 'Weekly' : 'Monthly'} Breakdown
                </h3>
              </div>
              {trendLoading
                ? <div className="p-6 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
                : reportRows.length === 0
                  ? <div className="flex items-center justify-center py-16 text-gray-400 text-sm gap-2"><AlertCircle className="h-5 w-5" /> No data available</div>
                  : <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                        <tr>
                          <th className="px-6 py-3 text-left">Period</th>
                          <th className="px-6 py-3 text-left">Avg Score</th>
                          <th className="px-6 py-3 text-left">Grade</th>
                          <th className="px-6 py-3 text-left">Bucket Days</th>
                          <th className="px-6 py-3 text-left">Trend</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {reportRows.map((row, i) => {
                          const prev = reportRows[i - 1]?.avg ?? null
                          const delta = prev !== null ? row.avg - prev : null
                          const g = grade(row.avg)
                          return (
                            <tr key={i} className="hover:bg-gray-50 transition-colors">
                              <td className="px-6 py-3.5 font-medium text-gray-900">{row.period}</td>
                              <td className="px-6 py-3.5">
                                <div className="flex items-center gap-3">
                                  <span className="font-semibold text-gray-900">{row.avg.toFixed(1)}%</span>
                                  <div className="w-24">
                                    <ScoreBar score={row.avg} color="bg-indigo-500" />
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-3.5">
                                <span className={`font-bold text-xs px-2 py-1 rounded ${g.bg} ${g.color}`}>{g.label}</span>
                              </td>
                              <td className="px-6 py-3.5 text-gray-500">{row.count} day{row.count !== 1 ? 's' : ''}</td>
                              <td className="px-6 py-3.5">
                                {delta !== null ? <Trend val={delta} /> : <span className="text-gray-300 text-xs">—</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
              }
            </div>

            {/* Summary cards for reports tab */}
            {!trendLoading && reportRows.length > 0 && (() => {
              const avg = reportRows.reduce((s, r) => s + r.avg, 0) / reportRows.length
              const best = reportRows.reduce((a, b) => a.avg > b.avg ? a : b)
              const worst = reportRows.reduce((a, b) => a.avg < b.avg ? a : b)
              return (
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'Period Average', val: avg, sub: `across ${reportRows.length} ${reportMode === 'weekly' ? 'weeks' : 'months'}` },
                    { label: 'Best Period',    val: best.avg, sub: best.period },
                    { label: 'Lowest Period',  val: worst.avg, sub: worst.period },
                  ].map((c, i) => {
                    const g = grade(c.val)
                    return (
                      <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                        <p className="text-xs text-gray-500 mb-1">{c.label}</p>
                        <div className="flex items-end gap-2">
                          <span className="text-2xl font-bold text-gray-900">{c.val.toFixed(1)}%</span>
                          <span className={`text-sm font-bold px-1.5 py-0.5 rounded mb-0.5 ${g.bg} ${g.color}`}>{g.label}</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">{c.sub}</p>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </>
        )}
      </div>
      <Footer />
    </div>
  )
}

export default AdminAnalytics
