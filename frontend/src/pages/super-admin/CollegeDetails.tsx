import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import Footer from '../../components/Footer'
import {
  ArrowLeft,
  Building,
  Users,
  BarChart3,
  Mail,
  Phone,
  Globe,
  Calendar,
  CheckCircle,
  XCircle,
  BookOpen,
} from 'lucide-react'
import { superAdminApi } from '../../utils/api'

const CollegeDetails = () => {
  const { collegeId } = useParams<{ collegeId: string }>()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['college-detail', collegeId],
    queryFn: () => superAdminApi.getCollegeDetail(collegeId!),
    enabled: !!collegeId,
  })

  const college = data?.data

  const getStatusColor = (s: string) => {
    if (s === 'active') return 'text-green-700 bg-green-100'
    if (s === 'inactive') return 'text-gray-600 bg-gray-100'
    return 'text-red-700 bg-red-100'
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 space-x-4">
            <Link
              to="/super-admin/colleges"
              className="flex items-center text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">College Details</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
        {isLoading && (
          <div className="space-y-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg shadow p-6 animate-pulse">
                <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
              </div>
            ))}
          </div>
        )}

        {isError && (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Building className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">Failed to load college details.</p>
          </div>
        )}

        {college && (
          <div className="space-y-6">
            {/* Overview card */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{college.college_name}</h2>
                  <div className="flex items-center space-x-2 mt-2">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                        college.status
                      )}`}
                    >
                      {college.status}
                    </span>
                    <span className="px-2 py-1 rounded-full text-xs font-medium text-blue-700 bg-blue-100">
                      {college.college_type}
                    </span>
                  </div>
                </div>
                <Link
                  to={`/super-admin/colleges/${collegeId}/analytics`}
                  className="flex items-center px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm"
                >
                  <BarChart3 className="h-4 w-4 mr-2" />
                  View Analytics
                </Link>
              </div>

              {/* Contact info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-sm text-gray-600">
                {college.contact_email && (
                  <div className="flex items-center">
                    <Mail className="h-4 w-4 mr-2 text-gray-400" />
                    <a href={`mailto:${college.contact_email}`} className="hover:text-primary-600">
                      {college.contact_email}
                    </a>
                  </div>
                )}
                {college.contact_phone && (
                  <div className="flex items-center">
                    <Phone className="h-4 w-4 mr-2 text-gray-400" />
                    {college.contact_phone}
                  </div>
                )}
                {college.website_url && (
                  <div className="flex items-center">
                    <Globe className="h-4 w-4 mr-2 text-gray-400" />
                    <a
                      href={college.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-primary-600 truncate"
                    >
                      {college.website_url}
                    </a>
                  </div>
                )}
                {college.established_year && (
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 mr-2 text-gray-400" />
                    Established {college.established_year}
                  </div>
                )}
                {college.address && (
                  <div className="flex items-start md:col-span-2">
                    <Building className="h-4 w-4 mr-2 text-gray-400 mt-0.5 shrink-0" />
                    {college.address}
                  </div>
                )}
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Students', value: college.total_students, icon: Users, color: 'text-blue-600' },
                { label: 'Admins', value: college.total_admins, icon: Building, color: 'text-purple-600' },
                { label: 'Interviews', value: college.total_interviews, icon: BookOpen, color: 'text-green-600' },
                {
                  label: 'Avg Score',
                  value: college.average_performance ? `${college.average_performance.toFixed(1)}%` : '—',
                  icon: BarChart3,
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

            {/* Admins / Departments table */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Departments & Admins</h3>
              </div>
              {college.admins && college.admins.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Admin', 'Department', 'Email', 'Students', 'Interviews', 'Status'].map(
                          (h) => (
                            <th
                              key={h}
                              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                            >
                              {h}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {college.admins.map((admin: any) => (
                        <tr key={admin.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">
                            {admin.full_name}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">{admin.department}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">{admin.email}</td>
                          <td className="px-6 py-4 text-sm text-gray-900">{admin.total_students}</td>
                          <td className="px-6 py-4 text-sm text-gray-900">{admin.total_interviews}</td>
                          <td className="px-6 py-4">
                            {admin.is_active ? (
                              <span className="flex items-center text-green-600 text-sm">
                                <CheckCircle className="h-4 w-4 mr-1" /> Active
                              </span>
                            ) : (
                              <span className="flex items-center text-gray-400 text-sm">
                                <XCircle className="h-4 w-4 mr-1" /> Inactive
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-gray-500">
                  No admins / departments yet. Create one from{' '}
                  <Link to="/super-admin/admins" className="text-primary-600 hover:underline">
                    Admin Management
                  </Link>
                  .
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

export default CollegeDetails
