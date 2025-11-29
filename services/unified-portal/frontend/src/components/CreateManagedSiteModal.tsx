import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { managedSitesAPI, type ManagedSiteCreate } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface CreateManagedSiteModalProps {
  isOpen: boolean
  onClose: () => void
}

// Available base domains
const BASE_DOMAINS = [
  { value: 'kuma8088.com', label: 'kuma8088.com' },
  { value: 'fx-trader-life.com', label: 'fx-trader-life.com' },
  { value: 'webmakeprofit.org', label: 'webmakeprofit.org' },
  { value: 'webmakesprofit.com', label: 'webmakesprofit.com' },
  { value: 'toyota-phv.jp', label: 'toyota-phv.jp' },
]

// MySQL reserved words (common ones)
const MYSQL_RESERVED_WORDS = [
  'mysql', 'information_schema', 'performance_schema', 'sys',
  'admin', 'root', 'test', 'temp', 'tmp',
  'select', 'insert', 'update', 'delete', 'drop', 'create',
  'table', 'database', 'index', 'view', 'user',
]

// WordPress core prefixes
const WP_RESERVED_PREFIXES = ['wp_']

export default function CreateManagedSiteModal({
  isOpen,
  onClose,
}: CreateManagedSiteModalProps) {
  const queryClient = useQueryClient()
  const [baseDomain, setBaseDomain] = useState('kuma8088.com')
  const [subdomain, setSubdomain] = useState('')
  const [formData, setFormData] = useState<ManagedSiteCreate>({
    site_name: '',
    domain: '',
    database_name: '',
    php_version: '8.2',
    admin_user: 'admin',
    admin_password: '',
    admin_email: '',
    title: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [success, setSuccess] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)

  // Calculate full domain from subdomain + base domain
  const fullDomain = subdomain ? `${subdomain}.${baseDomain}` : baseDomain

  // Creation steps for progress display
  const creationSteps = [
    'データベースを作成中...',
    'WordPressをインストール中...',
    'WP Mail SMTPを設定中...',
    'Nginx設定を生成中...',
    'Nginxをリロード中...',
    'Cloudflare Tunnelを設定中...',
  ]

  // Mutation: Create site
  const createMutation = useMutation({
    mutationFn: (data: ManagedSiteCreate) => {
      // Start step progression simulation
      setCurrentStep(0)
      const stepInterval = setInterval(() => {
        setCurrentStep((prev) => {
          if (prev < creationSteps.length - 1) {
            return prev + 1
          }
          return prev
        })
      }, 3000) // Progress every 3 seconds (estimated)

      // Store interval ID for cleanup
      ;(createMutation as any).stepInterval = stepInterval

      return managedSitesAPI.createSite(data)
    },
    onSuccess: () => {
      // Clear step progression interval
      if ((createMutation as any).stepInterval) {
        clearInterval((createMutation as any).stepInterval)
      }
      setCurrentStep(creationSteps.length - 1)
      setSuccess(true)
      queryClient.invalidateQueries({ queryKey: ['managed-sites'] })
      setTimeout(() => {
        handleClose()
      }, 2000)
    },
    onError: (error: Error) => {
      // Clear step progression interval
      if ((createMutation as any).stepInterval) {
        clearInterval((createMutation as any).stepInterval)
      }
      setCurrentStep(0)
      setErrors({ submit: error.message })
    },
  })

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    // Site name validation
    if (!formData.site_name) {
      newErrors.site_name = 'サイト名は必須です'
    } else if (formData.site_name.length > 100) {
      newErrors.site_name = 'サイト名は100文字以内で入力してください'
    } else if (!/^[a-zA-Z0-9_-]+$/.test(formData.site_name)) {
      newErrors.site_name = '英数字、ハイフン、アンダースコアのみ使用可能です'
    } else if (/^[-_]|[-_]$/.test(formData.site_name)) {
      newErrors.site_name = 'ハイフンやアンダースコアで始まる・終わることはできません'
    } else if (/--/.test(formData.site_name)) {
      newErrors.site_name = '連続したハイフンは使用できません'
    } else if (/^\d+$/.test(formData.site_name)) {
      newErrors.site_name = '数字のみのサイト名は使用できません'
    }

    // Subdomain validation (optional)
    if (subdomain) {
      if (subdomain.length > 63) {
        newErrors.subdomain = 'サブドメインは63文字以内で入力してください'
      } else if (!/^[a-zA-Z0-9-]+$/.test(subdomain)) {
        newErrors.subdomain = 'サブドメインは英数字とハイフンのみ使用可能です'
      } else if (/^-|-$/.test(subdomain)) {
        newErrors.subdomain = 'ハイフンで始まる・終わることはできません'
      } else if (/--/.test(subdomain)) {
        newErrors.subdomain = '連続したハイフンは使用できません'
      } else if (/^\d+$/.test(subdomain)) {
        newErrors.subdomain = '数字のみのサブドメインは使用できません'
      }
    }

    // Base domain is always valid (from selection)

    // Database name validation (required)
    if (!formData.database_name) {
      newErrors.database_name = 'データベース名は必須です'
    } else if (formData.database_name.length > 64) {
      newErrors.database_name = 'データベース名は64文字以内で入力してください'
    } else if (!/^[a-zA-Z0-9_]+$/.test(formData.database_name)) {
      newErrors.database_name = '英数字とアンダースコアのみ使用可能です'
    } else if (/^_|_$/.test(formData.database_name)) {
      newErrors.database_name = 'アンダースコアで始まる・終わることはできません'
    } else if (/^\d/.test(formData.database_name)) {
      newErrors.database_name = '数字で始めることはできません'
    } else if (MYSQL_RESERVED_WORDS.includes(formData.database_name.toLowerCase())) {
      newErrors.database_name = 'このデータベース名は予約語のため使用できません'
    } else if (WP_RESERVED_PREFIXES.some(prefix => formData.database_name.startsWith(prefix))) {
      newErrors.database_name = 'wp_ で始まるデータベース名は推奨されません'
    }

    // PHP version validation
    if (!formData.php_version) {
      newErrors.php_version = 'PHPバージョンは必須です'
    }

    // Admin user validation
    if (!formData.admin_user) {
      newErrors.admin_user = '管理者ユーザー名は必須です'
    } else if (formData.admin_user.length < 3) {
      newErrors.admin_user = 'ユーザー名は3文字以上である必要があります'
    } else if (formData.admin_user.length > 60) {
      newErrors.admin_user = 'ユーザー名は60文字以内で入力してください'
    } else if (!/^[a-zA-Z0-9_]+$/.test(formData.admin_user)) {
      newErrors.admin_user = '英数字とアンダースコアのみ使用可能です'
    }

    // Admin password validation
    if (!formData.admin_password) {
      newErrors.admin_password = '管理者パスワードは必須です'
    } else if (formData.admin_password.length < 8) {
      newErrors.admin_password = 'パスワードは8文字以上である必要があります'
    } else if (formData.admin_password.length > 100) {
      newErrors.admin_password = 'パスワードは100文字以内で入力してください'
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.admin_password)) {
      newErrors.admin_password = '大文字、小文字、数字をそれぞれ1文字以上含める必要があります'
    }

    // Admin email validation
    if (!formData.admin_email) {
      newErrors.admin_email = '管理者メールアドレスは必須です'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.admin_email)) {
      newErrors.admin_email = '有効なメールアドレスを入力してください'
    } else if (formData.admin_email.length > 100) {
      newErrors.admin_email = 'メールアドレスは100文字以内で入力してください'
    }

    // Site title validation (optional)
    if (formData.title && formData.title.length > 255) {
      newErrors.title = 'サイトタイトルは255文字以内で入力してください'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (validateForm()) {
      // Set domain from subdomain + base domain
      const submitData = { ...formData, domain: fullDomain }
      if (!submitData.title) {
        delete submitData.title
      }
      createMutation.mutate(submitData)
    }
  }

  const handleClose = () => {
    // Clear any running step interval
    if ((createMutation as any).stepInterval) {
      clearInterval((createMutation as any).stepInterval)
    }
    setFormData({
      site_name: '',
      domain: '',
      database_name: '',
      php_version: '8.2',
      admin_user: 'admin',
      admin_password: '',
      admin_email: '',
      title: '',
    })
    setBaseDomain('kuma8088.com')
    setSubdomain('')
    setErrors({})
    setSuccess(false)
    setCurrentStep(0)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
            新規WordPressサイト作成
          </h3>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            disabled={createMutation.isPending}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Success message */}
          {success && (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                サイトが正常に作成されました
              </AlertDescription>
            </Alert>
          )}

          {/* Error message */}
          {errors.submit && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errors.submit}</AlertDescription>
            </Alert>
          )}

          {/* Progress display */}
          {createMutation.isPending && (
            <div className="space-y-3 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  サイトを作成中...
                </span>
              </div>
              <div className="space-y-2">
                {creationSteps.map((step, index) => (
                  <div
                    key={index}
                    className={`flex items-center gap-2 text-sm ${
                      index === currentStep
                        ? 'text-blue-700 dark:text-blue-300 font-medium'
                        : index < currentStep
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-gray-400 dark:text-gray-600'
                    }`}
                  >
                    {index < currentStep ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : index === currentStep ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-current" />
                    )}
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Site name */}
          <div className="space-y-2">
            <Label htmlFor="site_name">
              サイト名 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="site_name"
              value={formData.site_name}
              onChange={(e) =>
                setFormData({ ...formData, site_name: e.target.value })
              }
              placeholder="my-wordpress-site"
              disabled={createMutation.isPending}
              className={errors.site_name ? 'border-red-500' : ''}
            />
            {errors.site_name && (
              <p className="text-sm text-red-600">{errors.site_name}</p>
            )}
            <p className="text-sm text-gray-500">
              英数字、ハイフン、アンダースコアのみ使用可能
            </p>
          </div>

          {/* Base domain selection */}
          <div className="space-y-2">
            <Label htmlFor="base_domain">
              ベースドメイン <span className="text-red-500">*</span>
            </Label>
            <Select
              value={baseDomain}
              onValueChange={setBaseDomain}
              disabled={createMutation.isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BASE_DOMAINS.map((domain) => (
                  <SelectItem key={domain.value} value={domain.value}>
                    {domain.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Subdomain (optional) */}
          <div className="space-y-2">
            <Label htmlFor="subdomain">
              サブドメイン（オプション）
            </Label>
            <Input
              id="subdomain"
              value={subdomain}
              onChange={(e) => setSubdomain(e.target.value)}
              placeholder="例: blog, test, demo"
              disabled={createMutation.isPending}
              className={errors.subdomain ? 'border-red-500' : ''}
            />
            {errors.subdomain && (
              <p className="text-sm text-red-600">{errors.subdomain}</p>
            )}
            <p className="text-sm text-gray-500">
              空欄の場合はベースドメインのみ使用されます
            </p>
          </div>

          {/* Domain preview */}
          <div className="space-y-2">
            <Label>作成されるドメイン</Label>
            <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border rounded-md">
              <code className="text-sm font-mono text-blue-600 dark:text-blue-400">
                {fullDomain}
              </code>
            </div>
          </div>

          {/* Database name */}
          <div className="space-y-2">
            <Label htmlFor="database_name">
              データベース名 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="database_name"
              value={formData.database_name}
              onChange={(e) =>
                setFormData({ ...formData, database_name: e.target.value })
              }
              placeholder="wp_database"
              disabled={createMutation.isPending}
              className={errors.database_name ? 'border-red-500' : ''}
            />
            {errors.database_name && (
              <p className="text-sm text-red-600">{errors.database_name}</p>
            )}
            <p className="text-sm text-gray-500">
              英数字とアンダースコアのみ使用可能
            </p>
          </div>

          {/* PHP version */}
          <div className="space-y-2">
            <Label htmlFor="php_version">
              PHPバージョン <span className="text-red-500">*</span>
            </Label>
            <Select
              value={formData.php_version}
              onValueChange={(value) =>
                setFormData({ ...formData, php_version: value })
              }
              disabled={createMutation.isPending}
            >
              <SelectTrigger className={errors.php_version ? 'border-red-500' : ''}>
                <SelectValue placeholder="PHPバージョンを選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="8.3">PHP 8.3</SelectItem>
                <SelectItem value="8.2">PHP 8.2 (推奨)</SelectItem>
                <SelectItem value="8.1">PHP 8.1</SelectItem>
                <SelectItem value="8.0">PHP 8.0</SelectItem>
                <SelectItem value="7.4">PHP 7.4</SelectItem>
              </SelectContent>
            </Select>
            {errors.php_version && (
              <p className="text-sm text-red-600">{errors.php_version}</p>
            )}
          </div>

          {/* Admin user */}
          <div className="space-y-2">
            <Label htmlFor="admin_user">
              WordPress管理者ユーザー名 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="admin_user"
              value={formData.admin_user}
              onChange={(e) =>
                setFormData({ ...formData, admin_user: e.target.value })
              }
              placeholder="admin"
              disabled={createMutation.isPending}
              className={errors.admin_user ? 'border-red-500' : ''}
            />
            {errors.admin_user && (
              <p className="text-sm text-red-600">{errors.admin_user}</p>
            )}
          </div>

          {/* Admin password */}
          <div className="space-y-2">
            <Label htmlFor="admin_password">
              WordPress管理者パスワード <span className="text-red-500">*</span>
            </Label>
            <Input
              id="admin_password"
              type="password"
              value={formData.admin_password}
              onChange={(e) =>
                setFormData({ ...formData, admin_password: e.target.value })
              }
              placeholder="8文字以上"
              disabled={createMutation.isPending}
              className={errors.admin_password ? 'border-red-500' : ''}
            />
            {errors.admin_password && (
              <p className="text-sm text-red-600">{errors.admin_password}</p>
            )}
          </div>

          {/* Admin email */}
          <div className="space-y-2">
            <Label htmlFor="admin_email">
              WordPress管理者メールアドレス <span className="text-red-500">*</span>
            </Label>
            <Input
              id="admin_email"
              type="email"
              value={formData.admin_email}
              onChange={(e) =>
                setFormData({ ...formData, admin_email: e.target.value })
              }
              placeholder="admin@example.com"
              disabled={createMutation.isPending}
              className={errors.admin_email ? 'border-red-500' : ''}
            />
            {errors.admin_email && (
              <p className="text-sm text-red-600">{errors.admin_email}</p>
            )}
          </div>

          {/* Site title (optional) */}
          <div className="space-y-2">
            <Label htmlFor="title">サイトタイトル（オプション）</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              placeholder="サイトのタイトル（空欄の場合はドメイン名）"
              disabled={createMutation.isPending}
            />
            <p className="text-sm text-gray-500">
              空欄の場合はドメイン名が使用されます
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={createMutation.isPending}
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || success}
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  作成中...
                </>
              ) : success ? (
                '作成完了'
              ) : (
                'サイトを作成'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
