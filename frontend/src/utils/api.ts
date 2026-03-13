import axios, { AxiosHeaders } from 'axios'
import toast from 'react-hot-toast'

// Use nullish coalescing so an explicit empty string is respected.
// This enables Docker/nginx deployments to set VITE_API_BASE_URL='' and use same-origin '/api'.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export function getApiErrorMessage(error: any, fallbackMessage: string): string {
  const detail = error?.response?.data?.detail ?? error?.response?.data ?? error?.message

  if (!detail) return fallbackMessage

  if (typeof detail === 'string') return detail

  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => (typeof d === 'string' ? d : d?.msg || d?.message))
      .filter(Boolean)
    return msgs.length ? msgs.join('\n') : fallbackMessage
  }

  if (typeof detail === 'object') {
    if (typeof (detail as any).msg === 'string') return (detail as any).msg
    if (typeof (detail as any).message === 'string') return (detail as any).message
    try {
      return JSON.stringify(detail)
    } catch {
      return fallbackMessage
    }
  }

  return fallbackMessage
}

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 120000, // 120s — AI endpoints (LLM, Groq, TTS, transcription) can take up to 90s
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Always attach auth token if available.
    // This avoids 401s caused by app refresh / zustand rehydrate timing.
    try {
      const raw = localStorage.getItem('mockmentorbiz-auth')
      const parsed = raw ? JSON.parse(raw) : null
      const token: string | undefined = parsed?.state?.token

      if (token) {
        const headers = (config.headers ?? {}) as any
        const existingAuthHeader =
          headers?.Authorization ||
          headers?.authorization ||
          (typeof headers?.get === 'function' ? headers.get('Authorization') : undefined)

        if (!existingAuthHeader) {
          // Axios v1 may use AxiosHeaders (esp. when using FormData). Mutate via .set().
          if (headers instanceof AxiosHeaders || typeof headers?.set === 'function') {
            headers.set('Authorization', `Bearer ${token}`)
            config.headers = headers
          } else {
            config.headers = {
              ...headers,
              Authorization: `Bearer ${token}`,
            }
          }
        }
      }
    } catch {
      // ignore localStorage/JSON errors
    }

    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      try {
        const authStore = JSON.parse(localStorage.getItem('mockmentorbiz-auth') || '{}')
        if (authStore.state) {
          // Clear auth and redirect to login
          localStorage.removeItem('mockmentorbiz-auth')
          window.location.href = '/login'
        }
      } catch {
        // localStorage data was malformed; clear it and redirect
        localStorage.removeItem('mockmentorbiz-auth')
        window.location.href = '/login'
      }
    }

    if (error.response?.status >= 500) {
      toast.error('Server error. Please try again later.')
    }

    return Promise.reject(error)
  }
)

// API endpoints
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  
  register: (userData: any) =>
    api.post('/auth/register', userData),
  
  logout: () =>
    api.post('/auth/logout'),
}

