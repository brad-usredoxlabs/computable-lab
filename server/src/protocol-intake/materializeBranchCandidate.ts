import { conceptKey, parseBranchOption } from '../ingestion/vendor-protocol/deriveBranchAxes.js';
import type { ProtocolCandidate } from '../ingestion/vendor-protocol/types.js';
import type { DecisionTreeAxis } from './deriveDecisionTree.js';

/** Match extracted quotations despite PDF whitespace and trademark glyphs. */
function normalized(text: string) {
  let value = '';
  const offsets: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (/[™®©]/u.test(char)) continue;
    if (/\s/u.test(char)) {
      if (!value || value.endsWith(' ')) continue;
      value += ' ';
    } else value += char;
    offsets.push(i);
  }
  return { value: value.trimEnd(), offsets };
}

function replaceQuote(text: string, quote: string, replacement: string): string {
  const source = normalized(text);
  const wanted = normalized(quote).value.trim();
  const start = source.value.indexOf(wanted);
  if (!wanted || start < 0 || source.value.indexOf(wanted, start + 1) >= 0) return text;
  const end = source.offsets[start + wanted.length - 1]! + 1;
  return text.slice(0, source.offsets[start]) + replacement + text.slice(end);
}

/** A branch is a specialized copy; the persisted vendor candidate stays verbatim.
 * Choice values here are condition ids, exactly as supplied by the review UI.
 */
export function materializeBranchCandidate(
  candidate: ProtocolCandidate,
  axes: DecisionTreeAxis[],
  choices: Record<string, string>,
): ProtocolCandidate {
  for (const axis of axes) {
    if (!axis.sectionId && axis.conditions.length && !choices[axis.axisId]) throw new Error(`Missing choice for ${axis.axisId}`);
  }
  const selected = axes.flatMap((axis) => {
    const id = choices[axis.axisId];
    if (!id) return [];
    const condition = axis.conditions.find((c) => c.id === id);
    if (!condition) throw new Error(`Unknown choice ${id} for ${axis.axisId}`);
    return [{ axis, condition }];
  });
  const activeSteps = candidate.steps.filter((step) => axes.every((axis) => {
    if (!axis.conditions.some((condition) => condition.then_stepIds?.includes(step.id))) return true;
    return selected.some((s) => s.axis.axisId === axis.axisId && s.condition.then_stepIds?.includes(step.id));
  }));
  const applicableSteps = activeSteps.filter((step) => {
    const text = normalized(step.sourceText).value;
    if (!/^(?:if|when) using\b/i.test(text)) return true;
    const subject = conceptKey(parseBranchOption(text).subject.replace(/^the\s+/i, ''));
    for (const { axis, condition } of selected) {
      if (axis.origin !== 'document_branch') continue;
      const options = axis.conditions.filter((c) => c.label && conceptKey(parseBranchOption(c.label).subject) === subject);
      if (options.length === 1 && options[0]!.id !== condition.id) return false;
    }
    return true;
  });
  const steps = applicableSteps.map((step) => {
    let sourceText = step.sourceText;
    let branches = step.branches;
    for (const { axis, condition } of selected) {
      if (!condition.then_stepIds?.includes(step.id)) continue;
      if (axis.origin === 'document_branch' && branches.length > 1) {
        const predicate = condition.predicate as { value?: unknown } | undefined;
        const selectedKey = predicate?.value;
        const matching = branches.filter((branch) => {
          const parsed = parseBranchOption(branch);
          return parsed.key === selectedKey || conceptKey(parsed.subject) === selectedKey;
        });
        if (matching.length === 1) {
          for (const branch of branches) {
            const parsed = parseBranchOption(branch);
            sourceText = replaceQuote(sourceText, branch, branch === matching[0] ? (parsed.action ?? branch) : '');
          }
          branches = [];
        }
      }
      if (axis.origin === 'document_table') {
        const tables = candidate.tables.filter((table) => table.rows.some((row) => row[table.headers[0]!] === condition.label));
        if (tables.length !== 1) continue;
        const table = tables[0]!;
        const row = table.rows.find((r) => r[table.headers[0]!] === condition.label)!;
        // Some extractors include the following note's prefix in sourceText.
        // Replace only the table, keeping the complete note in the step.
        const quote = table.sourceText.split(/\bNote:/u)[0]!.trim();
        sourceText = replaceQuote(sourceText, quote, table.headers.map((header) => `${header}: ${row[header]}`).join('; ') + '.');
      }
    }
    if (sourceText === step.sourceText) return step;
    sourceText = sourceText.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return { ...step, sourceText, branches, actions: [{ actionKind: 'other' as const, sourceText, provenance: step.provenance }] };
  });
  return { ...candidate, steps };
}
