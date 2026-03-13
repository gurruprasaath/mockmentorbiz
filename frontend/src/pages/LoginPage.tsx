import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Eye, EyeOff } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'

interface LoginForm {
  email: string
  password: string
}

/* ── decorative dot-grid SVG for left panel ── */
const DotGrid = () => (
  <svg width="120" height="120" viewBox="0 0 120 120" fill="none" className="opacity-30">
    {Array.from({ length: 6 }, (_, row) =>
      Array.from({ length: 6 }, (_, col) => (
        <circle
          key={`${row}-${col}`}
          cx={col * 22 + 11}
          cy={row * 22 + 11}
          r="3"
          fill="white"
        />
      ))
    )}
  </svg>
)

/* ── squiggle accent SVG ── */
const Squiggle = () => (
  <svg width="80" height="20" viewBox="0 0 80 20" fill="none">
    <path
      d="M2 10 Q10 2 18 10 Q26 18 34 10 Q42 2 50 10 Q58 18 66 10 Q74 2 78 10"
      stroke="white"
      strokeWidth="3"
      strokeLinecap="round"
      fill="none"
      opacity="0.5"
    />
  </svg>
)

/* ── inline SVG illustration (interview/learning themed) ── */
const HeroIllustration = () => (
  <svg viewBox="0 0 320 240" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-xs mx-auto drop-shadow-2xl">
    {/* Screen / monitor */}
    <rect x="60" y="30" width="200" height="130" rx="10" fill="white" opacity="0.15" />
    <rect x="60" y="30" width="200" height="130" rx="10" stroke="white" strokeWidth="2" opacity="0.4" />
    <rect x="70" y="40" width="180" height="100" rx="6" fill="white" opacity="0.1" />
    {/* Monitor stand */}
    <rect x="148" y="160" width="24" height="20" fill="white" opacity="0.25" />
    <rect x="128" y="178" width="64" height="8" rx="4" fill="white" opacity="0.25" />

    {/* Person on screen (interviewer) */}
    <circle cx="160" cy="72" r="18" fill="#FFA94D" />
    <rect x="144" y="90" width="32" height="36" rx="8" fill="#4263EB" />
    {/* Tie */}
    <path d="M158 90 L160 100 L162 90" fill="white" opacity="0.6" />
    {/* Speech bubble */}
    <rect x="185" y="52" width="52" height="28" rx="8" fill="white" opacity="0.9" />
    <path d="M185 68 L178 74 L190 68" fill="white" opacity="0.9" />
    <rect x="191" y="60" width="32" height="4" rx="2" fill="#4263EB" opacity="0.5" />
    <rect x="191" y="68" width="22" height="4" rx="2" fill="#4263EB" opacity="0.3" />

    {/* Student at desk (bottom-left) */}
    <circle cx="90" cy="185" r="14" fill="#74C0FC" />
    <rect x="78" y="199" width="24" height="28" rx="6" fill="#1C7ED6" />
    {/* Laptop */}
    <rect x="62" y="210" width="56" height="34" rx="4" fill="white" fillOpacity="0.2" stroke="white" strokeWidth="1.5" strokeOpacity="0.5" />
    <rect x="66" y="213" width="48" height="24" rx="2" fill="#4263EB" opacity="0.3" />

    {/* Formula card */}
    <rect x="100" y="150" width="70" height="38" rx="6" fill="white" opacity="0.9" />
    <text x="110" y="168" fill="#4263EB" fontSize="9" fontFamily="monospace" fontWeight="bold">2x + 3y =</text>
    <text x="110" y="180" fill="#4263EB" fontSize="9" fontFamily="monospace">√ x + 2y</text>

    {/* Floating chat bubble top-right */}
    <rect x="238" y="45" width="50" height="28" rx="8" fill="white" opacity="0.85" />
    <path d="M238 62 L231 68 L244 62" fill="white" opacity="0.85" />
    <rect x="244" y="53" width="30" height="4" rx="2" fill="#ADB5BD" />
    <rect x="244" y="61" width="20" height="4" rx="2" fill="#ADB5BD" />

    {/* Pencil accent */}
    <rect x="240" y="185" width="50" height="12" rx="4" fill="#FFD43B" transform="rotate(-20 240 185)" />
    <rect x="282" y="174" width="8" height="12" rx="2" fill="#FF6B6B" transform="rotate(-20 282 174)" />
    <polygon points="287,170 283,172 290,165" fill="#F5F5F5" transform="rotate(-20 287 170)" />

    {/* Play button on screen */}
    <circle cx="160" cy="110" r="14" fill="white" fillOpacity="0.15" stroke="white" strokeWidth="1.5" strokeOpacity="0.5" />
    <polygon points="156,105 156,115 168,110" fill="white" opacity="0.7" />

    {/* Progress bar */}
    <rect x="110" y="128" width="100" height="6" rx="3" fill="white" opacity="0.15" />
    <rect x="110" y="128" width="55" height="6" rx="3" fill="#74C0FC" opacity="0.7" />
    <circle cx="165" cy="131" r="5" fill="white" opacity="0.9" />
  </svg>
)

