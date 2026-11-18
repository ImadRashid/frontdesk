import type { InMessage, Task } from './types.ts'
import { autoSendEnabledFor, findTaskByExternal, insertTask } from './db.ts'
import { autoSendEligible, sendReply } from './send.ts'
import { triage } from './triage.ts'

const inflight = new Set<string>()

// Run triage, store message + task, return the task. Dedupes on (channel_id, external_id).
export async function ingest(msg: InMessage): Promise<Task | null> {
  const key = `${msg.channel_id}|${msg.external_id}`
  const existing = findTaskByExternal(msg.channel_id, msg.external_id)
  if (existing) return existing
  if (inflight.has(key)) return null
  inflight.add(key)
  try {
    const result = await triage(msg)
    const task = insertTask(msg, result)
    const label = result.qualifies ? `lane=${result.lane} ${result.urgency ?? ''} ${result.category ?? ''}` : `filtered=${result.not_qualifying_reason}`
    console.log(`[ingest] ${msg.channel}/${msg.channel_id} ${label} mode=${result.mode} ${result.ms}ms $${result.cost_usd.toFixed(4)}`)
    if (task && autoSendEnabledFor(msg.channel_id) && autoSendEligible(task)) {
      try {
        return (await sendReply(task, task.draft!.trim(), { auto: true })) ?? task
      } catch (e) {
        console.warn(`[auto-send] ${task.id} failed, left for a person: ${(e as Error).message}`)
      }
    }
    return task
  } finally {
    inflight.delete(key)
  }
}
