import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Users, Building, BarChart3, Shield, Settings,
  TrendingUp, AlertTriangle, LogOut, Activity,
  ArrowUpRight, Wifi, Clock, CheckCircle2, XCircle,
  AlertCircle, Zap, ChevronRight, Server, Star,
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { superAdminApi } from '../../utils/api'

/* ══════════════════════════════════════════
   HOOKS
══════════════════════════════════════════ */
function useCounter(target: number, duration = 1400) {
  const [val, setVal] = useState(0)
  const raf = useRef<number>(0)
  useEffect(() => {
    if (target === 0) { setVal(0); return }
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1)
      const ease = 1 - Math.pow(1 - p, 4)
      setVal(Math.round(ease * target))
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target, duration])
  return val
}

/* ══════════════════════════════════════════
   TINY SPARKLINE
══════════════════════════════════════════ */
function Sparkline({ color = '#10b981', up = true }: { color?: string; up?: boolean }) {
  const pts = up
    ? [30, 45, 38, 55, 48, 62, 58, 72, 65, 80]
    : [80, 65, 72, 58, 62, 48, 55, 38, 45, 30]
  const w = 80; const h = 32
  const min = Math.min(...pts); const max = Math.max(...pts)
  const coords = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * w
    const y = h - ((v - min) / (max - min + 1)) * h
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      <polyline points={coords} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ══════════════════════════════════════════
   DONUT
══════════════════════════════════════════ */
function Donut({ pct, color, size = 56 }: { pct: number; color: string; size?: number }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="#f1f5f9" strokeWidth="6" fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        stroke={color} strokeWidth="6" fill="none"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 1s ease' }}
      />
    </svg>
  )
}

/* ══════════════════════════════════════════
   SKELETON
══════════════════════════════════════════ */
const Sk = ({ className = '' }: { className?: string }) => (
  <div className={`animate-pulse rounded-xl bg-gray-100 ${className}`} />
)

/* ══════════════════════════════════════════
   HELPERS
══════════════════════════════════════════ */
const initials = (name?: string) =>
  name ? name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) : 'SA'

const avatarGradients = [
  'from-blue-400 to-blue-600',
  'from-violet-400 to-violet-600',
  'from-emerald-400 to-emerald-600',
  'from-rose-400 to-rose-600',
  'from-amber-400 to-amber-600',
]