export const studentApi = {
  startInterview: (data: any, resumeFile?: File) => {
    const formData = new FormData()
    
    // Add interview type and domain as form fields
    formData.append('interview_type', data.interview_type)
    if (data.domain) {
      formData.append('domain', data.domain)
    }

    if (data.num_questions !== undefined && data.num_questions !== null) {
      formData.append('num_questions', String(data.num_questions))
    }

    if (data.enable_followups !== undefined && data.enable_followups !== null) {
      formData.append('enable_followups', String(Boolean(data.enable_followups)))
    }

    if (data.duration_minutes !== undefined && data.duration_minutes !== null) {
      formData.append('duration_minutes', String(Number(data.duration_minutes)))
    }

    if (data.mode) {
      formData.append('mode', String(data.mode))
    }
    
    // Add resume file if provided
    if (resumeFile) {
      formData.append('resume_file', resumeFile)
    }
    
    return api.post('/students/start-interview', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },

  startScheduledResumeInterview: (interviewId: string, resumeFile: File, mode?: string) => {
    const formData = new FormData()
    formData.append('resume_file', resumeFile)

    if (mode) {
      formData.append('mode', mode)
    }

    return api.post(`/students/scheduled-interview/${interviewId}/start-resume`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  startScheduledDomainInterview: (interviewId: string) =>
    api.post(`/students/scheduled-interview/${interviewId}/start-domain`),
  
  submitAnswer: (interviewId: number, answerData: any, audioFile?: File) => {
    const formData = new FormData()
    
    // Add answer data
    Object.keys(answerData).forEach(key => {
      formData.append(key, answerData[key])
    })
    
    // Add audio file if provided
    if (audioFile) {
      formData.append('audio_file', audioFile)
    }
    
    return api.post(`/students/submit-answer/${interviewId}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },

  getAnswerAudio: (interviewId: number | string, questionId: number) =>
    api.get(`/students/interview/${interviewId}/answer-audio`, {
      params: { question_id: questionId },
      responseType: 'blob',
    }),
  
  completeInterview: (interviewId: number) =>
    api.post(`/students/complete-interview/${interviewId}`),
  
  getMyInterviews: () =>
    api.get('/students/my-interviews'),

  getScheduledInterview: (interviewId: string) =>
    api.get(`/students/interview/${interviewId}`),

  getScheduledInterviews: () =>
    api.get('/students/scheduled-interviews'),
  
  getPerformanceSummary: () =>
    api.get('/students/performance-summary'),

  getPerformance: (timeframe: string = 'all') =>
    api.get('/students/performance', { params: { timeframe } }),
  
  getDomains: () =>
    api.get('/students/domains'),

  getMyNotices: () =>
    api.get('/students/notices'),
}

export const adminApi = {
  getMe: () =>
    api.get('/admin/me'),

  scheduleInterview: (data: any) =>
    api.post('/admin/schedule-interview', data),
  
  getMyStudents: (params?: any) =>
    api.get('/admin/students', { params }),
  
  getStudentPerformance: (studentId: number) =>
    api.get(`/admin/student/${studentId}/performance`),
  
  getScheduledInterviews: (params?: any) =>
    api.get('/admin/scheduled-interviews', { params }),
  
  getMalpracticeReports: (params?: any) =>
    api.get('/admin/malpractice-reports', { params }),
  
  getDashboardAnalytics: () =>
    api.get('/admin/analytics/dashboard'),
  
  getAnalytics: (params?: any) =>
    api.get('/admin/analytics', { params }),
    
  getPerformanceTrends: (params?: any) =>
    api.get('/admin/analytics/performance-trends', { params }),
  
  cancelInterview: (interviewId: string) =>
    api.put(`/admin/interview/${interviewId}/cancel`),

  getInterviewResults: (interviewId: number) =>
    api.get(`/admin/interview/${interviewId}/results`),

  getAnswerAudio: (interviewId: number | string, questionId: number) =>
    api.get(`/admin/interview/${interviewId}/answer-audio`, {
      params: { question_id: questionId },
      responseType: 'blob',
    }),
    
  reviewMalpracticeReport: (reportId: string, data: any) =>
    api.post(`/admin/malpractice-reports/${reportId}/review`, data),
}

export const superAdminApi = {
  createSuperAdmin: (data: any, superAdminSecret?: string) =>
    api.post('/super-admin/create-super-admin', data, {
      headers: superAdminSecret ? { 'X-Superadmin-Secret': superAdminSecret } : undefined,
    }),
  
  createAdmin: (data: any) =>
    api.post('/super-admin/create-admin', data),

  resetDepartmentAdminPassword: (adminUserId: number) =>
    api.post(`/super-admin/admins/${adminUserId}/reset-password`),
  
  getAdmins: () =>
    api.get('/super-admin/admins'),
  
  getAllAdmins: (params?: any) =>
    api.get('/super-admin/admins', { params }),
  
  getCollegeAnalytics: () =>
    api.get('/super-admin/analytics'),
    
  getDashboardOverview: () =>
    api.get('/super-admin/dashboard'),
    
  getAllColleges: (params?: any) =>
    api.get('/super-admin/colleges', { params }),
    
  addCollege: (data: any) =>
    api.post('/super-admin/colleges', data),
    
  updateCollegeStatus: (collegeId: string, status: string) =>
    api.put(`/super-admin/colleges/${collegeId}/status`, { status }),
    
  getSystemStatistics: () =>
    api.get('/super-admin/system/statistics'),
    
  getSystemAnalytics: (params?: any) =>
    api.get('/super-admin/analytics/system', { params }),
    
  getSystemPerformance: (params?: any) =>
    api.get('/super-admin/system/performance', { params }),

  deleteAdmin: (adminUserId: number) =>
    api.delete(`/super-admin/admins/${adminUserId}`),

  toggleAdminActive: (adminUserId: number) =>
    api.patch(`/super-admin/admins/${adminUserId}/toggle-active`),

  getCollegePerformance: (params?: any) =>
    api.get('/super-admin/analytics/college-performance', { params }),

  getCollegeDetail: (collegeId: string) =>
    api.get(`/super-admin/colleges/${collegeId}`),

  getCollegeAnalyticsDetail: (collegeId: string, days?: number) =>
    api.get(`/super-admin/colleges/${collegeId}/analytics`, { params: { days } }),

  updateCollegeInfo: (data: any) =>
    api.post('/super-admin/colleges', data),

  getSettingsProfile: () =>
    api.get('/super-admin/settings/profile'),

  updateSettingsProfile: (data: any) =>
    api.patch('/super-admin/settings/profile', data),

  updateSettingsPassword: (data: { current_password: string; new_password: string }) =>
    api.patch('/super-admin/settings/password', data),
}

export const interviewApi = {
  updateProctoring: (data: any) =>
    api.post('/interviews/proctor/update', data),
  
  getMalpracticeSummary: (interviewId: number) =>
    api.get(`/interviews/${interviewId}/malpractice-summary`),
  
  analyzeVoice: (interviewId: number, audioFile: File) => {
    const formData = new FormData()
    formData.append('audio_file', audioFile)
    
    return api.post(`/interviews/voice/analyze?interview_id=${interviewId}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },
  
  getLiveStatus: (interviewId: number) =>
    api.get(`/interviews/${interviewId}/live-status`),
}

export const ttsApi = {
  speak: (text: string, provider?: 'elevenlabs' | 'murf') =>
    api.post(
      '/tts/speak',
      { text, provider },
      {
        responseType: 'arraybuffer',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    ),
}