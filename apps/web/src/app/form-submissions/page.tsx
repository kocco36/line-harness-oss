'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchApi } from '@/lib/api'
import Header from '@/components/layout/header'
import { useAccount } from '@/contexts/account-context'

interface FormField {
  name: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'radio' | 'checkbox'
  required: boolean
  options?: string // カンマ区切り（select/radio/checkbox用）
}

interface Form {
  id: string
  name: string
  description?: string | null
  fields: FormField[]
  isActive: boolean
  submitCount?: number
}

interface Submission {
  id: string
  formId: string
  friendId: string
  friendName?: string
  data: Record<string, unknown>
  createdAt: string
}

const FIELD_TYPES = [
  { value: 'text', label: 'テキスト（1行）' },
  { value: 'textarea', label: 'テキスト（複数行）' },
  { value: 'select', label: 'セレクトボックス' },
  { value: 'radio', label: 'ラジオボタン' },
  { value: 'checkbox', label: 'チェックボックス' },
]

const PAGE_SIZE = 20

const EMPTY_FIELD: FormField = { name: '', label: '', type: 'text', required: false, options: '' }

export default function FormSubmissionsPage() {
  const { selectedAccountId } = useAccount()
  const [forms, setForms] = useState<Form[]>([])
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [subLoading, setSubLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [fieldLabels, setFieldLabels] = useState<Record<string, string>>({})

  // フォーム作成モーダル
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [createFields, setCreateFields] = useState<FormField[]>([{ ...EMPTY_FIELD }])
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const loadForms = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchApi<{ success: boolean; data: Form[] }>('/api/forms')
      if (res.success) setForms(res.data)
    } catch { /* silent */ }
    setLoading(false)
  }, [])

  useEffect(() => { loadForms() }, [loadForms])

  const loadSubmissions = useCallback(async (formId: string) => {
    setSubLoading(true)
    setPage(1)
    try {
      const formRes = await fetchApi<{ success: boolean; data: { fields: FormField[] } }>(`/api/forms/${formId}`)
      const res = await fetchApi<{ success: boolean; data: (Submission & { friendName?: string })[] }>(`/api/forms/${formId}/submissions`)

      setSelectedFormId((current) => {
        if (current !== formId) return current
        if (formRes.success && formRes.data.fields) {
          const labels: Record<string, string> = {}
          const fields = typeof formRes.data.fields === 'string' ? JSON.parse(formRes.data.fields) : formRes.data.fields
          for (const f of fields) labels[f.name] = f.label
          setFieldLabels(labels)
        }
        if (res.success) {
          setSubmissions(res.data.map((s) => ({
            ...s,
            data: typeof s.data === 'string' ? JSON.parse(s.data) : s.data,
            friendName: s.friendName || '不明',
          })))
        }
        return current
      })
    } catch { /* silent */ }
    setSelectedFormId((current) => {
      if (current === formId) setSubLoading(false)
      return current
    })
  }, [selectedAccountId])

  const handleSelectForm = (formId: string) => {
    setSelectedFormId(formId)
    loadSubmissions(formId)
  }

  const handleDeleteForm = async (id: string) => {
    if (!confirm('このフォームを削除しますか？回答データも削除されます。')) return
    try {
      await fetchApi(`/api/forms/${id}`, { method: 'DELETE' })
      if (selectedFormId === id) {
        setSelectedFormId(null)
        setSubmissions([])
      }
      loadForms()
    } catch { /* silent */ }
  }

  // フィールド編集ヘルパー
  const updateField = (idx: number, patch: Partial<FormField>) => {
    setCreateFields((prev) => prev.map((f, i) => i === idx ? { ...f, ...patch } : f))
  }
  const addField = () => setCreateFields((prev) => [...prev, { ...EMPTY_FIELD }])
  const removeField = (idx: number) => setCreateFields((prev) => prev.filter((_, i) => i !== idx))

  const openCreate = () => {
    setCreateName('')
    setCreateDesc('')
    setCreateFields([{ ...EMPTY_FIELD }])
    setCreateError(null)
    setShowCreate(true)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createName.trim()) return

    // バリデーション
    for (const f of createFields) {
      if (!f.name.trim() || !f.label.trim()) {
        setCreateError('すべてのフィールドに識別子と表示名を入力してください。')
        return
      }
    }

    setCreating(true)
    setCreateError(null)
    try {
      const fields = createFields.map((f) => ({
        name: f.name.trim(),
        label: f.label.trim(),
        type: f.type,
        required: f.required,
        ...(f.options?.trim() && ['select', 'radio', 'checkbox'].includes(f.type)
          ? { options: f.options.split(',').map((o) => o.trim()).filter(Boolean) }
          : {}),
      }))
      await fetchApi('/api/forms', {
        method: 'POST',
        body: JSON.stringify({
          name: createName.trim(),
          description: createDesc.trim() || null,
          fields,
        }),
      })
      setShowCreate(false)
      loadForms()
    } catch {
      setCreateError('作成に失敗しました。')
    }
    setCreating(false)
  }

  // Pagination
  const totalPages = Math.ceil(submissions.length / PAGE_SIZE)
  const paged = submissions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const fieldKeys = submissions.length > 0
    ? [...new Set(submissions.flatMap(s => Object.keys(s.data)))]
    : []

  return (
    <div>
      <Header
        title="フォーム回答"
        description="フォーム送信データの一覧"
        action={
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <span className="text-base leading-none">+</span> フォーム作成
          </button>
        }
      />

      {/* Form selector */}
      <div className="mb-6">
        <div className="flex flex-wrap gap-2">
          {loading ? (
            <div className="text-sm text-gray-400">読み込み中...</div>
          ) : forms.length === 0 ? (
            <div className="text-sm text-gray-400">フォームがまだ作成されていません</div>
          ) : (
            forms.map((form) => (
              <div key={form.id} className="flex items-center gap-1">
                <button
                  onClick={() => handleSelectForm(form.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedFormId === form.id
                      ? 'text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  style={selectedFormId === form.id ? { backgroundColor: '#06C755' } : {}}
                >
                  {form.name}
                  {form.submitCount !== undefined && (
                    <span className="ml-1.5 text-xs opacity-70">({form.submitCount})</span>
                  )}
                </button>
                <button
                  onClick={() => handleDeleteForm(form.id)}
                  className="text-gray-300 hover:text-red-500 transition-colors text-xs px-1"
                  title="削除"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Stats */}
      {selectedFormId && !subLoading && submissions.length > 0 && (
        <div className="mb-4 text-sm text-gray-500">
          全 <span className="font-bold text-gray-900">{submissions.length}</span> 件の回答
        </div>
      )}

      {/* Table */}
      {selectedFormId && (
        subLoading ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400">読み込み中...</div>
        ) : submissions.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400">回答がありません</div>
        ) : (
          <>
            <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">名前</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">日時</th>
                    {fieldKeys.map((key) => (
                      <th key={key} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">
                        {fieldLabels[key] || key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paged.map((sub) => (
                    <tr key={sub.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">{sub.friendName}</td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {new Date(sub.createdAt).toLocaleString('ja-JP', {
                          month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      {fieldKeys.map((key) => (
                        <td key={key} className="px-4 py-3 text-sm text-gray-700 max-w-[200px] truncate">
                          {Array.isArray(sub.data[key])
                            ? (sub.data[key] as string[]).join(', ')
                            : (sub.data[key] !== null && sub.data[key] !== undefined && sub.data[key] !== '') ? String(sub.data[key]) : '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-xs text-gray-400">
                  {(page - 1) * PAGE_SIZE + 1}〜{Math.min(page * PAGE_SIZE, submissions.length)} 件 / 全{submissions.length}件
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50"
                  >
                    前へ
                  </button>
                  <span className="px-3 py-1.5 text-sm text-gray-500">{page} / {totalPages}</span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50"
                  >
                    次へ
                  </button>
                </div>
              </div>
            )}
          </>
        )
      )}

      {/* フォーム作成モーダル */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 mx-4 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-4">フォームを作成</h2>
            <form onSubmit={handleCreate} className="space-y-5">
              {/* 基本情報 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">フォーム名 <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="例: 初回アンケート"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">説明（任意）</label>
                  <input
                    type="text"
                    value={createDesc}
                    onChange={(e) => setCreateDesc(e.target.value)}
                    placeholder="フォームの用途・メモ"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* フィールド一覧 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">フィールド</label>
                  <button
                    type="button"
                    onClick={addField}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    + フィールド追加
                  </button>
                </div>
                <div className="space-y-3">
                  {createFields.map((field, idx) => (
                    <div key={idx} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <div className="flex items-start justify-between mb-3">
                        <span className="text-xs font-semibold text-gray-400 uppercase">フィールド {idx + 1}</span>
                        {createFields.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeField(idx)}
                            className="text-gray-300 hover:text-red-500 text-xs"
                          >
                            削除
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">表示名 <span className="text-red-500">*</span></label>
                          <input
                            type="text"
                            value={field.label}
                            onChange={(e) => updateField(idx, { label: e.target.value })}
                            placeholder="例: お名前"
                            className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">識別子 <span className="text-red-500">*</span></label>
                          <input
                            type="text"
                            value={field.name}
                            onChange={(e) => updateField(idx, { name: e.target.value.replace(/\s/g, '_') })}
                            placeholder="例: full_name"
                            className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">タイプ</label>
                          <select
                            value={field.type}
                            onChange={(e) => updateField(idx, { type: e.target.value as FormField['type'] })}
                            className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            {FIELD_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-end">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={field.required}
                              onChange={(e) => updateField(idx, { required: e.target.checked })}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">必須</span>
                          </label>
                        </div>
                      </div>
                      {['select', 'radio', 'checkbox'].includes(field.type) && (
                        <div className="mt-3">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            選択肢 <span className="text-gray-400 font-normal">（カンマ区切りで入力）</span>
                          </label>
                          <input
                            type="text"
                            value={field.options || ''}
                            onChange={(e) => updateField(idx, { options: e.target.value })}
                            placeholder="例: 選択肢A, 選択肢B, 選択肢C"
                            className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {createError && <p className="text-sm text-red-600">{createError}</p>}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {creating ? '作成中...' : '作成'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
