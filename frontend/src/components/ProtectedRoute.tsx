import { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

interface ProtectedRouteProps {
  children: ReactNode
  allowedRoles: string[]
}

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, token } = useAuthStore()

  // Not authenticated
  if (!token || !user) {
    const isOwnerRoute = allowedRoles.includes('owner')
    return <Navigate to={isOwnerRoute ? '/owner/login' : '/login'} replace />
  }

  // User role not allowed
  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

export default ProtectedRoute