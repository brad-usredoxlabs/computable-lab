/**
 * L1-PIN-HARDEN-1 — brace-depth CSS rule scanner for the FAME-8 GATEFIX5
 * cell-render source pin (ViewRenderer.cellrender.test.tsx).
 *
 * The pre-fix parser was line-anchored (`matchAll(/^([^{}\\/][^{]*)\{([^}]*)\}
 * \s*$/gm)`): a rule nested inside @media/@supports/@layer/@container was
 * invisible to it, so a responsive override reintroducing
 * `overflow-wrap: anywhere` on a `.view-spec__table` cell passed the pin
 * (adv-cycle-3 observation O1, FAME-8-GATEFIX5 review). This scanner walks
 * the stylesheet tracking `{}` depth plus comment/string state, and emits
 * each style rule with `selector`, `decls`, and `atContext` — the chain of
 * enclosing at-rule preludes. No parser dependency (no postcss/css-tree):
 * a ~60-line brace scanner is the point (item contract).
 *
 * FIX RUN 1 (adversarial review advc1, defect 1 + §3 cases 13/14/17): the
 * first version swallowed any `{ … }` block inside a style rule's decls
 * verbatim, so two more native CSS Nesting shapes evaded the pin (both
 * valid browser CSS; app/ has no postcss config, so Vite ships them
 * untouched):
 *   - an at-rule nested INSIDE a style rule (review §3 case 13):
 *     `.analyses { @media (…) { .view-spec__table td { overflow-wrap:
 *       anywhere; } } }` — the whole conditional group became ".analyses"
 *     decl text and the inner rule was never emitted;
 *   - a `&`-prefixed nested style rule (review §3 case 14):
 *     `.view-spec__table { & td { overflow-wrap: anywhere; } }` — the
 *     nested selector `& td` was never desugared, so the ban's token
 *     check saw no `th`/`td` at all.
 * Both are now recursed into: a `{` inside a style rule's declaration body
 * starts a nested construct whose selector is resolved against the parent
 * (a bare `&` IS the parent selector; `& td` -> parent + " td") and whose
 * body is parsed with the same rules. An at-rule nested inside a style
 * rule pushes its prelude onto the context chain exactly like a top-level
 * one; declarations written directly under it (no selector of their own)
 * apply to the PARENT selector per the CSS Nesting spec, so they are
 * emitted as a separate rule carrying the parent's selector WITH the
 * extended `atContext` — never merged into the parent's unconditional
 * decls (a conditional `break-word` must not satisfy the unconditional
 * floor). Case 17 of the review's battery: CSS escape-encoded selector
 * tokens (`\74 d` is `td` with a hex escape) are decoded via
 * `decodeCssEscapes` before the pin's selector checks — generic CSS
 * syntax handling, no domain-specific knowledge. The pin must never
 * silently accept a nested override of the shatter property: every shape
 * either emits the offending rule or fails closed (an unbalanced `{`
 * keeps the rest of the file inside the open rule's scope, so nothing
 * after it can satisfy the unconditional floor).
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
        i += 1
        continue
      }
      // Style rule: capture decls until THIS rule's own closing brace;
      // inner braces (CSS nesting) are tracked so a nested `}` cannot end
      // the rule early, then recurse into the body for nested constructs.
      const [body, end] = captureBlock(text, i + 1)
      const [ownDecls, nested] = scanDecls(body, atContext.slice(), head)
      rules.push({ selector: head, decls: ownDecls, atContext: atContext.slice() })
      rules.push(...nested)
      i = end + 1
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

/**
 * Resolve a nested rule's selector against its parent (CSS Nesting `&`
 * semantics, desugared per the spec's `:is()` equivalence). Returns every
 * composed selector. Resolution NEVER drops the parent chain — every
 * emitted selector is ONE selector part composed under ONE parent part, so
 * the pin's top-level comma split can never re-split an emission into a
 * scope-less part:
 *  - a nested head ALWAYS composes under its parent chain;
 *  - a head that is itself a selector list is distributed PART-BY-PART —
 *    the cartesian product parentParts x headParts — over the parent list,
 *    never parent x the joined head string. Prefixing the whole head made
 *    every head part after the first escape the parent chain (`.view-
 *    spec__table { .wrap, td { … } }` emitted `.view-spec__table .wrap,
 *    td`; the re-split `td` part carried no scope at all) — the advc3
 *    blocker;
 *  - a bare `&` IS the parent selector itself;
 *  - `&` followed by whitespace (or end of input) descends from the parent
 *    (`& td` -> `parent td`);
 *  - `&` glued to a compound suffix (`&.x`, `&:hover`) compounds with the
 *    parent (`parent.x`, `parent:hover`);
 *  - a selector WITHOUT `&` composes against the parent as an implicit
 *    descendant (`parent head`). This is the relaxed CSS-Nesting behaviour
 *    shipped by current engines and by Vite as-is: `.view-spec__table { td
 *    { … } }` means `.view-spec__table { & td { … } }`. Dropping the
 *    parent would hide text from the ban and is exactly what this branch
 *    must not do;
 *  - an `&` in an AMBIGUOUS position (not the leading token of the part,
 *    e.g. `:is(&) td`, `td &`): every `&` in THAT head part is replaced by
 *    the parent per the `:is()` equivalence, and the part is additionally
 *    composed as an implicit descendant — the substitution operates on the
 *    split part, never on the joined head string (that collapsed the head
 *    list into one emission). The composed forms may be over-broad —
 *    over-flagging is acceptable for this pin; an emitted selector part
 *    that escapes its parent chain is not.
 * Empty head-list parts (e.g. a trailing comma) are filtered — a bare
 * parent or a blank tail is never emitted. Product duplicates are possible
 * and harmless for the pin. Composition applies ONLY when the parent is a
 * style rule — this function is called from `scanDecls` (a style-rule
 * body) and never for top-level heads or heads written directly inside
 * at-rules (those keep their head unmodified with the at-rule prelude in
 * `atContext`).
 */
