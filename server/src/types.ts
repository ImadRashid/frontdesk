export type ChannelType = 'email' | 'whatsapp' | 'test'
export type InMessage = {
  channel: ChannelType; channel_id: string; external_id: string
  from_name: string; from_address: string            // email address or WhatsApp number/jid
  subject: string | null; text: string; received_at: string  // ISO
  thread_key?: string | null; headers?: Record<string, string>
}
export type Category = 'how_to' | 'bug' | 'outage' | 'billing' | 'refund' | 'account_access' | 'cancellation'
  | 'feature_request' | 'data_privacy' | 'other'
export type NonQualifying = 'spam' | 'newsletter' | 'automated' | 'personal'
export type Urgency = 'P1' | 'P2' | 'P3' | 'P4'
export type Lane = 'reply' | 'review' | 'escalated'          // reply = ready to approve; review = needs a look; escalated = specialist/human only
export type Team = 'support' | 'billing' | 'engineering' | 'success' | 'privacy'
export type Flag = { kind: 'injection' | 'pii' | 'promise' | 'unsupported_fact' | 'no_source' | 'language' | 'policy' | 'low_confidence' | 'ai_unavailable'; text: string }
export type TriageResult = {
  qualifies: boolean; not_qualifying_reason: NonQualifying | null
  category: Category | null; urgency: Urgency | null; sentiment: 'angry' | 'negative' | 'neutral' | 'positive'
  language: string                    // ISO-639-1, e.g. 'en', 'ko', 'ur'
  summary: string                     // one line, English
  team: Team | null; lane: Lane | null
  reasons: string[]                   // why this lane/urgency, short, human-readable
  draft: string | null                // reply in the customer's language; null when lane=escalated or AI unavailable
  sources: { id: string; title: string }[]
  flags: Flag[]
  confidence: 'high' | 'medium' | 'low'
  injection: string[]; pii_masked: number
  mode: 'ai' | 'rules'; model: string; cost_usd: number; ms: number
}

export type TaskStatus = 'open' | 'done' | 'dismissed'
export type Task = InMessage & TriageResult & {
  id: string; status: TaskStatus; created_at: string; sent_at: string | null
  final_reply: string | null; edited: boolean; channel_name: string; auto_sent: boolean
}
export type ChannelStatus = 'connected' | 'connecting' | 'paused' | 'error'
export type Channel = {
  id: string; type: ChannelType; name: string; address: string; status: ChannelStatus
  detail: string; last_message_at: string | null; qr?: string | null; message_count: number; auto_send: boolean
}
