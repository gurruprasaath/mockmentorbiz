import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Eye, EyeOff, User, Mail, Lock, Users } from 'lucide-react'
import { useAuthStore, RegisterData } from '../stores/authStore'

/* ── shared decorative pieces (same as LoginPage) ── */
const DotGrid = () => (
  <svg width="100" height="100" viewBox="0 0 100 100" fill="none" className="opacity-25">
    {Array.from({ length: 5 }, (_, row) =>
      Array.from({ length: 5 }, (_, col) => (
        <circle key={`${row}-${col}`} cx={col * 22 + 11} cy={row * 22 + 11} r="3" fill="white" />
      ))
    )}
  </svg>
)

const Squiggle = () => (
  <svg width="80" height="20" viewBox="0 0 80 20" fill="none">
    <path
      d="M2 10 Q10 2 18 10 Q26 18 34 10 Q42 2 50 10 Q58 18 66 10 Q74 2 78 10"
      stroke="white" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.45"
    />
  </svg>
)

/* ── Register-themed illustration ── */
const RegisterIllustration = () => (
  <svg viewBox="0 0 280 220" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-[260px] mx-auto drop-shadow-2xl">
    {/* Clipboard / form */}
    <rect x="70" y="20" width="140" height="170" rx="10" fill="white" opacity="0.15" />
    <rect x="70" y="20" width="140" height="170" rx="10" stroke="white" strokeWidth="1.5" opacity="0.35" />
    {/* Clipboard clip */}
    <rect x="110" y="12" width="60" height="18" rx="9" fill="white" opacity="0.3" />
    {/* Form lines */}
    <rect x="86" y="50" width="108" height="8" rx="4" fill="white" opacity="0.2" />
    <rect x="86" y="50" width="60" height="8" rx="4" fill="#74C0FC" opacity="0.5" />
    <rect x="86" y="70" width="108" height="8" rx="4" fill="white" opacity="0.2" />
    <rect x="86" y="70" width="80" height="8" rx="4" fill="#74C0FC" opacity="0.4" />
    <rect x="86" y="90" width="108" height="8" rx="4" fill="white" opacity="0.2" />
    <rect x="86" y="90" width="50" height="8" rx="4" fill="#74C0FC" opacity="0.35" />
    <rect x="86" y="110" width="108" height="8" rx="4" fill="white" opacity="0.2" />
    {/* Submit button */}
    <rect x="86" y="130" width="108" height="28" rx="8" fill="white" opacity="0.25" />
    <rect x="100" y="138" width="80" height="12" rx="6" fill="white" opacity="0.5" />

    {/* Check mark badge */}
    <circle cx="196" cy="48" r="22" fill="#51CF66" opacity="0.9" />
    <polyline points="185,48 193,56 208,40" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />

    {/* Person */}
    <circle cx="88" cy="182" r="16" fill="#FFA94D" />
    <rect x="74" y="198" width="28" height="22" rx="8" fill="#4263EB" opacity="0.9" />

    {/* Stars / confetti */}
    <circle cx="220" cy="90" r="4" fill="#FFD43B" opacity="0.8" />
    <circle cx="58" cy="60" r="3" fill="#FF6B6B" opacity="0.7" />
    <circle cx="235" cy="155" r="5" fill="#74C0FC" opacity="0.7" />
    <rect x="52" y="130" width="8" height="8" rx="2" fill="#FFD43B" opacity="0.6" transform="rotate(20 52 130)" />
    <rect x="228" y="120" width="6" height="6" rx="1" fill="#51CF66" opacity="0.7" transform="rotate(-15 228 120)" />

    {/* Lock icon (security) */}
    <rect x="195" y="160" width="28" height="22" rx="5" fill="white" opacity="0.2" />
    <rect x="199" y="155" width="20" height="12" rx="10" stroke="white" strokeWidth="2" opacity="0.4" fill="none" />
    <circle cx="209" cy="171" r="3" fill="white" opacity="0.6" />
  </svg>
)

