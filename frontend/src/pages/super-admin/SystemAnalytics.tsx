import { useState, useMemo } from 'react'
import Footer from '../../components/Footer'
import { useQuery } from '@tanstack/react-query'
import {
  Users,
  Calendar,
  Award,
  BarChart3,
  ArrowLeft,
  Download,
  TrendingUp,
  TrendingDown,
  Minus,
  Star,
  Activity,
  AlertCircle,
  Building2,
  ChevronRight,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { superAdminApi } from '../../utils/api'
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

// ─── Colours ──────────────────────────────────────────────────────────────────
const PIE_COLORS  = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']
const BAR_COLORS  = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']
const AREA_COLOR  = '#6366f1'

// ─── Grade helper ─────────────────────────────────────────────────────────────
function gradeOf(score: number) {
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

// ─── Pie label ────────────────────────────────────────────────────────────────
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
    weeks[key].values.push(t.avg_score ?? 0)
    weeks[key].count += t.interview_count ?? 1
  })
  return Object.entries(weeks).slice(-8).map(([, v]) => ({
    period: v.label,
    avg:    v.values.reduce((a, b) => a + b, 0) / (v.values.length || 1),
    count:  v.count,
  }))
}

function buildMonthlyRows(trends: any[]) {
  const months: Record<string, { label: string; values: number[]; count: number }> = {}
  trends.forEach(t => {
    const d = new Date(t.date)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    if (!months[key]) months[key] = { label, values: [], count: 0 }
    months[key].values.push(t.avg_score ?? 0)
    months[key].count += t.interview_count ?? 1
  })
  return Object.entries(months).slice(-12).map(([, v]) => ({
    period: v.label,
    avg:    v.values.reduce((a, b) => a + b, 0) / (v.values.length || 1),
    count:  v.count,
  }))
}

