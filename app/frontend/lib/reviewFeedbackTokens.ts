// Client mirror of ReviewFeedbackFormatter (app/services/review_feedback_formatter.rb) — keep in sync.
// `@user` is the project owner, `@Display Name` a known user, `/proj/` the project (linked to its repo).

export const OWNER_ALIAS = 'user'
export const PROJECT_TOKEN = '/proj/'

export type FeedbackSegment =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; text: string; name: string }
  | { kind: 'unresolved'; text: string }
  | { kind: 'project'; text: string }

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// `names` maps downcased display names (plus OWNER_ALIAS) to the display name shown in previews.
export function tokenizeFeedback(text: string, names: Map<string, string>): FeedbackSegment[] {
  const alts = [...names.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp)
  const pattern = new RegExp(
    `(${escapeRegExp(PROJECT_TOKEN)})|(?<![\\p{L}\\p{N}_])@(${alts.join('|')})(?![\\p{L}\\p{N}_])|((?<![\\p{L}\\p{N}_])@[\\p{L}\\p{N}_.-]+)`,
    'giu',
  )
  const segments: FeedbackSegment[] = []
  let last = 0
  for (const m of text.matchAll(pattern)) {
    if (m.index > last) segments.push({ kind: 'text', text: text.slice(last, m.index) })
    if (m[1]) segments.push({ kind: 'project', text: m[0] })
    else if (m[2]) segments.push({ kind: 'mention', text: m[0], name: names.get(m[2].toLowerCase()) ?? m[2] })
    else segments.push({ kind: 'unresolved', text: m[0] })
    last = m.index + m[0].length
  }
  if (last < text.length) segments.push({ kind: 'text', text: text.slice(last) })
  return segments
}
