import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react'
import { managedSitesAPI } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

// MySQL reserved words (common ones)
const MYSQL_RESERVED_WORDS = [
  'mysql', 'information_schema', 'performance_schema', 'sys',
  'admin', 'root', 'test', 'temp', 'tmp',
  'select', 'insert', 'update', 'delete', 'drop', 'create',
  'table', 'database', 'index', 'view', 'user',
]

// WordPress core prefixes
const WP_RESERVED_PREFIXES = ['wp_']

// Available base domains
const BASE_DOMAINS = [
  'kuma8088.com',
  'fx-trader-life.com',
  'webmakeprofit.org',
  'webmakesprofit.com',
  'toyota-phv.jp',
]

// PHP versions
const PHP_VERSIONS = [
  { value: '8.2', label: 'PHP 8.2 (推奨)' },
  { value: '8.1', label: 'PHP 8.1' },
  { value: '8.0', label: 'PHP 8.0' },
]

// Creation steps for progress display
const creationSteps = [
  'データベースを作成中...',
  'WordPressをインストール中...',
  'WP Mail SMTPを設定中...',
  'Nginx設定を生成中...',
  'Nginxをリロード中...',
  'Cloudflare Tunnelを設定中...',
]

export default function CreateManagedSitePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [currentStep, setCurrentStep] = useState(0)
  const [formData, setFormData] = useState({
    site_name: '',
    base_domain: 'kuma8088.com',
    subdomain: '',
    database_name: '',
    php_version: '8.2',
    admin_user: 'admin',
    admin_password: '',
    admin_email: '',
    title: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Computed domain
  const fullDomain = formData.subdomain
    ? `${formData.subdomain}.${formData.base_domain}`
    : formData.base_domain

  // Mutation: Create site
  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => {
      const domain = data.subdomain
        ? `${data.subdomain}.${data.base_domain}`
        : data.base_domain

      return managedSitesAPI.createSite({
        site_name: data.site_name,
        domain,
        database_name: data.database_name,
        php_version: data.php_version,
        admin_user: data.admin_user,
        admin_password: data.admin_password,
        admin_email: data.admin_email,
        title: data.title || domain,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['managed-sites'] })
      // Navigate back to WordPress management page
      navigate('/wordpress')
    },
  })

  // Progress step animation
  useEffect(() => {
    if (createMutation.isPending) {
      const interval = setInterval(() => {
        setCurrentStep((prev) => {
          if (prev < creationSteps.length - 1) {
            return prev + 1
          }
          return prev
        })
      }, 2000) // Progress every 2 seconds

      return () => clearInterval(interval)
    } else {
      setCurrentStep(0)
    }
  }, [createMutation.isPending])

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    // Site name validation (required)
    if (!formData.site_name) {
      newErrors.site_name = 'サイト名は必須です'
    } else if (formData.site_name.length > 100) {
      newErrors.site_name = 'サイト名は100文字以内で入力してください'
    } else if (!/^[a-zA-Z0-9_-]+$/.test(formData.site_name)) {
      newErrors.site_name = '英数字、ハイフン、アンダースコアのみ使用可能です'
    } else if (/^-|^_|-$|_$/.test(formData.site_name)) {
      newErrors.site_name = 'ハイフンまたはアンダースコアで始まる・終わることはできません'
    } else if (/--/.test(formData.site_name)) {
      newErrors.site_name = 'ハイフンを連続して使用することはできません'
    } else if (/^\d+$/.test(formData.site_name)) {
      newErrors.site_name = '数字のみのサイト名は使用できません'
    }

    // Subdomain validation (optional)
    if (formData.subdomain) {
      if (formData.subdomain.length > 63) {
        newErrors.subdomain = 'サブドメインは63文字以内で入力してください'
      } else if (!/^[a-zA-Z0-9-]+$/.test(formData.subdomain)) {
        newErrors.subdomain = '英数字とハイフンのみ使用可能です'
      } else if (/^-|-$/.test(formData.subdomain)) {
        newErrors.subdomain = 'ハイフンで始まる・終わることはできません'
      } else if (/--/.test(formData.subdomain)) {
        newErrors.subdomain = 'ハイフンを連続して使用することはできません'
      } else if (/^\d+$/.test(formData.subdomain)) {
        newErrors.subdomain = '数字のみのサブドメインは使用できません'
      }
    }

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

    // Admin password validation (required)
    if (!formData.admin_password) {
      newErrors.admin_password = '管理者パスワードは必須です'
    } else if (formData.admin_password.length < 8) {
      newErrors.admin_password = 'パスワードは8文字以上で入力してください'
    } else if (!/[A-Z]/.test(formData.admin_password)) {
      newErrors.admin_password = 'パスワードには大文字を含めてください'
    } else if (!/[a-z]/.test(formData.admin_password)) {
      newErrors.admin_password = 'パスワードには小文字を含めてください'
    } else if (!/[0-9]/.test(formData.admin_password)) {
      newErrors.admin_password = 'パスワードには数字を含めてください'
    }

    // Admin email validation (required)
    if (!formData.admin_email) {
      newErrors.admin_email = '管理者メールアドレスは必須です'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.admin_email)) {
      newErrors.admin_email = '有効なメールアドレスを入力してください'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (validateForm()) {
      createMutation.mutate(formData)
    }
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/wordpress')}
          disabled={createMutation.isPending}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          戻る
        </Button>
        <div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
            新規WordPressサイト作成
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            必要な情報を入力してWordPressサイトを作成します
          </p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Form */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>サイト情報</CardTitle>
              <CardDescription>
                サイトの基本情報とWordPress管理者設定を入力してください
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Site name */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    サイト名 *
                  </label>
                  <input
                    type="text"
                    value={formData.site_name}
                    onChange={(e) => setFormData({ ...formData, site_name: e.target.value })}
                    placeholder="my-wordpress-site"
                    disabled={createMutation.isPending}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  {errors.site_name && (
                    <p className="text-sm text-red-600 mt-1">{errors.site_name}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    英数字、ハイフン、アンダースコアのみ使用可能
                  </p>
                </div>

                {/* Base domain */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    ベースドメイン *
                  </label>
                  <select
                    value={formData.base_domain}
                    onChange={(e) => setFormData({ ...formData, base_domain: e.target.value })}
                    disabled={createMutation.isPending}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {BASE_DOMAINS.map((domain) => (
                      <option key={domain} value={domain}>
                        {domain}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Subdomain */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    サブドメイン（オプション）
                  </label>
                  <input
                    type="text"
                    value={formData.subdomain}
                    onChange={(e) => setFormData({ ...formData, subdomain: e.target.value })}
                    placeholder="例: blog, test, demo"
                    disabled={createMutation.isPending}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  {errors.subdomain && (
                    <p className="text-sm text-red-600 mt-1">{errors.subdomain}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    空欄の場合はベースドメインのみ使用されます
                  </p>
                </div>

                {/* Domain preview */}
                <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                    作成されるドメイン
                  </p>
                  <code className="text-sm text-blue-700 dark:text-blue-300">
                    {fullDomain}
                  </code>
                </div>

                {/* Database name */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    データベース名 *
                  </label>
                  <input
                    type="text"
                    value={formData.database_name}
                    onChange={(e) => setFormData({ ...formData, database_name: e.target.value })}
                    placeholder="wp_database"
                    disabled={createMutation.isPending}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  {errors.database_name && (
                    <p className="text-sm text-red-600 mt-1">{errors.database_name}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    英数字とアンダースコアのみ使用可能
                  </p>
                </div>

                {/* PHP version */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    PHPバージョン *
                  </label>
                  <select
                    value={formData.php_version}
                    onChange={(e) => setFormData({ ...formData, php_version: e.target.value })}
                    disabled={createMutation.isPending}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {PHP_VERSIONS.map((php) => (
                      <option key={php.value} value={php.value}>
                        {php.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Admin user */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    WordPress管理者ユーザー名 *
                  </label>
                  <input
                    type="text"
                    value={formData.admin_user}
                    onChange={(e) => setFormData({ ...formData, admin_user: e.target.value })}
                    placeholder="admin"
                    disabled={createMutation.isPending}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>

                {/* Admin password */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    WordPress管理者パスワード *
                  </label>
                  <input
                    type="password"
                    value={formData.admin_password}
                    onChange={(e) => setFormData({ ...formData, admin_password: e.target.value })}
                    placeholder="8文字以上"
                    disabled={createMutation.isPending}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  {errors.admin_password && (
                    <p className="text-sm text-red-600 mt-1">{errors.admin_password}</p>
                  )}
                </div>

                {/* Admin email */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    WordPress管理者メールアドレス *
                  </label>
                  <input
                    type="email"
                    value={formData.admin_email}
                    onChange={(e) => setFormData({ ...formData, admin_email: e.target.value })}
                    placeholder="admin@example.com"
                    disabled={createMutation.isPending}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  {errors.admin_email && (
                    <p className="text-sm text-red-600 mt-1">{errors.admin_email}</p>
                  )}
                </div>

                {/* Site title */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    サイトタイトル（オプション）
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="サイトのタイトル（空欄の場合はドメイン名）"
                    disabled={createMutation.isPending}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    空欄の場合はドメイン名が使用されます
                  </p>
                </div>

                {/* Error display */}
                {createMutation.isError && (
                  <div className="p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-800 dark:text-red-200">
                      {createMutation.error instanceof Error
                        ? createMutation.error.message
                        : 'サイトの作成に失敗しました'}
                    </p>
                  </div>
                )}

                {/* Submit buttons */}
                <div className="flex gap-4 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate('/wordpress')}
                    disabled={createMutation.isPending}
                    className="flex-1"
                  >
                    キャンセル
                  </Button>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending}
                    className="flex-1"
                  >
                    {createMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        作成中...
                      </>
                    ) : (
                      'サイトを作成'
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Progress sidebar */}
        <div className="lg:col-span-1">
          {createMutation.isPending && (
            <Card>
              <CardHeader>
                <CardTitle>作成進捗</CardTitle>
                <CardDescription>サイト作成中...</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
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
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
