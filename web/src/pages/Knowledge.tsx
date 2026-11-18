import { useMemo, useRef, useState } from 'react'
import { BookOpen, Download, FileText, FileUp, Search, Trash2, UploadCloud } from 'lucide-react'
import { api, timeAgo, usePoll, type Article } from '../api'
import { Badge, Button, cx, Field, Input, Modal, Spinner, useToast } from '../components/ui'

export default function Knowledge() {
  const { data, loading, reload } = usePoll<Article[]>('/kb', 0)
  const [uploadOpen, setUploadOpen] = useState(false)
  const toast = useToast()
  async function remove(a: Article) {
    if (!confirm(`Remove “${a.title}” from the knowledge base? Future drafts won’t use it.`)) return
    try { await api(`/kb/${a.id}`, { method: 'DELETE' }); setSel(null); reload(); toast('Removed') } catch (e) { toast((e as Error).message, 'error') }
  }
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const items = useMemo(() => (data ?? []).filter((a) => !q || `${a.title} ${a.tags.join(' ')} ${a.body}`.toLowerCase().includes(q.toLowerCase())), [data, q])
  const cur = items.find((a) => a.id === sel) ?? items[0]

  return (
    <div className="flex h-full">
      <section className="flex w-[340px] shrink-0 flex-col border-r border-ink-200/80 bg-white">
        <header className="border-b border-ink-100 px-5 pb-3.5 pt-5">
          <div className="flex items-center justify-between">
            <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight"><BookOpen className="size-[18px] text-ink-400" />Knowledge base</h1>
            <Button size="sm" variant="primary" icon={<FileUp className="size-3.5" />} onClick={() => setUploadOpen(true)}>Add document</Button>
          </div>
          <p className="mt-1 text-[12.5px] text-ink-500">Drafts may only use what these articles say. Upload PDFs, Word files or notes to teach Frontdesk new answers.</p>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search articles" className="h-8 pl-8 text-[13px]" />
          </div>
        </header>
        <ul className="flex-1 overflow-y-auto scroll-thin p-2">
          {loading && !data ? <div className="p-6"><Spinner /></div> : items.map((a) => (
            <li key={a.id}>
              <button onClick={() => setSel(a.id)} className={cx('w-full rounded-lg px-3 py-2.5 text-left transition', cur?.id === a.id ? 'bg-indigo-50' : 'hover:bg-ink-50')}>
                <div className={cx('flex items-center gap-1.5 text-[13.5px]', cur?.id === a.id ? 'font-medium text-indigo-800' : 'text-ink-800')}>
                  {a.uploaded && <FileText className="size-3.5 shrink-0 text-indigo-500" />}<span className="truncate">{a.title}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {a.uploaded ? <Badge tone="indigo">{a.tags.includes('answer') ? 'Saved answer' : 'Uploaded'}</Badge> : null}
                  {a.tags.filter((t) => t !== 'uploaded' && t !== 'answer').slice(0, 3).map((t) => <Badge key={t}>{t}</Badge>)}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="min-w-0 flex-1 overflow-y-auto bg-ink-50 scroll-thin">
        {cur ? (
          <article className="mx-auto max-w-3xl px-10 py-10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[12px] font-medium text-ink-400">{cur.uploaded ? `${cur.source ?? 'Uploaded'}${cur.added ? ` · added ${timeAgo(cur.added)}` : ''}` : `${cur.id} · built-in`}</div>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">{cur.title}</h2>
              </div>
              {cur.uploaded && <Button size="sm" variant="danger" icon={<Trash2 className="size-3.5" />} onClick={() => remove(cur)}>Remove</Button>}
            </div>
            <ArticleView key={cur.id} a={cur} />
          </article>
        ) : <div className="grid h-full place-items-center text-sm text-ink-500">No articles yet.</div>}
      </section>
      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onDone={(id) => { setUploadOpen(false); reload(); setSel(id) }} />
    </div>
  )
}

function UploadModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (id: string) => void }) {
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function pick(f: File | undefined | null) {
    if (!f) return
    setFile(f)
    setError(null)
    setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '))
  }
  async function upload() {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('title', title)
      const res = await fetch('/api/kb/upload', { method: 'POST', body: fd, credentials: 'same-origin' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`)
      toast(`Added “${data.title}”${data.pages ? ` · ${data.pages} pages` : ''}. Drafts can use it now.`)
      setFile(null)
      setTitle('')
      onDone(data.id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Add a document to the knowledge base" subtitle="Frontdesk reads the text and uses it as a source for replies. Long documents are split into sections."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={<UploadCloud className="size-4" />} loading={busy} disabled={!file} onClick={upload}>Add to knowledge base</Button></>}>
      <div
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]) }}
        className={cx('grid cursor-pointer place-items-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition',
          drag ? 'border-indigo-400 bg-indigo-50' : file ? 'border-emerald-300 bg-emerald-50/50' : 'border-ink-200 hover:border-ink-300 hover:bg-ink-50')}>
        <input ref={input} type="file" accept=".pdf,.docx,.md,.markdown,.txt" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        {file ? (
          <div>
            <FileText className="mx-auto size-8 text-emerald-600" />
            <div className="mt-2 text-sm font-medium">{file.name}</div>
            <div className="text-xs text-ink-500">{(file.size / 1024).toFixed(0)} KB · click to choose another</div>
          </div>
        ) : (
          <div>
            <UploadCloud className="mx-auto size-8 text-ink-400" />
            <div className="mt-2 text-sm font-medium text-ink-800">Drop a file here, or click to choose</div>
            <div className="mt-1 text-xs text-ink-500">PDF, Word (.docx), Markdown or text · up to 20 MB</div>
          </div>
        )}
      </div>
      {file && <Field label="Title" className="mt-4"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>}
      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-[13px] text-red-800 ring-1 ring-red-200">{error}</p>}
      <p className="mt-4 text-[12px] leading-relaxed text-ink-500">Only upload content you’re happy for customers to be told. Scanned PDFs without a text layer can’t be read.</p>
    </Modal>
  )
}

function ArticleView({ a }: { a: Article }) {
  const [tab, setTab] = useState<'original' | 'text'>(a.file_type === 'pdf' ? 'original' : 'text')
  return (
    <div className="mt-6">
      {a.file_url && (
        <div className="mb-3 flex items-center justify-between">
          <div className="inline-flex rounded-lg bg-ink-100 p-1">
            {(a.file_type === 'pdf' ? (['original', 'text'] as const) : (['text'] as const)).map((k) => (
              <button key={k} onClick={() => setTab(k)} className={cx('rounded-md px-3 py-1.5 text-[13px] font-medium transition',
                tab === k ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800')}>
                {k === 'original' ? 'Original PDF' : 'Text the AI uses'}
              </button>
            ))}
          </div>
          <a href={a.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-indigo-600 hover:text-indigo-500">
            <Download className="size-3.5" />{a.file_type === 'pdf' ? 'Open PDF' : `Download .${a.file_type}`}
          </a>
        </div>
      )}
      {tab === 'original' && a.file_url ? (
        <iframe src={`${a.file_url}#view=FitH`} title={a.title} className="h-[75vh] w-full rounded-2xl bg-white ring-1 ring-ink-200/80" />
      ) : (
        <div className="rounded-2xl bg-white px-8 py-7 ring-1 ring-ink-200/80">
          {a.body.split(/\n{2,}/).map((p, i) => <Para key={i} text={p} />)}
        </div>
      )}
    </div>
  )
}

function Para({ text }: { text: string }) {
  const t = text.trim()
  if (!t) return null
  if (/^#{1,3}\s/.test(t)) return <h3 className="mb-2 mt-6 text-[15px] font-semibold text-ink-900 first:mt-0">{t.replace(/^#{1,3}\s/, '')}</h3>
  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean)
  const isItem = (l: string) => /^([-*•]|\d+[.)])\s/.test(l)
  const headingLike = (l: string) => l.length < 70 && !/[.:,;!?]$/.test(l) && /^[A-Z0-9]/.test(l) && !isItem(l)
  // "Heading\nParagraph…" (common in PDFs): render the heading, then the rest.
  if (lines.length > 1 && headingLike(lines[0]) && !headingLike(lines[1])) {
    return <><h3 className="mb-2 mt-6 text-[15px] font-semibold text-ink-900 first:mt-0">{inline(lines[0])}</h3><Para text={lines.slice(1).join('\n')} /></>
  }
  // A short line with no full stop, followed by content, reads as a heading.
  if (lines.length === 1 && lines[0].length < 70 && !/[.:,;!?]$/.test(lines[0]) && /^[A-Z0-9]/.test(lines[0]) && !isItem(lines[0])) {
    return <h3 className="mb-2 mt-6 text-[15px] font-semibold text-ink-900 first:mt-0">{inline(lines[0])}</h3>
  }
  const blocks: { list: boolean; ordered: boolean; items: string[] }[] = []
  for (const l of lines) {
    const item = isItem(l)
    const last = blocks[blocks.length - 1]
    if (item) {
      const ordered = /^\d/.test(l)
      const clean = l.replace(/^([-*•]|\d+[.)])\s/, '')
      if (last?.list) last.items.push(clean)
      else blocks.push({ list: true, ordered, items: [clean] })
    } else if (last && !last.list) last.items.push(l)
    else blocks.push({ list: false, ordered: false, items: [l] })
  }
  return (
    <>
      {blocks.map((b, i) => b.list ? (
        b.ordered
          ? <ol key={i} className="mb-4 list-decimal space-y-1.5 pl-5 text-[14.5px] leading-relaxed text-ink-700 marker:text-ink-400">{b.items.map((x, j) => <li key={j}>{inline(x)}</li>)}</ol>
          : <ul key={i} className="mb-4 list-disc space-y-1.5 pl-5 text-[14.5px] leading-relaxed text-ink-700 marker:text-ink-300">{b.items.map((x, j) => <li key={j}>{inline(x)}</li>)}</ul>
      ) : (
        <p key={i} className="mb-4 text-[14.5px] leading-[1.7] text-ink-700 last:mb-0">{inline(b.items.join(' '))}</p>
      ))}
    </>
  )
}

function inline(s: string) {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') ? <strong key={i} className="font-semibold text-ink-900">{part.slice(2, -2)}</strong> : part))
}
