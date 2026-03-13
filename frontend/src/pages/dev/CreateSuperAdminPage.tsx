import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import Footer from '../../components/Footer'
import { ArrowLeft, Building2, KeyRound, Mail, Lock, User } from 'lucide-react'
import { superAdminApi, getApiErrorMessage } from '../../utils/api'

const CreateSuperAdminPage = () => {
  const navigate = useNavigate()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [form, setForm] = useState({
    email: '',
    username: '',
    password: '',
    full_name: '',
    college_name: '',
    super_admin_secret: '',
  })

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.super_admin_secret.trim()) {
      toast.error('Super admin secret is required')
      return
    }

    setIsSubmitting(true)
    try {
      const payload = {
        email: form.email,
        username: form.username,
        password: form.password,
        full_name: form.full_name,
        college_name: form.college_name,
      }

      await superAdminApi.createSuperAdmin(payload, form.super_admin_secret)
      toast.success('Super admin created. You can now login.')
      navigate('/login')
    } catch (err: any) {
      toast.error(getApiErrorMessage(err, 'Failed to create super admin'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white shadow-sm">
        <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Link to="/" className="flex items-center text-gray-500 hover:text-gray-700 mr-4">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Home
              </Link>
              <h1 className="text-xl font-bold text-gray-900">Create Super Admin (Dev Only)</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 mb-6">
            This page is available only in development builds. The backend bootstrap endpoint is also restricted (secret + localhost by default).
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">College name</label>
              <div className="relative">
                <input
                  className="input-field pl-10"
                  value={form.college_name}
                  onChange={(e) => setForm((p) => ({ ...p, college_name: e.target.value }))}
                  placeholder="e.g., ABC Engineering College"
                  required
                />
                <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
              <div className="relative">
                <input
                  className="input-field pl-10"
                  value={form.full_name}
                  onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
                  placeholder="College Super Admin"
                  required
                />
                <User className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <div className="relative">
                <input
                  className="input-field pl-10"
                  value={form.username}
                  onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
                  placeholder="college_superadmin"
                  required
                />
                <User className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <div className="relative">
                <input
                  type="email"
                  className="input-field pl-10"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="superadmin@college.edu"
                  required
                />
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type="password"
                  className="input-field pl-10"
                  value={form.password}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                  placeholder="StrongPassword@123"
                  required
                />
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Super admin secret</label>
              <div className="relative">
                <input
                  type="password"
                  className="input-field pl-10"
                  value={form.super_admin_secret}
                  onChange={(e) => setForm((p) => ({ ...p, super_admin_secret: e.target.value }))}
                  placeholder="SUPER_ADMIN_SECRET from backend/.env"
                  required
                />
                <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              </div>
              <div className="mt-1 text-xs text-gray-500">
                This is never stored; it’s sent as an HTTP header.
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Creating...' : 'Create Super Admin'}
            </button>
          </form>

          <div className="mt-4 text-xs text-gray-500">
            If you get “restricted to localhost”, open this page from the same machine as the backend.
          </div>
        </div>
      </div>
      <Footer />
    </div>
  )
}

export default CreateSuperAdminPage
