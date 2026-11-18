// node:sqlite storage at data/frontdesk.db
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Channel, ChannelStatus, ChannelType, InMessage, Task, TriageResult } from './types.ts'

export const DATA_DIR = resolve(import.meta.dirname, '../../data')
mkdirSync(DATA_DIR, { recursive: true })

export const db = new DatabaseSync(process.env.DB_PATH || resolve(DATA_DIR, 'frontdesk.db'))
db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, address TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'connecting', detail TEXT NOT NULL DEFAULT '', config_json TEXT NOT NULL DEFAULT '{}',
  last_message_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL, channel_id TEXT NOT NULL, external_id TEXT NOT NULL,
  from_name TEXT NOT NULL DEFAULT '', from_address TEXT NOT NULL DEFAULT '', subject TEXT, text TEXT NOT NULL DEFAULT '',
  received_at TEXT NOT NULL, thread_key TEXT, headers_json TEXT NOT NULL DEFAULT '{}',
  qualifies INTEGER NOT NULL DEFAULT 0, not_qualifying_reason TEXT, category TEXT, urgency TEXT, sentiment TEXT,
  language TEXT, summary TEXT, team TEXT, lane TEXT, reasons_json TEXT NOT NULL DEFAULT '[]', draft TEXT,
  sources_json TEXT NOT NULL DEFAULT '[]', flags_json TEXT NOT NULL DEFAULT '[]', confidence TEXT,
  injection_json TEXT NOT NULL DEFAULT '[]', pii_masked INTEGER NOT NULL DEFAULT 0, mode TEXT, model TEXT,
  cost_usd REAL NOT NULL DEFAULT 0, ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL, sent_at TEXT, final_reply TEXT,
  edited INTEGER NOT NULL DEFAULT 0, dismiss_reason TEXT,
  UNIQUE(channel_id, external_id)
);
CREATE INDEX IF NOT EXISTS tasks_created ON tasks(created_at);
`)

const now = () => new Date().toISOString()

if (!db.prepare('SELECT id FROM channels WHERE id = ?').get('test')) {
  db.prepare(`INSERT INTO channels (id, type, name, address, status, detail, config_json, created_at) VALUES ('test','test','Test inbox','simulator','connected','Messages from the simulator and demo loader','{}',?)`).run(now())
}

// ---------- channels ----------
type ChannelRow = { id: string; type: ChannelType; name: string; address: string; status: ChannelStatus; detail: string; config_json: string; last_message_at: string | null; created_at: string }

export function getChannelRow(id: string): ChannelRow | undefined {
  return db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as ChannelRow | undefined
}
export function listChannelRows(): ChannelRow[] {
  return db.prepare('SELECT * FROM channels ORDER BY created_at').all() as ChannelRow[]
}
export function channelConfig<T = any>(id: string): T {
  const r = getChannelRow(id)
  try { return JSON.parse(r?.config_json || '{}') as T } catch { return {} as T }
}
export function createChannel(type: ChannelType, name: string, address: string, config: object, status: ChannelStatus = 'connecting', detail = ''): string {
  const id = `${type}-${randomUUID().slice(0, 8)}`
  db.prepare('INSERT INTO channels (id, type, name, address, status, detail, config_json, created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, type, name, address, status, detail, JSON.stringify(config), now())
  return id
}
export function updateChannel(id: string, patch: Partial<{ name: string; address: string; status: ChannelStatus; detail: string; config_json: string; last_message_at: string }>) {
  const keys = Object.keys(patch) as (keyof typeof patch)[]
  if (!keys.length) return
  db.prepare(`UPDATE channels SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => patch[k] as string), id)
}
export function deleteChannel(id: string) {
  db.prepare('DELETE FROM channels WHERE id = ?').run(id)
}
export function toChannel(r: ChannelRow, qr: string | null = null): Channel {
  const cnt = db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE channel_id = ?').get(r.id) as { n: number }
  return { id: r.id, type: r.type, name: r.name, address: r.address, status: r.status, detail: r.detail, last_message_at: r.last_message_at, qr, message_count: Number(cnt.n), auto_send: !!(r as any).auto_send }
}

// ---------- tasks ----------
const J = (s: string | null | undefined, d: any) => { try { return s ? JSON.parse(s) : d } catch { return d } }

