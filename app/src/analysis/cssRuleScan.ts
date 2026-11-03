/**
 * L1-PIN-HARDEN-1 — brace-depth CSS rule scanner for the FAME-8 GATEFIX5
 * cell-render source pin (ViewRenderer.cellrender.test.tsx).
 *
 * The pre-fix parser was line-anchored (`matchAll(/^([^{}\/][^{]*)\{([^}]*)\}
 * \s*$/gm)`): a rule nested inside @media/@supports/@layer/@container was
 * invisible to it, so a responsive override reintroducing
 * `overflow-wrap: anywhere` on a `.view-spec__table` cell passed the pin
 * (adv-cycle-3 observation O1, FAME-8-GATEFIX5 review). This scanner walks
 * the stylesheet tracking `{}` depth plus comment/string state, and emits
 * each style rule with `selector`, `decls`, and `atContext` — the chain of
 * enclosing at-rule preludes. No parser dependency (no postcss/css-tree):
 * a ~60-line brace scanner is the point (item contract).
 */

export interface CssRule {
  selector: string
  decls: string
  /**
   * Chain of enclosing at-rule preludes, outermost first, e.g.
   * `['@media (max-width: 900px)']`. Empty for an unconditional rule.
   * The pin's floor and door claims are satisfied ONLY by rules with an
   * empty chain — a rule declared only inside an at-rule must not count.
   */
  atContext: string[]
}

/**
 * Parse a stylesheet into style rules, nesting-aware.
 *
 * Comments are stripped FIRST: the GATEFIX5 history/architect prose
 * legitimately contains the words `overflow-wrap: anywhere`, so matching
 * the raw text would be wrong. Block comments only — no string literals
 * carry `/*` in the pinned file. (Rationale carried over verbatim from the
 * pre-fix parser.)
 */
export function parseCssRules(css: string): CssRule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules: CssRule[] = []
  let atContext: string[] = []
  let prelude = ''
  let quote: '"' | "'" | null = null
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (quote) {
      if (ch === quote) quote = null
      prelude += ch
      i += 1
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      prelude += ch
      i += 1
      continue
    }
    if (ch === ';') {
      // Statement-level terminator at prelude position (e.g.
      // `@import url(...)`); discard the prelude so it cannot bleed into
      // the next rule's head.
      prelude = ''
      i += 1
      continue
    }
    if (ch === '{') {
      const head = prelude.trim()
      prelude = ''
      if (head.startsWith('@')) {
        // At-rule with a body: its prelude becomes context for everything
        // nested inside it (@media/@supports/@layer/@container alike).
        atContext.push(head)
      } else {
        // Style rule: capture decls until THIS rule's own closing brace;
        // inner braces (CSS nesting) are tracked so a nested `}` cannot end
        // the rule early.
        let j = i + 1
        let inner = 0
        let dquote: '"' | "'" | null = null
        let decls = ''
        while (j < text.length) {
          const c = text[j]
          if (dquote) {
            decls += c
            if (c === dquote) dquote = null
          } else if (c === '"' || c === "'") {
            dquote = c
            decls += c
          } else if (c === '{') {
            inner += 1
            decls += c
          } else if (c === '}') {
            if (inner === 0) break
            inner -= 1
            decls += c
          } else {
            decls += c
          }
          j += 1
        }
        rules.push({ selector: head, decls: decls.trim(), atContext: atContext.slice() })
        i = j + 1
        continue
      }
      i += 1
      continue
    }
    if (ch === '}') {
      // Closes the innermost open at-rule body.
      if (atContext.length > 0) atContext.pop()
      i += 1
      continue
    }
    prelude += ch
    i += 1
  }
  return rules
}

// ---------------------------------------------------------------------------
// Selector-part logic: moved VERBATIM from the test file (unchanged logic —
// the pin extends the pre-existing split/guard semantics, it does not
// re-derive them; reviews D4/D5).
// ---------------------------------------------------------------------------

/**
 * Split a selector list on its TOP-LEVEL commas only: commas inside `()`
 * (functional pseudo-classes such as `:is(th, td)`) or `[]` (attribute
 * selectors) are part of one selector part. A naive `split(',')` tears
 * `.view-spec__table :is(th, td)` into `.view-spec__table :is(th` + ` td)`,
 * neither of which names a cell selector (review D4).
 */
export function splitSelectorParts(selector: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of selector) {
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  parts.push(current)
  return parts.map((p) => p.trim())
}

/**
 * True when ONE selector part targets a `.view-spec__table` cell: it is scoped
 * under `.view-spec__table` (with or without a `table` tag prefix) and carries
 * a standalone `th` or `td` tag token. Descendant/child/sibling combinators,
 * pseudo-classes and pseudo-elements are tolerated, INCLUDING functional
 * pseudo-classes (`:is(th, td)`) — the token may be preceded by any
 * non-identifier character, so `(` and `:` do not hide it (review D4).
 * `thead`/`tbody`/`.view-spec__table-cell` are not `th`/`td`: the trailing
 * `(?![\w-])` guard rejects them. Both regexes are case-insensitive because
 * CSS type selectors are case-insensitive in an HTML document (review D5).
 */
export function isTableCellSelectorPart(part: string): boolean {
  const scopedToTable = /\.view-spec__table(?![\w-])/.test(part)
  const cellToken = /(?:^|[^\w-])(?:th|td)(?![\w-])/i.test(part)
  return scopedToTable && cellToken
}
