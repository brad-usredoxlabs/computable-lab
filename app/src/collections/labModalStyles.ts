/**
 * labModalStyles — the single shared stylesheet authority for the `.lab-modal`
 * dialog shell (backdrop, panel, header, body, rows, footer, save/cancel).
 *
 * Moved verbatim out of LabwareInstanceCreateModal.tsx (gate D1,
 * L2-LABINV-SEEDLAB-browser-g1-l2t2210): MaterialReceivingDoor renders the same
 * class names but only declared its own __result/__refusal/__hint rules, so its
 * backdrop stayed in normal flow and the workspace pane swallowed every click.
 * One module, two importers — do not paste a second copy of these rules.
 */
export const labModalStyles = `
.lab-modal__backdrop {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center; padding: 24px;
}
.lab-modal {
  background: var(--cl-bg-elev); color: var(--cl-text);
  border: 1px solid var(--cl-border); border-radius: 8px;
  width: min(480px, 96vw); display: flex; flex-direction: column;
  /* g3 D6 tall state: cap against the viewport (48px = the backdrop's 24px gutters),
     so a tall dialog never pushes its header/close/footer off screen. */
  max-height: calc(100vh - 48px);
  box-shadow: 0 16px 48px rgba(0,0,0,0.4);
}
.lab-modal__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border-bottom: 1px solid var(--cl-border);
}
.lab-modal__header h2 { margin: 0; font-size: 1rem; }
.lab-modal__close {
  margin-left: auto; background: transparent; border: 1px solid var(--cl-border);
  color: var(--cl-text-dim); border-radius: 4px; width: 26px; height: 26px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.lab-modal__body {
  padding: 14px 16px; display: flex; flex-direction: column; gap: 12px;
  overflow-y: auto; min-height: 0;
}
.lab-modal__row { display: flex; flex-direction: column; gap: 4px; }
.lab-modal__label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--cl-text-faint); }
.lab-modal__row select, .lab-modal__row input {
  font: inherit; background: var(--cl-bg-elev-2); color: var(--cl-text);
  border: 1px solid var(--cl-border); border-radius: 4px; padding: 6px 8px;
}
.lab-modal__row input:focus, .lab-modal__row select:focus {
  outline: none; border-color: var(--cl-accent);
}
.lab-modal__error { margin: 0; color: var(--cl-danger); font-size: 0.85rem; }
.lab-modal__footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 12px 16px; border-top: 1px solid var(--cl-border);
}
.lab-modal__save {
  background: var(--cl-accent); color: var(--cl-on-accent);
  border: none; border-radius: 6px; padding: 6px 14px; cursor: pointer; font: inherit;
}
.lab-modal__save:disabled { opacity: 0.6; cursor: default; }
.lab-modal__cancel {
  background: transparent; color: var(--cl-text);
  border: 1px solid var(--cl-border); border-radius: 6px; padding: 6px 14px;
  cursor: pointer; font: inherit;
}
`
