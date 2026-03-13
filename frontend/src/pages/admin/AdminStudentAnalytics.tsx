import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, BarChart3, Calendar } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import Footer from '../../components/Footer'
import { adminApi } from '../../utils/api'

const AdminStudentAnalytics = () => {
  const { studentId } = useParams()

  const sid = Number(studentId)
  const isValid = Number.isFinite(sid) && sid > 0

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-student-analytics', sid],
    queryFn: () => adminApi.getStudentPerformance(sid),
    enabled: isValid,
  })

  const payload = data?.data

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Link
                to={`/admin/students/${sid || ''}`}
                className="flex items-center text-gray-500 hover:text-gray-700 mr-4"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Student Analytics</h1>
            </div>
            {isValid && (
              <Link
                to={`/admin/students/${sid}/schedule`}
                className="flex items-center px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
              >
                <Calendar className="h-4 w-4 mr-2" />
                Schedule
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!isValid ? (
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-700">Invalid student.</p>
          </div>
        ) : isLoading ? (
          <div className="bg-white rounded-lg shadow p-6 animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
            <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
            <div className="h-4 bg-gray-200 rounded w-1/2" />
          </div>
        ) : error ? (
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-red-600">Failed to load analytics.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center mb-4">
                <BarChart3 className="h-5 w-5 text-primary-600 mr-2" />
                <h2 className="text-lg font-semibold text-gray-900">Highlights</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-500">Top strengths</div>
                  <div className="mt-2 space-y-1">
                    {(payload?.top_strengths || []).slice(0, 5).map((s: any, idx: number) => (
                      <div key={idx} className="text-sm text-gray-900">{s.strength}</div>
                    ))}
                    {(payload?.top_strengths || []).length === 0 && (
                      <div className="text-sm text-gray-500">No data</div>
                    )}
                  </div>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-500">Areas to improve</div>
                  <div className="mt-2 space-y-1">
                    {(payload?.areas_for_improvement || []).slice(0, 5).map((w: any, idx: number) => (
                      <div key={idx} className="text-sm text-gray-900">{w.weakness}</div>
                    ))}
                    {(payload?.areas_for_improvement || []).length === 0 && (
                      <div className="text-sm text-gray-500">No data</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Summary Scores</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-500">Technical</div>
                  <div className="text-xl font-semibold text-gray-900">{payload?.performance_summary?.average_technical_score ?? 0}</div>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-500">Communication</div>
                  <div className="text-xl font-semibold text-gray-900">{payload?.performance_summary?.average_communication_score ?? 0}</div>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-500">Confidence</div>
                  <div className="text-xl font-semibold text-gray-900">{payload?.performance_summary?.average_confidence_score ?? 0}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </div>
  )
}

export default AdminStudentAnalytics