export function rowToTask(r: any): Task {
  return {
    id: r.id, channel: r.channel, channel_id: r.channel_id, external_id: r.external_id,
    from_name: r.from_name, from_address: r.from_address, subject: r.subject, text: r.text, received_at: r.received_at,
    thread_key: r.thread_key, headers: J(r.headers_json, {}),
    qualifies: !!r.qualifies, not_qualifying_reason: r.not_qualifying_reason, category: r.category, urgency: r.urgency,
    sentiment: r.sentiment || 'neutral', language: r.language || 'en', summary: r.summary || '', team: r.team, lane: r.lane,
    reasons: J(r.reasons_json, []), draft: r.draft, sources: J(r.sources_json, []), flags: J(r.flags_json, []),
    confidence: r.confidence || 'low', injection: J(r.injection_json, []), pii_masked: Number(r.pii_masked || 0),
    mode: r.mode || 'rules', model: r.model || '', cost_usd: Number(r.cost_usd || 0), ms: Number(r.ms || 0),
    status: r.status, created_at: r.created_at, sent_at: r.sent_at, final_reply: r.final_reply, edited: !!r.edited,
    channel_name: r.channel_name || (r.channel_id === 'test' ? 'Test inbox' : r.channel_id),
    auto_sent: !!r.auto_sent,
  }
}

const SELECT_TASK = 'SELECT t.*, c.name AS channel_name FROM tasks t LEFT JOIN channels c ON c.id = t.channel_id'

export function findTaskByExternal(channel_id: string, external_id: string): Task | null {
  const r = db.prepare(`${SELECT_TASK} WHERE t.channel_id = ? AND t.external_id = ?`).get(channel_id, external_id)
  return r ? rowToTask(r) : null
}
export function getTask(id: string): Task | null {
  const r = db.prepare(`${SELECT_TASK} WHERE t.id = ?`).get(id)
  return r ? rowToTask(r) : null
}

function triageCols(t: TriageResult) {
  return {
    qualifies: t.qualifies ? 1 : 0, not_qualifying_reason: t.not_qualifying_reason, category: t.category, urgency: t.urgency,
    sentiment: t.sentiment, language: t.language, summary: t.summary, team: t.team, lane: t.lane,
    reasons_json: JSON.stringify(t.reasons || []), draft: t.draft, sources_json: JSON.stringify(t.sources || []),
    flags_json: JSON.stringify(t.flags || []), confidence: t.confidence, injection_json: JSON.stringify(t.injection || []),
    pii_masked: t.pii_masked || 0, mode: t.mode, model: t.model, cost_usd: t.cost_usd || 0, ms: t.ms || 0,
  }
}

export function insertTask(msg: InMessage, t: TriageResult): Task {
  const id = randomUUID()
  const cols: Record<string, any> = {
    id, channel: msg.channel, channel_id: msg.channel_id, external_id: msg.external_id,
    from_name: msg.from_name || '', from_address: msg.from_address || '', subject: msg.subject ?? null, text: msg.text || '',
    received_at: msg.received_at || now(), thread_key: msg.thread_key ?? null, headers_json: JSON.stringify(msg.headers || {}),
    ...triageCols(t), status: 'open', created_at: now(), sent_at: null, final_reply: null, edited: 0,
  }
  const keys = Object.keys(cols)
  db.prepare(`INSERT OR IGNORE INTO tasks (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((k) => cols[k] ?? null))
  updateChannel(msg.channel_id, { last_message_at: now() })
  return getTask(id) || findTaskByExternal(msg.channel_id, msg.external_id)!
}

export function updateTriage(id: string, t: TriageResult) {
  const cols = triageCols(t) as Record<string, any>
  const keys = Object.keys(cols)
  db.prepare(`UPDATE tasks SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => cols[k] ?? null), id)
}

