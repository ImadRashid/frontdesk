import { NavLink, Outlet } from 'react-router'
import { AlertOctagon, BarChart3, BookOpen, CheckCheck, CircleHelp, Filter, Home as HomeIcon, Inbox as InboxIcon, LogOut, Eye, Plug, Send } from 'lucide-react'
import { api, usePoll, type Counts, type Health } from '../api'
import { cx, Logo as BrandLogo } from './ui'

export function Logo({ dark }: { dark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-[9px] bg-indigo-600 shadow-sm shadow-indigo-600/30">
        <svg viewBox="0 0 32 32" className="size-5"><path d="M8 11h16M8 16h11M8 21h6" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" /></svg>
      </span>
      <span className={cx('text-[17px] font-semibold tracking-tight', dark ? 'text-white' : 'text-ink-900')}>Frontdesk</span>
    </span>
  )
}

const LANES = [
  { to: '/inbox/all', label: 'All messages', icon: InboxIcon, key: 'all' as const, tone: 'text-ink-500' },
  { to: '/inbox/reply', label: 'Ready to send', icon: Send, key: 'reply' as const, tone: 'text-emerald-600' },
  { to: '/inbox/review', label: 'Needs a look', icon: Eye, key: 'review' as const, tone: 'text-amber-600' },
  { to: '/inbox/escalated', label: 'Escalated', icon: AlertOctagon, key: 'escalated' as const, tone: 'text-red-600' },
  { to: '/inbox/unanswered', label: 'Unanswered', icon: CircleHelp, key: 'unanswered' as const, tone: 'text-violet-600' },
  { to: '/inbox/done', label: 'Done', icon: CheckCheck, key: 'done' as const, tone: 'text-ink-500' },
  { to: '/inbox/filtered', label: 'Filtered out', icon: Filter, key: 'filtered' as const, tone: 'text-ink-500' },
]

export default function Layout({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const { data: counts } = usePoll<{ counts: Counts }>('/tasks?view=reply', 5000)
  const { data: health } = usePoll<Health>('/health', 30000)
  const c = counts?.counts

  async function signOut() {
    await api('/logout', { method: 'POST' }).catch(() => {})
    onSignOut()
  }

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-ink-200/80 bg-white">
        <NavLink to="/" title="Home" className="block px-5 pb-4 pt-5 transition-opacity hover:opacity-80"><Logo /></NavLink>
        <div className="mx-3 mb-3 flex items-center gap-2.5 rounded-lg bg-ink-50 px-2.5 py-2 ring-1 ring-ink-100">
          <span className="grid size-7 place-items-center rounded-md bg-gradient-to-br from-teal-400 to-emerald-600 text-[11px] font-bold text-white">S</span>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[13px] font-semibold">Slotwise Support</div>
            <div className="text-[11px] text-ink-500">Demo workspace</div>
          </div>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 scroll-thin">
          <NavLink to="/" end className={({ isActive }) => cx('flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors',
            isActive ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900')}>
            <HomeIcon className="size-4" />Home
          </NavLink>
          <div>
            <div className="mb-1 flex items-center gap-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400"><InboxIcon className="size-3.5" />Inbox</div>
            {LANES.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => cx('group flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors',
                isActive ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900')}>
                {({ isActive }) => (<>
                  <l.icon className={cx('size-4', isActive ? 'text-indigo-600' : l.tone)} />
                  <span className="flex-1">{l.label}</span>
                  {c && ((l.key === 'all' ? 0 : c[l.key as keyof typeof c]) ?? 0) > 0 && (
                    <span className={cx('min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold tabular-nums leading-5',
                      l.key === 'escalated' ? 'bg-red-100 text-red-700' : isActive ? 'bg-indigo-100 text-indigo-700' : 'bg-ink-100 text-ink-600')}>{c[l.key as keyof typeof c]}</span>
                  )}
                </>)}
              </NavLink>
            ))}
          </div>
          <div>
            <div className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Workspace</div>
            {[
              { to: '/connections', label: 'Connections', icon: Plug },
              { to: '/knowledge-base', label: 'Knowledge base', icon: BookOpen },
              { to: '/insights', label: 'Insights', icon: BarChart3 },
            ].map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => cx('flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors',
                isActive ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900')}>
                <l.icon className="size-4" />{l.label}
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="border-t border-ink-100 p-3">
          <div className="mb-2 flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs">
            {health?.ai && health.ai !== 'none' ? (
              <><BrandLogo name="claude" className="size-4" /><span className="live-dot size-1.5 rounded-full bg-emerald-500" /><span className="text-ink-600">AI on · <span className="font-medium text-ink-800">{prettyModel(health.model)}</span></span></>
            ) : (
              <><span className="size-2 rounded-full bg-amber-500" /><span className="text-ink-600">Rules-only mode · <span className="text-ink-400">no AI key</span></span></>
            )}
          </div>
          <div className="flex items-center gap-2 px-2.5">
            <span className="min-w-0 flex-1 truncate text-xs text-ink-500">{email}</span>
            <button onClick={signOut} title="Sign out" className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"><LogOut className="size-4" /></button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-hidden"><Outlet /></main>
    </div>
  )
}

function prettyModel(m: string) {
  return m.replace(/^anthropic\//, '').replace(/^claude-/, 'Claude ').replace(/-(\d)-(\d)$/, ' $1.$2').replace(/-(\d)\.(\d)$/, ' $1.$2').replace(/\bsonnet\b/i, 'Sonnet').replace(/\bopus\b/i, 'Opus').replace(/\bhaiku\b/i, 'Haiku')
}
