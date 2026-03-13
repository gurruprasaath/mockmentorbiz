import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '../utils/api'
import toast from 'react-hot-toast'

export interface User {
  id: number
  email: string
  username: string
  full_name: string
  role: 'student' | 'admin' | 'super_admin' | 'owner'
  department?: string
  college_name?: string
}

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<boolean>
  register: (userData: RegisterData) => Promise<boolean>
  logout: () => void
  setUser: (user: User) => void
  clearAuth: () => void
}

export interface RegisterData {
  email: string
  username: string
  password: string
  full_name: string
  admin_id?: string
  department?: string
  college_name?: string
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,

      login: async (email: string, password: string) => {
        set({ isLoading: true })
        try {
          const response = await api.post('/auth/login', {
            email,
            password,
          })

          const { access_token, user } = response.data
          
          // Set token in API headers
          api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`
          
          set({
            user,
            token: access_token,
            isLoading: false,
          })

          toast.success(`Welcome back, ${user.full_name}!`)
          return true
        } catch (error: any) {
          console.error('Login error:', error)
          let message = 'Login failed'
          
          if (error.response?.data?.detail) {
            if (Array.isArray(error.response.data.detail)) {
              message = error.response.data.detail.map((err: any) => err.msg || err).join(', ')
            } else {
              message = error.response.data.detail
            }
          } else if (error.response?.data?.message) {
            message = error.response.data.message
          } else if (error.message) {
            message = error.message
          }
          
          toast.error(message)
          set({ isLoading: false })
          return false
        }
      },

      register: async (userData: RegisterData) => {
        set({ isLoading: true })
        try {
          const response = await api.post('/auth/register', userData)
          
          toast.success('Registration successful! Please login.')
          set({ isLoading: false })
          return true
        } catch (error: any) {
          const message = error.response?.data?.detail || 'Registration failed'
          toast.error(message)
          set({ isLoading: false })
          return false
        }
      },

      logout: () => {
        // Remove token from API headers
        delete api.defaults.headers.common['Authorization']
        
        set({
          user: null,
          token: null,
        })
        
        toast.success('Logged out successfully')
      },

      setUser: (user: User) => {
        set({ user })
      },

      clearAuth: () => {
        delete api.defaults.headers.common['Authorization']
        set({
          user: null,
          token: null,
        })
      },
    }),
    {
      name: 'mockmentorbiz-auth',
      onRehydrateStorage: () => (state) => {
        // Set token in API headers when rehydrating from storage
        if (state?.token) {
          api.defaults.headers.common['Authorization'] = `Bearer ${state.token}`
        }
      },
    }
  )
)