export function patchTask(id: string, patch: Record<string, string | number | null>) {
  const keys = Object.keys(patch)
  if (!keys.length) return
  db.prepare(`UPDATE tasks SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => patch[k]), id)
}

export type View = 'open' | 'reply' | 'review' | 'escalated' | 'unanswered' | 'done' | 'filtered' | 'all'
const VIEW_SQL: Record<View, string> = {
  open: "t.qualifies = 1 AND t.status = 'open'",
  reply: "t.qualifies = 1 AND t.status = 'open' AND t.lane = 'reply'",
  review: "t.qualifies = 1 AND t.status = 'open' AND t.lane = 'review'",
  escalated: "t.qualifies = 1 AND t.status = 'open' AND t.lane = 'escalated'",
  // Knowledge gaps (no help article could ground a reply) or anything still open after 24 hours.
  unanswered: "t.qualifies = 1 AND t.status = 'open' AND (t.flags_json LIKE '%\"no_source\"%' OR (t.sources_json = '[]' AND COALESCE(t.lane, '') <> 'escalated') OR COALESCE(t.received_at, t.created_at) < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-24 hours'))",
  done: "t.status IN ('done','dismissed')",
  filtered: "t.qualifies = 0 AND t.status = 'open'",
  all: '1 = 1',
}

export function listTasks(view: View, q?: string): Task[] {
  const where = [VIEW_SQL[view] || VIEW_SQL.all]
  const args: string[] = []
  if (q && q.trim()) {
    where.push('(t.subject LIKE ? OR t.text LIKE ? OR t.from_name LIKE ? OR t.from_address LIKE ? OR t.summary LIKE ?)')
    const like = `%${q.trim()}%`
    args.push(like, like, like, like, like)
  }
  const order = view === 'done' ? 'COALESCE(t.sent_at, t.created_at) DESC' : "CASE t.urgency WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 WHEN 'P4' THEN 4 ELSE 5 END, t.created_at DESC"
  return db.prepare(`${SELECT_TASK} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 500`).all(...args).map(rowToTask)
}

export function counts() {
  const c = (sql: string) => Number((db.prepare(`SELECT COUNT(*) AS n FROM tasks t WHERE ${sql}`).get() as { n: number }).n)
  return { reply: c(VIEW_SQL.reply), review: c(VIEW_SQL.review), escalated: c(VIEW_SQL.escalated), unanswered: c(VIEW_SQL.unanswered), done: c(VIEW_SQL.done), filtered: c(VIEW_SQL.filtered) }
}

export function stats(ai_mode: string) {
  const one = (sql: string) => db.prepare(sql).get() as any
  const group = (col: string, where = '1=1') => {
    const out: Record<string, number> = {}
    for (const r of db.prepare(`SELECT ${col} AS k, COUNT(*) AS n FROM tasks WHERE ${where} GROUP BY ${col}`).all() as any[]) out[r.k ?? 'none'] = Number(r.n)
    return out
  }
  const a = one(`SELECT COUNT(*) AS total, SUM(qualifies) AS qualified, AVG(ms) AS avg_ms, SUM(cost_usd) AS cost,
    SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS approved, SUM(CASE WHEN status='done' AND edited=1 THEN 1 ELSE 0 END) AS edited, SUM(CASE WHEN auto_sent=1 THEN 1 ELSE 0 END) AS auto_sent,
    SUM(CASE WHEN urgency='P1' AND status='open' AND qualifies=1 THEN 1 ELSE 0 END) AS p1 FROM tasks`)
  const total = Number(a.total || 0)
  const qualified = Number(a.qualified || 0)
  return {
    total, qualified, filtered: total - qualified,
    by_lane: group('lane', 'qualifies = 1'), by_category: group('category', 'qualifies = 1'), by_channel: group('channel'),
    p1_open: Number(a.p1 || 0), avg_ms: Math.round(Number(a.avg_ms || 0)), cost_usd: Math.round(Number(a.cost || 0) * 1e4) / 1e4,
    approved: Number(a.approved || 0), edited_before_send: Number(a.edited || 0), auto_sent: Number(a.auto_sent || 0), ai_mode,
  }
}

// ---------- auto-send settings ----------
// Added after the first release: columns are added in place so existing databases keep working.
for (const sql of [
  'ALTER TABLE tasks ADD COLUMN auto_sent INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE channels ADD COLUMN auto_send INTEGER NOT NULL DEFAULT 0',
]) { try { db.exec(sql) } catch { /* column already exists */ } }
db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)')

export function getSetting(key: string, fallback = ''): string {
  const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return r ? r.value : fallback
}
export function setSetting(key: string, value: string) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
}
export function setChannelAutoSend(id: string, on: boolean) {
  db.prepare('UPDATE channels SET auto_send = ? WHERE id = ?').run(on ? 1 : 0, id)
}
export function autoSendEnabledFor(channelId: string): boolean {
  if (getSetting('auto_send_all', '0') === '1') return true
  const r = db.prepare('SELECT auto_send FROM channels WHERE id = ?').get(channelId) as { auto_send: number } | undefined
  return !!r?.auto_send
}
