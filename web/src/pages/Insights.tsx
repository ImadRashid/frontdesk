import { AlertOctagon, BarChart3, Clock, DollarSign, Filter, Inbox, PenLine, Send } from 'lucide-react'
import { CATEGORY_LABEL, usePoll, type Stats } from '../api'
import { Spinner } from '../components/ui'

export default function Insights() {
  const { data } = usePoll<Stats>('/stats', 5000)
  if (!data) return <div className="grid h-full place-items-center"><Spinner /></div>
  const s = data
  const editRate = s.approved ? Math.round((s.edited_before_send / s.approved) * 100) : 0

  return (
    <div className="h-full overflow-y-auto scroll-thin">
      <div className="mx-auto max-w-5xl px-10 py-10">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><BarChart3 className="size-6 text-ink-400" />Insights</h1>
        <p className="mt-1.5 text-sm text-ink-500">What came in, what Frontdesk did with it, and how often people had to correct it.</p>

        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Tile icon={<Inbox className="size-4" />} label="Messages received" value={s.total} sub={`${s.qualified} became tasks`} />
          <Tile icon={<Filter className="size-4" />} label="Filtered out" value={s.filtered} sub="spam, newsletters, automated" />
          <Tile icon={<AlertOctagon className="size-4 text-red-500" />} label="Urgent (P1) open" value={s.p1_open} sub="escalated straight away" accent={s.p1_open > 0} />
          <Tile icon={<Send className="size-4" />} label="Replies sent" value={s.approved} sub={s.auto_sent ? `${s.approved - s.auto_sent} approved · ${s.auto_sent} auto-sent` : 'all approved by a person'} />
          <Tile icon={<PenLine className="size-4" />} label="Edited before sending" value={`${editRate}%`} sub={`${s.edited_before_send} of ${s.approved}`} />
          <Tile icon={<Clock className="size-4" />} label="Avg. triage time" value={`${(s.avg_ms / 1000).toFixed(1)}s`} sub="per message" />
          <Tile icon={<DollarSign className="size-4" />} label="AI cost" value={`$${s.cost_usd.toFixed(2)}`} sub={s.qualified ? `$${(s.cost_usd / Math.max(1, s.total)).toFixed(4)} per message` : '—'} />
          <Tile icon={<BarChart3 className="size-4" />} label="Open now" value={(s.by_lane.reply ?? 0) + (s.by_lane.review ?? 0) + (s.by_lane.escalated ?? 0)} sub={`${s.by_lane.reply ?? 0} ready · ${s.by_lane.review ?? 0} to check · ${s.by_lane.escalated ?? 0} escalated`} />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Bars title="By topic" data={Object.fromEntries(Object.entries(s.by_category).map(([k, v]) => [CATEGORY_LABEL[k] ?? k, v]))} color="bg-indigo-500" />
          <Bars title="By channel" data={Object.fromEntries(Object.entries(s.by_channel).map(([k, v]) => [k === 'whatsapp' ? 'WhatsApp' : k === 'email' ? 'Email' : 'Test inbox', v]))} color="bg-emerald-500" />
        </div>
      </div>
    </div>
  )
}

function Tile({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl bg-white p-5 ring-1 ${accent ? 'ring-red-200' : 'ring-ink-200/80'}`}>
      <div className="flex items-center gap-2 text-[12.5px] font-medium text-ink-500"><span className="text-ink-400">{icon}</span>{label}</div>
      <div className={`mt-2 text-[28px] font-semibold tabular-nums tracking-tight ${accent ? 'text-red-600' : 'text-ink-900'}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-ink-400">{sub}</div>}
    </div>
  )
}

function Bars({ title, data, color }: { title: string; data: Record<string, number>; color: string }) {
  const rows = Object.entries(data).sort((a, b) => b[1] - a[1])
  const max = Math.max(1, ...rows.map((r) => r[1]))
  return (
    <div className="rounded-xl bg-white p-5 ring-1 ring-ink-200/80">
      <h3 className="text-[13px] font-semibold text-ink-800">{title}</h3>
      {rows.length === 0 ? <p className="mt-6 text-[13px] text-ink-400">No data yet.</p> : (
        <ul className="mt-4 space-y-2.5">
          {rows.map(([k, v]) => (
            <li key={k} className="grid grid-cols-[120px_1fr_32px] items-center gap-3 text-[13px]">
              <span className="truncate text-ink-600">{k}</span>
              <span className="h-2 overflow-hidden rounded-full bg-ink-100"><span className={`block h-full rounded-full ${color}`} style={{ width: `${(v / max) * 100}%` }} /></span>
              <span className="text-right tabular-nums text-ink-500">{v}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
