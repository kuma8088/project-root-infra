/**
 * DomainForm Component
 *
 * Form for creating/editing mail domains
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { mailDomainAPI } from '@/lib/api/mailserver'
import type { MailDomain, MailDomainCreate, MailDomainUpdate } from '@/types/mailserver'

interface DomainFormProps {
  domain?: MailDomain | null
  onSuccess?: (domain: MailDomain) => void
  onCancel?: () => void
}

export function DomainForm({ domain, onSuccess, onCancel }: DomainFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    default_quota: '1024',
    enabled: true,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (domain) {
      setFormData({
        name: domain.name,
        description: domain.description || '',
        default_quota: domain.default_quota.toString(),
        enabled: domain.enabled,
      })
    }
  }, [domain])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      let result: MailDomain
      if (domain) {
        const data: MailDomainUpdate = {
          description: formData.description || null,
          default_quota: parseInt(formData.default_quota),
          enabled: formData.enabled,
        }
        result = await mailDomainAPI.update(domain.id, data)
      } else {
        const data: MailDomainCreate = {
          name: formData.name,
          description: formData.description || null,
          default_quota: parseInt(formData.default_quota),
          enabled: formData.enabled,
        }
        result = await mailDomainAPI.create(data)
      }

      if (onSuccess) onSuccess(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed')
      console.error('Domain form submission failed:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{domain ? 'ドメイン編集' : 'ドメイン新規作成'}</CardTitle>
        <CardDescription>
          メールドメインの{domain ? '情報を編集' : '新規作成'}します
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-destructive/10 text-destructive px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">
              ドメイン名 <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="example.com"
              required
              disabled={!!domain}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {domain && (
              <p className="text-xs text-muted-foreground mt-1">
                ドメイン名は編集できません
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              説明（オプション）
            </label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="ドメインの説明"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              デフォルト容量（MB） <span className="text-destructive">*</span>
            </label>
            <input
              type="number"
              value={formData.default_quota}
              onChange={(e) =>
                setFormData({ ...formData, default_quota: e.target.value })
              }
              placeholder="1024"
              required
              min="100"
              max="10000"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={formData.enabled}
                onChange={(e) =>
                  setFormData({ ...formData, enabled: e.target.checked })
                }
                className="rounded border-gray-300"
              />
              <span className="text-sm font-medium">有効</span>
            </label>
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="submit" disabled={loading}>
              {loading ? '処理中...' : domain ? '更新' : '作成'}
            </Button>
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                キャンセル
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
