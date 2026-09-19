/**
 * SourcesStrip — the sources the AI tab is reading from, plus the "+ Add source"
 * affordance to ingest a vendor PDF inline.
 *
 * It shows ONLY sources the user attached in this session (clicking one opens
 * the artifact in the viewer). It deliberately does NOT render non-interactive
 * "auto-attached" chips for the study / deck / overview: they were not
 * clickable, duplicated the top-level surface indicator ("where am I" already
 * lives in the shell), and consumed the AI panel's scarcest real estate.
 *
 * The study/active-viewer context still flows to the model — per message, via
 * the structured SurfaceContextPayload — it just does not need a chip here.
 *
 * Pure presentation — state, the modal, and the openTab plumbing live in
 * AiTabPanel.
 */

export interface AddedSource {
  artifactId: string
  title: string
}

export interface SourcesStripProps {
  /** PDFs ingested via the "+ Add source" button in this session. */
  addedSources: AddedSource[]
  /** Open the "+ Add source" picker. */
  onAddSource: () => void
  /** Open an added source in the viewer (becomes the active artifact). */
  onOpenSource: (artifactId: string) => void
}

export function SourcesStrip({
  addedSources,
  onAddSource,
  onOpenSource,
}: SourcesStripProps) {
  return (
    <div className="sources-strip" data-testid="sources-strip">
      {addedSources.map((src) => (
        <button
          key={src.artifactId}
          type="button"
          className="sources-strip__chip sources-strip__chip--added"
          data-testid={`sources-chip-added-${src.artifactId}`}
          title={`${src.title} — click to open in viewer`}
          onClick={() => onOpenSource(src.artifactId)}
        >
          <span className="sources-strip__chip-label">PDF</span>
          <span className="sources-strip__chip-sub">{src.title}</span>
        </button>
      ))}
      <button
        type="button"
        className="sources-strip__add-btn"
        onClick={onAddSource}
        data-testid="sources-strip-add"
        title="Search Exa for a vendor PDF and ingest it as a study artifact"
      >
        + Add source
      </button>
      {addedSources.length === 0 ? (
        <span className="sources-strip__hint">
          Open a viewer in <strong>Find</strong>, or add a vendor PDF, to
          attach more context.
        </span>
      ) : null}
    </div>
  )
}