/* ── reusable styled input ── */
interface FieldInputProps {
  id: string
  type?: string
  placeholder: string
  icon: React.ReactNode
  error?: string
  rightSlot?: React.ReactNode
  inputProps: React.InputHTMLAttributes<HTMLInputElement>
}

const FieldInput = ({ id, type = 'text', placeholder, icon, error, rightSlot, inputProps }: FieldInputProps) => (
  <div>
    <div className="relative">
      <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none">
        {icon}
      </span>
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none transition-all duration-200"
        {...inputProps}
      />
      {rightSlot && (
        <span className="absolute inset-y-0 right-0 flex items-center pr-3">
          {rightSlot}
        </span>
      )}
    </div>
    {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
  </div>
)

const RegisterPage = () => {
  const [showPassword, setShowPassword] = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { register: registerUser, isLoading } = useAuthStore()

  const prefilledAdminId = (searchParams.get('admin_id') || '').trim()

  const {
    register: formRegister,
    handleSubmit: formHandleSubmit,
    formState: { errors: formErrors },
  } = useForm<RegisterData>({
    defaultValues: prefilledAdminId ? { admin_id: prefilledAdminId } : undefined,
  })

  const focusGlow = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.boxShadow = '0 0 0 3px rgba(76,110,245,0.15)'
    e.target.style.borderColor = '#4C6EF5'
  }
  const blurReset = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.boxShadow = 'none'
    e.target.style.borderColor = ''
  }

  /* merge our blurReset with react-hook-form's onBlur */
  const reg = (name: keyof RegisterData, rules: Parameters<typeof formRegister>[1]) => {
    const { onBlur, ...rest } = formRegister(name, rules)
    return {
      ...rest,
      onFocus: focusGlow,
      onBlur: (e: React.FocusEvent<HTMLInputElement>) => { blurReset(e); onBlur(e) },
    }
  }

  const onSubmit = async (data: RegisterData) => {
    const success = await registerUser(data)
    if (success) {
      navigate('/login')
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row lg:h-screen lg:overflow-hidden">

      {/* ── LEFT PANEL ── */}
      <div
        className="hidden lg:flex lg:w-5/12 xl:w-[42%] flex-col justify-between relative overflow-hidden flex-shrink-0"
        style={{ background: 'linear-gradient(145deg, #3B5BDB 0%, #4C6EF5 40%, #228BE6 100%)' }}
      >
        <div className="absolute top-5 left-5"><DotGrid /></div>
        <div className="absolute bottom-8 right-6 rotate-180"><DotGrid /></div>
        <div className="absolute top-8 right-8"><Squiggle /></div>
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full opacity-10 pointer-events-none"
          style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)', filter: 'blur(40px)' }}
        />

        {/* Main content */}
        <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-10 py-10 text-center">
          <RegisterIllustration />

          <h2 className="mt-8 text-2xl font-extrabold text-white leading-tight">
            Start Your Journey<br />to Interview Success
          </h2>
          <p className="mt-3 text-blue-100 text-sm leading-relaxed max-w-xs">
            Join thousands of students who practice with AI-powered mock interviews and land their dream jobs.
          </p>

          {/* Feature bullets */}
          <div className="mt-7 space-y-3 text-left w-full max-w-xs">
            {[
              'Unlimited AI mock interviews',
              'Real-time feedback & scoring',
              'Track progress over time',
              'Industry-specific question banks',
            ].map(f => (
              <div key={f} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.2)' }}>
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <polyline points="1,4 3.5,6.5 9,1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <span className="text-blue-100 text-xs">{f}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 pb-6 text-center">
          <p className="text-blue-200 text-xs">© 2026 MockMentorBiz. All rights reserved.</p>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 sm:px-10 py-10 bg-white overflow-y-auto">
        <div className="w-full max-w-md">

          {/* Logo */}
          <div className="flex items-center gap-2 mb-5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold text-base"
              style={{ background: 'linear-gradient(135deg, #4C6EF5, #228BE6)' }}
            >M</div>
            <span className="text-xl font-extrabold" style={{ color: '#3B5BDB' }}>MockMentorBiz</span>
          </div>

          <h1 className="text-2xl font-bold text-gray-800 mb-0.5">Create your account.</h1>
          <p className="text-gray-500 text-sm mb-5">Join thousands of students practising interviews</p>

          <form className="space-y-3.5" onSubmit={formHandleSubmit(onSubmit)}>

            {/* Full Name + Username row */}
            <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="full_name" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Full Name</label>
                <FieldInput
                  id="full_name"
                  placeholder="Jane Smith"
                  icon={<User className="h-3.5 w-3.5" />}
                  error={formErrors.full_name?.message}
                  inputProps={reg('full_name', {
                    required: 'Required',
                    minLength: { value: 2, message: 'Min 2 chars' },
                  })}
                />
              </div>
              <div>
                <label htmlFor="username" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Username</label>
                <FieldInput
                  id="username"
                  placeholder="janesmith"
                  icon={<User className="h-3.5 w-3.5" />}
                  error={formErrors.username?.message}
                  inputProps={reg('username', {
                    required: 'Required',
                    minLength: { value: 3, message: 'Min 3 chars' },
                    pattern: { value: /^[a-zA-Z0-9_]+$/, message: 'Letters, numbers & _' },
                  })}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Email Address</label>
              <FieldInput
                id="email"
                type="email"
                placeholder="example@mail.com"
                icon={<Mail className="h-3.5 w-3.5" />}
                error={formErrors.email?.message}
                inputProps={reg('email', {
                  required: 'Email is required',
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: 'Invalid email address',
                  },
                })}
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Password</label>
              <FieldInput
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Min 8 chars, upper + lower + number"
                icon={<Lock className="h-3.5 w-3.5" />}
                error={formErrors.password?.message}
                rightSlot={
                  <button
                    type="button"
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                    onClick={() => setShowPassword(v => !v)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
                inputProps={reg('password', {
                  required: 'Password is required',
                  minLength: { value: 8, message: 'Minimum 8 characters' },
                  pattern: {
                    value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
                    message: 'Needs lowercase, uppercase & number',
                  },
                })}
              />
            </div>

            {/* Admin ID */}
            <div>
              <label htmlFor="admin_id" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Admin ID <span className="text-red-400 normal-case font-normal">· from your department admin</span>
              </label>
              <FieldInput
                id="admin_id"
                placeholder="Enter your department admin ID"
                icon={<Users className="h-3.5 w-3.5" />}
                error={formErrors.admin_id?.message}
                inputProps={reg('admin_id', { required: 'Admin ID is required to register' })}
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed mt-1"
              style={{ background: 'linear-gradient(135deg, #4C6EF5, #228BE6)' }}
              onMouseEnter={e => {
                if (!isLoading) {
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'
                  ;(e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 24px rgba(76,110,245,0.35)'
                }
              }}
              onMouseLeave={e => {
                ;(e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'
                ;(e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'
              }}
            >
              {isLoading ? 'Creating Account…' : 'Create Account'}
            </button>
          </form>

          {/* Divider + login link */}
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-xs text-gray-400 font-medium">or</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          <p className="text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link
              to="/login"
              className="font-semibold transition-colors duration-200"
              style={{ color: '#4C6EF5' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#3B5BDB')}
              onMouseLeave={e => (e.currentTarget.style.color = '#4C6EF5')}
            >
              Sign in
            </Link>
          </p>

          {/* Mobile back */}
          <p className="mt-4 text-center text-xs text-gray-400 lg:hidden">
            <Link to="/" className="underline hover:text-gray-600">← Back to Home</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default RegisterPage
