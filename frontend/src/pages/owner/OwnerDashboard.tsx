import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import Footer from '../../components/Footer'
import { ArrowLeft, KeyRound, LogOut, Plus, Shield, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { api, getApiErrorMessage } from '../../utils/api'
import { useAuthStore } from '../../stores/authStore'

type SuperAdminRow = {
  id: number
  email: string
  username: string
  full_name: string
  college_name?: string | null
  is_active: boolean
}

const ownerApi = {
  listSuperAdmins: () => api.get('/owner/super-admins'),
  createSuperAdmin: (payload: any) => api.post('/owner/super-admins', payload),
  updateSuperAdmin: (id: number, payload: any) => api.put(`/owner/super-admins/${id}`, payload),
  resetPassword: (id: number) => api.post(`/owner/super-admins/${id}/reset-password`),
  deactivate: (id: number) => api.delete(`/owner/super-admins/${id}`),
  hardDelete: (id: number) => api.delete(`/owner/super-admins/${id}/hard-delete`),
}

const OwnerDashboard = () => {
  const queryClient = useQueryClient()
  const { user, logout } = useAuthStore()

  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    email: '',
    username: '',
    full_name: '',
    college_name: '',
    password: '',
  })

  const { data, isLoading } = useQuery({
    queryKey: ['owner-super-admins'],
    queryFn: ownerApi.listSuperAdmins,
  })

  const rows: SuperAdminRow[] = useMemo(() => {
    const v = (data as any)?.data
    return Array.isArray(v) ? (v as SuperAdminRow[]) : []
  }, [data])

  const createMutation = useMutation({
    mutationFn: ownerApi.createSuperAdmin,
    onSuccess: (res: any) => {
      const temp = res?.data?.temporary_password
      toast.success('Super admin created')
      if (temp) toast.success(`Temporary password: ${temp}`)
      setShowCreate(false)
      setForm({ email: '', username: '', full_name: '', college_name: '', password: '' })
      queryClient.invalidateQueries({ queryKey: ['owner-super-admins'] })
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Failed to create super admin')),
  })

  const resetMutation = useMutation({
    mutationFn: (id: number) => ownerApi.resetPassword(id),
    onSuccess: (res: any) => {
      const temp = res?.data?.temporary_password
      toast.success('Password reset')
      if (temp) toast.success(`Temporary password: ${temp}`)
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Failed to reset password')),
  })

  const setActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) => ownerApi.updateSuperAdmin(id, { is_active }),
    onSuccess: (_res: any, vars) => {
      toast.success(vars.is_active ? 'Super admin activated' : 'Super admin deactivated')
      queryClient.invalidateQueries({ queryKey: ['owner-super-admins'] })
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Failed to update status')),
  })

  const hardDeleteMutation = useMutation({
    mutationFn: (id: number) => ownerApi.hardDelete(id),
    onSuccess: () => {
      toast.success('Super admin deleted')
      queryClient.invalidateQueries({ queryKey: ['owner-super-admins'] })
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Failed to delete super admin')),
  })

  const onCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.email || !form.username || !form.full_name || !form.college_name) {
      toast.error('Please fill all fields')
      return
    }
    createMutation.mutate({
      email: form.email,
      username: form.username,
      full_name: form.full_name,
      college_name: form.college_name,
      password: form.password?.trim() ? form.password : undefined,
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Link to="/" className="flex items-center text-gray-500 hover:text-gray-700 mr-4">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Home
              </Link>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 bg-gray-900 rounded-lg flex items-center justify-center">
                  <Shield className="h-4 w-4 text-white" />
                </div>
                <h1 className="text-xl font-bold text-gray-900">Owner Dashboard</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-xs text-gray-600">
                Signed in as <span className="font-medium">{user?.full_name}</span>
              </div>
              <button onClick={logout} className="flex items-center text-gray-500 hover:text-gray-700">
                <LogOut className="h-4 w-4 mr-1" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Super Admin
          </button>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          {isLoading ? (
            <div className="animate-pulse space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 bg-gray-200 rounded" />
              ))}
            </div>
          ) : rows.length ? (
            <div className="space-y-4">
              {rows.map((sa) => (
                <div key={sa.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-gray-900">{sa.college_name || 'Unknown college'}</div>
                      <div className="text-sm text-gray-600">{sa.full_name} ({sa.username})</div>
                      <div className="text-sm text-gray-600">{sa.email}</div>
                      <div className="text-xs mt-2">
                        Status:{' '}
                        <span className={sa.is_active ? 'text-green-700' : 'text-red-700'}>
                          {sa.is_active ? 'active' : 'inactive'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => resetMutation.mutate(sa.id)}
                        className="px-3 py-1 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center"
                      >
                        <KeyRound className="h-4 w-4 mr-1" />
                        Reset password
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (sa.is_active) {
                            setActiveMutation.mutate({ id: sa.id, is_active: false })
                          } else {
                            setActiveMutation.mutate({ id: sa.id, is_active: true })
                          }
                        }}
                        className="px-3 py-1 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center"
                        title={sa.is_active ? 'Deactivate' : 'Activate'}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        {sa.is_active ? 'Deactivate' : 'Activate'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const ok = window.confirm(
                            `Delete super admin for "${sa.college_name || 'Unknown college'}"?\n\nThis will permanently delete:\n- The super admin\n- All admins under this college\n- All students under those admins\n- Their interviews, performance records, and malpractice logs\n\nThis cannot be undone.`
                          )
                          if (!ok) return
                          hardDeleteMutation.mutate(sa.id)
                        }}
                        className="px-3 py-1 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 flex items-center"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Shield className="h-10 w-10 text-gray-400 mx-auto mb-3" />
              <div className="text-gray-700 font-medium">No super admins yet</div>
              <div className="text-gray-500 text-sm mt-1">Create super admins for each college.</div>
            </div>
          )}
        </div>
      </div>

      {showCreate ? (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-lg w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Create Super Admin</h2>
                <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>

              <form onSubmit={onCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">College name</label>
                  <input
                    className="input-field"
                    value={form.college_name}
                    onChange={(e) => setForm((p) => ({ ...p, college_name: e.target.value }))}
                    placeholder="ABC Engineering College"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
                  <input
                    className="input-field"
                    value={form.full_name}
                    onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
                    placeholder="College Super Admin"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                  <input
                    className="input-field"
                    value={form.username}
                    onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
                    placeholder="college_superadmin"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    className="input-field"
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    placeholder="superadmin@college.edu"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    className="input-field"
                    value={form.password}
                    onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                    placeholder="Leave blank to auto-generate"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    If left blank, a temporary password will be generated and shown after creation.
                  </p>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending}
                    className="px-4 py-2 rounded-lg bg-gray-900 hover:bg-gray-800 text-white disabled:opacity-50"
                  >
                    {createMutation.isPending ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
      <Footer />
    </div>
  )
}

export default OwnerDashboard
