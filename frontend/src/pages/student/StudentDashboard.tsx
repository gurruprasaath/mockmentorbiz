import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import Footer from '../../components/Footer'
import { 
  FileText, 
  Target, 
  Calendar, 
  BarChart3, 
  Mic, 
  MessageSquare,
  Clock,
  Award,
  TrendingUp,
  LogOut,
  AlertTriangle,
  XCircle,
  X,
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { studentApi } from '../../utils/api'

const StudentDashboard = () => {
  const { user, logout } = useAuthStore()
  const [dismissedNotices, setDismissedNotices] = useState<number[]>([])

  // Fetch student data
  const { data: interviews, isLoading: interviewsLoading, isError: interviewsError } = useQuery({
    queryKey: ['student-interviews'],
    queryFn: studentApi.getMyInterviews,
  })

  const { data: performanceSummary, isLoading: performanceLoading, isError: performanceError } = useQuery({
    queryKey: ['performance-summary'],
    queryFn: studentApi.getPerformanceSummary,
  })

  const { data: domains } = useQuery({
    queryKey: ['domains'],
    queryFn: studentApi.getDomains,
  })

  const { data: noticesData } = useQuery({
    queryKey: ['student-notices'],
    queryFn: studentApi.getMyNotices,
  })

  const allNotices: any[] = noticesData?.data || []
  const visibleNotices = allNotices.filter((n: any) => !dismissedNotices.includes(n.interview_id))

  const interviewModes = [
    {
      title: 'Resume-Based Interview',
      description: 'Upload your resume and get personalized questions',
      icon: FileText,
      path: '/student/interview/resume',
      color: 'bg-blue-500',
    },
    {
      title: 'Domain-Specific Interview',
      description: 'Practice with domain-focused technical questions',
      icon: Target,
      path: '/student/interview/domain',
      color: 'bg-green-500',
    },
    {
      title: 'Scheduled Interviews',
      description: 'Join interviews scheduled by your admin',
      icon: Calendar,
      path: '/student/scheduled',
      color: 'bg-purple-500',
    },
  ]

  const recentInterviews = interviews?.data?.slice(0, 5) || []
  const performance = performanceSummary?.data || {
    total_interviews: 0,
    average_technical_score: 0,
    average_communication_score: 0,
    average_confidence_score: 0,
    average_completion_rate: 0,
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-primary-600">MockMentorBiz</h1>
              <span className="hidden sm:block ml-4 text-sm text-gray-500">Student Dashboard</span>
            </div>
            <div className="flex items-center space-x-3 sm:space-x-4 shrink-0">
              <div className="hidden sm:block text-sm text-gray-700">
                Welcome, <span className="font-semibold">{user?.full_name}</span>
              </div>
              <button
                onClick={logout}
                className="flex items-center text-gray-500 hover:text-gray-700 text-sm"
              >
                <LogOut className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Admin Notice Banners */}
        {visibleNotices.length > 0 && (
          <div className="space-y-3 mb-8">
            {visibleNotices.map((notice: any) => {
              const isPenalty = notice.notice_type === 'penalty'
              const interviewLabel = `Interview #${notice.interview_id} (${(notice.interview_type || '').replace(/_/g, ' ')})`
              const dateLabel = notice.reviewed_at
                ? new Date(notice.reviewed_at).toLocaleDateString([], { dateStyle: 'medium' })
                : ''
              return (
                <div
                  key={notice.interview_id}
                  className={`relative rounded-lg border px-5 py-4 flex items-start gap-4 shadow-sm ${
                    isPenalty
                      ? 'bg-red-50 border-red-300'
                      : 'bg-orange-50 border-orange-300'
                  }`}
                >
                  <div className={`shrink-0 mt-0.5 ${isPenalty ? 'text-red-600' : 'text-orange-500'}`}>
                    {isPenalty ? <XCircle className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm ${isPenalty ? 'text-red-800' : 'text-orange-800'}`}>
                      {isPenalty
                        ? `Penalty applied to ${interviewLabel}`
                        : `Warning issued for ${interviewLabel}`}
                      {dateLabel && <span className="font-normal ml-2 text-xs opacity-70">{dateLabel}</span>}
                    </p>
                    {isPenalty && (
                      <p className="text-xs text-red-700 mt-0.5">
                        Your score for this interview has been set to 0 due to confirmed malpractice.
                      </p>
                    )}
                    {notice.message && (
                      <p className={`text-xs mt-1 ${isPenalty ? 'text-red-700' : 'text-orange-700'}`}>
                        <span className="font-medium">Admin note:</span> {notice.message}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setDismissedNotices((prev) => [...prev, notice.interview_id])}
                    className={`shrink-0 ${isPenalty ? 'text-red-400 hover:text-red-600' : 'text-orange-400 hover:text-orange-600'}`}
                    title="Dismiss notice"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            Ready to practice your interview skills?
          </h2>
          <p className="text-gray-600">
            Choose from three different interview modes to improve your performance
          </p>
        </div>

        {/* Performance Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 mb-8">
          <div className="card">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <BarChart3 className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Interviews</p>
                {performanceLoading ? (
                  <div className="h-8 w-16 bg-gray-200 rounded animate-pulse mt-1" />
                ) : performanceError ? (
                  <p className="text-sm text-red-400 mt-1">—</p>
                ) : (
                  <p className="text-2xl font-bold text-gray-900">
                    {performance.total_interviews}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <Award className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Avg. Technical</p>
                {performanceLoading ? (
                  <div className="h-8 w-16 bg-gray-200 rounded animate-pulse mt-1" />
                ) : performanceError ? (
                  <p className="text-sm text-red-400 mt-1">—</p>
                ) : (
                  <p className="text-2xl font-bold text-gray-900">
                    {Number(performance.average_technical_score).toFixed(1)}%
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg">
                <MessageSquare className="h-6 w-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Communication</p>
                {performanceLoading ? (
                  <div className="h-8 w-16 bg-gray-200 rounded animate-pulse mt-1" />
                ) : performanceError ? (
                  <p className="text-sm text-red-400 mt-1">—</p>
                ) : (
                  <p className="text-2xl font-bold text-gray-900">
                    {Number(performance.average_communication_score).toFixed(1)}%
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center">
              <div className="p-2 bg-orange-100 rounded-lg">
                <TrendingUp className="h-6 w-6 text-orange-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Completion</p>
                {performanceLoading ? (
                  <div className="h-8 w-16 bg-gray-200 rounded animate-pulse mt-1" />
                ) : performanceError ? (
                  <p className="text-sm text-red-400 mt-1">—</p>
                ) : (
                  <p className="text-2xl font-bold text-gray-900">
                    {Number(performance.average_completion_rate).toFixed(1)}%
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Interview Modes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mb-8">
          {interviewModes.map((mode, index) => {
            const Icon = mode.icon
            return (
              <Link
                key={index}
                to={mode.path}
                className="card hover:shadow-lg transition-shadow duration-200 group"
              >
                <div className="flex items-center mb-4">
                  <div className={`p-3 ${mode.color} rounded-lg`}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="ml-4 text-lg font-semibold text-gray-900 group-hover:text-primary-600">
                    {mode.title}
                  </h3>
                </div>
                <p className="text-gray-600 mb-4">{mode.description}</p>
                <div className="flex items-center text-primary-600 font-medium">
                  Start Practice
                  <span className="ml-1 group-hover:translate-x-1 transition-transform duration-200">
                    →
                  </span>
                </div>
              </Link>
            )
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Recent Interviews */}
          <div className="card">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Recent Interviews</h3>
              <Link
                to="/student/performance"
                className="text-sm text-primary-600 hover:text-primary-700"
              >
                View all
              </Link>
            </div>
            
            {interviewsLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="animate-pulse flex space-x-4">
                    <div className="rounded-full bg-gray-200 h-10 w-10"></div>
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                      <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : interviewsError ? (
              <div className="text-center py-8">
                <p className="text-sm text-red-500 font-medium">Failed to load interviews</p>
                <p className="text-xs text-gray-400 mt-1">Check your connection and refresh</p>
              </div>
            ) : recentInterviews.length > 0 ? (
              <div className="space-y-4">
                {recentInterviews.map((interview: any) => (
                  <div key={interview.id} className="flex items-center space-x-4">
                    <div className={`p-2 rounded-lg ${
                      interview.interview_type === 'resume_based' ? 'bg-blue-100' :
                      interview.interview_type === 'domain_based' ? 'bg-green-100' : 'bg-purple-100'
                    }`}>
                      {interview.interview_type === 'resume_based' ? (
                        <FileText className="h-4 w-4 text-blue-600" />
                      ) : interview.interview_type === 'domain_based' ? (
                        <Target className="h-4 w-4 text-green-600" />
                      ) : (
                        <Calendar className="h-4 w-4 text-purple-600" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {interview.interview_type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                        {interview.domain && ` - ${interview.domain}`}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(interview.created_at).toLocaleDateString()} • 
                        <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          interview.status === 'completed' ? 'bg-green-100 text-green-800' :
                          interview.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {interview.status.replace(/_/g, ' ')}
                        </span>
                      </p>
                    </div>
                    {interview.overall_score !== null && (
                      <div className="text-sm font-semibold text-gray-900">
                        {interview.overall_score.toFixed(1)}%
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No interviews yet</p>
                <p className="text-sm text-gray-400 mt-1">
                  Start your first interview to see it here
                </p>
              </div>
            )}
          </div>

          {/* Available Domains */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Available Domains</h3>
            <div className="space-y-3">
              {!domains ? (
                <div className="text-center py-4">
                  <p className="text-gray-500 text-sm">Loading domains...</p>
                </div>
              ) : (domains?.data?.length ?? 0) === 0 ? (
                <div className="text-center py-4">
                  <Target className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">No domains available yet</p>
                </div>
              ) : (
                domains.data.slice(0, 6).map((domain: any) => (
                  <div key={domain.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{domain.name}</p>
                      <p className="text-xs text-gray-500">{domain.description}</p>
                    </div>
                    <Link
                      to={`/student/interview/domain?domain=${domain.name}`}
                      className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                    >
                      Practice
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-8 bg-gradient-to-r from-primary-600 to-purple-600 rounded-xl p-6 text-white">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Ready to improve your skills?</h3>
              <p className="text-blue-100">
                Start with a resume-based interview or explore domain-specific practice
              </p>
            </div>
            <div className="flex flex-wrap gap-3 shrink-0">
              <Link
                to="/student/interview/resume"
                className="bg-white text-primary-600 hover:bg-gray-100 px-4 py-2 rounded-lg font-medium transition-colors duration-200 text-sm"
              >
                Start Now
              </Link>
              <Link
                to="/student/performance"
                className="bg-primary-700 hover:bg-primary-800 px-4 py-2 rounded-lg font-medium transition-colors duration-200 text-sm"
              >
                View Analytics
              </Link>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  )
}

export default StudentDashboard