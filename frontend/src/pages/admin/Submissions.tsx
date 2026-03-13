import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Footer from '../../components/Footer'
import {
  ArrowLeft,
  FileText,
  AlertCircle,
  Calendar,
  Clock,
  Users,
  BookOpen,
  ChevronRight,
  Search,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { adminApi } from '../../utils/api'

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

// A "batch" = all interviews sharing the same scheduled_at + type + domain
export type InterviewBatch = {
  batchKey: string          // encoded for URL: base64 of scheduled_at|type|domain
  scheduled_at: string
  interview_type: string
  domain: string | null
  total_students: number    // how many were scheduled (pending + completed + others)
  completed_students: number
  rows: CompletedInterviewRow[]
}

const getTypeLabel = (type: string) => {
  switch (type) {
    case 'resume_based': return 'Resume Based'
    case 'domain_based':
    case 'domain_specific': return 'Domain Based'
    case 'admin_scheduled':
    case 'scheduled': return 'Admin Scheduled'
    default: return type.replace(/_/g, ' ')
  }
}

const getTypeColor = (type: string) => {
  switch (type) {
    case 'resume_based': return 'bg-blue-100 text-blue-600'
    case 'domain_based':
    case 'domain_specific': return 'bg-green-100 text-green-600'
    default: return 'bg-purple-100 text-purple-600'
  }
}

const Submissions = () => {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')

  // Fetch ALL interviews (any status) so we show total_students correctly
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-submissions-all'],
    queryFn: () => adminApi.getScheduledInterviews({}),
  })

  const rows: CompletedInterviewRow[] = data?.data || []

  const batches: InterviewBatch[] = useMemo(() => {
    const map = new Map<string, InterviewBatch>()

    for (const r of rows) {
      // Group by scheduled_at (minute precision) + interview_type + domain
      const scheduledMin = r.scheduled_at
        ? r.scheduled_at.slice(0, 16)   // "2026-02-22T17:43"
        : 'unknown'
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

      const batch = map.get(key)!
      batch.total_students += 1
      if (r.status === 'completed') {
        batch.completed_students += 1
        batch.rows.push(r)
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()
    )
  }, [rows])

  const filtered = useMemo(() => {
    if (!search.trim()) return batches
    const q = search.toLowerCase()
    return batches.filter(b =>
      getTypeLabel(b.interview_type).toLowerCase().includes(q) ||
      (b.domain || '').toLowerCase().includes(q) ||
      new Date(b.scheduled_at).toLocaleDateString().includes(q)
    )
  }, [batches, search])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Unable to load submissions</h3>
          <p className="text-gray-600 mb-4">Please try again.</p>
          <button
            onClick={() => navigate('/admin/schedule')}
            className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium"
          >
            Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <Link
              to="/admin/schedule"
              className="flex items-center text-gray-500 hover:text-gray-700 mr-4"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Submissions</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by type, domain or date..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No interviews found</h3>
            <p className="text-gray-500">Scheduled interviews will appear here.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filtered.map((batch) => {
              const scheduledDate = batch.scheduled_at
                ? new Date(batch.scheduled_at)
                : null

              const title = batch.domain
                ? `${getTypeLabel(batch.interview_type)} — ${batch.domain}`
                : getTypeLabel(batch.interview_type)

              const completionPct = batch.total_students > 0
                ? Math.round((batch.completed_students / batch.total_students) * 100)
                : 0

              return (
                <button
                  key={batch.batchKey}
                  onClick={() =>
                    navigate(`/admin/submissions/${batch.batchKey}`, {
                      state: { batch },
                    })
                  }
                  className="text-left bg-white rounded-lg shadow hover:shadow-md transition-shadow w-full"
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-4 flex-1 min-w-0">
                        {/* Icon */}
                        <div className={`p-3 rounded-lg flex-shrink-0 ${getTypeColor(batch.interview_type)}`}>
                          <BookOpen className="h-6 w-6" />
                        </div>

                        <div className="flex-1 min-w-0">
                          {/* Title */}
                          <h3 className="text-lg font-semibold text-gray-900 mb-1 truncate">
                            {title}
                          </h3>

                          {/* Meta row */}
                          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 mb-4">
                            {scheduledDate && (
                              <>
                                <span className="flex items-center">
                                  <Calendar className="h-4 w-4 mr-1" />
                                  {scheduledDate.toLocaleDateString()}
                                </span>
                                <span className="flex items-center">
                                  <Clock className="h-4 w-4 mr-1" />
                                  {scheduledDate.toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </>
                            )}
                            <span className="flex items-center">
                              <Users className="h-4 w-4 mr-1" />
                              {batch.total_students} student{batch.total_students !== 1 ? 's' : ''} assigned
                            </span>
                          </div>

                          {/* Progress bar */}
                          <div>
                            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                              <span>{batch.completed_students} of {batch.total_students} completed</span>
                              <span>{completionPct}%</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full transition-all ${
                                  completionPct === 100
                                    ? 'bg-green-500'
                                    : completionPct > 0
                                    ? 'bg-blue-500'
                                    : 'bg-gray-300'
                                }`}
                                style={{ width: `${completionPct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Arrow */}
                      <div className="flex-shrink-0 ml-4 flex items-center text-gray-400">
                        <ChevronRight className="h-5 w-5" />
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
      <Footer />
    </div>
  )
}

export default Submissions
