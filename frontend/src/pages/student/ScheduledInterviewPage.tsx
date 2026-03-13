import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import Footer from '../../components/Footer'
import { 
  ArrowLeft, 
  Clock, 
  Calendar,
  User,
  Video,
  AlertCircle,
  CheckCircle,
  Square,
  Play
} from 'lucide-react'
import { studentApi } from '../../utils/api'

const ScheduledInterviewPage = () => {
  const { interviewId } = useParams<{ interviewId: string }>()
  const navigate = useNavigate()
  const [timeLeft, setTimeLeft] = useState<string | null>(null)
  const [checklistDone, setChecklistDone] = useState<boolean[]>([false, false, false, false])

  const { data: interviewData, isLoading, isError } = useQuery({
    queryKey: ['scheduled-interview', interviewId],
    queryFn: () => studentApi.getScheduledInterview(interviewId!),
    enabled: !!interviewId,
  })

  const interview = interviewData?.data

  const normalizedStatus =
    interview?.status === 'pending' ? 'scheduled' : interview?.status

  // Countdown timer
  useEffect(() => {
    if (!interview?.scheduled_at) return

    const updateCountdown = () => {
      const now = new Date().getTime()
      const scheduledTime = new Date(interview.scheduled_at).getTime()
      const durationMinutes = interview.duration_minutes || 60
      const endTime = scheduledTime + durationMinutes * 60 * 1000
      const difference = scheduledTime - now

      if (difference > 0) {
        const days = Math.floor(difference / (1000 * 60 * 60 * 24))
        const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
        const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60))
        const seconds = Math.floor((difference % (1000 * 60)) / 1000)

        if (days > 0) {
          setTimeLeft(`${days}d ${hours}h ${minutes}m`)
        } else if (hours > 0) {
          setTimeLeft(`${hours}h ${minutes}m ${seconds}s`)
        } else {
          setTimeLeft(`${minutes}m ${seconds}s`)
        }
      } else if (now <= endTime) {
        const timeLeftMs = endTime - now
        const minutes = Math.floor(timeLeftMs / (1000 * 60))
        const seconds = Math.floor((timeLeftMs % (1000 * 60)) / 1000)
        setTimeLeft(`In progress • ${minutes}m ${seconds}s left`)
      } else {
        setTimeLeft('Interview time has passed')
      }
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)

    return () => clearInterval(interval)
  }, [interview?.scheduled_at])

  const canJoinInterview = () => {
    if (!interview?.scheduled_at) return false

    if (!['pending', 'in_progress'].includes(interview.status)) return false

    const now = new Date().getTime()
    const scheduledTime = new Date(interview.scheduled_at).getTime()
    const durationMinutes = interview.duration_minutes || 60
    const endTime = scheduledTime + durationMinutes * 60 * 1000
    
    // Join allowed 15 minutes before start until end time
    return now >= scheduledTime - 15 * 60 * 1000 && now <= endTime
  }

  const handleJoinInterview = () => {
    if (canJoinInterview()) {
      if (interview?.interview_type === 'resume_based') {
        navigate(`/student/interview/resume?scheduledInterviewId=${interviewId}`)
        return
      }

      if (interview?.interview_type === 'domain_based') {
        const domainParam = interview?.domain ? `&domain=${encodeURIComponent(interview.domain)}` : ''
        navigate(`/student/interview/domain?scheduledInterviewId=${interviewId}${domainParam}`)
        return
      }

      // Fallback: direct room
      navigate(`/student/interview/room/${interviewId}`)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'text-blue-600 bg-blue-100'
      case 'in_progress': return 'text-yellow-600 bg-yellow-100'
      case 'completed': return 'text-green-600 bg-green-100'
      case 'cancelled': return 'text-red-600 bg-red-100'
      case 'pending': return 'text-blue-600 bg-blue-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Failed to load interview</h3>
          <p className="text-gray-600 mb-4">There was a problem fetching the interview details. Check your connection and try again.</p>
          <button
            onClick={() => navigate('/student/scheduled')}
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            Back to Scheduled Interviews
          </button>
        </div>
      </div>
    )
  }

  if (!interview) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Interview not found</h3>
          <p className="text-gray-600 mb-4">This interview doesn't exist or you don't have access to it.</p>
          <button
            onClick={() => navigate('/student/scheduled')}
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            Back to Scheduled Interviews
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <button 
              onClick={() => navigate('/student/scheduled')}
              className="flex items-center text-gray-500 hover:text-gray-700 mr-4"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Scheduled Interviews
            </button>
            <h1 className="text-xl font-semibold text-gray-900">Scheduled Interview</h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Interview Details Card */}
        <div className="bg-white rounded-lg shadow-sm p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Interview Details</h2>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              getStatusColor(normalizedStatus || interview.status)
            }`}>
              {(normalizedStatus || interview.status).replace(/_/g, ' ').toUpperCase()}
            </span>
          </div>

          {/* Interview Information */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div className="space-y-4">
              <div className="flex items-center text-gray-700">
                <Calendar className="h-5 w-5 mr-3 text-gray-400" />
                <div>
                  <p className="font-medium">Scheduled Date & Time</p>
                  <p className="text-sm">
                    {new Date(interview.scheduled_at).toLocaleDateString()} at{' '}
                    {new Date(interview.scheduled_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>

              <div className="flex items-center text-gray-700">
                <Clock className="h-5 w-5 mr-3 text-gray-400" />
                <div>
                  <p className="font-medium">Duration</p>
                  <p className="text-sm">{interview.duration_minutes || 60} minutes</p>
                </div>
              </div>

              <div className="flex items-center text-gray-700">
                <User className="h-5 w-5 mr-3 text-gray-400" />
                <div>
                  <p className="font-medium">Interviewer</p>
                  <p className="text-sm">{interview.admin_name || 'Admin'}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center text-gray-700">
                <Video className="h-5 w-5 mr-3 text-gray-400" />
                <div>
                  <p className="font-medium">Interview Type</p>
                  <p className="text-sm capitalize">
                    {interview.interview_type?.replace(/_/g, ' ') || 'Admin Scheduled'}
                  </p>
                </div>
              </div>

              {interview.description && (
                <div>
                  <p className="font-medium text-gray-700 mb-2">Description</p>
                  <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                    {interview.description}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Special Instructions */}
          {interview.special_instructions && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-8">
              <div className="flex">
                <AlertCircle className="h-5 w-5 text-yellow-400 mt-0.5" />
                <div className="ml-3">
                  <h4 className="text-sm font-medium text-yellow-800">Special Instructions</h4>
                  <p className="mt-1 text-sm text-yellow-700">{interview.special_instructions}</p>
                </div>
              </div>
            </div>
          )}

          {/* Countdown Timer */}
          {(interview.status === 'pending' || interview.status === 'in_progress') && (
            <div className="text-center mb-8">
              <div className="bg-blue-50 rounded-lg p-6">
                <Clock className="h-8 w-8 text-blue-500 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-blue-900 mb-2">Time Remaining</h3>
                {timeLeft === null ? (
                  <div className="h-8 w-32 bg-blue-200 rounded animate-pulse mx-auto" />
                ) : (
                  <p className="text-2xl font-bold text-blue-600">{timeLeft}</p>
                )}
                {canJoinInterview() && (
                  <p className="text-sm text-blue-700 mt-2">
                    You can now join the interview!
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-center space-x-4">
            {(interview.status === 'pending' || interview.status === 'in_progress') && canJoinInterview() && (
              <button
                onClick={handleJoinInterview}
                className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-lg font-medium transition-colors duration-200 flex items-center"
              >
                <Play className="h-4 w-4 mr-2" />
                Join Interview
              </button>
            )}
            
            {normalizedStatus === 'completed' && (
              <button
                onClick={() => navigate('/student/performance')}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition-colors duration-200 flex items-center"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                View Results
              </button>
            )}
            
            {(interview.status === 'pending' || interview.status === 'in_progress') && !canJoinInterview() && (
              <div className="text-center">
                <p className="text-gray-600 mb-2">Interview is available 15 minutes before start (until end time)</p>
                <button
                  disabled
                  className="bg-gray-300 text-gray-500 px-6 py-3 rounded-lg font-medium cursor-not-allowed"
                >
                  Join Interview
                </button>
              </div>
            )}
          </div>

          {/* Preparation Checklist */}
          <div className="mt-8 bg-gray-50 rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Preparation Checklist</h3>
            <div className="space-y-2">
              {[
                'Ensure stable internet connection',
                'Test camera and microphone',
                'Find a quiet, well-lit environment',
                'Close unnecessary applications',
              ].map((item, i) => (
                <button
                  key={i}
                  onClick={() =>
                    setChecklistDone((prev) => prev.map((v, idx) => (idx === i ? !v : v)))
                  }
                  className="flex items-center w-full text-left group"
                >
                  {checklistDone[i] ? (
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                  ) : (
                    <Square className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0 group-hover:text-gray-600" />
                  )}
                  <span className={`text-sm ${checklistDone[i] ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                    {item}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  )
}

export default ScheduledInterviewPage