// ═══════════════════════════════════════════════════════════════════════════════
const SystemAnalytics = () => {
  const [dateRange, setDateRange]   = useState('30')
  const [activeTab, setActiveTab]   = useState<'overview' | 'departments' | 'reports'>('overview')
  const [reportMode, setReportMode] = useState<ReportMode>('weekly')

  const { data: rawData, isLoading } = useQuery({
    queryKey: ['college-performance', dateRange],
    queryFn:  () => superAdminApi.getCollegePerformance({ days: parseInt(dateRange) }),
  })

  const data            = rawData?.data ?? {}
  const summary         = data.summary ?? {}
  const adminPerf: any[] = data.admin_performance ?? []
  const topDept         = data.top_department ?? null
  const scoreDist: any[] = data.score_distribution ?? []
  const typeDist: any[]  = data.interview_type_distribution ?? []
  const trends: any[]    = data.trends ?? []

  // ── Derived ──────────────────────────────────────────────────────────────────
  const trendChartData = useMemo(() =>
    trends.map(t => ({
      ...t,
      label: new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    })),
  [trends])

  const weeklyRows  = useMemo(() => buildWeeklyRows(trends),  [trends])
  const monthlyRows = useMemo(() => buildMonthlyRows(trends), [trends])
  const reportRows  = reportMode === 'weekly' ? weeklyRows : monthlyRows

  const avgScore  = summary.avg_score ?? 0
  const perfGrade = gradeOf(avgScore)

  const typeTotal = typeDist.reduce((s: number, t: any) => s + (t.count ?? 0), 0)

  // Sort admin list by avg_score desc for the departments tab
  const sortedAdmins = useMemo(
    () => [...adminPerf].sort((a, b) => b.avg_score - a.avg_score),
    [adminPerf]
  )

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* ── Top Bar ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link to="/super-admin" className="flex items-center text-gray-500 hover:text-gray-700 text-sm gap-1">
                <ArrowLeft className="h-4 w-4" /> Back
              </Link>
              <div className="h-5 w-px bg-gray-300" />
              <h1 className="text-xl font-bold text-gray-900">College Analytics</h1>
            </div>

            <div className="flex items-center gap-3">
              {/* Tab switcher */}
              <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
                {(['overview', 'departments', 'reports'] as const).map(t => (
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
            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { title: 'Total Departments', value: summary.total_admins   ?? 0, icon: Building2, iconBg: 'bg-indigo-100',  iconColor: 'text-indigo-600',  suffix: '' },
                { title: 'Total Students',    value: summary.total_students ?? 0, icon: Users,     iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', suffix: '' },
                { title: 'Interviews Done',   value: summary.total_interviews ?? 0, icon: Calendar, iconBg: 'bg-amber-100',   iconColor: 'text-amber-600',   suffix: '' },
                { title: 'Completion Rate',   value: (summary.completion_rate ?? 0).toFixed(1), icon: Activity, iconBg: 'bg-rose-100', iconColor: 'text-rose-600', suffix: '%' },
              ].map((card, i) => {
                const Icon = card.icon
                return (
                  <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className={`p-2.5 rounded-xl ${card.iconBg}`}>
                        <Icon className={`h-5 w-5 ${card.iconColor}`} />
                      </div>
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

            {/* Grade banner + top department */}
            {!isLoading && avgScore > 0 && (
              <div className="grid md:grid-cols-2 gap-4">
                <div className={`rounded-2xl border p-4 flex items-center gap-4 ${perfGrade.bg} border-transparent`}>
                  <div className={`text-3xl font-black ${perfGrade.color} w-12 text-center`}>{perfGrade.label}</div>
                  <div>
                    <p className="font-semibold text-gray-800">College Overall Grade</p>
                    <p className="text-sm text-gray-600">
                      Average score of <strong>{avgScore.toFixed(1)}</strong> across {summary.total_interviews ?? 0} completed interviews
                    </p>
                  </div>
                </div>

                {topDept && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-center gap-4">
                    <Star className="h-8 w-8 text-amber-500 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-gray-800">Top Department</p>
                      <p className="text-lg font-bold text-amber-700">{topDept.department}</p>
                      <p className="text-sm text-gray-600">
                        {topDept.admin_name} · avg {topDept.avg_score.toFixed(1)} · {topDept.interview_count} interviews
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Bar chart: avg score per department + Pie: interview types */}
            <div className="grid lg:grid-cols-2 gap-6">

              {/* Department bar chart */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h3 className="text-base font-semibold text-gray-900 mb-1">Avg Score by Department</h3>
                <p className="text-xs text-gray-500 mb-4">{adminPerf.length} department{adminPerf.length !== 1 ? 's' : ''}</p>

                {isLoading
                  ? <Skeleton className="h-56 w-full" />
                  : adminPerf.length === 0
                    ? <div className="flex flex-col items-center justify-center h-56 text-gray-400 gap-2">
                        <AlertCircle className="h-8 w-8" />
                        <p className="text-sm">No department data yet</p>
                      </div>
                    : <ResponsiveContainer width="100%" height={240}>
                        <BarChart
                          data={adminPerf.map(a => ({
                            dept:  a.department,
                            score: a.avg_score,
                          }))}
                          margin={{ top: 5, right: 10, left: -10, bottom: 20 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                          <XAxis dataKey="dept" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} angle={-20} textAnchor="end" />
                          <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} domain={[0, 100]} />
                          <Tooltip
                            contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                            formatter={(v: number) => [`${v.toFixed(1)}`, 'Avg Score']}
                          />
                          <Bar dataKey="score" radius={[4, 4, 0, 0]} maxBarSize={56}>
                            {adminPerf.map((_, idx) => (
                              <Cell key={idx} fill={BAR_COLORS[idx % BAR_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                }
              </div>

              {/* Interview type pie chart */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h3 className="text-base font-semibold text-gray-900 mb-1">Interview Type Distribution</h3>
                <p className="text-xs text-gray-500 mb-4">{typeTotal} total across all departments</p>

                {isLoading
                  ? <div className="flex items-center justify-center h-56"><Skeleton className="h-40 w-40 rounded-full" /></div>
                  : typeDist.length === 0
                    ? <div className="flex flex-col items-center justify-center h-56 text-gray-400 gap-2">
                        <AlertCircle className="h-8 w-8" />
                        <p className="text-sm">No interview data yet</p>
                      </div>
                    : <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie
                            data={typeDist.map(t => ({ name: t.type.replace(/_/g, ' '), value: t.count }))}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={90}
                            paddingAngle={3}
                            dataKey="value"
                            labelLine={false}
                            label={renderPieLabel}
                          >
                            {typeDist.map((_, idx) => (
                              <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(val: number, name: string) => [
                            `${val} (${typeTotal ? ((val / typeTotal) * 100).toFixed(1) : 0}%)`, name,
                          ]} />
                          <Legend iconType="circle" iconSize={8} />
                        </PieChart>
                      </ResponsiveContainer>
                }

                {/* Score distribution under pie */}
                {!isLoading && scoreDist.some(s => s.count > 0) && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Grade Distribution</p>
                    <div className="flex gap-2 flex-wrap">
                      {scoreDist.map((s: any) => {
                        const g = gradeOf(
                          s.grade === 'A+' ? 95 : s.grade === 'A' ? 85 : s.grade === 'B' ? 75 :
                          s.grade === 'C' ? 65 : s.grade === 'D' ? 55 : 30
                        )
                        return s.count > 0 ? (
                          <span key={s.grade} className={`text-xs font-bold px-2 py-1 rounded ${g.bg} ${g.color}`}>
                            {s.grade}: {s.count}
                          </span>
                        ) : null
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Trend chart */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="mb-5">
                <h3 className="text-base font-semibold text-gray-900">Score Trend Over Time</h3>
                <p className="text-xs text-gray-500 mt-0.5">College-wide average score per day</p>
              </div>

              {isLoading
                ? <Skeleton className="h-56 w-full" />
                : trendChartData.length === 0
                  ? <div className="flex items-center justify-center h-56 text-gray-400 text-sm gap-2">
                      <AlertCircle className="h-5 w-5" /> No trend data for this period
                    </div>
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
                          formatter={(v: number) => [`${v.toFixed(1)}`, 'Avg Score']}
                        />
                        <Area
                          type="monotone"
                          dataKey="avg_score"
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

            {/* Insights */}
            {!isLoading && (
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100 p-6">
                <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-indigo-600" /> Insights & Recommendations
                </h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-2">Performance Insights</p>
                    <ul className="text-sm text-gray-700 space-y-1.5">
                      <li className="flex gap-2">
                        <ChevronRight className="h-4 w-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                        <span>{avgScore > 75 ? 'Strong' : avgScore > 50 ? 'Moderate' : 'Needs improvement'} college-wide performance — average {avgScore.toFixed(1)}</span>
                      </li>
                      <li className="flex gap-2">
                        <ChevronRight className="h-4 w-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                        <span>Completion rate is {(summary.completion_rate ?? 0) > 80 ? 'excellent' : 'needs attention'} at {(summary.completion_rate ?? 0).toFixed(0)}%</span>
                      </li>
                      {topDept && (
                        <li className="flex gap-2">
                          <ChevronRight className="h-4 w-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                          <span>{topDept.department} is the leading department with avg {topDept.avg_score.toFixed(1)}</span>
                        </li>
                      )}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-2">Recommendations</p>
                    <ul className="text-sm text-gray-700 space-y-1.5">
                      <li className="flex gap-2">
                        <ChevronRight className="h-4 w-4 text-purple-400 flex-shrink-0 mt-0.5" />
                        <span>Departments with low avg scores should increase practice frequency</span>
                      </li>
                      <li className="flex gap-2">
                        <ChevronRight className="h-4 w-4 text-purple-400 flex-shrink-0 mt-0.5" />
                        <span>Share best practices from the top-performing department</span>
                      </li>
                      <li className="flex gap-2">
                        <ChevronRight className="h-4 w-4 text-purple-400 flex-shrink-0 mt-0.5" />
                        <span>Prioritise scheduled interview sessions for departments with 0 students</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ══ DEPARTMENTS TAB ═══════════════════════════════════════════════ */}
        {activeTab === 'departments' && (
          <>
            {/* Multi-metric bar: technical / communication / confidence */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className="text-base font-semibold text-gray-900 mb-1">Skill Breakdown by Department</h3>
              <p className="text-xs text-gray-500 mb-5">Technical · Communication · Confidence averages</p>

              {isLoading
                ? <Skeleton className="h-64 w-full" />
                : adminPerf.length === 0
                  ? <div className="flex items-center justify-center h-56 text-gray-400 text-sm gap-2"><AlertCircle className="h-5 w-5" /> No data yet</div>
                  : <ResponsiveContainer width="100%" height={280}>
                      <BarChart
                        data={adminPerf.map(a => ({
                          dept:    a.department,
                          Technical:     a.technical_avg,
                          Communication: a.communication_avg,
                          Confidence:    a.confidence_avg,
                        }))}
                        margin={{ top: 5, right: 10, left: -10, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                        <XAxis dataKey="dept" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} angle={-15} textAnchor="end" />
                        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} domain={[0, 100]} />
                        <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} formatter={(v: number) => v.toFixed(1)} />
                        <Legend iconType="circle" iconSize={8} />
                        <Bar dataKey="Technical"     fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={20} />
                        <Bar dataKey="Communication" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={20} />
                        <Bar dataKey="Confidence"    fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
              }
            </div>

            {/* Per-admin detail table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-900">Department Leaderboard</h3>
                <BarChart3 className="h-4 w-4 text-gray-400" />
              </div>

              {isLoading
                ? <div className="p-6 space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                : sortedAdmins.length === 0
                  ? <div className="flex items-center justify-center py-16 text-gray-400 text-sm gap-2"><AlertCircle className="h-5 w-5" /> No department data</div>
                  : <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                        <tr>
                          <th className="px-5 py-3 text-left">Rank</th>
                          <th className="px-5 py-3 text-left">Department</th>
                          <th className="px-5 py-3 text-left">Admin</th>
                          <th className="px-5 py-3 text-center">Students</th>
                          <th className="px-5 py-3 text-center">Interviews</th>
                          <th className="px-5 py-3 text-left">Avg Score</th>
                          <th className="px-5 py-3 text-center">Grade</th>
                          <th className="px-5 py-3 text-left">Technical</th>
                          <th className="px-5 py-3 text-left">Comm.</th>
                          <th className="px-5 py-3 text-left">Confidence</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {sortedAdmins.map((a: any, i: number) => {
                          const g = gradeOf(a.avg_score)
                          const medals = ['🥇', '🥈', '🥉']
                          return (
                            <tr key={a.admin_id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-5 py-3 font-bold text-gray-500 text-base">
                                {i < 3 ? medals[i] : i + 1}
                              </td>
                              <td className="px-5 py-3 font-semibold text-gray-900">{a.department}</td>
                              <td className="px-5 py-3 text-gray-600">
                                <div className="text-xs text-gray-400">{a.admin_id}</div>
                                {a.admin_name}
                              </td>
                              <td className="px-5 py-3 text-center text-gray-700">{a.student_count}</td>
                              <td className="px-5 py-3 text-center text-gray-700">{a.interview_count}</td>
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-gray-900 w-10">{a.avg_score.toFixed(1)}</span>
                                  <div className="w-20">
                                    <ScoreBar score={a.avg_score} color="bg-indigo-500" />
                                  </div>
                                </div>
                              </td>
                              <td className="px-5 py-3 text-center">
                                <span className={`text-xs font-bold px-2 py-1 rounded ${g.bg} ${g.color}`}>{g.label}</span>
                              </td>
                              <td className="px-5 py-3 text-gray-600">{a.technical_avg.toFixed(1)}</td>
                              <td className="px-5 py-3 text-gray-600">{a.communication_avg.toFixed(1)}</td>
                              <td className="px-5 py-3 text-gray-600">{a.confidence_avg.toFixed(1)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
              }
            </div>
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
                <p className="text-xs text-gray-500 mt-0.5">College-wide average score per {reportMode === 'weekly' ? 'week' : 'month'}</p>
              </div>

              {isLoading
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
                          formatter={(v: number) => [`${v.toFixed(1)}`, 'Avg Score']}
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

              {isLoading
                ? <div className="p-6 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
                : reportRows.length === 0
                  ? <div className="flex items-center justify-center py-16 text-gray-400 text-sm gap-2"><AlertCircle className="h-5 w-5" /> No data available</div>
                  : <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                        <tr>
                          <th className="px-6 py-3 text-left">Period</th>
                          <th className="px-6 py-3 text-left">Avg Score</th>
                          <th className="px-6 py-3 text-left">Grade</th>
                          <th className="px-6 py-3 text-left">Interviews</th>
                          <th className="px-6 py-3 text-left">Trend</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {reportRows.map((row, i) => {
                          const prev  = reportRows[i - 1]?.avg ?? null
                          const delta = prev !== null ? row.avg - prev : null
                          const g     = gradeOf(row.avg)
                          return (
                            <tr key={i} className="hover:bg-gray-50 transition-colors">
                              <td className="px-6 py-3.5 font-medium text-gray-900">{row.period}</td>
                              <td className="px-6 py-3.5">
                                <div className="flex items-center gap-3">
                                  <span className="font-semibold text-gray-900">{row.avg.toFixed(1)}</span>
                                  <div className="w-24"><ScoreBar score={row.avg} color="bg-indigo-500" /></div>
                                </div>
                              </td>
                              <td className="px-6 py-3.5">
                                <span className={`font-bold text-xs px-2 py-1 rounded ${g.bg} ${g.color}`}>{g.label}</span>
                              </td>
                              <td className="px-6 py-3.5 text-gray-500">{row.count}</td>
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

            {/* Summary cards */}
            {!isLoading && reportRows.length > 0 && (() => {
              const avg   = reportRows.reduce((s, r) => s + r.avg, 0) / reportRows.length
              const best  = reportRows.reduce((a, b) => a.avg > b.avg ? a : b)
              const worst = reportRows.reduce((a, b) => a.avg < b.avg ? a : b)
              return (
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'Period Average', val: avg,      sub: `across ${reportRows.length} ${reportMode === 'weekly' ? 'weeks' : 'months'}` },
                    { label: 'Best Period',    val: best.avg, sub: best.period },
                    { label: 'Lowest Period',  val: worst.avg,sub: worst.period },
                  ].map((c, i) => {
                    const g = gradeOf(c.val)
                    return (
                      <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                        <p className="text-xs text-gray-500 mb-1">{c.label}</p>
                        <div className="flex items-end gap-2">
                          <span className="text-2xl font-bold text-gray-900">{c.val.toFixed(1)}</span>
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

export default SystemAnalytics
