import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Footer from '../../components/Footer'
import { 
  Calendar,
  Clock,
  Users,
  Plus,
  ArrowLeft,
  Search,
  Filter,
  BookOpen,
  Video,
  FileText,
  ExternalLink,
  Trash2,
  Edit3
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { adminApi, studentApi } from '../../utils/api'
import { toast } from 'react-hot-toast'

const InterviewScheduling = () => {
  const [searchParams] = useSearchParams()
  const [showScheduleForm, setShowScheduleForm] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [selectedDate, setSelectedDate] = useState('')
  
  const queryClient = useQueryClient()

  // Form state
  const [scheduleForm, setScheduleForm] = useState({
    interview_type: 'domain_based' as 'resume_based' | 'domain_based',
    domain: '',
    scheduled_at: '',
    scheduled_end_at: '',
    num_questions: 10,
    is_proctored: true,
    student_emails: '',
  })

  const { data: domainsData } = useQuery({
    queryKey: ['domains-for-scheduling'],
    queryFn: studentApi.getDomains,
  })

  const { data: studentsData } = useQuery({
    queryKey: ['admin-students'],
    queryFn: adminApi.getMyStudents,
  })

  const { data: interviewsData, isLoading } = useQuery({
    queryKey: ['admin-scheduled-interviews', searchTerm, filterStatus, selectedDate],
    queryFn: () => adminApi.getScheduledInterviews({
      search: searchTerm,
      status: filterStatus === 'all' ? undefined : filterStatus,
      date: selectedDate || undefined
    }),
  })

  const scheduleInterviewMutation = useMutation({
    mutationFn: adminApi.scheduleInterview,
    onSuccess: () => {
      toast.success('Interview scheduled successfully!')
      setShowScheduleForm(false)
      setScheduleForm({
        interview_type: 'domain_based',
        domain: '',
        scheduled_at: '',
        scheduled_end_at: '',
        num_questions: 10,
        is_proctored: true,
        student_emails: '',
      })
      queryClient.invalidateQueries({ queryKey: ['admin-scheduled-interviews'] })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to schedule interview')
    }
  })

  const cancelInterviewMutation = useMutation({
    mutationFn: adminApi.cancelInterview,
    onSuccess: () => {
      toast.success('Interview cancelled successfully!')
      queryClient.invalidateQueries({ queryKey: ['admin-scheduled-interviews'] })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to cancel interview')
    }
  })

  const students = studentsData?.data || []
  const interviews = interviewsData?.data || []

  const handleScheduleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const studentIdsParam = (searchParams.get('student_ids') || '').trim()
    const selectedStudentIds = studentIdsParam
      ? studentIdsParam
          .split(',')
          .map(s => Number(s.trim()))
          .filter(n => Number.isFinite(n) && n > 0)
      : []

    if (!scheduleForm.scheduled_at || !scheduleForm.scheduled_end_at) {
      toast.error('Please select both start and end time')
      return
    }

    const startDate = new Date(scheduleForm.scheduled_at)
    const endDate = new Date(scheduleForm.scheduled_end_at)

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      toast.error('Please enter valid start and end time')
      return
    }

    if (endDate <= startDate) {
      toast.error('End time must be after start time')
      return
    }

    // Enforce: duration must be at most 24 hours
    const durationMinutes = (endDate.getTime() - startDate.getTime()) / 60000
    if (durationMinutes > 24 * 60) {
      toast.error('Interview duration cannot exceed 24 hours')
      return
    }

    if (scheduleForm.interview_type === 'domain_based' && !scheduleForm.domain) {
      toast.error('Please select a domain')
      return
    }

    const n = Math.max(1, Math.min(25, Number(scheduleForm.num_questions) || 10))

    const emailList = scheduleForm.student_emails
      .split(/[\n,]+/)
      .map(e => e.trim())
      .filter(e => e.length > 0 && e.includes('@'));

    scheduleInterviewMutation.mutate({
      interview_type: scheduleForm.interview_type,
      domain: scheduleForm.interview_type === 'domain_based' ? scheduleForm.domain : undefined,
      // Convert datetime-local (local time) to ISO for backend UTC comparisons
      scheduled_at: startDate.toISOString(),
      scheduled_end_at: endDate.toISOString(),
      num_questions: n,
      is_proctored: scheduleForm.is_proctored,
      student_ids: selectedStudentIds.length > 0 ? selectedStudentIds : undefined,
      student_emails: emailList.length > 0 ? emailList : undefined,
    })
  }

  const handleCancelInterview = (interviewId: string) => {
    if (confirm('Are you sure you want to cancel this interview?')) {
      cancelInterviewMutation.mutate(interviewId)
    }
  }

  const getInterviewTypeIcon = (type: string) => {
    switch (type) {
      case 'resume_based': return FileText
      case 'domain_based':
      case 'domain_specific':
        return BookOpen
      case 'admin_scheduled':
      case 'scheduled':
        return Video
      default: return FileText
    }
  }

  const getInterviewTypeLabel = (type: string) => {
    switch (type) {
      case 'resume_based': return 'Resume Based'
      case 'domain_based':
      case 'domain_specific':
        return 'Domain Based'
      case 'admin_scheduled':
      case 'scheduled':
        return 'Admin Scheduled'
      default: return 'Unknown'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-blue-600 bg-blue-100'
      case 'in_progress': return 'text-yellow-600 bg-yellow-100'
      case 'completed': return 'text-green-600 bg-green-100'
      case 'cancelled': return 'text-red-600 bg-red-100'
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
              <h1 className="text-2xl font-bold text-gray-900">Interview Scheduling</h1>
            </div>
            <div className="flex items-center space-x-3">
              <Link
                to="/admin/submissions"
                className="flex items-center px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg transition-colors"
              >
                <FileText className="h-4 w-4 mr-2" />
                Submissions
              </Link>
              <button
                onClick={() => setShowScheduleForm(true)}
                className="flex items-center px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
              >
                <Plus className="h-4 w-4 mr-2" />
                Schedule Interview
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search interviews..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="pending">Scheduled</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>

            <input
              type="date"
              className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />

            <button 
              onClick={() => {
                setSearchTerm('')
                setFilterStatus('all')
                setSelectedDate('')
              }}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>

        {/* Interviews List */}
        <div className="grid gap-6">
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-white rounded-lg shadow p-6 animate-pulse">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                      <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                      <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                    </div>
                    <div className="h-8 w-8 bg-gray-200 rounded"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : interviews.length > 0 ? (
            interviews.map((interview: any) => {
              const interviewType = interview.interview_type || 'scheduled'
              const InterviewIcon = getInterviewTypeIcon(interviewType)
              return (
                <div key={interview.interview_id} className="bg-white rounded-lg shadow hover:shadow-md transition-shadow">
                  <div className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-4">
                        <div className={`p-3 rounded-lg ${
                          interviewType === 'resume_based' ? 'bg-blue-100 text-blue-600' :
                          interviewType === 'domain_specific' ? 'bg-purple-100 text-purple-600' :
                          'bg-green-100 text-green-600'
                        }`}>
                          <InterviewIcon className="h-6 w-6" />
                        </div>
                        
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900">
                              {interview.student_name}
                            </h3>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              getStatusColor(interview.status)
                            }`}>
                              {interview.status.replace(/_/g, ' ')}
                            </span>
                          </div>
                          
                          <div className="flex items-center space-x-6 text-sm text-gray-500 mb-3">
                            <div className="flex items-center">
                              <Calendar className="h-4 w-4 mr-1" />
                              {new Date(interview.scheduled_at).toLocaleDateString()}
                            </div>
                            <div className="flex items-center">
                              <Clock className="h-4 w-4 mr-1" />
                              {new Date(interview.scheduled_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                            <div className="flex items-center">
                              <BookOpen className="h-4 w-4 mr-1" />
                              {getInterviewTypeLabel(interviewType)}
                            </div>
                          </div>
                          
                          {interview.description && (
                            <p className="text-gray-600 text-sm mb-3">{interview.description}</p>
                          )}
                          
                          {interview.special_instructions && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3">
                              <p className="text-sm text-yellow-800">
                                <strong>Special Instructions:</strong> {interview.special_instructions}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {interview.status === 'completed' && (() => {
                          const scheduledMin = interview.scheduled_at
                            ? interview.scheduled_at.slice(0, 16)
                            : 'unknown'
                          const raw = `${scheduledMin}|${interview.interview_type}|${interview.domain ?? ''}`
                          const batchKey = btoa(encodeURIComponent(raw))
                          return (
                            <Link
                              to={`/admin/submissions/${batchKey}`}
                              state={{ batch: null }}
                              className="inline-flex items-center px-3 py-2 text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors"
                            >
                              <ExternalLink className="h-4 w-4 mr-2" />
                              Submissions
                            </Link>
                          )
                        })()}

                        {interview.status === 'pending' && (
                          <>
                            <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button 
                              onClick={() => handleCancelInterview(interview.interview_id)}
                              className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No interviews scheduled</h3>
              <p className="text-gray-500 mb-4">
                {searchTerm || filterStatus !== 'all' || selectedDate 
                  ? 'No interviews match your current filters'
                  : 'Schedule your first interview to get started'
                }
              </p>
              <button
                onClick={() => setShowScheduleForm(true)}
                className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium"
              >
                Schedule Interview
              </button>
            </div>
          )}
        </div>

        {/* Schedule Interview Modal */}
        {showScheduleForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Schedule New Interview</h3>
                  <button
                    onClick={() => setShowScheduleForm(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleScheduleSubmit} className="space-y-6">
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center">
                      <Users className="h-4 w-4 text-gray-500 mr-2" />
                      <p className="text-sm text-gray-700">
                        This will schedule the interview for <span className="font-medium">all students</span> under you
                        {students.length ? ` (${students.length})` : ''}.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Interview Type
                    </label>
                    <select
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      value={scheduleForm.interview_type}
                      onChange={(e) => setScheduleForm(prev => ({
                        ...prev,
                        interview_type: e.target.value as any,
                        domain: e.target.value === 'domain_based' ? prev.domain : ''
                      }))}
                      required
                    >
                      <option value="resume_based">Resume Based</option>
                      <option value="domain_based">Domain Based</option>
                    </select>
                  </div>

                  {scheduleForm.interview_type === 'domain_based' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Domain
                      </label>
                      <select
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        value={scheduleForm.domain}
                        onChange={(e) => setScheduleForm(prev => ({ ...prev, domain: e.target.value }))}
                        required
                      >
                        <option value="">Choose a domain...</option>
                        {(domainsData?.data || []).map((d: any) => (
                          <option key={d.id} value={d.name}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Number of questions
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={25}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      value={scheduleForm.num_questions}
                      onChange={(e) =>
                        setScheduleForm((prev) => ({
                          ...prev,
                          num_questions: Math.max(1, Math.min(25, Number(e.target.value) || 1)),
                        }))
                      }
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">Choose 1–25 questions</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                       Invite by Email (Optional)
                    </label>
                    <textarea
                      rows={3}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                      placeholder="Enter student emails (comma or newline separated). Useful for inviting students before they register."
                      value={scheduleForm.student_emails}
                      onChange={(e) => setScheduleForm(prev => ({ ...prev, student_emails: e.target.value }))}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Start Time
                      </label>
                      <input
                        type="datetime-local"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        value={scheduleForm.scheduled_at}
                        onChange={(e) => setScheduleForm(prev => ({ ...prev, scheduled_at: e.target.value }))}
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        End Time
                      </label>
                      <input
                        type="datetime-local"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        value={scheduleForm.scheduled_end_at}
                        onChange={(e) => setScheduleForm(prev => ({ ...prev, scheduled_end_at: e.target.value }))}
                        required
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Proctored Interview</p>
                      <p className="text-xs text-gray-600">Enables malpractice detection during the interview.</p>
                    </div>
                    <label className="inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                        checked={!!scheduleForm.is_proctored}
                        onChange={(e) => setScheduleForm(prev => ({ ...prev, is_proctored: e.target.checked }))}
                      />
                    </label>
                  </div>

                  <div className="flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={() => setShowScheduleForm(false)}
                      className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={scheduleInterviewMutation.isPending}
                      className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      {scheduleInterviewMutation.isPending ? 'Scheduling...' : 'Schedule Interview'}
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

export default InterviewScheduling