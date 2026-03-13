import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'

// Pages
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'

// Student Pages
import StudentDashboard from './pages/student/StudentDashboard'
import InterviewPage from './pages/student/InterviewPage'
import ScheduledInterviewPage from './pages/student/ScheduledInterviewPage'
import PerformancePage from './pages/student/PerformancePage'
import ResumeInterview from './pages/student/ResumeInterview'
import DomainInterview from './pages/student/DomainInterview'
import InterviewRoom from './pages/student/InterviewRoom'
import ScheduledInterviews from './pages/student/ScheduledInterviews'

// Admin Pages
import AdminDashboard from './pages/admin/AdminDashboard'
import StudentManagement from './pages/admin/StudentManagement'
import InterviewScheduling from './pages/admin/InterviewScheduling'
import AdminStudentDetails from './pages/admin/AdminStudentDetails.tsx'
import AdminStudentAnalytics from './pages/admin/AdminStudentAnalytics.tsx'
import AdminStudentScheduleRedirect from './pages/admin/AdminStudentScheduleRedirect.tsx'
import InterviewResults from './pages/admin/InterviewResults'
import Submissions from './pages/admin/Submissions'
import SubmissionDetail from './pages/admin/SubmissionDetail'
import AdminAnalytics from './pages/admin/AdminAnalytics'
import MalpracticeReports from './pages/admin/MalpracticeReports'

// Super Admin Pages
import SuperAdminDashboard from './pages/super-admin/SuperAdminDashboard'
import CollegeManagement from './pages/super-admin/CollegeManagement'
import CollegeDetails from './pages/super-admin/CollegeDetails'
import CollegeAnalyticsPage from './pages/super-admin/CollegeAnalyticsPage'
import SystemAnalytics from './pages/super-admin/SystemAnalytics'
import AdminManagement from './pages/super-admin/AdminManagement'
import SystemSettings from './pages/super-admin/SystemSettings'
import CreateSuperAdminPage from './pages/dev/CreateSuperAdminPage'
import OwnerLoginPage from './pages/owner/OwnerLoginPage'
import OwnerDashboard from './pages/owner/OwnerDashboard'

// Components
import ProtectedRoute from './components/ProtectedRoute'

function App() {
  const { user, isLoading } = useAuthStore()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        {/* Public routes */}
        <Route 
          path="/" 
          element={user ? <Navigate to={`/${user.role}`} /> : <LandingPage />} 
        />
        <Route 
          path="/login" 
          element={user ? <Navigate to={`/${user.role}`} /> : <LoginPage />} 
        />
        <Route 
          path="/register" 
          element={user ? <Navigate to={`/${user.role}`} /> : <RegisterPage />} 
        />

        {/* Student routes */}
        <Route
          path="/student"
          element={
            <ProtectedRoute allowedRoles={['student']}>
              <StudentDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/student/interview/resume"
          element={
            <ProtectedRoute allowedRoles={['student']}>
              <ResumeInterview />
            </ProtectedRoute>
          }
        />
        <Route
          path="/student/interview/domain"
          element={
            <ProtectedRoute allowedRoles={['student']}>
              <DomainInterview />
            </ProtectedRoute>
          }
        />
        <Route
          path="/student/interview/room/:interviewId"
          element={
            <ProtectedRoute allowedRoles={['student']}>
              <InterviewRoom />
            </ProtectedRoute>
          }
        />
        <Route
          path="/student/scheduled"
          element={
            <ProtectedRoute allowedRoles={['student']}>
              <ScheduledInterviews />
            </ProtectedRoute>
          }
        />
        <Route
          path="/student/interview/:type"
          element={
            <ProtectedRoute allowedRoles={['student']}>
              <InterviewPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/student/scheduled-interview/:interviewId"
          element={
            <ProtectedRoute allowedRoles={['student']}>
              <ScheduledInterviewPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/student/performance"
          element={
            <ProtectedRoute allowedRoles={['student']}>
              <PerformancePage />
            </ProtectedRoute>
          }
        />

        {/* Admin routes */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/students"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <StudentManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/students/:studentId"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminStudentDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/students/:studentId/analytics"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminStudentAnalytics />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/students/:studentId/schedule"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminStudentScheduleRedirect />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/schedule"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <InterviewScheduling />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/submissions"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Submissions />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/submissions/:batchKey"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <SubmissionDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/interview/:interviewId/results"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <InterviewResults />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/analytics"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminAnalytics />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/malpractice"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <MalpracticeReports />
            </ProtectedRoute>
          }
        />

        {/* Super Admin routes */}
        <Route
          path="/super_admin"
          element={
            <ProtectedRoute allowedRoles={['super_admin']}>
              <SuperAdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/super-admin"
          element={
            <ProtectedRoute allowedRoles={['super_admin']}>
              <SuperAdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/super-admin/colleges"
          element={
            <ProtectedRoute allowedRoles={['super_admin']}>
              <CollegeManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/super-admin/colleges/:collegeId"
          element={
            <ProtectedRoute allowedRoles={['super_admin']}>
              <CollegeDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="/super-admin/colleges/:collegeId/analytics"
          element={
            <ProtectedRoute allowedRoles={['super_admin']}>
              <CollegeAnalyticsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/super-admin/admins"
          element={
            <ProtectedRoute allowedRoles={['super_admin']}>
              <AdminManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/super-admin/analytics"
          element={
            <ProtectedRoute allowedRoles={['super_admin']}>
              <SystemAnalytics />
            </ProtectedRoute>
          }
        />
        <Route
          path="/super-admin/settings"
          element={
            <ProtectedRoute allowedRoles={['super_admin']}>
              <SystemSettings />
            </ProtectedRoute>
          }
        />

        <Route path="/owner/login" element={<OwnerLoginPage />} />
        <Route
          path="/owner"
          element={
            <ProtectedRoute allowedRoles={['owner']}>
              <OwnerDashboard />
            </ProtectedRoute>
          }
        />

        {import.meta.env.DEV ? (
          <Route path="/dev/create-super-admin" element={<CreateSuperAdminPage />} />
        ) : null}

        {/* Fallback route */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  )
}

export default App