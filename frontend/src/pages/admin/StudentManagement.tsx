import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Footer from '../../components/Footer'
import {
  Users,
  Search,
  MoreVertical,
  UserPlus,
  Eye,
  BarChart3,
  Calendar,
  ArrowLeft,
  Download,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { adminApi } from '../../utils/api'
import { toast } from 'react-hot-toast'

const StudentManagement = () => {
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [selectedStudents, setSelectedStudents] = useState<number[]>([])
  const [page, setPage] = useState(1)
  const pageSize = 10

  const { data: meData } = useQuery({
    queryKey: ['admin-me'],
    queryFn: adminApi.getMe,
  })

  const { data: studentsData, isLoading } = useQuery({
    queryKey: ['admin-students', searchTerm, filterStatus],
    queryFn: () => adminApi.getMyStudents({ 
      search: searchTerm, 
      status: filterStatus === 'all' ? undefined : filterStatus 
    }),
  })

  const students = studentsData?.data || []

  const filteredStudents = useMemo(() => {
    const s = (searchTerm || '').trim().toLowerCase()
    return (students as any[])
      .filter(st => {
        if (!s) return true
        const name = String(st.student_name || '').toLowerCase()
        const email = String(st.email || '').toLowerCase()
        return name.includes(s) || email.includes(s)
      })
      .filter(st => {
        if (filterStatus === 'all') return true
        return String(st.status || 'active').toLowerCase() === filterStatus
      })
  }, [students, searchTerm, filterStatus])

  // Keep pagination within bounds when filters change
  useEffect(() => {
    setPage(1)
  }, [searchTerm, filterStatus])

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize))
  const currentPage = Math.min(Math.max(1, page), totalPages)
  const pageStartIdx = (currentPage - 1) * pageSize
  const pagedStudents = filteredStudents.slice(pageStartIdx, pageStartIdx + pageSize)

  const downloadCsv = (filename: string, rows: Array<Record<string, any>>) => {
    if (!rows.length) {
      toast.error('Nothing to export')
      return
    }

    const headersSet = rows.reduce<Set<string>>((acc, row) => {
      Object.keys(row).forEach(k => acc.add(k))
      return acc
    }, new Set<string>())

    const headers = Array.from(headersSet)

    const escape = (v: any) => {
      const s = String(v ?? '')
      const needsQuotes = /[\n\r",]/.test(s)
      const escaped = s.replace(/"/g, '""')
      return needsQuotes ? `"${escaped}"` : escaped
    }

    const csv = [
      headers.join(','),
      ...rows.map(r => headers.map(h => escape(r[h])).join(',')),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.setAttribute('readonly', '')
        ta.style.position = 'absolute'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        const ok = document.execCommand('copy')
        ta.remove()
        return ok
      } catch {
        return false
      }
    }
  }

  const handleAddStudent = async () => {
    const uniqueAdminId = String(meData?.data?.unique_admin_id || '').trim()
    if (!uniqueAdminId) {
      toast.error('Could not load your Admin ID')
      return
    }

    const link = `${window.location.origin}/register?admin_id=${encodeURIComponent(uniqueAdminId)}`
    const ok = await copyText(link)
    if (ok) toast.success('Student registration link copied')
    else toast.error('Failed to copy link')
  }

  const handleExportAll = () => {
    const rows = filteredStudents.map((st: any) => ({
      student_id: st.student_id,
      student_name: st.student_name,
      email: st.email,
      total_interviews: st.total_interviews ?? 0,
      average_score: st.average_score ?? 0,
      status: st.status ?? 'active',
    }))
    downloadCsv('students.csv', rows)
  }

  const handleExportSelected = () => {
    const selected = new Set(selectedStudents)
    const rows = filteredStudents
      .filter((st: any) => selected.has(Number(st.student_id)))
      .map((st: any) => ({
        student_id: st.student_id,
        student_name: st.student_name,
        email: st.email,
        total_interviews: st.total_interviews ?? 0,
        average_score: st.average_score ?? 0,
        status: st.status ?? 'active',
      }))
    downloadCsv('students-selected.csv', rows)
  }

  const handleBulkSchedule = () => {
    if (!selectedStudents.length) return
    const qs = selectedStudents.join(',')
    navigate(`/admin/schedule?student_ids=${encodeURIComponent(qs)}`)
  }

  const handleSelectStudent = (studentId: number) => {
    setSelectedStudents(prev => 
      prev.includes(studentId) 
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    )
  }

  const handleSelectAll = () => {
    if (selectedStudents.length === pagedStudents.length) {
      setSelectedStudents([])
    } else {
      setSelectedStudents(pagedStudents.map((s: any) => Number(s.student_id)))
    }
  }

  const getPerformanceColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-100'
    if (score >= 60) return 'text-yellow-600 bg-yellow-100'
    return 'text-red-600 bg-red-100'
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-100'
      case 'inactive': return 'text-gray-600 bg-gray-100'
      case 'suspended': return 'text-red-600 bg-red-100'
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
                to="/admin"
                className="flex items-center text-gray-500 hover:text-gray-700 mr-4"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Student Management</h1>
            </div>
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
                  placeholder="Search students..."
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
              
              <button
                onClick={handleExportAll}
                className="flex items-center px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </button>
              
              <button
                onClick={handleAddStudent}
                className="flex items-center px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Add Student
              </button>
            </div>
          </div>
          
          {selectedStudents.length > 0 && (
            <div className="mt-4 flex items-center justify-between p-3 bg-primary-50 rounded-lg">
              <span className="text-sm text-primary-700">
                {selectedStudents.length} student{selectedStudents.length > 1 ? 's' : ''} selected
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleBulkSchedule}
                  className="text-sm text-primary-600 hover:text-primary-700"
                >
                  Schedule Interview
                </button>
                <button
                  onClick={handleExportSelected}
                  className="text-sm text-primary-600 hover:text-primary-700"
                >
                  Export Data
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Students Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {isLoading ? (
            <div className="p-8">
              <div className="animate-pulse space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center space-x-4">
                    <div className="h-4 w-4 bg-gray-200 rounded"></div>
                    <div className="h-4 bg-gray-200 rounded flex-1"></div>
                    <div className="h-4 bg-gray-200 rounded w-24"></div>
                    <div className="h-4 bg-gray-200 rounded w-16"></div>
                    <div className="h-4 bg-gray-200 rounded w-20"></div>
                  </div>
                ))}
              </div>
            </div>
          ) : filteredStudents.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={pagedStudents.length > 0 && selectedStudents.length === pagedStudents.length}
                        onChange={handleSelectAll}
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Student
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Performance
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Interviews
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Active
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {pagedStudents.map((student: any) => (
                    <tr key={student.student_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedStudents.includes(Number(student.student_id))}
                          onChange={() => handleSelectStudent(Number(student.student_id))}
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                        />
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="h-10 w-10 flex-shrink-0">
                            <div className="h-10 w-10 bg-primary-100 rounded-full flex items-center justify-center">
                              <span className="text-primary-600 font-medium text-sm">
                                {student.student_name?.charAt(0)?.toUpperCase() || 'S'}
                              </span>
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {student.student_name}
                            </div>
                            <div className="text-sm text-gray-500">{student.email}</div>
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                            getPerformanceColor(student.average_score || 0)
                          }`}>
                            {(student.average_score || 0).toFixed(1)}%
                          </div>
                          <BarChart3 className="h-4 w-4 text-gray-400 ml-2" />
                        </div>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="flex items-center">
                          <span className="font-medium">{student.total_interviews || 0}</span>
                          <span className="text-gray-500 ml-1">completed</span>
                        </div>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          getStatusColor(student.status || 'active')
                        }`}>
                          {(student.status || 'active').charAt(0).toUpperCase() + 
                           (student.status || 'active').slice(1)}
                        </span>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {student.last_login ? 
                          new Date(student.last_login).toLocaleDateString() : 
                          'Never'
                        }
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          <Link
                            to={`/admin/students/${student.student_id}`}
                            className="text-primary-600 hover:text-primary-900 p-1 rounded"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          <Link
                            to={`/admin/students/${student.student_id}/analytics`}
                            className="text-primary-600 hover:text-primary-900 p-1 rounded"
                          >
                            <BarChart3 className="h-4 w-4" />
                          </Link>
                          <Link
                            to={`/admin/students/${student.student_id}/schedule`}
                            className="text-primary-600 hover:text-primary-900 p-1 rounded"
                          >
                            <Calendar className="h-4 w-4" />
                          </Link>
                          <button
                            onClick={() => navigate(`/admin/students/${student.student_id}`)}
                            className="text-gray-400 hover:text-gray-600 p-1 rounded"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No students found</h3>
              <p className="text-gray-500 mb-4">
                {searchTerm || filterStatus !== 'all' 
                  ? 'Try adjusting your search or filter criteria'
                  : 'You don\'t have any students registered yet'
                }
              </p>
              {!searchTerm && filterStatus === 'all' && (
                <button
                  onClick={handleAddStudent}
                  className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium"
                >
                  Add Your First Student
                </button>
              )}
            </div>
          )}
        </div>

        {/* Pagination */}
        {filteredStudents.length > 0 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6 mt-8 rounded-lg shadow">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                disabled={currentPage <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing <span className="font-medium">{filteredStudents.length === 0 ? 0 : pageStartIdx + 1}</span> to{' '}
                  <span className="font-medium">{Math.min(pageStartIdx + pageSize, filteredStudents.length)}</span> of{' '}
                  <span className="font-medium">{filteredStudents.length}</span> results
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                  <button
                    disabled={currentPage <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-primary-50 text-sm font-medium text-primary-600">
                    {currentPage}
                  </button>
                  <button
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </div>
  )
}

export default StudentManagement