/* ══════════════════════════════════════════
   MAIN
══════════════════════════════════════════ */
export default function SuperAdminDashboard() {
  const { user, logout } = useAuthStore()

  const { data: dashboardData } = useQuery({ queryKey: ['super-admin-dashboard'], queryFn: superAdminApi.getDashboardOverview })
  const { data: collegesData, isLoading: collegesLoading } = useQuery({ queryKey: ['super-admin-colleges'], queryFn: superAdminApi.getAllColleges })
  const { data: adminsData, isLoading: adminsLoading } = useQuery({ queryKey: ['super-admin-admins'], queryFn: superAdminApi.getAllAdmins })
  const { data: sysData } = useQuery({ queryKey: ['super-admin-system-stats'], queryFn: superAdminApi.getSystemStatistics })

  const d   = dashboardData?.data || {}
  const sys = sysData?.data || {}
  const colleges     = collegesData?.data?.slice(0, 5) || []
  const recentAdmins = adminsData?.data?.slice(0, 4) || []

  /* animated counters */
  const cColleges   = useCounter(d.total_colleges   || 0)
  const cStudents   = useCounter(d.total_students   || 0)
  const cInterviews = useCounter(d.total_interviews || 0)
  const cAdmins     = useCounter(d.active_admins    || 0)

  const successRate = parseFloat((sys.interview_success_rate || 0).toFixed(1))
  const platformScore = parseFloat((sys.platform_score || 0).toFixed(1))
  const responseTime  = sys.avg_response_time != null ? `${sys.avg_response_time}ms` : '—'
  const criticalIssues   = sys.critical_issues || 0
  const malpractice      = sys.pending_malpractice || 0
  const warnings         = sys.system_warnings || 0
  const serverUptime     = sys.server_uptime != null ? `${sys.server_uptime}%` : '—'

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #f0f4ff 0%, #fafafa 50%, #f5f0ff 100%)' }}>

      {/* ══ NAV ══ */}
      <nav
        className="sticky top-0 z-50 flex items-center justify-between px-4 sm:px-6 lg:px-10 h-[60px]"
        style={{
          background: 'rgba(255,255,255,0.72)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
        }}
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #2563eb, #7c3aed)' }}
          >
            <Zap className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-[15px] font-bold text-gray-900 tracking-tight">MockMentorBiz</span>
          <span
            className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
            style={{ background: '#ede9fe', color: '#7c3aed' }}
          >
            Super Admin
          </span>
        </div>

        {/* Right */}
        <div className="flex items-center gap-4">
          <span className="hidden lg:block text-xs text-gray-400">{today}</span>
          <div className="h-4 w-px bg-gray-200" />
          <div className="flex items-center gap-2">
            <div
              className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shadow-sm"
              style={{ background: 'linear-gradient(135deg, #2563eb, #7c3aed)' }}
            >
              {initials(user?.full_name)}
            </div>
            <div className="hidden sm:block">
              <p className="text-[13px] font-semibold text-gray-800 leading-none">{user?.full_name || 'Super Admin'}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">System Administrator</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-[12px] font-medium text-gray-400 hover:text-red-500 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-red-50"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </nav>

      {/* ══ CONTENT ══ */}
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-10 py-8">

        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">Dashboard</p>
            <h1 className="text-[28px] font-bold text-gray-900 tracking-tight leading-none">System Overview</h1>
          </div>
          <div
            className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full self-start sm:self-auto"
            style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            All systems operational
          </div>
        </div>

        {/* ══ BENTO GRID ══ */}
        {/* Row 1: 4 stat tiles + 1 wide health panel */}
        <div className="grid grid-cols-12 gap-4 mb-4">

          {/* Stat: Colleges */}
          <BentoStatCard
            className="col-span-6 sm:col-span-3"
            label="Total Colleges"
            value={cColleges}
            icon={Building}
            trend={+4}
            accentColor="#2563eb"
            accentLight="#dbeafe"
            sparkColor="#3b82f6"
          />

          {/* Stat: Students */}
          <BentoStatCard
            className="col-span-6 sm:col-span-3"
            label="Total Students"
            value={cStudents}
            icon={Users}
            trend={+12}
            accentColor="#059669"
            accentLight="#d1fae5"
            sparkColor="#10b981"
          />

          {/* Stat: Interviews */}
          <BentoStatCard
            className="col-span-6 sm:col-span-3"
            label="Total Interviews"
            value={cInterviews}
            icon={Activity}
            trend={+8}
            accentColor="#7c3aed"
            accentLight="#ede9fe"
            sparkColor="#8b5cf6"
          />

          {/* Stat: Active Admins */}
          <BentoStatCard
            className="col-span-6 sm:col-span-3"
            label="Active Admins"
            value={cAdmins}
            icon={Shield}
            accentColor="#d97706"
            accentLight="#fef3c7"
            sparkColor="#f59e0b"
          />
        </div>

        {/* Row 2: Success Rate (wide) + Platform Score + Alerts + Health */}
        <div className="grid grid-cols-12 gap-4 mb-4">

          {/* Success Rate — wide bento tile */}
          <div
            className="col-span-12 sm:col-span-5 rounded-2xl p-6 flex flex-col justify-between"
            style={{
              background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
              boxShadow: '0 20px 60px rgba(15,23,42,0.18)',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-blue-300 mb-1">Platform Performance</p>
                <h3 className="text-white text-[15px] font-semibold">Interview Success Rate</h3>
              </div>
              <div className="flex items-center gap-1 text-emerald-400 text-xs font-semibold bg-emerald-400/10 px-2 py-1 rounded-full">
                <TrendingUp className="h-3 w-3" />
                Live
              </div>
            </div>

            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[52px] font-black text-white leading-none tabular-nums tracking-tight">
                  {successRate}<span className="text-2xl text-blue-300 font-bold ml-1">%</span>
                </p>
                <p className="text-blue-300 text-xs mt-2">
                  {sys.daily_interviews || 0} interviews today
                </p>
              </div>
              {/* Radial ring */}
              <div className="relative flex-shrink-0">
                <Donut pct={successRate} color="#3b82f6" size={80} />
                <span
                  className="absolute inset-0 flex items-center justify-center text-[13px] font-bold text-white tabular-nums"
                  style={{ transform: 'none' }}
                >
                  {successRate}%
                </span>
              </div>
            </div>

            {/* Mini bar */}
            <div className="mt-5">
              <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{
                    width: `${Math.min(successRate, 100)}%`,
                    background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                  }}
                />
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-[10px] text-blue-400">0%</span>
                <span className="text-[10px] text-blue-400">100%</span>
              </div>
            </div>
          </div>

          {/* Platform Score */}
          <div
            className="col-span-6 sm:col-span-3 rounded-2xl p-4 sm:p-5 flex flex-col justify-between"
            style={{ background: '#fff', border: '1px solid #f1f5f9', boxShadow: '0 4px 24px rgba(0,0,0,0.05)' }}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Platform Score</p>
              <Star className="h-4 w-4 text-amber-400" />
            </div>
            <div className="flex flex-col items-center justify-center flex-1 py-4">
              <div className="relative">
                <Donut pct={(platformScore / 10) * 100} color="#f59e0b" size={72} />
                <span className="absolute inset-0 flex items-center justify-center text-[15px] font-black text-gray-900 tabular-nums">
                  {platformScore}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-2">out of 10</p>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">Response</span>
              <span className="font-semibold text-gray-700 tabular-nums">{responseTime}</span>
            </div>
          </div>

          {/* Alerts */}
          <div
            className="col-span-6 sm:col-span-4 rounded-2xl p-4 sm:p-5 flex flex-col"
            style={{ background: '#fff', border: '1px solid #f1f5f9', boxShadow: '0 4px 24px rgba(0,0,0,0.05)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Alerts</p>
              <AlertTriangle className="h-4 w-4 text-amber-400" />
            </div>

            <div className="space-y-2 flex-1">
              <AlertTile label="Critical Issues"     value={criticalIssues} severity="critical" />
              <AlertTile label="Malpractice Reports" value={malpractice}    severity="warning" />
              <AlertTile label="System Warnings"     value={warnings}       severity="info" />
            </div>

            <div className="mt-4 pt-3 border-t border-gray-50">
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                Server uptime <span className="ml-auto font-semibold text-emerald-600">{serverUptime}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Row 3: Management modules — bento 2×2 + sidebar */}
        <div className="grid grid-cols-12 gap-4 mb-4">

          {/* Management header */}
          <div className="col-span-12">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3">Management</p>
          </div>

          {/* Module: College */}
          <NavTile
            className="col-span-6 lg:col-span-3"
            title="College Management"
            desc="Onboard and configure institutions"
            icon={Building}
            path="/super-admin/colleges"
            count={d.total_colleges || 0}
            countLabel="Colleges"
            from="#dbeafe" to="#eff6ff"
            iconColor="#2563eb"
          />
          {/* Module: Admins */}
          <NavTile
            className="col-span-6 lg:col-span-3"
            title="Admin Management"
            desc="Oversee admins across colleges"
            icon={Users}
            path="/super-admin/admins"
            count={d.total_admins || 0}
            countLabel="Admins"
            from="#d1fae5" to="#f0fdf4"
            iconColor="#059669"
          />
          {/* Module: Analytics */}
          <NavTile
            className="col-span-6 lg:col-span-3"
            title="Performance Analytics"
            desc="College-wide trends and insights"
            icon={BarChart3}
            path="/super-admin/analytics"
            from="#ede9fe" to="#f5f3ff"
            iconColor="#7c3aed"
          />
          {/* Module: Settings */}
          <NavTile
            className="col-span-6 lg:col-span-3"
            title="System Settings"
            desc="Security and platform config"
            icon={Settings}
            path="/super-admin/settings"
            from="#fef3c7" to="#fffbeb"
            iconColor="#d97706"
          />
        </div>

        {/* Row 4: Colleges table + Admins table */}
        <div className="grid grid-cols-12 gap-4 pb-10">

          {/* Top Colleges */}
          <div
            className="col-span-12 lg:col-span-7 rounded-2xl overflow-hidden"
            style={{ background: '#fff', border: '1px solid #f1f5f9', boxShadow: '0 4px 24px rgba(0,0,0,0.05)' }}
          >
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #f8fafc' }}>
              <div>
                <h3 className="text-[14px] font-semibold text-gray-900">Top Performing Colleges</h3>
                <p className="text-xs text-gray-400 mt-0.5">Ranked by average performance score</p>
              </div>
              <Link
                to="/super-admin/colleges"
                className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-full"
              >
                View all <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="px-4 py-3">
              {collegesLoading ? (
                <div className="space-y-3 p-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Sk className="h-8 w-8 rounded-full flex-shrink-0" />
                      <div className="flex-1 space-y-2"><Sk className="h-3 w-3/4" /><Sk className="h-2.5 w-1/2" /></div>
                      <Sk className="h-5 w-16 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : colleges.length > 0 ? (
                <div>
                  {/* Table header */}
                  <div className="grid grid-cols-12 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    <span className="col-span-1">#</span>
                    <span className="col-span-5">Institution</span>
                    <span className="col-span-2 text-right">Students</span>
                    <span className="col-span-2 text-right">Interviews</span>
                    <span className="col-span-2 text-right">Score</span>
                  </div>
                  {colleges.map((college: any, i: number) => {
                    const perf = parseFloat(college.average_performance?.toFixed(1) || '0')
                    const scoreColor = perf >= 70 ? '#10b981' : perf >= 40 ? '#f59e0b' : '#ef4444'
                    const rankBg = i === 0 ? '#fef3c7' : i === 1 ? '#f1f5f9' : i === 2 ? '#fee2e2' : '#f8fafc'
                    const rankColor = i === 0 ? '#92400e' : i === 1 ? '#475569' : i === 2 ? '#9f1239' : '#94a3b8'
                    return (
                      <Link
                        key={college.college_id}
                        to={`/super-admin/colleges/${college.college_id}`}
                        className="grid grid-cols-12 items-center px-3 py-3 rounded-xl hover:bg-slate-50 transition-colors group"
                      >
                        <span
                          className="col-span-1 h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-black"
                          style={{ background: rankBg, color: rankColor }}
                        >
                          {i + 1}
                        </span>
                        <div className="col-span-5">
                          <p className="text-[13px] font-semibold text-gray-800 group-hover:text-blue-600 transition-colors truncate pr-2">
                            {college.college_name}
                          </p>
                          <p className="text-[11px] text-gray-400">{college.total_admins} admins</p>
                        </div>
                        <span className="col-span-2 text-right text-[13px] font-medium text-gray-700 tabular-nums">
                          {college.total_students?.toLocaleString() || 0}
                        </span>
                        <span className="col-span-2 text-right text-[13px] font-medium text-gray-700 tabular-nums">
                          {college.total_interviews?.toLocaleString() || 0}
                        </span>
                        <div className="col-span-2 flex justify-end items-center gap-1.5">
                          <span
                            className="text-[13px] font-bold tabular-nums"
                            style={{ color: scoreColor }}
                          >
                            {perf}%
                          </span>
                          <ChevronRight className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </Link>
                    )
                  })}
                </div>
              ) : (
                <EmptyState icon={Building} label="No colleges registered" cta="Add college" to="/super-admin/colleges" />
              )}
            </div>
          </div>

          {/* Recent Admins */}
          <div
            className="col-span-12 lg:col-span-5 rounded-2xl overflow-hidden"
            style={{ background: '#fff', border: '1px solid #f1f5f9', boxShadow: '0 4px 24px rgba(0,0,0,0.05)' }}
          >
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #f8fafc' }}>
              <div>
                <h3 className="text-[14px] font-semibold text-gray-900">Admin Activity</h3>
                <p className="text-xs text-gray-400 mt-0.5">Recently active administrators</p>
              </div>
              <Link
                to="/super-admin/admins"
                className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-full"
              >
                Manage <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="px-4 py-3">
              {adminsLoading ? (
                <div className="space-y-4 p-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Sk className="h-10 w-10 rounded-full flex-shrink-0" />
                      <div className="flex-1 space-y-2"><Sk className="h-3 w-2/3" /><Sk className="h-2.5 w-1/2" /></div>
                      <Sk className="h-5 w-16 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : recentAdmins.length > 0 ? (
                <div className="space-y-1">
                  {recentAdmins.map((admin: any, i: number) => {
                    const isActive = admin.status === 'active'
                    const lastLogin = admin.last_login
                      ? new Date(admin.last_login).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      : 'Never'
                    return (
                      <div
                        key={admin.admin_id}
                        className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 transition-colors"
                      >
                        <div
                          className={`h-9 w-9 rounded-full flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0 bg-gradient-to-br ${avatarGradients[i % avatarGradients.length]}`}
                          style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}
                        >
                          {initials(admin.full_name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-gray-800 truncate">{admin.full_name}</p>
                          <p className="text-[11px] text-gray-400 truncate">{admin.department} · {admin.college_name}</p>
                        </div>
                        <div className="flex-shrink-0 text-right space-y-1">
                          <span
                            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                            style={isActive
                              ? { background: '#dcfce7', color: '#15803d' }
                              : { background: '#f1f5f9', color: '#64748b' }
                            }
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                            {isActive ? 'Active' : 'Inactive'}
                          </span>
                          <p className="text-[11px] text-gray-400">{lastLogin}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <EmptyState icon={Users} label="No admins registered" cta="Add admin" to="/super-admin/admins" />
              )}
            </div>

            {/* Active sessions strip */}
            <div
              className="mx-4 mb-4 mt-1 flex items-center justify-between px-4 py-3 rounded-xl"
              style={{ background: 'linear-gradient(135deg, #f0f4ff, #f5f3ff)', border: '1px solid #e0e7ff' }}
            >
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-blue-500" />
                <span className="text-[12px] font-medium text-gray-600">Active Sessions</span>
              </div>
              <span className="text-[14px] font-black text-blue-600 tabular-nums">{sys.active_sessions || 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════
   BENTO STAT CARD
══════════════════════════════════════════ */
interface BentoStatCardProps {
  className?: string
  label: string
  value: number
  icon: React.ElementType
  trend?: number
  accentColor: string
  accentLight: string
  sparkColor: string
}
function BentoStatCard({ className = '', label, value, icon: Icon, trend, accentColor, accentLight, sparkColor }: BentoStatCardProps) {
  const [hov, setHov] = useState(false)
  return (
    <div
      className={`${className} rounded-2xl p-5 flex flex-col justify-between transition-all duration-300 cursor-default`}
      style={{
        background: hov ? 'white' : 'white',
        border: hov ? `1.5px solid ${accentColor}30` : '1px solid #f1f5f9',
        boxShadow: hov ? `0 20px 60px ${accentColor}18, 0 4px 16px rgba(0,0,0,0.06)` : '0 4px 24px rgba(0,0,0,0.05)',
        transform: hov ? 'translateY(-3px)' : 'translateY(0)',
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div className="flex items-start justify-between">
        <div
          className="h-9 w-9 rounded-xl flex items-center justify-center transition-transform duration-300"
          style={{
            background: accentLight,
            transform: hov ? 'scale(1.08)' : 'scale(1)',
          }}
        >
          <Icon className="h-4.5 w-4.5" strokeWidth={2} style={{ color: accentColor, width: 18, height: 18 }} />
        </div>
        {trend !== undefined && (
          <span
            className="flex items-center gap-0.5 text-[11px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: '#dcfce7', color: '#15803d' }}
          >
            <TrendingUp className="h-2.5 w-2.5" />+{trend}%
          </span>
        )}
      </div>

      <div>
        <p
          className="text-[34px] font-black tracking-tight leading-none tabular-nums mt-3 transition-colors duration-300"
          style={{ color: hov ? accentColor : '#0f172a' }}
        >
          {value.toLocaleString()}
        </p>
        <p className="text-[12px] text-gray-400 font-medium mt-1">{label}</p>
      </div>

      <div className="mt-3 flex items-end justify-between">
        <Sparkline color={sparkColor} up={trend === undefined || trend >= 0} />
        <div
          className="text-[10px] font-bold uppercase tracking-wide opacity-0 transition-opacity duration-300"
          style={{ color: accentColor, opacity: hov ? 1 : 0 }}
        >
          View →
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════
   ALERT TILE
══════════════════════════════════════════ */
function AlertTile({ label, value, severity }: { label: string; value: number; severity: 'critical' | 'warning' | 'info' }) {
  const cfg = {
    critical: { Icon: XCircle,      active: { bg: '#fef2f2', text: '#dc2626', badge: '#fee2e2', badgeText: '#b91c1c' }, neutral: { bg: '#f8fafc', text: '#94a3b8', badge: '#f1f5f9', badgeText: '#94a3b8' } },
    warning:  { Icon: AlertCircle,  active: { bg: '#fffbeb', text: '#d97706', badge: '#fef3c7', badgeText: '#92400e' }, neutral: { bg: '#f8fafc', text: '#94a3b8', badge: '#f1f5f9', badgeText: '#94a3b8' } },
    info:     { Icon: CheckCircle2, active: { bg: '#f0fdf4', text: '#059669', badge: '#dcfce7', badgeText: '#065f46' }, neutral: { bg: '#f8fafc', text: '#94a3b8', badge: '#f1f5f9', badgeText: '#94a3b8' } },
  }[severity]
  const { Icon } = cfg
  const s = value > 0 ? cfg.active : cfg.neutral
  return (
    <div
      className="flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors duration-200"
      style={{ background: s.bg }}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" style={{ color: s.text }} strokeWidth={2} />
        <span className="text-[12px] font-medium text-gray-700">{label}</span>
      </div>
      <span
        className="text-[11px] font-black px-2 py-0.5 rounded-full tabular-nums"
        style={{ background: s.badge, color: s.badgeText }}
      >
        {value}
      </span>
    </div>
  )
}

/* ══════════════════════════════════════════
   NAV TILE (management module)
══════════════════════════════════════════ */
interface NavTileProps {
  className?: string
  title: string
  desc: string
  icon: React.ElementType
  path: string
  count?: number
  countLabel?: string
  from: string
  to: string
  iconColor: string
}
function NavTile({ className = '', title, desc, icon: Icon, path, count, countLabel, from, to, iconColor }: NavTileProps) {
  const [hov, setHov] = useState(false)
  return (
    <Link
      to={path}
      className={`${className} block rounded-2xl p-5 transition-all duration-300`}
      style={{
        background: hov ? `linear-gradient(135deg, ${from}, ${to})` : 'white',
        border: hov ? `1.5px solid ${iconColor}25` : '1px solid #f1f5f9',
        boxShadow: hov ? `0 20px 48px ${iconColor}20, 0 4px 16px rgba(0,0,0,0.06)` : '0 4px 24px rgba(0,0,0,0.05)',
        transform: hov ? 'translateY(-4px)' : 'translateY(0)',
        textDecoration: 'none',
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div className="flex items-start justify-between mb-4">
        <div
          className="h-10 w-10 rounded-xl flex items-center justify-center transition-transform duration-300"
          style={{
            background: hov ? iconColor : `${iconColor}15`,
            transform: hov ? 'scale(1.1) rotate(-4deg)' : 'scale(1)',
          }}
        >
          <Icon
            strokeWidth={2}
            style={{ color: hov ? 'white' : iconColor, width: 18, height: 18, transition: 'color 0.3s' }}
          />
        </div>
        {count !== undefined && (
          <div className="text-right">
            <p className="text-xl font-black text-gray-900 tabular-nums leading-none">{count.toLocaleString()}</p>
            {countLabel && <p className="text-[10px] text-gray-400 mt-0.5">{countLabel}</p>}
          </div>
        )}
      </div>

      <h3
        className="text-[14px] font-bold leading-tight mb-1 transition-colors duration-200"
        style={{ color: hov ? iconColor : '#0f172a' }}
      >
        {title}
      </h3>
      <p className="text-[12px] text-gray-400 leading-relaxed">{desc}</p>

      <div
        className="flex items-center gap-1 mt-4 text-[12px] font-bold transition-all duration-300"
        style={{
          color: iconColor,
          opacity: hov ? 1 : 0,
          transform: hov ? 'translateX(0)' : 'translateX(-4px)',
        }}
      >
        Open module <ArrowUpRight className="h-3.5 w-3.5" />
      </div>
    </Link>
  )
}

/* ══════════════════════════════════════════
   EMPTY STATE
══════════════════════════════════════════ */
function EmptyState({ icon: Icon, label, cta, to }: { icon: React.ElementType; label: string; cta: string; to: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="h-12 w-12 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-3">
        <Icon className="h-5 w-5 text-gray-300" strokeWidth={1.5} />
      </div>
      <p className="text-[13px] text-gray-500 font-medium">{label}</p>
      <Link to={to} className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-semibold">
        {cta} →
      </Link>
    </div>
  )
}
