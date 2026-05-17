export interface NumberedProtocolStep {
  index: number;
  text: string;
  sourceLine: number;
}

const NUMBERED_STEP_RE = /^\s*(\d+)\.\s*(.*)$/;

function normalizeStepText(lines: string[]): string {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts compiler-facing protocol steps from a Markdown meta-prompt.
 *
 * A step starts at a line beginning with `N.` and continues until the first
 * blank line or the next numbered step. Paragraphs between numbered steps are
 * treated as author notes for parser-eval purposes.
 */
export function extractNumberedProtocolSteps(markdown: string): NumberedProtocolStep[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const steps: NumberedProtocolStep[] = [];
  let active:
    | {
        index: number;
        sourceLine: number;
        lines: string[];
      }
    | undefined;

  function flushActive(): void {
    if (!active) return;
    const text = normalizeStepText(active.lines);
    if (text.length > 0) {
      steps.push({
        index: active.index,
        text,
        sourceLine: active.sourceLine,
      });
    }
    active = undefined;
  }

  lines.forEach((line, lineIndex) => {
    const stepMatch = line.match(NUMBERED_STEP_RE);
    if (stepMatch) {
      flushActive();
      active = {
        index: Number.parseInt(stepMatch[1]!, 10),
        sourceLine: lineIndex + 1,
        lines: [stepMatch[2] ?? ''],
      };
      return;
    }

    if (!active) return;

    if (line.trim().length === 0) {
      flushActive();
      return;
    }

    active.lines.push(line);
  });

  flushActive();
  return steps;
}

export function extractNumberedProtocolPrompt(markdown: string): string {
  return extractNumberedProtocolSteps(markdown)
    .map((step) => step.text)
    .join('\n');
}
