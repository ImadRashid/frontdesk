// Turns an uploaded document into plain text for the help center.
import { extractText, getDocumentProxy } from 'unpdf'
import mammoth from 'mammoth'

export type Extracted = { title: string; text: string; kind: 'pdf' | 'docx' | 'markdown' | 'text'; pages?: number; ext: string }

const titleFrom = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()

// PDF text comes out one printed line per line. Join lines back into paragraphs, keep bullets and headings.
const BULLET = /^\s*(?:[•●▪◦‣∙·\-*–]|\d{1,2}[.)])\s+/
export function reflow(t: string): string {
  const lines = t.replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+$/, ''))
  const out: string[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) { if (out.length && out[out.length - 1] !== '') out.push(''); continue }
    const isBullet = BULLET.test(line)
    const normalized = isBullet ? `- ${line.replace(BULLET, '')}` : line
    const prev = out.length ? out[out.length - 1] : ''
    const prevIsHeading = prev.length > 0 && prev.length < 60 && !/[.,;:!?]$/.test(prev) && /^[A-Z0-9]/.test(prev) && !prev.startsWith('- ')
    const joinable = prev !== '' && !isBullet && !/[.!?:]$/.test(prev) && !prevIsHeading && /^[a-z(\d,;]/.test(line)
    const continuesBullet = prev.startsWith('- ') && !isBullet && !/[.!?]$/.test(prev) && /^[a-z(]/.test(line)
    if (joinable || continuesBullet) out[out.length - 1] = `${prev} ${line}`
    else {
      if (isBullet && prev !== '' && !prev.startsWith('- ')) out.push('')
      if (!isBullet && prev.startsWith('- ')) out.push('')
      if (prevIsHeading && out[out.length - 1] !== '') out.push('')
      out.push(normalized)
    }
  }
  return out.join('\n')
}

function tidy(t: string): string {
  return t.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim()
}

export async function extractDocument(name: string, data: Uint8Array): Promise<Extracted> {
  const ext = (name.split('.').pop() || '').toLowerCase()
  let text = ''
  let kind: Extracted['kind']
  let pages: number | undefined
  if (ext === 'pdf') {
    kind = 'pdf'
    const pdf = await getDocumentProxy(data)
    const r = await extractText(pdf, { mergePages: false })
    pages = r.totalPages
    text = (r.text as string[]).map(reflow).join('\n\n')
  } else if (ext === 'docx') {
    kind = 'docx'
    text = reflow((await mammoth.extractRawText({ buffer: Buffer.from(data) })).value)
  } else if (['md', 'markdown', 'txt', 'text'].includes(ext)) {
    kind = ext === 'txt' || ext === 'text' ? 'text' : 'markdown'
    text = new TextDecoder().decode(data).replace(/^---[\s\S]*?\n---\s*\n/, '')
  } else {
    throw new Error('Upload a PDF, Word (.docx), Markdown or text file.')
  }
  text = tidy(text)
  if (text.replace(/\s/g, '').length < 40) {
    throw new Error(kind === 'pdf'
      ? 'This PDF has no readable text (it is probably a scan). Export it with text, or paste the content instead.'
      : 'This file has almost no text in it.')
  }
  return { title: titleFrom(name), text, kind, pages, ext }
}
