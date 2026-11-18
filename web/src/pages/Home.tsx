import { Link } from 'react-router'
import { AlertOctagon, ArrowRight, CircleHelp, Eye, PartyPopper, Send, Zap } from 'lucide-react'
import { CATEGORY_LABEL, timeAgo, usePoll, type Channel, type Counts, type Task } from '../api'
import { Avatar, Badge, ChannelIcon, ChannelLogo, cx, Spinner, UrgencyBadge } from '../components/ui'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function Home({ email }: { email: string }) {
  const { data: open } = usePoll<{ items: Task[]; counts: Counts }>('/tasks?view=open', 5000)
  const { data: channels } = usePoll<Channel[]>('/channels', 10000)
  if (!open) return <div className="grid h-full place-items-center"><Spinner /></div>

  const c = open.counts
  const items = open.items
  const urgent = items.filter((t) => t.urgency === 'P1').length
  const total = c.reply + c.review + c.escalated
  const name = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
  const top = items.slice(0, 6)

  const cards = [
    { to: '/inbox/reply', n: c.reply, label: 'Ready to send', text: 'Drafts passed every check. Read and approve.', icon: Send, tone: 'emerald' },
    { to: '/inbox/review', n: c.review, label: 'Need a look', text: 'Frontdesk wasn’t sure. Your judgement needed.', icon: Eye, tone: 'amber' },
    { to: '/inbox/escalated', n: c.escalated, label: 'Escalated', text: 'Refunds, outages, privacy. A specialist decides.', icon: AlertOctagon, tone: 'red' },
    { to: '/inbox/unanswered', n: c.unanswered, label: 'Unanswered', text: 'The knowledge base had no answer, or no reply in 24h.', icon: CircleHelp, tone: 'violet' },
  ] as const

  return (
    <div className="h-full overflow-y-auto scroll-thin">
      <div className="mx-auto max-w-4xl px-10 py-12">
        <p className="text-sm text-ink-500">{greeting()}, {name}</p>
        {total > 0 ? (
          <h1 className="mt-1 text-[32px] font-semibold leading-tight tracking-tight">
            You have <span className="text-indigo-600">{total} {total === 1 ? 'thing' : 'things'}</span> that need your attention.
          </h1>
        ) : (
          <h1 className="mt-1 flex items-center gap-3 text-[32px] font-semibold tracking-tight">You’re all caught up. <PartyPopper className="size-7 text-amber-500" /></h1>
        )}
        {urgent > 0 && (
          <Link to="/inbox/escalated" className="fade-up mt-5 flex items-center gap-3 rounded-xl bg-red-50 px-4 py-3 text-[14px] text-red-800 ring-1 ring-red-200 transition hover:bg-red-100/70">
            <span className="relative grid size-8 place-items-center rounded-lg bg-red-600 text-white"><Zap className="size-4" /></span>
            <span><span className="font-semibold">{urgent} urgent {urgent === 1 ? 'issue' : 'issues'}</span> — customers may be blocked right now. Start here.</span>
            <ArrowRight className="ml-auto size-4" />
          </Link>
        )}

        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {cards.map((k) => (
            <Link key={k.to} to={k.to} className="group rounded-2xl bg-white p-5 ring-1 ring-ink-200/80 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-ink-900/[0.05]">
              <div className="flex items-center justify-between">
                <span className={cx('grid size-9 place-items-center rounded-xl',
                  k.tone === 'emerald' && 'bg-emerald-50 text-emerald-600', k.tone === 'amber' && 'bg-amber-50 text-amber-600',
                  k.tone === 'red' && 'bg-red-50 text-red-600', k.tone === 'violet' && 'bg-violet-50 text-violet-600')}><k.icon className="size-[18px]" /></span>
                <ArrowRight className="size-4 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-ink-500" />
              </div>
              <div className="mt-4 text-[30px] font-semibold tabular-nums leading-none tracking-tight">{k.n}</div>
              <div className="mt-1.5 text-[13.5px] font-medium text-ink-800">{k.label}</div>
              <div className="mt-1 text-[12px] leading-snug text-ink-500">{k.text}</div>
            </Link>
          ))}
        </div>

        {top.length > 0 && (
          <section className="mt-10">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-[15px] font-semibold">Start with these</h2>
              <Link to="/inbox/review" className="text-[13px] font-medium text-indigo-600 hover:text-indigo-500">Open inbox →</Link>
            </div>
            <ul className="divide-y divide-ink-100 overflow-hidden rounded-2xl bg-white ring-1 ring-ink-200/80">
              {top.map((t) => (
                <li key={t.id}>
                  <Link to={`/inbox/${t.lane ?? 'review'}?id=${t.id}`} className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-ink-50">
                    <div className="relative">
                      <Avatar name={t.from_name || t.from_address} />
                      <span className="absolute -bottom-1 -right-1 rounded-md ring-2 ring-white"><ChannelIcon type={t.channel} address={t.from_address} size="sm" /></span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13.5px] font-semibold">{t.from_name || t.from_address}</span>
                        <span className="text-[11.5px] text-ink-400">{timeAgo(t.received_at || t.created_at)}</span>
                      </div>
                      <div className="truncate text-[13px] text-ink-600">{t.summary || t.subject || t.text}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <UrgencyBadge u={t.urgency} />
                      {t.category && <Badge>{CATEGORY_LABEL[t.category] ?? t.category}</Badge>}
                      <Badge tone={t.lane === 'escalated' ? 'red' : t.lane === 'reply' ? 'green' : 'amber'}>
                        {t.lane === 'reply' ? 'Ready' : t.lane === 'escalated' ? 'Escalated' : 'Check'}
                      </Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-10">
          <h2 className="mb-3 text-[15px] font-semibold">Listening on</h2>
          <div className="flex flex-wrap gap-2.5">
            {(channels ?? []).map((ch) => (
              <Link key={ch.id} to="/connections" className="flex items-center gap-2.5 rounded-xl bg-white px-3.5 py-2.5 ring-1 ring-ink-200/80 transition hover:ring-ink-300">
                <ChannelLogo ch={ch} />
                <span className="text-[13px] font-medium">{ch.name}</span>
                <span className={cx('size-2 rounded-full', ch.status === 'connected' ? 'live-dot bg-emerald-500' : ch.status === 'error' ? 'bg-red-500' : 'bg-amber-400')} />
              </Link>
            ))}
            <Link to="/connections" className="flex items-center gap-2 rounded-xl border border-dashed border-ink-300 px-3.5 py-2.5 text-[13px] font-medium text-ink-500 transition hover:border-indigo-400 hover:text-indigo-600">+ Connect a channel</Link>
          </div>
        </section>
      </div>
    </div>
  )
}
