/**
 * API client for Unified Portal Backend
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

/**
 * Generic API fetch wrapper with error handling
 */
async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
      throw new Error(error.detail || `API error: ${response.status}`)
    }

    return response.json()
  } catch (error) {
    console.error(`API request failed: ${url}`, error)
    throw error
  }
}

// ============================================================================
// Dashboard API Types
// ============================================================================

export interface DashboardOverview {
  total_containers: number
  running_containers: number
  wordpress_sites: number
  total_databases: number
  backup_count: number
}

export interface SystemStats {
  cpu_percent: number
  memory_used_gb: number
  memory_total_gb: number
  memory_percent: number
  disk_used_gb: number
  disk_total_gb: number
  disk_percent: number
  load_average: number[]
  uptime_seconds: number
}

export interface ContainerStats {
  total: number
  running: number
  containers: Array<{
    name: string
    status: string
    health: string
    uptime: string
  }>
}

export interface WordPressStats {
  total_sites: number
  sites: Array<{
    site_id: string
    domain: string
    status: string
  }>
}

export interface RedisStats {
  connected: boolean
  version: string
  used_memory: string
  connected_clients: number
  total_keys: number
}

// ============================================================================
// Dashboard API Functions
// ============================================================================

export const dashboardAPI = {
  /**
   * Get dashboard overview
   */
  getOverview: () =>
    apiFetch<DashboardOverview>('/api/v1/dashboard/overview'),

  /**
   * Get system resource stats
   */
  getSystemStats: () =>
    apiFetch<SystemStats>('/api/v1/dashboard/system'),

  /**
   * Get container stats
   */
  getContainerStats: () =>
    apiFetch<ContainerStats>('/api/v1/dashboard/containers'),

  /**
   * Get WordPress stats
   */
  getWordPressStats: () =>
    apiFetch<WordPressStats>('/api/v1/dashboard/wordpress'),

  /**
   * Get Redis stats
   */
  getRedisStats: () =>
    apiFetch<RedisStats>('/api/v1/dashboard/redis'),
}

// ============================================================================
// Export for convenience
// ============================================================================

export { apiFetch, API_BASE_URL }
