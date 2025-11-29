import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  Plus,
  RefreshCw,
  Globe,
  Download,
  Upload,
  AlertCircle,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { wordpressAPI } from '@/lib/api'
import ManagedSitesList from '@/components/ManagedSitesList'
import CreateManagedSiteModal from '@/components/CreateManagedSiteModal'

export default function WordPressManagement() {
  const [searchParams] = useSearchParams()
  const domainFilter = searchParams.get('domain')

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState(domainFilter || '')
  const queryClient = useQueryClient()

  // Query: WordPress stats
  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: ['wordpress-stats'],
    queryFn: wordpressAPI.getStats,
    refetchInterval: 30000,
  })

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['managed-sites'] })
    queryClient.invalidateQueries({ queryKey: ['wordpress-stats'] })
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
          WordPress管理
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          WordPressサイトの作成・管理・リストアを行います（自動更新: 30秒）
        </p>
      </div>

      {/* Actions bar */}
      <div className="flex items-center justify-between">
        <div className="w-64 relative">
          <input
            type="text"
            placeholder="サイトを検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="flex gap-4">
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            新規サイト作成
          </Button>
          <Button variant="outline" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            更新
          </Button>
        </div>
      </div>

      {/* Statistics */}
      {statsError ? (
        <div className="flex items-center gap-2 text-amber-600">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">統計情報の取得に失敗しました</span>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">総サイト数</CardTitle>
              <Globe className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statsLoading ? '...' : stats?.total_sites || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                オンライン: {stats?.sites_online || 0}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">総プラグイン数</CardTitle>
              <Download className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statsLoading ? '...' : stats?.total_plugins || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                全サイト合計
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Redisキャッシュ</CardTitle>
              <Upload className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statsLoading ? '...' : stats?.redis_enabled_sites || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                有効サイト数
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                サイトステータス
              </CardTitle>
              <Globe className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statsLoading ? '...' : (stats?.sites_online === stats?.total_sites ? '正常' : '要確認')}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                全サイト状態
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Managed sites list */}
      <ManagedSitesList searchQuery={searchQuery} />

      {/* Create site modal */}
      <CreateManagedSiteModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
    </div>
  )
}
