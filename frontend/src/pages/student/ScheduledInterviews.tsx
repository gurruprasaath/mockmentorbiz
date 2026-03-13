import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Footer from '../../components/Footer'
import { 
  ArrowLeft, 
  Calendar, 
  Clock, 
  User, 
  CheckCircle, 
  XCircle, 
  AlertCircle 
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { studentApi } from '../../utils/api'

const ScheduledInterviews = () => {
  const navigate = useNavigate()

  const { data: scheduledInterviews, isLoading, isError } = useQuery({
    queryKey: ['scheduled-interviews'],
    queryFn: studentApi.getScheduledInterviews,
  })

  const interviews = scheduledInterviews?.data || []

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-100'
      case 'in_progress': return 'text-blue-600 bg-blue-100'
      case 'pending': return 'text-yellow-600 bg-yellow-100'
      case 'cancelled': return 'text-red-600 bg-red-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return CheckCircle
      case 'in_progress': return Clock
      case 'pending': return Calendar
      case 'cancelled': return XCircle
      default: return AlertCircle
    }
  }

  // Ensure the datetime string is treated as UTC by appending 'Z' if no timezone
  // info is present. Python's .isoformat() omits the trailing 'Z' for naive datetimes,
  // which makes JavaScript parse the value as *local* time instead of UTC.
  const parseUtcDate = (s: string): Date => {
    if (!s) return new Date(NaN)
    // Already has timezone info (+HH:MM, -HH:MM, or Z)
    if (/[Zz]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s)) return new Date(s)
    return new Date(s + 'Z')
  }

  const canJoinInterview = (interview: any) => {
    if (!['pending', 'in_progress'].includes(interview.status)) return false
    
    const scheduledTime = parseUtcDate(interview.scheduled_at)
    const now = new Date()

    const durationMinutes = interview.duration_minutes || 60
    const endTime = new Date(scheduledTime.getTime() + durationMinutes * 60 * 1000)
    if (now > endTime) return false
    
    // Allow joining 15 minutes before scheduled time, until end time
    return now.getTime() >= scheduledTime.getTime() - 15 * 60 * 1000
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <button
              onClick={() => navigate('/student')}
              className="flex items-center text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-5 w-5 mr-2" />
              Back to Dashboard
            </button>
            <div className="ml-6">
              <h1 className="text-xl font-semibold text-gray-900">Scheduled Interviews</h1>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Info Banner */}
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-8">
          <div className="flex items-start">
            <Calendar className="h-5 w-5 text-purple-600 mt-0.5 mr-3" />
            <div>
              <h3 className="text-sm font-medium text-purple-900">
                About Scheduled Interviews
              </h3>
              <p className="mt-1 text-sm text-purple-700">
                These interviews are scheduled by your department admin. You can join them 15 minutes before 
                the scheduled time. All scheduled interviews are proctored for integrity.
              </p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg shadow-sm border animate-pulse">
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
                      <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                    </div>
                    <div className="h-8 bg-gray-200 rounded w-16"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-12">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Failed to load interviews</h3>
            <p className="text-gray-600">Check your connection and refresh the page.</p>
          </div>
        ) : interviews.length > 0 ? (
          <div className="space-y-4">
            {interviews.map((interview: any) => {
              const StatusIcon = getStatusIcon(interview.status)
              const canJoin = canJoinInterview(interview)
              const scheduledDate = parseUtcDate(interview.scheduled_at)
              
              return (
                <div key={interview.interview_id} className="bg-white rounded-lg shadow-sm border">
                  <div className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-lg font-medium text-gray-900">
                            Interview #{interview.interview_id}
                          </h3>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(interview.status)}`}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {interview.status.replace('_', ' ').toUpperCase()}
                          </span>
                        </div>
                        
                        <div className="space-y-2 text-sm text-gray-600">
                          <div className="flex items-center">
                            <Calendar className="h-4 w-4 mr-2" />
                            <span>
                              {scheduledDate.toLocaleDateString()} at {scheduledDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          
                          <div className="flex items-center">
                            <Clock className="h-4 w-4 mr-2" />
                            <span>Duration: {interview.duration_minutes || 60} minutes</span>
                          </div>
                          
                          <div className="flex items-center">
                            <User className="h-4 w-4 mr-2" />
                            <span>Admin: {interview.admin_name || 'Admin'}</span>
                          </div>
                          
                          {interview.is_proctored && (
                            <div className="flex items-center">
                              <AlertCircle className="h-4 w-4 mr-2 text-red-500" />
                              <span className="text-red-600 font-medium">Proctored Interview</span>
                            </div>
                          )}
                        </div>

                        {interview.status === 'completed' && interview.overall_score && (
                          <div className="mt-3 p-3 bg-green-50 rounded-lg">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-green-800">Final Score</span>
                              <span className="text-lg font-bold text-green-900">
                                {interview.overall_score.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="ml-6 flex flex-col space-y-2">
                        {canJoin && (
                          <button
                            onClick={() => navigate(`/student/scheduled-interview/${interview.interview_id}`)}
                            className="btn-success px-4 py-2"
                          >
                            Join Interview
                          </button>
                        )}
                        
                        {interview.status === 'pending' && !canJoin && (
                          <div className="text-center">
                            <p className="text-xs text-gray-500 mb-1">Available to join</p>
                            <p className="text-xs text-gray-500">15 min before start</p>
                          </div>
                        )}

                        {interview.status === 'completed' && (
                          <button
                            onClick={() => navigate('/student/performance')}
                            className="btn-secondary px-4 py-2 text-sm"
                          >
                            View Results
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Countdown for upcoming interviews */}
                    {interview.status === 'pending' && (
                      <InterviewCountdown scheduledAt={interview.scheduled_at} />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <Calendar className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Scheduled Interviews</h3>
            <p className="text-gray-600 mb-6">
              Your admin hasn't scheduled any interviews yet. Check back later or contact your admin.
            </p>
            <button
              onClick={() => navigate('/student')}
              className="btn-primary"
            >
              Try Other Interview Types
            </button>
          </div>
        )}
      </div>
      <Footer />
    </div>
  )
}

// Component for countdown timer
const InterviewCountdown = ({ scheduledAt }: { scheduledAt: string }) => {
  const [timeRemaining, setTimeRemaining] = useState('')

  useEffect(() => {
    const parseUtc = (s: string) => {
      if (!s) return NaN
      if (/[Zz]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s)) return new Date(s).getTime()
      return new Date(s + 'Z').getTime()
    }

    const updateCountdown = () => {
      const now = new Date().getTime()
      const scheduledTime = parseUtc(scheduledAt)
      const difference = scheduledTime - now

      if (difference > 0) {
        const days = Math.floor(difference / (1000 * 60 * 60 * 24))
        const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
        const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60))
        const seconds = Math.floor((difference % (1000 * 60)) / 1000)

        if (days > 0) {
          setTimeRemaining(`${days}d ${hours}h ${minutes}m`)
        } else if (hours > 0) {
          setTimeRemaining(`${hours}h ${minutes}m ${seconds}s`)
        } else if (minutes > 0) {
          setTimeRemaining(`${minutes}m ${seconds}s`)
        } else {
          setTimeRemaining(`${seconds}s`)
        }
      } else {
        setTimeRemaining('Available now')
      }
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)

    return () => clearInterval(interval)
  }, [scheduledAt])

  return (
    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-blue-800">
          Time until interview:
        </span>
        <span className="text-lg font-mono font-bold text-blue-900">
          {timeRemaining}
        </span>
      </div>
    </div>
  )
}

export default ScheduledInterviews