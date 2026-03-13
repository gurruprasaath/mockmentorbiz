import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, BarChart3, Calendar, FileText, User } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import Footer from '../../components/Footer'
import { adminApi } from '../../utils/api'

const AdminStudentDetails = () => {
  const { studentId } = useParams()

  const sid = Number(studentId)
  const isValid = Number.isFinite(sid) && sid > 0

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-student-performance', sid],
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
                to="/admin/students"
                className="flex items-center text-gray-500 hover:text-gray-700 mr-4"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Student Details</h1>
            </div>
            {isValid && (
              <div className="flex items-center space-x-2">
                <Link
                  to={`/admin/students/${sid}/analytics`}
                  className="flex items-center px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg transition-colors"
                >
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Analytics
                </Link>
                <Link
                  to={`/admin/students/${sid}/schedule`}
                  className="flex items-center px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  Schedule
                </Link>
              </div>
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
            <p className="text-red-600">Failed to load student details.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="h-12 w-12 bg-primary-100 rounded-full flex items-center justify-center">
                  <User className="h-6 w-6 text-primary-600" />
                </div>
                <div className="ml-4">
                  <div className="text-lg font-semibold text-gray-900">
                    {payload?.student_info?.name || 'Student'}
                  </div>
                  <div className="text-sm text-gray-500">{payload?.student_info?.email}</div>
                  <div className="text-sm text-gray-500">{payload?.student_info?.department}</div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Performance Summary</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-500">Total interviews</div>
                  <div className="text-xl font-semibold text-gray-900">{payload?.performance_summary?.total_interviews ?? 0}</div>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-500">Completed</div>
                  <div className="text-xl font-semibold text-gray-900">{payload?.performance_summary?.completed_interviews ?? 0}</div>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-500">Avg technical</div>
                  <div className="text-xl font-semibold text-gray-900">{payload?.performance_summary?.average_technical_score ?? 0}</div>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-500">Avg communication</div>
                  <div className="text-xl font-semibold text-gray-900">{payload?.performance_summary?.average_communication_score ?? 0}</div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Interviews</h2>
              {(payload?.recent_interviews || []).length === 0 ? (
                <p className="text-gray-500">No interviews yet.</p>
              ) : (
                <div className="space-y-3">
                  {(payload?.recent_interviews || []).map((it: any) => (
                    <div key={it.interview_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center">
                        <FileText className="h-4 w-4 text-gray-500 mr-2" />
                        <div>
                          <div className="text-sm font-medium text-gray-900">Interview #{it.interview_id}</div>
                          <div className="text-xs text-gray-500">{it.status} • {it.interview_type}</div>
                        </div>
                      </div>
                      <Link
                        to={`/admin/interview/${it.interview_id}/results`}
                        className="text-primary-600 hover:text-primary-700 text-sm"
                      >
                        View results
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <Footer />
    </div>
  )
}

export default AdminStudentDetails
