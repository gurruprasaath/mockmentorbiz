import { useParams, useNavigate } from 'react-router-dom'
import Footer from '../../components/Footer'
import { 
  ArrowLeft, 
  Clock, 
  FileText, 
  BookOpen, 
  Video,
  Award,
  TrendingUp
} from 'lucide-react'

const InterviewPage = () => {
  const { type } = useParams<{ type: string }>()
  const navigate = useNavigate()

  const interviewTypeMap = {
    'resume': {
      title: 'Resume-Based Interview',
      description: 'AI will analyze your resume and generate personalized questions',
      icon: FileText,
      color: 'bg-blue-500'
    },
    'domain': {
      title: 'Domain-Specific Interview',
      description: 'Technical questions based on your selected domain',
      icon: BookOpen,
      color: 'bg-purple-500'
    },
    'general': {
      title: 'General Interview',
      description: 'Common interview questions across various topics',
      icon: Video,
      color: 'bg-green-500'
    }
  }

  const currentType = interviewTypeMap[type as keyof typeof interviewTypeMap] || interviewTypeMap['general']
  const Icon = currentType.icon

  const handleStartInterview = () => {
    switch (type) {
      case 'resume':
        navigate('/student/interview/resume')
        break
      case 'domain':
        navigate('/student/interview/domain')
        break
      default:
        // No standalone "general" room route (room expects a numeric interviewId)
        // Send to domain flow as the simplest fallback.
        navigate('/student/interview/domain')
        break
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-2">
            <button 
              onClick={() => navigate('/student')}
              className="flex items-center text-gray-500 hover:text-gray-700 mr-2 sm:mr-4 shrink-0"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Back to Dashboard</span>
              <span className="sm:hidden">Back</span>
            </button>
            <h1 className="text-lg sm:text-xl font-semibold text-gray-900 truncate">{currentType.title}</h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Interview Type Card */}
        <div className="bg-white rounded-lg shadow-sm p-8 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center mb-6 gap-4">
            <div className={`p-4 ${currentType.color} rounded-lg self-start`}>
              <Icon className="h-8 w-8 text-white" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{currentType.title}</h2>
              <p className="text-gray-600 mt-1">{currentType.description}</p>
            </div>
          </div>

          {/* Interview Guidelines */}
          <div className="bg-blue-50 rounded-lg p-6 mb-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-4">Interview Guidelines</h3>
            <ul className="space-y-2 text-blue-800">
              <li className="flex items-center">
                <Clock className="h-4 w-4 mr-2" />
                Expected duration: 30–60 minutes
              </li>
              <li className="flex items-center">
                <Video className="h-4 w-4 mr-2" />
                Camera and microphone will be monitored
              </li>
              <li className="flex items-center">
                <Award className="h-4 w-4 mr-2" />
                You can answer via voice or text
              </li>
              <li className="flex items-center">
                <TrendingUp className="h-4 w-4 mr-2" />
                Performance feedback will be provided after completion
              </li>
            </ul>
          </div>

          {/* Important Notes */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h4 className="text-sm font-medium text-yellow-800">Important Notes</h4>
                <div className="mt-2 text-sm text-yellow-700">
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Ensure stable internet connection</li>
                    <li>Find a quiet, well-lit environment</li>
                    <li>Close unnecessary applications and tabs</li>
                    <li>Have your resume ready if doing a resume-based interview</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="flex justify-center">
            <button
              onClick={handleStartInterview}
              className="bg-primary-600 hover:bg-primary-700 text-white px-8 py-3 rounded-lg font-medium transition-colors duration-200 flex items-center"
            >
              Start {currentType.title}
              <ArrowLeft className="h-4 w-4 ml-2 rotate-180" />
            </button>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  )
}

export default InterviewPage