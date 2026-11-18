import { useCallback, useEffect, useRef, useState } from 'react'

export type ChannelType = 'email' | 'whatsapp' | 'test'
export type Lane = 'reply' | 'review' | 'escalated'
export type Urgency = 'P1' | 'P2' | 'P3' | 'P4'
export type Flag = { kind: string; text: string }

export type Task = {
  id: string
  channel: ChannelType
  channel_id: string
  channel_name?: string
  external_id: string
  from_name: string
  from_address: string
  subject: string | null
  text: string
  received_at: string
  qualifies: boolean
  not_qualifying_reason: string | null
  category: string | null
  urgency: Urgency | null
  sentiment: string
  language: string
  summary: string
  team: string | null
  lane: Lane | null
  reasons: string[]
  draft: string | null
  sources: { id: string; title: string }[]
  flags: Flag[]
  confidence: 'high' | 'medium' | 'low'
  injection: string[]
  pii_masked: number
  mode: 'ai' | 'rules'
  model: string
  cost_usd: number
  ms: number
  status: 'open' | 'done' | 'dismissed'
  created_at: string
  sent_at: string | null
  final_reply: string | null
  edited: boolean
  auto_sent?: boolean
}

export type Counts = { reply: number; review: number; escalated: number; unanswered: number; done: number; filtered: number }

export type Channel = {
  id: string
  type: ChannelType
  name: string
  address: string | null
  status: 'connected' | 'connecting' | 'paused' | 'error'
  detail: string | null
  last_message_at: string | null
  qr?: string | null
  message_count?: number
  auto_send?: boolean
}

export type Stats = {
  total: number
  qualified: number
  filtered: number
  by_lane: Record<string, number>
  by_category: Record<string, number>
  by_channel: Record<string, number>
  p1_open: number
  avg_ms: number
  cost_usd: number
  approved: number
  edited_before_send: number
  auto_sent?: number
  ai_mode?: string
}

export type Article = { id: string; title: string; tags: string[]; body: string; uploaded?: boolean; source?: string | null; added?: string | null; file_url?: string | null; file_type?: string | null }
export type Health = { ok: boolean; ai: 'anthropic' | 'openrouter' | 'none'; model: string }

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? (init?.body !== undefined ? 'POST' : 'GET'),
    headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: 'same-origin',
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401 && !path.startsWith('/login')) {
    window.dispatchEvent(new Event('fd:unauthorized'))
  }
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error || `Request failed (${res.status})`)
  return data as T
}

// Fetch + refresh on an interval. Keeps the last good value while refreshing.
export function usePoll<T>(path: string | null, ms = 4000): { data: T | undefined; error: string | null; reload: () => void; loading: boolean } {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)
  const load = useCallback(() => {
    if (!path) return
    const my = ++seq.current
    api<T>(path)
      .then((d) => { if (my === seq.current) { setData(d); setError(null) } })
      .catch((e: Error) => { if (my === seq.current) setError(e.message) })
      .finally(() => { if (my === seq.current) setLoading(false) })
  }, [path])
  useEffect(() => {
    setLoading(true)
    load()
    if (!ms) return
    const t = setInterval(load, ms)
    return () => clearInterval(t)
  }, [load, ms])
  return { data, error, reload: load, loading }
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return ''
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000)
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export const CATEGORY_LABEL: Record<string, string> = {
  how_to: 'How-to', bug: 'Bug', outage: 'Outage', billing: 'Billing', refund: 'Refund', account_access: 'Account access',
  cancellation: 'Cancellation', feature_request: 'Feature request', data_privacy: 'Data & privacy', other: 'Other',
  spam: 'Spam', newsletter: 'Newsletter', automated: 'Automated', personal: 'Personal',
}

export const TEAM_LABEL: Record<string, string> = {
  support: 'Support', billing: 'Billing', engineering: 'Engineering', success: 'Customer success', privacy: 'Privacy',
}

export const LANGUAGE_LABEL: Record<string, string> = {
  en: 'English', ko: 'Korean', ur: 'Urdu', ar: 'Arabic', es: 'Spanish', de: 'German', fr: 'French', hi: 'Hindi',
}