function resolveNestedSelectors(head: string, parent: string): string[] {
  if (head === '&') return [parent]
  const parentParts = splitSelectorParts(parent).filter((p) => p.length > 0)
  const headParts = splitSelectorParts(head).filter((h) => h.length > 0)
  const out: string[] = []
  // Cartesian product parentParts x headParts: each head part is resolved
  // against each parent part on its own, so every emitted selector keeps
  // the full parent chain (no joined-head emissions, no empty parts).
  for (const p of parentParts) {
    for (const part of headParts) {
      if (part === '&') {
        // A bare `&` inside a head list IS that parent part itself.
        out.push(p)
      } else if (part.startsWith('&')) {
        // `&` followed by whitespace descends from the parent (`& td` ->
        // `parent td`); `&` glued to a compound suffix compounds
        // (`&.x` -> `parent.x`).
        const rest = part.slice(1)
        if (/^[\s]/.test(rest)) {
          out.push(`${p} ${rest.trimStart()}`)
        } else {
          out.push(`${p}${rest}`)
        }
      } else if (part.includes('&')) {
        // Ambiguous `&` placement in this part: substitute per the
        // `:is()` equivalence AND compose as an implicit descendant. Both
        // forms retain the parent part. (Function replacement so a `$` in
        // the parent text stays literal; `replace(/&/g, …)` instead of
        // `replaceAll` — the project's tsc lib target predates ES2021.)
        out.push(part.replace(/&/g, () => p))
        out.push(`${p} ${part}`)
      } else {
        // No `&` in this part: relaxed nesting — implicit descendant.
        out.push(`${p} ${part}`)
      }
    }
  }
  return out
}

/**
 * Find the matching `}` for the `{` just before `start`, tracking brace
 * depth and string state. Returns the body text (inner content, raw) and
 * the index of the closing `}` (or `text.length - 1` if unbalanced —
 * fail-closed: the remainder stays inside this rule's scope).
 */
function captureBlock(text: string, start: number): [string, number] {
  let j = start
  let inner = 0
  let dquote: '"' | "'" | null = null
  let body = ''
  while (j < text.length) {
    const c = text[j]
    if (dquote) {
      body += c
      if (c === dquote) dquote = null
    } else if (c === '"' || c === "'") {
      dquote = c
      body += c
    } else if (c === '{') {
      inner += 1
      body += c
    } else if (c === '}') {
      if (inner === 0) break
      inner -= 1
      body += c
    } else {
      body += c
    }
    j += 1
  }
  return [body, j]
}

/**
 * Walk a style rule's declaration body. Text accumulates into a pending
 * buffer; a `;` commits the pending run (plus the `;`) to this rule's own
 * `decls` (in valid CSS a rule body's `;` separates declarations only —
 * at-rule preludes use commas, not semicolons); a `{` takes the pending
 * run as the NESTED construct's head:
 *  - an at-rule (`@…`): push its prelude onto the context chain and parse
 *    its contents with the same rules. Declarations written directly
 *    under it (no selector) apply to the PARENT selector when the
 *    condition holds (CSS Nesting spec §2.3), so they are emitted as a
 *    separate rule — parent selector, extended `atContext` — NEVER merged
 *    into the parent's own (unconditional) decls, so a conditional
 *    `break-word` cannot satisfy the unconditional floor;
 *  - a nested STYLE rule: resolve its selector against the parent (`&`
 *    semantics above) and recurse with it as the new nesting scope,
 *    carrying the current `atContext` chain;
 *  - an EMPTY head (malformed: `{` with no selector): fail closed — parse
 *    what is inside it anyway (children remain visible to the pin) and
 *    merge its plain decls into the parent's own decls (any
 *    `overflow-wrap: anywhere` there stays visible to the ban).
 * Returns `[decls, nestedRules]`. `decls` is the parent's own declaration
 * text (outer whitespace trimmed, inner text raw — parity with the
 * pre-fix parser's `.trim()`).
 */
