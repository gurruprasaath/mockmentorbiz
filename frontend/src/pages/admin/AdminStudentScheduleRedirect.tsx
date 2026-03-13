import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

const AdminStudentScheduleRedirect = () => {
  const navigate = useNavigate()
  const { studentId } = useParams()

  useEffect(() => {
    if (!studentId) {
      navigate('/admin/students', { replace: true })
      return
    }

    navigate(`/admin/schedule?student_ids=${encodeURIComponent(studentId)}`, { replace: true })
  }, [navigate, studentId])

  return null
}

export default AdminStudentScheduleRedirect
