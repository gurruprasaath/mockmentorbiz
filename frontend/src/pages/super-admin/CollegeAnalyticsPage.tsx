import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import Footer from '../../components/Footer'
import {
  ArrowLeft,
  BarChart3,
  Users,
  BookOpen,
  TrendingUp,
  Award,
} from 'lucide-react'
import { superAdminApi } from '../../utils/api'

const CollegeAnalyticsPage = () => {
  const { collegeId } = useParams<{ collegeId: string }>()
  const [days, setDays] = useState(30)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['college-analytics-detail', collegeId, days],
    queryFn: () => superAdminApi.getCollegeAnalyticsDetail(collegeId!, days),
    enabled: !!collegeId,
  })

  const analytics = data?.data

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <Link
                to={`/super-admin/colleges/${collegeId}`}
                className="flex items-center text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">
                {analytics?.college_name || 'College'} — Analytics
              </h1>
            </div>
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last year</option>
            </select>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
        {isLoading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg shadow p-6 animate-pulse">
                <div className="h-8 bg-gray-200 rounded w-1/2 mx-auto mb-2" />
                <div className="h-4 bg-gray-200 rounded w-3/4 mx-auto" />
              </div>
            ))}
          </div>
        )}

        {isError && (
          <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
            Failed to load analytics.
          </div>
        )}

        {analytics && (
          <div className="space-y-6">
            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Students', value: analytics.total_students, icon: Users, color: 'text-blue-600' },
                { label: 'Total Interviews', value: analytics.total_interviews, icon: BookOpen, color: 'text-green-600' },
                {
                  label: 'Completion Rate',
                  value: `${analytics.completion_rate}%`,
                  icon: TrendingUp,
                  color: 'text-purple-600',
                },
                {
                  label: 'Avg Score',
                  value: analytics.average_score ? `${analytics.average_score}%` : '—',
                  icon: Award,
                  color: 'text-orange-600',
                },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="bg-white rounded-lg shadow p-4 text-center">
                  <Icon className={`h-6 w-6 mx-auto mb-2 ${color}`} />
                  <div className="text-2xl font-bold text-gray-900">{value}</div>
                  <div className="text-sm text-gray-500">{label}</div>
                </div>
              ))}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Score distribution */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <BarChart3 className="h-5 w-5 mr-2 text-primary-600" />
                  Score Distribution
                </h3>
                {analytics.score_distribution && analytics.score_distribution.length > 0 ? (
                  <div className="space-y-3">
                    {analytics.score_distribution.map((bucket: any) => {
                      const total = analytics.completed_interviews || 1
                      const pct = Math.round((bucket.count / total) * 100)
                      return (
                        <div key={bucket.range}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-600">{bucket.range}</span>
                            <span className="font-medium text-gray-900">
                              {bucket.count} ({pct}%)
                            </span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div
                              className="bg-primary-500 h-2 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">No completed interviews yet.</p>
                )}
              </div>

              {/* Interview type breakdown */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <BookOpen className="h-5 w-5 mr-2 text-primary-600" />
                  Interview Types
                </h3>
                {analytics.interview_type_breakdown && analytics.interview_type_breakdown.length > 0 ? (
                  <div className="space-y-3">
                    {analytics.interview_type_breakdown.map((item: any) => {
                      const total = analytics.total_interviews || 1
                      const pct = Math.round((item.count / total) * 100)
                      const label = item.type.replace(/_/g, ' ')
                      return (
                        <div key={item.type}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-600 capitalize">{label}</span>
                            <span className="font-medium text-gray-900">
                              {item.count} ({pct}%)
                            </span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div
                              className="bg-blue-500 h-2 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">No interviews yet.</p>
                )}
              </div>
            </div>

            {/* Department breakdown table */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Department Breakdown</h3>
              </div>
              {analytics.department_breakdown && analytics.department_breakdown.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        {[
                          'Department',
                          'Admin',
                          'Students',
                          'Total Interviews',
                          'Completed',
                          'Avg Score',
                        ].map((h) => (
                          <th
                            key={h}
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {analytics.department_breakdown.map((dept: any) => (
                        <tr key={dept.department} className="hover:bg-gray-50">
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">
                            {dept.department}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">{dept.admin_name}</td>
                          <td className="px-6 py-4 text-sm text-gray-900">{dept.total_students}</td>
                          <td className="px-6 py-4 text-sm text-gray-900">{dept.total_interviews}</td>
                          <td className="px-6 py-4 text-sm text-gray-900">{dept.completed_interviews}</td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {dept.average_score > 0 ? `${dept.average_score}%` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-gray-500">No department data yet.</div>
              )}
            </div>
          </div>
        )}
      </div>
      <Footer />
    </div>
  )
}

export default CollegeAnalyticsPage