function scanDecls(
  body: string,
  atContext: string[],
  parentSelector: string,
): [string, CssRule[]] {
  const nested: CssRule[] = []
  let decls = ''
  let pending = ''
  let quote: '"' | "'" | null = null
  let i = 0
  while (i < body.length) {
    const ch = body[i]
    if (quote) {
      if (ch === quote) quote = null
      pending += ch
      i += 1
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      pending += ch
      i += 1
      continue
    }
    if (ch === ';') {
      // Declaration terminator: commit the pending run to this rule's own
      // decls and reset it so a later statement cannot bleed into a
      // nested head.
      decls += pending + ';'
      pending = ''
      i += 1
      continue
    }
    if (ch === '{') {
      const head = pending.trim()
      pending = ''
      const [innerBody, end] = captureBlock(body, i + 1)
      if (head.startsWith('@')) {
        // Conditional group nested inside a style rule (CSS Nesting
        // spec §2.3). Its contents are a rule list scoped to the PARENT
        // style rule; recurse with the extended context chain.
        const childContext = [...atContext, head]
        const [childDecls, childRules] = scanDecls(innerBody, childContext, parentSelector)
        if (childDecls) {
          // Declarations directly under the condition apply to the parent
          // selector ONLY while the condition holds — a separate rule with
          // the extended chain, never part of the parent's own decls.
          nested.push({ selector: parentSelector, decls: childDecls, atContext: childContext })
        }
        nested.push(...childRules)
      } else if (head) {
        // Nested style rule: resolve against the parent and recurse (its
        // own body may nest further). Resolution may return MULTIPLE
        // selectors (a head with no `&` distributes over a parent
        // selector list); each emitted rule carries the same decls and
        // the current atContext chain.
        const selectors = resolveNestedSelectors(head, parentSelector)
        const [ownDecls, grandChild] = scanDecls(innerBody, atContext.slice(), selectors.join(', '))
        for (const selector of selectors) {
          nested.push({ selector, decls: ownDecls, atContext: atContext.slice() })
        }
        nested.push(...grandChild)
      } else {
        // Empty head (invalid CSS): fail closed — the block's plain decls
        // merge into the parent's own decls and its children are still
        // parsed, so nothing inside it can hide from the pin.
        const [childDecls, childRules] = scanDecls(innerBody, atContext.slice(), parentSelector)
        decls += childDecls
        nested.push(...childRules)
      }
      i = end + 1
      continue
    }
    if (ch === '}') {
      // Stray close inside a decl body: captureBlock already bounded the
      // body, so this is malformed input — stop accumulating (fail
      // closed; nothing after a stray `}` can be attributed).
      break
    }
    pending += ch
    i += 1
  }
  decls += pending
  return [decls.trim(), nested]
}

/**
 * Decode CSS escape sequences in a selector string (generic CSS syntax,
 * no domain values): a `\XX` hex escape (1-6 hex digits) becomes the code
 * point and a single following whitespace character is the escape
 * terminator (consumed); a backslash before a non-hex character escapes
 * that character (`\_` -> `_`); a trailing backslash is dropped.
 * Review §3 case 17: `.view-spec__table \74 d` is `.view-spec__table td`
 * with the cell token escape-encoded — without decoding, the pin's token
 * check could be evaded by writing `td` as a hex escape. The pin applies
 * this to each rule's selector before its selector checks, so escape-
 * encoded evasion and plain-text evasion are pinned identically.
 */
export function decodeCssEscapes(s: string): string {
  let out = ''
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (ch !== '\\') {
      out += ch
      i += 1
      continue
    }
    const next = s[i + 1]
    if (next === undefined) break // trailing backslash: drop it
    const hexDigits = s.slice(i + 1, i + 7).match(/^[0-9a-fA-F]+/)?.[0] ?? ''
    if (hexDigits.length > 0) {
      out += String.fromCodePoint(parseInt(hexDigits.slice(0, 6), 16))
      i += 1 + hexDigits.length
      // A single following whitespace char terminates the hex escape.
      const after = s[i]
      if (after === ' ' || after === '\t' || after === '\n' || after === '\r' || after === '\f') {
        i += 1
      }
    } else {
      out += next
      i += 2
    }
  }
  return out
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
