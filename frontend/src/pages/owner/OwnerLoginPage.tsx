import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import Footer from '../../components/Footer'
import { Eye, EyeOff, ArrowLeft, Shield } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../../stores/authStore'

interface LoginForm {
  email: string
  password: string
}

const OwnerLoginPage = () => {
  const [showPassword, setShowPassword] = useState(false)
  const navigate = useNavigate()
  const { login, isLoading, user } = useAuthStore()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>()

  const onSubmit = async (data: LoginForm) => {
    const ok = await login(data.email, data.password)
    if (!ok) return

    // Zustand state is updated inside login; read the latest role.
    const role = (useAuthStore.getState().user as any)?.role
    if (role !== 'owner') {
      toast.error('This account is not a platform owner')
      useAuthStore.getState().logout()
      return
    }

    navigate('/owner')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-slate-100 flex flex-col">
      <div className="flex-1 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Link to="/" className="flex items-center justify-center text-primary-600 hover:text-primary-700 mb-6">
          <ArrowLeft className="h-5 w-5 mr-2" />
          Back to Home
        </Link>

        <div className="text-center">
          <div className="mx-auto h-12 w-12 bg-gray-900 rounded-xl flex items-center justify-center mb-3">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Platform Owner Login</h2>
          <p className="text-gray-600 mt-1">Manage college super admins</p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  className="input-field"
                  placeholder="owner@platform.com"
                  {...register('email', {
                    required: 'Email is required',
                  })}
                />
                {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="mt-1 relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="input-field pr-10"
                  placeholder="Enter your password"
                  {...register('password', {
                    required: 'Password is required',
                    minLength: { value: 6, message: 'Password must be at least 6 characters' },
                  })}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4 text-gray-400" /> : <Eye className="h-4 w-4 text-gray-400" />}
                </button>
                {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>}
              </div>
            </div>

            <button type="submit" disabled={isLoading} className="w-full btn-primary disabled:opacity-50">
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          {user?.role === 'owner' ? (
            <div className="mt-4 text-xs text-gray-500">Already signed in as owner. Go to <Link to="/owner" className="text-primary-600 hover:text-primary-700">Owner Dashboard</Link>.</div>
          ) : null}
        </div>
      </div>
      </div>
      <Footer />
    </div>
  )
}

export default OwnerLoginPage
