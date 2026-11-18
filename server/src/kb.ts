// Help-center articles: built-in ones from kb/*.md (versioned with the code) plus documents admins upload
// in the app, stored as Markdown in data/kb/ (gitignored). Front matter: id, title, tags, source, added.
// Reloaded when files change. Long documents are split into sections for search, so a draft only sees
// the part of a 40-page PDF that matters.
import { readdirSync, readFileSync, statSync, existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'

export type Article = { id: string; title: string; tags: string[]; body: string; uploaded?: boolean; source?: string; added?: string; file?: string }

const KB_DIR = resolve(import.meta.dirname, '../../kb')
export const UPLOAD_DIR = resolve(import.meta.dirname, '../../data/kb')
export const FILE_DIR = join(UPLOAD_DIR, 'files')
let cache: { sig: string; articles: Article[] } = { sig: '', articles: [] }

function parse(file: string, raw: string): Article {
  let id = file.replace(/\.md$/, '')
  let title = id
  let tags: string[] = []
  let body = raw
  const extra: { source?: string; added?: string; file?: string } = {}
  const m = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/)
  if (m) {
    body = m[2]
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^(\w+)\s*:\s*(.*)$/)
      if (!kv) continue
      const v = kv[2].trim().replace(/^["']|["']$/g, '')
      if (kv[1] === 'id' && v) id = v
      else if (kv[1] === 'title' && v) title = v
      else if (kv[1] === 'source' && v) extra.source = v
      else if (kv[1] === 'added' && v) extra.added = v
      else if (kv[1] === 'file' && v) extra.file = v
      else if (kv[1] === 'tags') tags = v.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
    }
  }
  return { id, title, tags, body: body.trim(), ...extra }
}

function mdFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((f) => f.endsWith('.md') && !/^readme/i.test(f)).sort().map((f) => join(dir, f))
}

export function loadArticles(): Article[] {
  try {
    const builtIn = mdFiles(KB_DIR)
    // The eval sets FD_KB_BUILTIN_ONLY=1 so results don't depend on what admins uploaded locally.
    const uploaded = process.env.FD_KB_BUILTIN_ONLY === '1' ? [] : mdFiles(UPLOAD_DIR)
    const sig = [...builtIn, ...uploaded].map((f) => `${f}:${statSync(f).mtimeMs}`).join('|')
    if (sig === cache.sig) return cache.articles
    const name = (f: string) => f.split('/').pop()!
    const articles = [
      ...builtIn.map((f) => parse(name(f), readFileSync(f, 'utf8'))),
      ...uploaded.map((f) => ({ ...parse(name(f), readFileSync(f, 'utf8')), uploaded: true })),
    ]
    cache = { sig, articles }
    return articles
  } catch (e) {
    console.error('[kb] failed to load articles:', (e as Error).message)
    return cache.articles
  }
}

const STOP = new Set('a an the and or but if of to in on at for with by from is are was were be been am i you we they he she it my our your their me us this that these those do does did can could would should will have has had not no yes please hi hello thanks thank how what when where why which who there here as so just about into get got also any some all'.split(' '))

function tokens(s: string): string[] {
  return (s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t)).map(stem)
}
function stem(t: string): string {
  return t.replace(/(?:ing|ed|es|s)$/, '') || t
}

// ---------------------------------------------------------------- uploads
export function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'document'
}

export function saveUpload(a: { title: string; body: string; source: string; tags?: string[]; original?: { ext: string; data: Uint8Array } }): Article {
  mkdirSync(UPLOAD_DIR, { recursive: true })
  let id = `doc-${slugify(a.title)}`
  const taken = new Set(loadArticles().map((x) => x.id))
  for (let i = 2; taken.has(id); i++) id = `doc-${slugify(a.title)}-${i}`
  const clean = (v: string) => v.replace(/[\r\n]+/g, ' ').trim()
  const fm = [`id: ${id}`, `title: ${clean(a.title)}`, `tags: [${(a.tags ?? ['uploaded']).map(clean).join(', ')}]`,
    `source: ${clean(a.source)}`, `added: ${new Date().toISOString()}`]
  if (a.original) {
    mkdirSync(FILE_DIR, { recursive: true })
    writeFileSync(join(FILE_DIR, `${id}.${a.original.ext}`), a.original.data)
    fm.push(`file: ${id}.${a.original.ext}`)
  }
  writeFileSync(join(UPLOAD_DIR, `${id}.md`), `---\n${fm.join('\n')}\n---\n${a.body.trim()}\n`)
  return loadArticles().find((x) => x.id === id)!
}

export function deleteUpload(id: string): boolean {
  const f = join(UPLOAD_DIR, `${id}.md`)
  if (!/^[a-z0-9-]+$/.test(id) || !existsSync(f)) return false
  const file = loadArticles().find((x) => x.id === id)?.file
  unlinkSync(f)
  if (file && existsSync(join(FILE_DIR, file))) unlinkSync(join(FILE_DIR, file))
  return true
}

// Long documents become sections of ~1,500 characters, split on headings and paragraphs.
const CHUNK = 1500
function sections(a: Article): Article[] {
  if (a.body.length <= CHUNK * 1.4) return [a]
  const paras = a.body.split(/\n{2,}/)
  const out: string[] = []
  let cur = ''
  for (const p of paras) {
    const heading = /^#{1,3}\s/.test(p.trim())
    if (cur && (cur.length + p.length > CHUNK || (heading && cur.length > CHUNK / 3))) { out.push(cur); cur = '' }
    if (p.length > CHUNK * 1.5) {
      for (let i = 0; i < p.length; i += CHUNK) out.push(p.slice(i, i + CHUNK))
      continue
    }
    cur = cur ? `${cur}\n\n${p}` : p
  }
  if (cur) out.push(cur)
  return out.map((body, i) => ({ ...a, id: `${a.id}#${i + 1}`, title: `${a.title} (part ${i + 1} of ${out.length})`, body }))
}

export function search(query: string, k = 3): Article[] {
  const arts = loadArticles().flatMap(sections)
  if (!arts.length) return []
  const docs = arts.map((a) => {
    const titleT = tokens(`${a.title} ${a.tags.join(' ')}`)
    const bodyT = tokens(a.body)
    const all = [...titleT, ...titleT, ...titleT, ...bodyT] // title + tags weighted x3
    const tf = new Map<string, number>()
    for (const t of all) tf.set(t, (tf.get(t) || 0) + 1)
    return { a, tf, len: all.length }
  })
  const N = docs.length
  const avg = docs.reduce((s, d) => s + d.len, 0) / N
  const q = [...new Set(tokens(query))]
  const k1 = 1.4, b = 0.75
  const scored = docs.map((d) => {
    let score = 0
    for (const t of q) {
      const f = d.tf.get(t) || 0
      if (!f) continue
      const df = docs.filter((x) => x.tf.has(t)).length
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5))
      score += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / avg))
    }
    return { a: d.a, score }
  })
  return scored.filter((s) => s.score > 0.5).sort((x, y) => y.score - x.score).slice(0, k).map((s) => s.a)
}
