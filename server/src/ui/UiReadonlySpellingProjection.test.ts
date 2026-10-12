/**
 * W2-8-FIX2 D1 (declarative source) — the ui YAML `readonly:` spelling must
 * survive into the projection as slot.readOnly.
 *
 * schema/ui/ui-v1.schema.yaml declares the field-hint keyword `readonly`
 * (line ~156) and every *.ui.yaml in the repo spells it `readonly: true`
 * (protocol.ui.yaml's Intent/Provenance hint sections included). The app-side
 * helper accepts both spellings (formHelpers.isFieldReadonly), but the server
 * fallback projection read only `readOnly` — so the read-only intent hints
 * projected as EDITABLE slots and the MEANT editor rendered them as live
 * inputs over data the ui spec declares read-only.
 */
import { describe, expect, it } from 'vitest';
import type { UISpec } from './types.js';
import { projectRecord } from './EditorProjectionService.js';

function uiSpecWithReadonlySpelling(): UISpec {
  return {
    uiVersion: 1,
    schemaId: 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml',
    form: {
      layout: 'sections',
      sections: [
        {
          title: 'Protocol',
          fields: [
            { path: '$.title', widget: 'text', label: 'Title' },
          ],
        },
        {
          title: 'Intent',
          fields: [
            // The exact spelling protocol.ui.yaml ships.
            { path: '$.steps[*].intent.semanticVerb', widget: 'ref', label: 'Semantic verb', readonly: true } as never,
            { path: '$.steps[*].intent.provenance', widget: 'ref', label: 'Provenance', readonly: true } as never,
          ],
        },
      ],
    },
  };
}

describe('fallback projection honours the YAML readonly: spelling (D1)', () => {
  it('projects a `readonly: true` field hint as a read-only slot', () => {
    const result = projectRecord(
      uiSpecWithReadonlySpelling(),
      { title: 'x' },
      'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml',
      'PRT-READONLY-SPELLING',
    );
    const verb = result.slots.find((s) => s.path === '$.steps[*].intent.semanticVerb');
    const prov = result.slots.find((s) => s.path === '$.steps[*].intent.provenance');
    expect(verb, 'hint slot must still project').toBeTruthy();
    expect(verb!.readOnly, 'the declared readonly hint must project read-only').toBe(true);
    expect(prov!.readOnly).toBe(true);
    // Editable fields are unaffected.
    const title = result.slots.find((s) => s.path === '$.title');
    expect(title!.readOnly).toBe(false);
  });
});
