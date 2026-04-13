'use client'

import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/layout/header'
import { fetchApi, api } from '@/lib/api'
import { useAccount } from '@/contexts/account-context'
import type { Tag, Scenario } from '@line-crm/shared'

const WORKER_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'

interface EntryRoute {
  id: string
  refCode: string
  name: string
  tagId: string | null
  scenarioId: string | null
  redirectUrl: string | null
  isActive: boolean
  createdAt: string
  // 分析データ（マージ）
  friendCount: number
  clickCount: number
  latestAt: string | null
}

interface RefFriend {
  id: string
  displayName: string
  trackedAt: string | null
}

export default function AffiliatesPage() {
  const { selectedAccountId } = useAccount()
  const [routes, setRoutes] = useState<EntryRoute[]>([])
  const [loading, setLoading] = useState(true)
  const [tags, setTags] = useState<Tag[]>([])
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [selectedRef, setSelectedRef] = useState<string | null>(null)
  const [detail, setDetail] = useState<RefFriend[] | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  // モーダル状態
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editTarget, setEditTarget] = useState<EntryRoute | null>(null)
  const [formName, setFormName] = useState('')
  const [formRefCode, setFormRefCode] = useState('')
  const [formTagId, setFormTagId] = useState('')
  const [formScenarioId, setFormScenarioId] = useState('')
  const [formRedirectUrl, setFormRedirectUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [routesRes, analyticsRes] = await Promise.allSettled([
        fetchApi<{ success: boolean; data: Omit<EntryRoute, 'friendCount' | 'clickCount' | 'latestAt'>[] }>('/api/entry-routes'),
        fetchApi<{ success: boolean; data: { routes: Array<{ refCode: string; friendCount: number; clickCount: number; latestAt: string | null }> } }>(
          `/api/analytics/ref-summary${selectedAccountId ? `?lineAccountId=${selectedAccountId}` : ''}`
        ),
      ])

      let routeList: Omit<EntryRoute, 'friendCount' | 'clickCount' | 'latestAt'>[] = []
      if (routesRes.status === 'fulfilled' && routesRes.value.success) {
        routeList = routesRes.value.data
      }

      const analyticsMap = new Map<string, { friendCount: number; clickCount: number; latestAt: string | null }>()
      if (analyticsRes.status === 'fulfilled' && analyticsRes.value.success) {
        for (const r of analyticsRes.value.data.routes) {
          analyticsMap.set(r.refCode, { friendCount: r.friendCount, clickCount: r.clickCount, latestAt: r.latestAt })
        }
      }

      setRoutes(routeList.map((r) => ({
        ...r,
        friendCount: analyticsMap.get(r.refCode)?.friendCount ?? 0,
        clickCount: analyticsMap.get(r.refCode)?.clickCount ?? 0,
        latestAt: analyticsMap.get(r.refCode)?.latestAt ?? null,
      })))
    } catch { /* silent */ }
    setLoading(false)
  }, [selectedAccountId])

  const loadMeta = useCallback(async () => {
    const [tagsRes, scenariosRes] = await Promise.allSettled([
      api.tags.list(),
      api.scenarios.list(),
    ])
    if (tagsRes.status === 'fulfilled' && tagsRes.value.success) setTags(tagsRes.value.data)
    if (scenariosRes.status === 'fulfilled' && scenariosRes.value.success) setScenarios(scenariosRes.value.data)
  }, [])

  useEffect(() => { loadAll(); loadMeta() }, [loadAll, loadMeta])

  const handleRowClick = async (refCode: string) => {
    if (selectedRef === refCode) { setSelectedRef(null); setDetail(null); return }
    setSelectedRef(refCode)
    setDetailLoading(true)
    try {
      const query = selectedAccountId ? `?lineAccountId=${selectedAccountId}` : ''
      const res = await fetchApi<{ success: boolean; data: { friends: RefFriend[] } }>(`/api/analytics/ref/${encodeURIComponent(refCode)}${query}`)
      setDetail(res.success ? res.data.friends : [])
    } catch { setDetail([]) }
    setDetailLoading(false)
  }

  const handleCopy = async (refCode: string) => {
    const url = `${WORKER_BASE}/auth/line?ref=${encodeURIComponent(refCode)}`
    await navigator.clipboard.writeText(url)
    setCopiedCode(refCode)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  const openCreate = () => {
    setModalMode('create')
    setEditTarget(null)
    setFormName(''); setFormRefCode(''); setFormTagId(''); setFormScenarioId(''); setFormRedirectUrl('')
    setFormError(null)
  }

  const openEdit = (route: EntryRoute) => {
    setModalMode('edit')
    setEditTarget(route)
    setFormName(route.name)
    setFormRefCode(route.refCode)
    setFormTagId(route.tagId ?? '')
    setFormScenarioId(route.scenarioId ?? '')
    setFormRedirectUrl(route.redirectUrl ?? '')
    setFormError(null)
  }

  const closeModal = () => { setModalMode(null); setEditTarget(null) }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setFormError(null)
    try {
      if (modalMode === 'create') {
        await fetchApi('/api/entry-routes', {
          method: 'POST',
          body: JSON.stringify({
            name: formName.trim(),
            refCode: formRefCode.trim(),
            tagId: formTagId || null,
            scenarioId: formScenarioId || null,
            redirectUrl: formRedirectUrl.trim() || null,
          }),
        })
      } else if (modalMode === 'edit' && editTarget) {
        await fetchApi(`/api/entry-routes/${editTarget.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: formName.trim(),
            tagId: formTagId || null,
            scenarioId: formScenarioId || null,
            redirectUrl: formRedirectUrl.trim() || null,
          }),
        })
      }
      closeModal()
      loadAll()
    } catch {
      setFormError(modalMode === 'create'
        ? '作成に失敗しました。ref コードが重複している可能性があります。'
        : '更新に失敗しました。')
    }
    setSubmitting(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('この流入経路を削除しますか？')) return
    try {
      await fetchApi(`/api/entry-routes/${id}`, { method: 'DELETE' })
      if (selectedRef === routes.find((r) => r.id === id)?.refCode) {
        setSelectedRef(null); setDetail(null)
      }
      loadAll()
    } catch { /* silent */ }
  }

  const formatDate = (iso: string | null) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
  }

  const getTagName = (id: string | null) => id ? (tags.find((t) => t.id === id)?.name ?? id) : null
  const getScenarioName = (id: string | null) => id ? (scenarios.find((s) => s.id === id)?.name ?? id) : null

  const totalFriends = routes.reduce((s, r) => s + r.friendCount, 0)
  const totalClicks = routes.reduce((s, r) => s + r.clickCount, 0)

  return (
    <div>
      <Header
        title="流入経路管理"
        description="ref コード別の友だち獲得・シナリオ・タグ設定"
        action={
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
            style={{ backgroundColor: '#06C755' }}
          >
            <span className="text-base leading-none">+</span> 新規追加
          </button>
        }
      />

      {/* Summary cards */}
      {!loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-5 border border-gray-100">
            <p className="text-sm text-gray-500">経路数</p>
            <p className="text-3xl font-bold text-blue-600 mt-1">{routes.length}</p>
          </div>
          <div className="bg-white rounded-xl p-5 border border-gray-100">
            <p className="text-sm text-gray-500">総クリック数</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{totalClicks}</p>
          </div>
          <div className="bg-white rounded-xl p-5 border border-gray-100">
            <p className="text-sm text-gray-500">ref 経由友だち</p>
            <p className="text-3xl font-bold text-green-600 mt-1">{totalFriends}</p>
          </div>
          <div className="bg-white rounded-xl p-5 border border-gray-100">
            <p className="text-sm text-gray-500">シナリオ設定済み</p>
            <p className="text-3xl font-bold text-purple-600 mt-1">{routes.filter((r) => r.scenarioId).length}</p>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400">読み込み中...</div>
      ) : routes.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400">
          流入経路がまだ登録されていません。「新規追加」から作成してください。
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">経路名</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ref コード</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">タグ</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">シナリオ</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">友だち</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">クリック</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">URL</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {routes.map((route) => {
                const authUrl = `${WORKER_BASE}/auth/line?ref=${encodeURIComponent(route.refCode)}`
                const isExpanded = selectedRef === route.refCode
                const tagName = getTagName(route.tagId)
                const scenarioName = getScenarioName(route.scenarioId)
                return (
                  <>
                    <tr
                      key={route.id}
                      className={`cursor-pointer ${isExpanded ? 'bg-green-50' : 'hover:bg-gray-50'}`}
                      onClick={() => handleRowClick(route.refCode)}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{route.name}</td>
                      <td className="px-4 py-3 text-sm font-mono text-blue-600">{route.refCode}</td>
                      <td className="px-4 py-3 text-sm">
                        {tagName
                          ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-800">{tagName}</span>
                          : <span className="text-gray-300 text-xs">なし</span>}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {scenarioName
                          ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-800">{scenarioName}</span>
                          : <span className="text-gray-300 text-xs">なし</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">{route.friendCount}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600">{route.clickCount}</td>
                      <td className="px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 truncate max-w-[160px]">{authUrl}</span>
                          <button
                            onClick={() => handleCopy(route.refCode)}
                            className="text-xs text-blue-500 hover:text-blue-700 shrink-0"
                          >
                            {copiedCode === route.refCode ? 'コピー済' : 'コピー'}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3">
                          <button onClick={() => openEdit(route)} className="text-xs text-blue-500 hover:text-blue-700">編集</button>
                          <button onClick={() => handleDelete(route.id)} className="text-xs text-red-400 hover:text-red-600">削除</button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${route.id}-detail`}>
                        <td colSpan={8} className="px-6 py-4 bg-green-50 border-t border-green-100">
                          {detailLoading ? (
                            <p className="text-sm text-gray-400">読み込み中...</p>
                          ) : detail && detail.length > 0 ? (
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase mb-3">
                                このルートから追加した友だち ({detail.length}人)
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {detail.map((f) => (
                                  <div key={f.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-100">
                                    <span className="text-sm text-gray-800 font-medium truncate">{f.displayName}</span>
                                    <span className="text-xs text-gray-400 ml-2 shrink-0">{formatDate(f.trackedAt)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-gray-400">このルートから追加した友だちはまだいません</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 作成・編集モーダル */}
      {modalMode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {modalMode === 'create' ? '流入経路を追加' : '流入経路を編集'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    経路名 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="例: Instagram広告"
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ref コード <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formRefCode}
                    onChange={(e) => setFormRefCode(e.target.value.replace(/\s/g, '_'))}
                    placeholder="例: instagram_ad_2026"
                    required
                    disabled={modalMode === 'edit'}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                  {modalMode === 'create' && (
                    <p className="mt-1 text-xs text-gray-400">URL に使用。英数字・アンダースコア推奨</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  タグ付与
                  <span className="ml-1 text-xs text-gray-400 font-normal">フォロー時に自動付与</span>
                </label>
                <select
                  value={formTagId}
                  onChange={(e) => setFormTagId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">なし</option>
                  {tags.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  シナリオ
                  <span className="ml-1 text-xs text-gray-400 font-normal">フォロー時に自動エンロール</span>
                </label>
                <select
                  value={formScenarioId}
                  onChange={(e) => setFormScenarioId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">なし</option>
                  {scenarios.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">リダイレクト URL（任意）</label>
                <input
                  type="url"
                  value={formRedirectUrl}
                  onChange={(e) => setFormRedirectUrl(e.target.value)}
                  placeholder="https://example.com/thanks"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <p className="mt-1 text-xs text-gray-400">設定するとフォロー後にこの URL へリダイレクトします</p>
              </div>

              {formError && <p className="text-sm text-red-600">{formError}</p>}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                  style={{ backgroundColor: '#06C755' }}
                >
                  {submitting
                    ? (modalMode === 'create' ? '作成中...' : '保存中...')
                    : (modalMode === 'create' ? '作成' : '保存')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