const LoginPage = () => {
  const [showPassword, setShowPassword] = useState(false)
  const navigate = useNavigate()
  const { login, isLoading } = useAuthStore()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>()

  const focusGlow = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.boxShadow = '0 0 0 3px rgba(76,110,245,0.15)'
    e.target.style.borderColor = '#4C6EF5'
  }
  const blurReset = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.boxShadow = 'none'
    e.target.style.borderColor = ''
  }

  const onSubmit = async (data: LoginForm) => {
    const success = await login(data.email, data.password)
    if (success) {
      navigate('/')
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row lg:h-screen lg:overflow-hidden">
      {/* ── LEFT PANEL ── */}
      <div
        className="hidden lg:flex lg:w-5/12 xl:w-1/2 flex-col justify-between relative overflow-hidden flex-shrink-0"
        style={{ background: 'linear-gradient(145deg, #3B5BDB 0%, #4C6EF5 40%, #228BE6 100%)' }}
      >
        {/* Decorative dot grids */}
        <div className="absolute top-6 left-6">
          <DotGrid />
        </div>
        <div className="absolute bottom-10 right-8 rotate-180">
          <DotGrid />
        </div>

        {/* Squiggle top-right */}
        <div className="absolute top-10 right-10">
          <Squiggle />
        </div>

        {/* Large blurred blob */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)', filter: 'blur(40px)' }}
        />

        {/* Main content */}
        <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-10 py-16 text-center">
          <HeroIllustration />

          <h2 className="mt-10 text-3xl font-extrabold text-white leading-tight">
            AI-Powered Mock<br />Interview Platform
          </h2>
          <p className="mt-4 text-blue-100 text-sm leading-relaxed max-w-xs">
            Practice real interview questions, get instant AI feedback, and land your dream job — built for college students.
          </p>

          {/* Stat pills */}
          <div className="mt-8 flex gap-4">
            <div className="bg-white bg-opacity-15 backdrop-blur-sm rounded-2xl px-5 py-3 text-center border border-white border-opacity-20">
              <p className="text-white font-bold text-xl">10K+</p>
              <p className="text-blue-100 text-xs mt-0.5">Students</p>
            </div>
            <div className="bg-white bg-opacity-15 backdrop-blur-sm rounded-2xl px-5 py-3 text-center border border-white border-opacity-20">
              <p className="text-white font-bold text-xl">500+</p>
              <p className="text-blue-100 text-xs mt-0.5">Questions</p>
            </div>
            <div className="bg-white bg-opacity-15 backdrop-blur-sm rounded-2xl px-5 py-3 text-center border border-white border-opacity-20">
              <p className="text-white font-bold text-xl">95%</p>
              <p className="text-blue-100 text-xs mt-0.5">Success Rate</p>
            </div>
          </div>
        </div>

        {/* Bottom brand */}
        <div className="relative z-10 pb-8 text-center">
          <p className="text-blue-200 text-xs">© 2026 MockMentorBiz. All rights reserved.</p>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 sm:px-12 py-10 bg-white overflow-y-auto">
        <div className="w-full max-w-md">
          {/* Logo / Brand */}
          <div className="flex items-center gap-2 mb-8">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-lg" style={{ background: 'linear-gradient(135deg, #4C6EF5, #228BE6)' }}>
              M
            </div>
            <span className="text-2xl font-extrabold" style={{ color: '#3B5BDB' }}>MockMentorBiz</span>
          </div>

          <h1 className="text-2xl font-bold text-gray-800 mb-1">Welcome back.</h1>
          <p className="text-gray-500 text-sm mb-8">Sign in to continue your interview practice</p>

          {/* Form */}
          <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="example@mail.com"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none transition-all duration-200"
                onFocus={focusGlow}
                {...(() => {
                  const { onBlur, ...rest } = register('email', {
                    required: 'Email is required',
                    pattern: {
                      value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                      message: 'Invalid email address',
                    },
                  })
                  return { ...rest, onBlur: (e: React.FocusEvent<HTMLInputElement>) => { blurReset(e); onBlur(e) } }
                })()}
              />
              {errors.email && (
                <p className="mt-1.5 text-xs text-red-500">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full px-4 py-3 pr-11 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none transition-all duration-200"
                  onFocus={focusGlow}
                  {...(() => {
                    const { onBlur, ...rest } = register('password', { required: 'Password is required' })
                    return { ...rest, onBlur: (e: React.FocusEvent<HTMLInputElement>) => { blurReset(e); onBlur(e) } }
                  })()}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1.5 text-xs text-red-500">{errors.password.message}</p>
              )}
            </div>

            {/* Forgot password */}
            <div className="flex justify-end">
              <Link
                to="/forgot-password"
                className="text-xs font-medium transition-colors duration-200"
                style={{ color: '#4C6EF5' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#3B5BDB')}
                onMouseLeave={e => (e.currentTarget.style.color = '#4C6EF5')}
              >
                Forgot Password?
              </Link>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, #4C6EF5, #228BE6)' }}
              onMouseEnter={e => { if (!isLoading) (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 24px rgba(76,110,245,0.35)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none' }}
            >
              {isLoading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-xs text-gray-400 font-medium">or</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          {/* Register link */}
          <p className="text-center text-sm text-gray-500">
            Don't have an account?{' '}
            <Link
              to="/register"
              className="font-semibold transition-colors duration-200"
              style={{ color: '#4C6EF5' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#3B5BDB')}
              onMouseLeave={e => (e.currentTarget.style.color = '#4C6EF5')}
            >
              Create one
            </Link>
          </p>

          {/* Demo credentials */}
          <div className="mt-8 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-5 py-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Demo Accounts</p>
            <div className="space-y-1 text-xs text-gray-500">
              <p><span className="font-medium text-gray-600">Student:</span> student@demo.com / password123</p>
              <p><span className="font-medium text-gray-600">Admin:</span> admin@demo.com / admin123</p>
              <p><span className="font-medium text-gray-600">Super Admin:</span> superadmin@demo.com / superadmin123</p>
            </div>
          </div>

          {/* Mobile back link */}
          <p className="mt-6 text-center text-xs text-gray-400 lg:hidden">
            <Link to="/" className="underline hover:text-gray-600">← Back to Home</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
