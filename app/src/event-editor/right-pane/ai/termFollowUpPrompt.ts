/**
 * The two turns the term panel can send.
 *
 * Both are ordinary user turns — the panel does not get its own channel. A
 * confirmed term is expressed as the mention the loop already understands
 * (`[[material:MSP-1|1 mM Clofibrate in DMSO]]`), and a clarified term is a
 * redraft request carrying the biologist's own sentence. Keeping them as plain
 * turns means the harness's existing grounding, binding and gating all apply.
 */
import type { TermClarification, TermConfirmation } from './TermPanel'

/** "Use [[material-spec:MSP-1|1 mM Clofibrate in DMSO]] for material." */
export function termConfirmPrompt(confirmation: TermConfirmation): string {
  const { label, mention, existingTermId } = confirmation
  // SlashMention is a union; the variants a term pick can produce (material,
  // labware, protocol) all carry an id, and the guard says so in the type system
  // rather than asserting it.
  if (mention && 'id' in mention) {
    return `Use [[${mention.type}:${mention.id}|${mention.label}]] for "${label}".`
  }
  if (existingTermId) {
    return `Use the existing term ${existingTermId} for "${label}".`
  }
  return `"${label}" is a new local term — keep it, and create the record on accept.`
}

/** "Redraft. On the term "F praus": means F. prausnitzii, the gut commensal." */
export function termClarifyPrompt(clarification: TermClarification): string {
  return `Redraft. On the term "${clarification.label}": ${clarification.text.trim()}`
}
