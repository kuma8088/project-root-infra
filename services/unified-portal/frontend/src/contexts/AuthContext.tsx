import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

interface AuthContextType {
  token: string | null
  username: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

// Token refresh interval: 5 minutes (in milliseconds)
const TOKEN_REFRESH_INTERVAL = 5 * 60 * 1000

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('token')
  })
  const [username, setUsername] = useState<string | null>(() => {
    return localStorage.getItem('username')
  })
  const navigate = useNavigate()

  // Track last activity time
  const lastActivityRef = useRef<number>(Date.now())
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token)
    } else {
      localStorage.removeItem('token')
    }
  }, [token])

  useEffect(() => {
    if (username) {
      localStorage.setItem('username', username)
    } else {
      localStorage.removeItem('username')
    }
  }, [username])

  // Refresh token function
  const refreshToken = useCallback(async () => {
    if (!token) return

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setToken(data.access_token)
        console.log('Token refreshed successfully')
      } else if (response.status === 401) {
        // Token expired, logout
        console.log('Token expired, logging out')
        setToken(null)
        setUsername(null)
        navigate('/login')
      }
    } catch (error) {
      console.error('Token refresh failed:', error)
    }
  }, [token, navigate])

  // Update last activity time on user interaction
  const updateActivity = useCallback(() => {
    lastActivityRef.current = Date.now()
  }, [])

  // Set up activity listeners and refresh timer
  useEffect(() => {
    if (!token) {
      // Clear timer if not authenticated
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
      return
    }

    // Activity event listeners
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click']

    events.forEach(event => {
      window.addEventListener(event, updateActivity, { passive: true })
    })

    // Set up periodic token refresh check
    refreshTimerRef.current = setInterval(() => {
      const timeSinceActivity = Date.now() - lastActivityRef.current

      // Only refresh if there was activity in the last 10 minutes
      if (timeSinceActivity < 10 * 60 * 1000) {
        refreshToken()
      }
    }, TOKEN_REFRESH_INTERVAL)

    // Cleanup
    return () => {
      events.forEach(event => {
        window.removeEventListener(event, updateActivity)
      })
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current)
      }
    }
  }, [token, updateActivity, refreshToken])

  const login = async (username: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Login failed' }))
      throw new Error(error.detail || 'ログインに失敗しました')
    }

    const data = await response.json()
    setToken(data.access_token)
    setUsername(username)
    lastActivityRef.current = Date.now()
    navigate('/')
  }

  const logout = () => {
    setToken(null)
    setUsername(null)
    navigate('/login')
  }

  return (
    <AuthContext.Provider
      value={{
        token,
        username,
        login,
        logout,
        isAuthenticated: !!token,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
