import { useState, useEffect } from 'react'
import Footer from '../../components/Footer'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  User,
  Lock,
  Building2,
  Save,
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
  Shield,
  Bell,
  Info,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { superAdminApi } from '../../utils/api'
import { useAuthStore } from '../../stores/authStore'
import toast from 'react-hot-toast'

// ─── Small helpers ────────────────────────────────────────────────────────────
function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  disabled,
  hint,
}: {
  label: string
  value: string
  onChange?: (v: string) => void
  type?: string
  placeholder?: string
  disabled?: boolean
  hint?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full px-3 py-2 border rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
          disabled
            ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
            : 'border-gray-300 bg-white text-gray-900'
        }`}
      />
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

function SectionCard({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: any
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="p-2 bg-indigo-50 rounded-xl">
          <Icon className="h-5 w-5 text-indigo-600" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
const SystemSettings = () => {
  const queryClient = useQueryClient()
  const { user: authUser, setUser } = useAuthStore()

  // ── Tabs ─────────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'notifications'>('profile')

  // ── Profile form ─────────────────────────────────────────────────────────────
  const [profileForm, setProfileForm] = useState({
    full_name: '',
    email: '',
    username: '',
    college_name: '',
  })

  // ── Password form ─────────────────────────────────────────────────────────────
  const [pwForm, setPwForm]           = useState({ current: '', next: '', confirm: '' })
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext]       = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // ── Fetch profile ─────────────────────────────────────────────────────────────
  const { data: profileData, isLoading } = useQuery({
    queryKey: ['super-admin-profile'],
    queryFn:  superAdminApi.getSettingsProfile,
  })

  useEffect(() => {
    const p = profileData?.data
    if (p) {
      setProfileForm({
        full_name:    p.full_name    ?? '',
        email:        p.email        ?? '',
        username:     p.username     ?? '',
        college_name: p.college_name ?? '',
      })
    }
  }, [profileData])

  // ── Profile mutation ──────────────────────────────────────────────────────────
  const profileMut = useMutation({
    mutationFn: (data: typeof profileForm) => superAdminApi.updateSettingsProfile(data),
    onSuccess: (res) => {
      toast.success('Profile updated successfully')
      queryClient.invalidateQueries({ queryKey: ['super-admin-profile'] })
      // Update auth store so the header name refreshes too
      if (authUser) {
        setUser({
          ...authUser,
          full_name:    res.data.full_name    ?? authUser.full_name,
          email:        res.data.email        ?? authUser.email,
          username:     res.data.username     ?? authUser.username,
          college_name: res.data.college_name ?? authUser.college_name,
        })
      }
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail ?? 'Failed to update profile')
    },
  })

  // ── Password mutation ─────────────────────────────────────────────────────────
  const pwMut = useMutation({
    mutationFn: (data: { current_password: string; new_password: string }) =>
      superAdminApi.updateSettingsPassword(data),
    onSuccess: () => {
      toast.success('Password changed successfully')
      setPwForm({ current: '', next: '', confirm: '' })
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail ?? 'Failed to change password')
    },
  })

  const handleProfileSave = () => {
    if (!profileForm.full_name.trim()) return toast.error('Full name is required')
    if (!profileForm.email.trim())     return toast.error('Email is required')
    if (!profileForm.username.trim())  return toast.error('Username is required')
    profileMut.mutate(profileForm)
  }

  const handlePasswordSave = () => {
    if (!pwForm.current) return toast.error('Enter your current password')
    if (!pwForm.next)     return toast.error('Enter a new password')
    if (pwForm.next.length < 6) return toast.error('New password must be at least 6 characters')
    if (pwForm.next !== pwForm.confirm) return toast.error('New passwords do not match')
    pwMut.mutate({ current_password: pwForm.current, new_password: pwForm.next })
  }

  const pwStrength = (() => {
    const p = pwForm.next
    if (!p) return null
    let score = 0
    if (p.length >= 8)              score++
    if (/[A-Z]/.test(p))           score++
    if (/[0-9]/.test(p))           score++
    if (/[^A-Za-z0-9]/.test(p))   score++
    if (score <= 1) return { label: 'Weak',   color: 'bg-red-400',    width: '25%'  }
    if (score === 2) return { label: 'Fair',   color: 'bg-yellow-400', width: '50%'  }
    if (score === 3) return { label: 'Good',   color: 'bg-blue-400',   width: '75%'  }
    return               { label: 'Strong', color: 'bg-emerald-400', width: '100%' }
  })()

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link to="/super-admin" className="flex items-center text-gray-500 hover:text-gray-700 text-sm gap-1">
                <ArrowLeft className="h-4 w-4" /> Back
              </Link>
              <div className="h-5 w-px bg-gray-300" />
              <h1 className="text-xl font-bold text-gray-900">System Settings</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">

          {/* ── Sidebar nav ─────────────────────────────────────────────────── */}
          <aside className="w-48 flex-shrink-0">
            <nav className="space-y-1">
              {[
                { key: 'profile',       label: 'Profile',       icon: User   },
                { key: 'security',      label: 'Security',      icon: Lock   },
                { key: 'notifications', label: 'Notifications', icon: Bell   },
              ].map(item => {
                const Icon = item.icon
                return (
                  <button
                    key={item.key}
                    onClick={() => setActiveTab(item.key as any)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      activeTab === item.key
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                )
              })}
            </nav>

            {/* Account info blurb */}
            <div className="mt-8 p-3 bg-gray-50 rounded-xl border border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-4 w-4 text-indigo-500" />
                <span className="text-xs font-semibold text-gray-700">Your Role</span>
              </div>
              <p className="text-xs text-gray-500">Super Admin</p>
              {profileData?.data?.college_name && (
                <p className="text-xs text-gray-400 mt-1">{profileData.data.college_name}</p>
              )}
            </div>
          </aside>

          {/* ── Content ─────────────────────────────────────────────────────── */}
          <div className="flex-1 space-y-6">

            {/* ══ PROFILE ══════════════════════════════════════════════════ */}
            {activeTab === 'profile' && (
              <>
                <SectionCard icon={User} title="Personal Information" subtitle="Update your name, email and username">
                  {isLoading ? (
                    <div className="space-y-4">
                      {[...Array(4)].map((_, i) => (
                        <div key={i} className="animate-pulse space-y-1">
                          <div className="h-4 bg-gray-200 rounded w-24" />
                          <div className="h-9 bg-gray-200 rounded" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <Field
                        label="Full Name"
                        value={profileForm.full_name}
                        onChange={v => setProfileForm(f => ({ ...f, full_name: v }))}
                        placeholder="Your full name"
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <Field
                          label="Email Address"
                          value={profileForm.email}
                          onChange={v => setProfileForm(f => ({ ...f, email: v }))}
                          type="email"
                          placeholder="you@college.edu"
                        />
                        <Field
                          label="Username"
                          value={profileForm.username}
                          onChange={v => setProfileForm(f => ({ ...f, username: v }))}
                          placeholder="username"
                        />
                      </div>
                      <div className="pt-2 flex justify-end">
                        <button
                          onClick={handleProfileSave}
                          disabled={profileMut.isPending}
                          className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          <Save className="h-4 w-4" />
                          {profileMut.isPending ? 'Saving…' : 'Save Changes'}
                        </button>
                      </div>
                    </div>
                  )}
                </SectionCard>

                <SectionCard icon={Building2} title="College Information" subtitle="Your college name shown to admins and students">
                  {isLoading ? (
                    <div className="animate-pulse space-y-1">
                      <div className="h-4 bg-gray-200 rounded w-24" />
                      <div className="h-9 bg-gray-200 rounded" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <Field
                        label="College Name"
                        value={profileForm.college_name}
                        onChange={v => setProfileForm(f => ({ ...f, college_name: v }))}
                        placeholder="e.g. Kongu Engineering College"
                        hint="Changing this affects all newly registered students' college display."
                      />
                      <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                        <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <span>Existing student records will not be retroactively updated.</span>
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={handleProfileSave}
                          disabled={profileMut.isPending}
                          className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          <Save className="h-4 w-4" />
                          {profileMut.isPending ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  )}
                </SectionCard>

                {/* Read-only account info */}
                <SectionCard icon={Info} title="Account Details" subtitle="Read-only account metadata">
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Role"      value="Super Admin"                              disabled />
                    <Field label="User ID"   value={String(profileData?.data?.id ?? '—')}    disabled />
                    <Field label="Status"    value={profileData?.data?.is_active ? 'Active' : 'Inactive'} disabled />
                    <Field label="Department" value={profileData?.data?.department ?? 'Administration'} disabled />
                  </div>
                </SectionCard>
              </>
            )}

            {/* ══ SECURITY ═════════════════════════════════════════════════ */}
            {activeTab === 'security' && (
              <>
                <SectionCard icon={Lock} title="Change Password" subtitle="Use a strong, unique password">
                  <div className="space-y-4">
                    {/* Current */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                      <div className="relative">
                        <input
                          type={showCurrent ? 'text' : 'password'}
                          value={pwForm.current}
                          onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
                          placeholder="Enter current password"
                          className="w-full pr-10 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <button type="button" onClick={() => setShowCurrent(v => !v)} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
                          {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {/* New */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                      <div className="relative">
                        <input
                          type={showNext ? 'text' : 'password'}
                          value={pwForm.next}
                          onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
                          placeholder="At least 6 characters"
                          className="w-full pr-10 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <button type="button" onClick={() => setShowNext(v => !v)} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
                          {showNext ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {/* Strength meter */}
                      {pwStrength && (
                        <div className="mt-2">
                          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-300 ${pwStrength.color}`} style={{ width: pwStrength.width }} />
                          </div>
                          <p className="text-xs text-gray-500 mt-1">Strength: <span className="font-medium">{pwStrength.label}</span></p>
                        </div>
                      )}
                    </div>

                    {/* Confirm */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                      <div className="relative">
                        <input
                          type={showConfirm ? 'text' : 'password'}
                          value={pwForm.confirm}
                          onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                          placeholder="Repeat new password"
                          className={`w-full pr-10 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                            pwForm.confirm && pwForm.next !== pwForm.confirm
                              ? 'border-red-400 bg-red-50'
                              : 'border-gray-300'
                          }`}
                        />
                        <button type="button" onClick={() => setShowConfirm(v => !v)} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
                          {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {pwForm.confirm && pwForm.next !== pwForm.confirm && (
                        <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Passwords do not match</p>
                      )}
                      {pwForm.confirm && pwForm.next === pwForm.confirm && pwForm.next && (
                        <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Passwords match</p>
                      )}
                    </div>

                    <div className="pt-2 flex justify-end">
                      <button
                        onClick={handlePasswordSave}
                        disabled={pwMut.isPending}
                        className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        <Lock className="h-4 w-4" />
                        {pwMut.isPending ? 'Changing…' : 'Change Password'}
                      </button>
                    </div>
                  </div>
                </SectionCard>

                {/* Security tips */}
                <SectionCard icon={Shield} title="Security Tips" subtitle="Keep your account safe">
                  <ul className="space-y-3 text-sm text-gray-600">
                    {[
                      'Use a password that is at least 8 characters long',
                      'Mix uppercase letters, numbers, and special characters',
                      'Never share your password with department admins',
                      'Reset passwords for any admin account you suspect is compromised',
                      'Log out from shared or public computers after use',
                    ].map((tip, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                        {tip}
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              </>
            )}

            {/* ══ NOTIFICATIONS ════════════════════════════════════════════ */}
            {activeTab === 'notifications' && (
              <SectionCard icon={Bell} title="Notification Preferences" subtitle="Control what you are notified about">
                <div className="space-y-4">
                  {[
                    { label: 'New student registrations',     sub: 'Notify when a student registers under any department',  defaultOn: true  },
                    { label: 'Interview completions',         sub: 'Notify when a scheduled interview is completed',        defaultOn: true  },
                    { label: 'Malpractice flagged',           sub: 'Notify when a malpractice event is detected',          defaultOn: true  },
                    { label: 'Admin account changes',         sub: 'Notify when admin passwords are reset or accounts deactivated', defaultOn: false },
                    { label: 'Weekly summary report',         sub: 'Receive a weekly email with college performance stats', defaultOn: false },
                  ].map((item, i) => (
                    <NotifRow key={i} label={item.label} sub={item.sub} defaultOn={item.defaultOn} />
                  ))}

                  <div className="pt-2 flex items-center gap-2 text-xs text-gray-400">
                    <Info className="h-3.5 w-3.5" />
                    <span>Email delivery requires SMTP configuration by the platform owner.</span>
                  </div>
                </div>
              </SectionCard>
            )}

          </div>
        </div>
      </div>
      <Footer />
    </div>
  )
}

// ─── Toggle row for notifications ─────────────────────────────────────────────
function NotifRow({ label, sub, defaultOn }: { label: string; sub: string; defaultOn: boolean }) {
  const [on, setOn] = useState(defaultOn)
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
      </div>
      <button
        onClick={() => setOn(v => !v)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${on ? 'bg-indigo-600' : 'bg-gray-300'}`}
      >
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-1'}`} />
      </button>
    </div>
  )
}

export default SystemSettings
