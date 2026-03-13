import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Footer from '../../components/Footer'
import { 
  Building,
  Search,
  Filter,
  Plus,
  ArrowLeft,
  MoreVertical,
  Users,
  BarChart3,
  Settings,
  Edit3,
  Trash2,
  Eye
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { superAdminApi } from '../../utils/api'
import { toast } from 'react-hot-toast'

const CollegeManagement = () => {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [showAddForm, setShowAddForm] = useState(false)
  const [selectedCollege, setSelectedCollege] = useState<any>(null)
  const [editingCollege, setEditingCollege] = useState<any>(null)
  
  const queryClient = useQueryClient()

  // Form state
  const [collegeForm, setCollegeForm] = useState({
    college_name: '',
    address: '',
    contact_email: '',
    contact_phone: '',
    website_url: '',
    established_year: new Date().getFullYear(),
    college_type: 'engineering',
    status: 'active'
  })

  const { data: collegesData, isLoading } = useQuery({
    queryKey: ['super-admin-colleges', searchTerm, filterStatus],
    queryFn: () => superAdminApi.getAllColleges({
      search: searchTerm,
      status: filterStatus === 'all' ? undefined : filterStatus
    }),
  })

  const addCollegeMutation = useMutation({
    mutationFn: superAdminApi.addCollege,
    onSuccess: () => {
      toast.success('College added successfully!')
      setShowAddForm(false)
      setCollegeForm({
        college_name: '',
        address: '',
        contact_email: '',
        contact_phone: '',
        website_url: '',
        established_year: new Date().getFullYear(),
        college_type: 'engineering',
        status: 'active'
      })
      queryClient.invalidateQueries({ queryKey: ['super-admin-colleges'] })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to add college')
    }
  })

  const updateCollegeMutation = useMutation({
    mutationFn: (data: any) => superAdminApi.updateCollegeInfo(data),
    onSuccess: () => {
      toast.success('College updated successfully!')
      setEditingCollege(null)
      queryClient.invalidateQueries({ queryKey: ['super-admin-colleges'] })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to update college')
    }
  })

  const updateCollegeStatusMutation = useMutation({
    mutationFn: ({ collegeId, status }: { collegeId: string, status: string }) =>
      superAdminApi.updateCollegeStatus(collegeId, status),
    onSuccess: () => {
      toast.success('College status updated successfully!')
      queryClient.invalidateQueries({ queryKey: ['super-admin-colleges'] })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to update college status')
    }
  })

  const colleges = collegesData?.data || []

  const handleAddCollege = (e: React.FormEvent) => {
    e.preventDefault()
    addCollegeMutation.mutate(collegeForm)
  }

  const handleStatusUpdate = (collegeId: string, status: string) => {
    updateCollegeStatusMutation.mutate({ collegeId, status })
  }

  const handleOpenEdit = (college: any) => {
    setEditingCollege({ ...college })
    setSelectedCollege(null)
  }

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateCollegeMutation.mutate({
      college_name: editingCollege.college_name,
      address: editingCollege.address,
      contact_phone: editingCollege.contact_phone,
      website_url: editingCollege.website_url,
      established_year: editingCollege.established_year,
      college_type: editingCollege.college_type,
      status: editingCollege.status,
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-100'
      case 'inactive': return 'text-gray-600 bg-gray-100'
      case 'suspended': return 'text-red-600 bg-red-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getCollegeTypeColor = (type: string) => {
    switch (type) {
      case 'engineering': return 'text-blue-600 bg-blue-100'
      case 'management': return 'text-purple-600 bg-purple-100'
      case 'arts': return 'text-pink-600 bg-pink-100'
      case 'science': return 'text-green-600 bg-green-100'
      case 'medical': return 'text-red-600 bg-red-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Link 
                to="/super-admin"
                className="flex items-center text-gray-500 hover:text-gray-700 mr-4"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">College Management</h1>
            </div>
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add College
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Controls */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between space-y-4 md:space-y-0">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search colleges..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <select
                className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>
        </div>

        {/* Colleges Grid */}
        <div className="grid gap-6">
          {isLoading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-white rounded-lg shadow p-6 animate-pulse">
                  <div className="space-y-4">
                    <div className="h-6 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                    <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                    <div className="flex space-x-2">
                      <div className="h-6 bg-gray-200 rounded w-16"></div>
                      <div className="h-6 bg-gray-200 rounded w-20"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : colleges.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {colleges.map((college: any) => (
                <div key={college.college_id} className="bg-white rounded-lg shadow hover:shadow-md transition-shadow">
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                          {college.college_name}
                        </h3>
                        <p className="text-sm text-gray-600 mb-2">
                          {college.address}
                        </p>
                        <div className="flex items-center space-x-2 mb-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            getStatusColor(college.status)
                          }`}>
                            {college.status}
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            getCollegeTypeColor(college.college_type)
                          }`}>
                            {college.college_type}
                          </span>
                        </div>
                      </div>
                      <div className="relative">
                        <button 
                          onClick={() => setSelectedCollege(college)}
                          className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                      <div className="flex items-center">
                        <Users className="h-4 w-4 text-gray-400 mr-2" />
                        <div>
                          <div className="font-semibold text-gray-900">
                            {college.total_students || 0}
                          </div>
                          <div className="text-gray-500">Students</div>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <Building className="h-4 w-4 text-gray-400 mr-2" />
                        <div>
                          <div className="font-semibold text-gray-900">
                            {college.total_admins || 0}
                          </div>
                          <div className="text-gray-500">Admins</div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                      <div className="text-sm text-gray-500">
                        Est. {college.established_year}
                      </div>
                      <div className="flex items-center space-x-2">
                        <Link
                          to={`/super-admin/colleges/${college.college_id}`}
                          className="p-1 text-gray-400 hover:text-primary-600 rounded"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        <Link
                          to={`/super-admin/colleges/${college.college_id}/analytics`}
                          className="p-1 text-gray-400 hover:text-primary-600 rounded"
                        >
                          <BarChart3 className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() => handleOpenEdit(college)}
                          className="p-1 text-gray-400 hover:text-primary-600 rounded"
                          title="Edit college"
                        >
                          <Settings className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <Building className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No colleges found</h3>
              <p className="text-gray-500 mb-4">
                {searchTerm || filterStatus !== 'all' 
                  ? 'No colleges match your current filters'
                  : 'Get started by adding your first college to the platform'
                }
              </p>
              <button
                onClick={() => setShowAddForm(true)}
                className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium"
              >
                Add College
              </button>
            </div>
          )}
        </div>

        {/* Add College Modal */}
        {showAddForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Add New College</h3>
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleAddCollege} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      College Name *
                    </label>
                    <input
                      type="text"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      value={collegeForm.college_name}
                      onChange={(e) => setCollegeForm(prev => ({ ...prev, college_name: e.target.value }))}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Address
                    </label>
                    <textarea
                      rows={3}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      value={collegeForm.address}
                      onChange={(e) => setCollegeForm(prev => ({ ...prev, address: e.target.value }))}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Contact Email *
                      </label>
                      <input
                        type="email"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        value={collegeForm.contact_email}
                        onChange={(e) => setCollegeForm(prev => ({ ...prev, contact_email: e.target.value }))}
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Contact Phone
                      </label>
                      <input
                        type="tel"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        value={collegeForm.contact_phone}
                        onChange={(e) => setCollegeForm(prev => ({ ...prev, contact_phone: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Website URL
                    </label>
                    <input
                      type="url"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      value={collegeForm.website_url}
                      onChange={(e) => setCollegeForm(prev => ({ ...prev, website_url: e.target.value }))}
                      placeholder="https://"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Established Year
                      </label>
                      <input
                        type="number"
                        min="1800"
                        max={new Date().getFullYear()}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        value={collegeForm.established_year}
                        onChange={(e) => setCollegeForm(prev => ({ ...prev, established_year: parseInt(e.target.value) }))}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        College Type
                      </label>
                      <select
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        value={collegeForm.college_type}
                        onChange={(e) => setCollegeForm(prev => ({ ...prev, college_type: e.target.value }))}
                      >
                        <option value="engineering">Engineering</option>
                        <option value="management">Management</option>
                        <option value="arts">Arts & Humanities</option>
                        <option value="science">Science</option>
                        <option value="medical">Medical</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Initial Status
                      </label>
                      <select
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        value={collegeForm.status}
                        onChange={(e) => setCollegeForm(prev => ({ ...prev, status: e.target.value }))}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end space-x-3 pt-6 border-t">
                    <button
                      type="button"
                      onClick={() => setShowAddForm(false)}
                      className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={addCollegeMutation.isPending}
                      className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      {addCollegeMutation.isPending ? 'Adding...' : 'Add College'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* College Actions Menu */}
        {selectedCollege && (
          <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg p-4 min-w-[200px]">
              <h4 className="font-semibold text-gray-900 mb-3">{selectedCollege.college_name}</h4>
              <div className="space-y-2">
                <Link
                  to={`/super-admin/colleges/${selectedCollege.college_id}`}
                  className="flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
                  onClick={() => setSelectedCollege(null)}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  View Details
                </Link>
                <Link
                  to={`/super-admin/colleges/${selectedCollege.college_id}/analytics`}
                  className="flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
                  onClick={() => setSelectedCollege(null)}
                >
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Analytics
                </Link>
                <button
                  onClick={() => {
                    const newStatus = selectedCollege.status === 'active' ? 'inactive' : 'active'
                    handleStatusUpdate(selectedCollege.college_id, newStatus)
                    setSelectedCollege(null)
                  }}
                  className="flex items-center w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  {selectedCollege.status === 'active' ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  onClick={() => handleOpenEdit(selectedCollege)}
                  className="flex items-center w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  <Edit3 className="h-4 w-4 mr-2" />
                  Edit Info
                </button>
              </div>
              <div className="mt-3 pt-3 border-t">
                <button
                  onClick={() => setSelectedCollege(null)}
                  className="w-full px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Edit College Modal */}
        {editingCollege && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Edit College</h3>
                  <button
                    onClick={() => setEditingCollege(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleEditSubmit} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      College Name *
                    </label>
                    <input
                      type="text"
                      required
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      value={editingCollege.college_name || ''}
                      onChange={(e) => setEditingCollege((p: any) => ({ ...p, college_name: e.target.value }))}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                    <textarea
                      rows={3}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      value={editingCollege.address || ''}
                      onChange={(e) => setEditingCollege((p: any) => ({ ...p, address: e.target.value }))}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Contact Phone
                      </label>
                      <input
                        type="tel"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        value={editingCollege.contact_phone || ''}
                        onChange={(e) => setEditingCollege((p: any) => ({ ...p, contact_phone: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Website URL
                      </label>
                      <input
                        type="url"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        value={editingCollege.website_url || ''}
                        onChange={(e) => setEditingCollege((p: any) => ({ ...p, website_url: e.target.value }))}
                        placeholder="https://"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Established Year
                      </label>
                      <input
                        type="number"
                        min="1800"
                        max={new Date().getFullYear()}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        value={editingCollege.established_year || ''}
                        onChange={(e) =>
                          setEditingCollege((p: any) => ({
                            ...p,
                            established_year: parseInt(e.target.value) || null,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        College Type
                      </label>
                      <select
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        value={editingCollege.college_type || 'engineering'}
                        onChange={(e) => setEditingCollege((p: any) => ({ ...p, college_type: e.target.value }))}
                      >
                        <option value="engineering">Engineering</option>
                        <option value="management">Management</option>
                        <option value="arts">Arts & Humanities</option>
                        <option value="science">Science</option>
                        <option value="medical">Medical</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                      <select
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        value={editingCollege.status || 'active'}
                        onChange={(e) => setEditingCollege((p: any) => ({ ...p, status: e.target.value }))}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end space-x-3 pt-6 border-t">
                    <button
                      type="button"
                      onClick={() => setEditingCollege(null)}
                      className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={updateCollegeMutation.isPending}
                      className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      {updateCollegeMutation.isPending ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </div>
  )
}

export default CollegeManagement