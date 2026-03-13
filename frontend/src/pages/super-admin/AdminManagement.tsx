import { useMemo, useState } from 'react'
import Footer from '../../components/Footer'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowLeft, Copy, KeyRound, Plus, Trash2, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { superAdminApi } from '../../utils/api'
import { getApiErrorMessage } from '../../utils/api'

type AdminRow = {
  id: number
  email: string
  username: string
  full_name: string
  department: string
  unique_admin_id: string
  permissions: string[]
  created_at: string
  is_active: boolean
  temporary_password?: string
}

const AdminManagement = () => {
  const queryClient = useQueryClient()

  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    email: '',
    username: '',
    full_name: '',
    department: '',
    unique_admin_id: '',
    password: '',
  })

  const { data, isLoading } = useQuery({
    queryKey: ['super-admin-admins-list'],
    queryFn: superAdminApi.getAdmins,
  })

  const admins: AdminRow[] = useMemo(() => {
    const rows = (data as any)?.data
    return Array.isArray(rows) ? (rows as AdminRow[]) : []
  }, [data])

  const createMutation = useMutation({
    mutationFn: (payload: any) => superAdminApi.createAdmin(payload),
    onSuccess: (res: any) => {
      const created = res?.data as AdminRow | undefined
      toast.success('Admin created')
      setShowCreate(false)
      setForm({ email: '', username: '', full_name: '', department: '', unique_admin_id: '', password: '' })
      queryClient.invalidateQueries({ queryKey: ['super-admin-admins-list'] })

      if (created?.unique_admin_id) {
        const temp = created?.temporary_password ? `\nTemporary password: ${created.temporary_password}` : ''
        toast.success(`Admin ID: ${created.unique_admin_id}${temp}`)
      }
    },
    onError: (err: any) => {
      toast.error(getApiErrorMessage(err, 'Failed to create admin'))
    },
  })

  const resetPasswordMutation = useMutation({
    mutationFn: (adminUserId: number) => superAdminApi.resetDepartmentAdminPassword(adminUserId),
    onSuccess: (res: any) => {
      const temp = res?.data?.temporary_password
      toast.success('Password reset')
      if (temp) toast.success(`Temporary password: ${temp}`)
    },
    onError: (err: any) => {
      toast.error(getApiErrorMessage(err, 'Failed to reset password'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (adminUserId: number) => superAdminApi.deleteAdmin(adminUserId),
    onSuccess: () => {
      toast.success('Admin deleted')
      queryClient.invalidateQueries({ queryKey: ['super-admin-admins-list'] })
    },
    onError: (err: any) => {
      toast.error(getApiErrorMessage(err, 'Failed to delete admin'))
    },
  })

  const toggleActiveMutation = useMutation({
    mutationFn: (adminUserId: number) => superAdminApi.toggleAdminActive(adminUserId),
    onSuccess: (res: any) => {
      const isActive: boolean = res?.data?.is_active
      toast.success(isActive ? 'Admin activated' : 'Admin deactivated')
      queryClient.invalidateQueries({ queryKey: ['super-admin-admins-list'] })
    },
    onError: (err: any) => {
      toast.error(getApiErrorMessage(err, 'Failed to update admin status'))
    },
  })

  const onCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.email || !form.username || !form.full_name || !form.department || !form.password) {
      toast.error('Please fill all required fields')
      return
    }
    createMutation.mutate({
      email: form.email,
      username: form.username,
      full_name: form.full_name,
      department: form.department,
      unique_admin_id: form.unique_admin_id,
      password: form.password,
    })
  }

  const copyText = async (text: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard');
      } else {
        // Fallback for older browsers or non-secure contexts
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "-9999px";
        textArea.style.opacity = "0";
        textArea.setAttribute('readonly', '');
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        let success = false;
        try {
          success = document.execCommand('copy');
        } catch (_err) {
          success = false;
        }
        document.body.removeChild(textArea);
        if (success) {
          toast.success('Copied to clipboard');
        } else {
          toast.error('Copy failed – please copy manually: ' + text);
        }
      }
    } catch {
      toast.error('Copy failed – please copy manually: ' + text);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Link to="/super-admin" className="flex items-center text-gray-500 hover:text-gray-700 mr-4">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Department Admins</h1>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Admin
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow p-6">
          {isLoading ? (
            <div className="animate-pulse space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 bg-gray-200 rounded" />
              ))}
            </div>
          ) : admins.length ? (
            <div className="space-y-4">
              {admins.map((a) => (
                <div key={a.unique_admin_id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-gray-400" />
                        <div className="font-semibold text-gray-900">{a.full_name}</div>
                        <div className="text-xs text-gray-500">({a.username})</div>
                        {a.is_active ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Active</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Inactive</span>
                        )}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">{a.email}</div>
                      <div className="text-sm text-gray-600">Department: {a.department}</div>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs text-gray-500">Admin ID</span>
                        <span className="font-mono text-sm">{a.unique_admin_id}</span>
                        <button
                          type="button"
                          onClick={() => copyText(a.unique_admin_id)}
                          className="text-gray-500 hover:text-gray-700"
                          title="Copy Admin ID"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
                      {a.temporary_password ? (
                        <div className="mt-2 flex items-center gap-2">
                          <KeyRound className="h-4 w-4 text-gray-400" />
                          <span className="text-xs text-gray-500">Temporary password</span>
                          <span className="font-mono text-sm">{a.temporary_password}</span>
                          <button
                            type="button"
                            onClick={() => copyText(a.temporary_password!)}
                            className="text-gray-500 hover:text-gray-700"
                            title="Copy password"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="text-xs text-gray-500">Created: {new Date(a.created_at).toLocaleString()}</div>
                      <button
                        type="button"
                        onClick={() => resetPasswordMutation.mutate(a.id)}
                        className="px-3 py-1 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center"
                        disabled={resetPasswordMutation.isPending}
                        title="Reset this admin's password"
                      >
                        <KeyRound className="h-4 w-4 mr-1" />
                        Reset password
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActiveMutation.mutate(a.id)}
                        className={`px-3 py-1 rounded-lg border flex items-center text-sm ${
                          a.is_active
                            ? 'border-amber-400 text-amber-700 hover:bg-amber-50'
                            : 'border-green-400 text-green-700 hover:bg-green-50'
                        }`}
                        disabled={toggleActiveMutation.isPending}
                        title={a.is_active ? 'Deactivate this admin' : 'Activate this admin'}
                      >
                        {a.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Delete admin "${a.full_name}"? This cannot be undone.`)) {
                            deleteMutation.mutate(a.id)
                          }
                        }}
                        className="px-3 py-1 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 flex items-center text-sm"
                        disabled={deleteMutation.isPending}
                        title="Permanently delete this admin"
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
              <Users className="h-10 w-10 text-gray-400 mx-auto mb-3" />
              <div className="text-gray-700 font-medium">No admins yet</div>
              <div className="text-gray-500 text-sm mt-1">Create department admins to generate unique Admin IDs for student registration.</div>
              <button
                onClick={() => setShowCreate(true)}
                className="mt-4 inline-flex items-center px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Admin
              </button>
            </div>
          )}
        </div>
      </div>

      {showCreate ? (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-lg w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Create Department Admin</h2>
                <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>

              <form onSubmit={onCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
                  <input
                    className="input-field"
                    value={form.full_name}
                    onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
                    placeholder="e.g., Dr. Kumar"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                  <input
                    className="input-field"
                    value={form.username}
                    onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
                    placeholder="e.g., cse_admin"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    className="input-field"
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    placeholder="admin@college.edu"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                  <input
                    className="input-field"
                    value={form.department}
                    onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))}
                    placeholder="e.g., Computer Science"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unique Admin ID</label>
                  <input
                    className="input-field"
                    value={form.unique_admin_id}
                    onChange={(e) => setForm((p) => ({ ...p, unique_admin_id: e.target.value.toUpperCase() }))}
                    placeholder="Leave empty to auto-generate"
                  />
                  <div className="text-xs text-gray-500 mt-1">Any non-empty value is accepted. Students will use this Admin ID to register.</div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    className="input-field"
                    value={form.password}
                    onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                    placeholder="Set a password for this admin"
                  />
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
                    className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-50"
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

export default AdminManagement
