import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Footer from '../../components/Footer'
import {
  ArrowLeft,
  AlertCircle,
  Calendar,
  Clock,
  Users,
  BookOpen,
  User,
  ChevronRight,
  CheckCircle,
  XCircle,
  Loader,
} from 'lucide-react'
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom'
import { adminApi } from '../../utils/api'
import type { InterviewBatch } from './Submissions'

type CompletedInterviewRow = {
  interview_id: number
  student_name: string
  student_email: string
  interview_type: string
  domain?: string | null
  status: string
  scheduled_at?: string | null
  started_at?: string | null
  ended_at?: string | null
  overall_score?: number | null
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed':  return <CheckCircle className="h-4 w-4 text-green-500" />
    case 'cancelled':  return <XCircle className="h-4 w-4 text-red-400" />
    case 'in_progress': return <Loader className="h-4 w-4 text-yellow-500" />
    default:           return <Clock className="h-4 w-4 text-gray-400" />
  }
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'completed':   return 'text-green-700 bg-green-100'
    case 'in_progress': return 'text-yellow-700 bg-yellow-100'
    case 'cancelled':   return 'text-red-700 bg-red-100'
    default:            return 'text-gray-700 bg-gray-100'
  }
}

const getScoreColor = (score: number) => {
  if (score >= 80) return 'text-green-700 bg-green-100'
  if (score >= 60) return 'text-yellow-700 bg-yellow-100'
  return 'text-red-700 bg-red-100'
}

const getTypeLabel = (type: string) => {
  switch (type) {
    case 'resume_based': return 'Resume Based'
    case 'domain_based':
    case 'domain_specific': return 'Domain Based'
    default: return type.replace(/_/g, ' ')
  }
}

const SubmissionDetail = () => {
  const navigate = useNavigate()
  const { batchKey } = useParams<{ batchKey: string }>()
  const location = useLocation()

  // Prefer state passed from Submissions.tsx (instant), fall back to re-fetching
  const passedBatch = (location.state as any)?.batch as InterviewBatch | undefined

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-submissions-all-detail'],
    queryFn: () => adminApi.getScheduledInterviews({}),
    // Skip fetching if we already have all info from navigation state
    enabled: !passedBatch,
  })

  // Re-derive batch from fetched data if we didn't get it via state
  const batch: InterviewBatch | null = useMemo(() => {
    if (passedBatch) return passedBatch
    if (!data?.data || !batchKey) return null

    const rows: CompletedInterviewRow[] = data.data
    const map = new Map<string, InterviewBatch>()
    for (const r of rows) {
      const scheduledMin = r.scheduled_at ? r.scheduled_at.slice(0, 16) : 'unknown'
      const raw = `${scheduledMin}|${r.interview_type}|${r.domain ?? ''}`
      const key = btoa(encodeURIComponent(raw))
      if (!map.has(key)) {
        map.set(key, {
          batchKey: key,
          scheduled_at: r.scheduled_at || '',
          interview_type: r.interview_type,
          domain: r.domain ?? null,
          total_students: 0,
          completed_students: 0,
          rows: [],
        })
      }
      const b = map.get(key)!
      b.total_students += 1
      if (r.status === 'completed') {
        b.completed_students += 1
        b.rows.push(r)
      }
    }
    return map.get(batchKey) ?? null
  }, [passedBatch, data, batchKey])

  // All students in this batch (any status) - we need raw rows for pending too
  const allStudentRows: CompletedInterviewRow[] = useMemo(() => {
    const sourceRows: CompletedInterviewRow[] = passedBatch
      ? []  // If passed via state, rows only has completed ones; re-fetch gives all
      : (data?.data || [])

    if (passedBatch && !data?.data) return passedBatch.rows  // fallback to completed-only

    return sourceRows.filter((r) => {
      const scheduledMin = r.scheduled_at ? r.scheduled_at.slice(0, 16) : 'unknown'
      const raw = `${scheduledMin}|${r.interview_type}|${r.domain ?? ''}`
      return btoa(encodeURIComponent(raw)) === batchKey
    })
  }, [passedBatch, data, batchKey])

  if (isLoading && !passedBatch) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (error && !passedBatch) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Unable to load details</h3>
          <button onClick={() => navigate('/admin/submissions')}
            className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium">
            Back to Submissions
          </button>
        </div>
      </div>
    )
  }

  if (!batch && !isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Interview not found</h3>
          <button onClick={() => navigate('/admin/submissions')}
            className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium">
            Back to Submissions
          </button>
        </div>
      </div>
    )
  }

  const scheduledDate = batch?.scheduled_at ? new Date(batch.scheduled_at) : null
  const title = batch
    ? batch.domain
      ? `${getTypeLabel(batch.interview_type)} — ${batch.domain}`
      : getTypeLabel(batch.interview_type)
    : '...'

  // Sort: completed first, then by name
  const sorted = [...allStudentRows].sort((a, b) => {
    if (a.status === 'completed' && b.status !== 'completed') return -1
    if (a.status !== 'completed' && b.status === 'completed') return 1
    return (a.student_name || '').localeCompare(b.student_name || '')
  })

  const completedCount = allStudentRows.filter(r => r.status === 'completed').length
  const totalCount = allStudentRows.length

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <Link
              to="/admin/submissions"
              className="flex items-center text-gray-500 hover:text-gray-700 mr-4"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Link>
            <h1 className="text-xl font-bold text-gray-900 truncate">{title}</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Interview Info Card */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-start space-x-4">
            <div className="p-3 rounded-lg bg-green-100 text-green-600 flex-shrink-0">
              <BookOpen className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">{title}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-gray-600">
                {scheduledDate && (
                  <>
                    <div className="flex items-center">
                      <Calendar className="h-4 w-4 mr-2 text-gray-400" />
                      <span>{scheduledDate.toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center">
                      <Clock className="h-4 w-4 mr-2 text-gray-400" />
                      <span>
                        {scheduledDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </>
                )}
                <div className="flex items-center">
                  <Users className="h-4 w-4 mr-2 text-gray-400" />
                  <span>
                    {completedCount} / {totalCount} students completed
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Completion</span>
                  <span>{totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${completedCount === totalCount && totalCount > 0 ? 'bg-green-500' : 'bg-blue-500'}`}
                    style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Students List */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">
              Students ({totalCount})
            </h2>
            <span className="text-sm text-gray-500">
              {completedCount} submitted
            </span>
          </div>

          {sorted.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No students assigned to this interview.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {sorted.map((row) => {
                const isCompleted = row.status === 'completed'
                const score = Number(row.overall_score || 0)
                const completedAt = row.ended_at || row.started_at

                return (
                  <div key={row.interview_id} className="px-6 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        {/* Avatar */}
                        <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <User className="h-5 w-5 text-gray-500" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-0.5">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {row.student_name}
                            </p>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(row.status)}`}>
                              {getStatusIcon(row.status)}
                              {row.status.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 truncate">{row.student_email}</p>
                          {completedAt && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              Submitted {new Date(completedAt).toLocaleDateString()} at{' '}
                              {new Date(completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center space-x-3 flex-shrink-0 ml-4">
                        {isCompleted && (
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getScoreColor(score)}`}>
                            {Math.round(score)}%
                          </span>
                        )}
                        {isCompleted ? (
                          <button
                            onClick={() => navigate(`/admin/interview/${row.interview_id}/results`)}
                            className="flex items-center text-sm font-medium text-primary-700 hover:text-primary-900 bg-primary-50 hover:bg-primary-100 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            View Results
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Not submitted</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  )
}

export default SubmissionDetail
