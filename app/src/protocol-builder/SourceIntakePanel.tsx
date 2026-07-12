/**
 * SourceIntakePanel — lets the user provide a protocol source via
 * PDF URL or raw text paste. On submission, stores the source text
 * in ProtocolBuilderContext and displays a summary.
 */

import { useState, useCallback } from 'react'
import { useProtocolBuilderState } from './ProtocolBuilderContext'

/** Estimate how many protocol steps the text contains. */
function estimateStepCount(text: string): number {
  const lines = text.split('\n')
  // Count lines that look like numbered steps: "1.", "1)", "1.", "10.", etc.
  // Also count bullet points: "- " or "* "
  const stepPattern = /^\s*(\d+[\.\)]\s|[-*]\s)/
  return lines.filter((l) => stepPattern.test(l) && l.trim().length > 3).length
}

/** Count words in text. */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter((w) => w.length > 0).length
}

/** Extract all text from a PDF at a given URL via the backend proxy (avoids CORS). */
async function extractPdfTextFromUrl(url: string): Promise<string> {
  const resp = await fetch('/api/protocol-builder/extract-pdf-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`Failed to fetch PDF: ${resp.status} ${resp.statusText} ${errBody.slice(0, 200)}`);
  }
  const data = await resp.json();
  if (!data.text || !data.text.trim()) {
    throw new Error('PDF was loaded but no text was extracted (may be a scanned PDF)');
  }
  return data.text;
}

interface SourceSummary {
  text: string
  charCount: number
  wordCount: number
  estimatedSteps: number
}

export interface SourceIntakePanelProps {
  onSourceLoaded?: (text: string) => void
}

export function SourceIntakePanel({ onSourceLoaded }: SourceIntakePanelProps) {
  const { actions } = useProtocolBuilderState()
  const [activeTab, setActiveTab] = useState<'pdf-url' | 'paste-text'>('pdf-url')
  const [pdfUrl, setPdfUrl] = useState('')
  const [pastedText, setPastedText] = useState('')
  const [urlError, setUrlError] = useState('')
  const [extractError, setExtractError] = useState('')
  const [isExtracting, setIsExtracting] = useState(false)
  const [summary, setSummary] = useState<SourceSummary | null>(null)

  const validateUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        setUrlError('URL must start with http:// or https://')
        return false
      }
      setUrlError('')
      return true
    } catch {
      setUrlError('Please enter a valid URL')
      return false
    }
  }

  const buildSummary = (text: string): SourceSummary => {
    return {
      text,
      charCount: text.length,
      wordCount: countWords(text),
      estimatedSteps: estimateStepCount(text),
    }
  }

  const handlePdfSubmit = useCallback(async () => {
    setExtractError('')
    setUrlError('')
    if (!pdfUrl.trim()) {
      setUrlError('Please enter a URL')
      return
    }
    if (!validateUrl(pdfUrl)) return

    setIsExtracting(true)
    try {
      const text = await extractPdfTextFromUrl(pdfUrl)
      if (!text.trim()) {
        setExtractError('PDF was loaded but no text was extracted (may be a scanned PDF)')
        return
      }
      const s = buildSummary(text)
      setSummary(s)
      actions.setSourceText(text)
      onSourceLoaded?.(text)
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : 'Failed to extract PDF')
    } finally {
      setIsExtracting(false)
    }
  }, [pdfUrl, actions, onSourceLoaded])

  const handlePasteSubmit = useCallback(() => {
    setExtractError('')
    if (!pastedText.trim()) return
    const s = buildSummary(pastedText)
    setSummary(s)
    actions.setSourceText(pastedText)
    onSourceLoaded?.(pastedText)
  }, [pastedText, actions, onSourceLoaded])

  const handleClear = useCallback(() => {
    actions.setSourceText(null)
    setPdfUrl('')
    setPastedText('')
    setUrlError('')
    setExtractError('')
    setSummary(null)
  }, [actions])

  return (
    <div
      className="protocol-builder-page__intake-panel"
      data-testid="source-intake-panel"
    >
      <h2 className="protocol-builder-page__intake-title">
        Load Protocol Source
      </h2>

      {/* Tabs */}
      <div className="protocol-builder-page__tabs" role="tablist">
        <button
          className={`protocol-builder-page__tab${activeTab === 'pdf-url' ? ' protocol-builder-page__tab--active' : ''}`}
          role="tab"
          aria-selected={activeTab === 'pdf-url'}
          onClick={() => setActiveTab('pdf-url')}
          data-testid="source-intake-tab-pdf-url"
        >
          PDF URL
        </button>
        <button
          className={`protocol-builder-page__tab${activeTab === 'paste-text' ? ' protocol-builder-page__tab--active' : ''}`}
          role="tab"
          aria-selected={activeTab === 'paste-text'}
          onClick={() => setActiveTab('paste-text')}
          data-testid="source-intake-tab-paste-text"
        >
          Paste Text
        </button>
      </div>

      {/* Tab content */}
      <div className="protocol-builder-page__intake-body">
        {activeTab === 'pdf-url' && (
          <div className="protocol-builder-page__pdf-url-tab">
            <label
              className="protocol-builder-page__input-label"
              htmlFor="pdf-url-input"
            >
              Vendor PDF URL
            </label>
            <input
              id="pdf-url-input"
              type="url"
              className="protocol-builder-page__input"
              placeholder="https://example.com/protocol.pdf"
              value={pdfUrl}
              onChange={(e) => {
                setPdfUrl(e.target.value)
                if (urlError) setUrlError('')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handlePdfSubmit()
              }}
              data-testid="pdf-url-input"
            />
            {urlError && (
              <div className="protocol-builder-page__error" role="alert">
                {urlError}
              </div>
            )}
            <button
              className="protocol-builder-page__btn protocol-builder-page__btn--primary"
              onClick={handlePdfSubmit}
              disabled={isExtracting || !pdfUrl.trim()}
              data-testid="source-intake-submit"
            >
              {isExtracting ? 'Extracting...' : 'Extract Text'}
            </button>
            {isExtracting && (
              <div className="protocol-builder-page__loading" data-testid="source-intake-loading">
                Extracting text from PDF...
              </div>
            )}
          </div>
        )}

        {activeTab === 'paste-text' && (
          <div className="protocol-builder-page__paste-text-tab">
            <label
              className="protocol-builder-page__input-label"
              htmlFor="paste-textarea"
            >
              Protocol Text
            </label>
            <textarea
              id="paste-textarea"
              className="protocol-builder-page__textarea"
              placeholder="Paste protocol text here (e.g. from a vendor manual, email, or notes)..."
              rows={12}
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              data-testid="paste-textarea"
            />
            <div className="protocol-builder-page__char-count">
              {pastedText.length} characters
            </div>
            <button
              className="protocol-builder-page__btn protocol-builder-page__btn--primary"
              onClick={handlePasteSubmit}
              disabled={!pastedText.trim()}
              data-testid="source-intake-submit"
            >
              Use Source
            </button>
          </div>
        )}

        {/* Error display */}
        {extractError && (
          <div
            className="protocol-builder-page__extraction-error"
            role="alert"
            data-testid="extraction-error"
          >
            <span className="protocol-builder-page__error-icon" aria-hidden>
              {'!'}
            </span>
            <span>{extractError}</span>
            <button
              className="protocol-builder-page__dismiss-error"
              onClick={() => setExtractError('')}
              aria-label="Dismiss error"
            >
              [x]
            </button>
          </div>
        )}

        {/* Source summary */}
        {summary && (
          <div
            className="protocol-builder-page__source-summary"
            data-testid="source-intake-summary"
          >
            <div className="protocol-builder-page__summary-header">
              <h3 className="protocol-builder-page__summary-title">
                Source Loaded
              </h3>
              <button
                className="protocol-builder-page__btn protocol-builder-page__btn--secondary"
                onClick={handleClear}
                data-testid="source-intake-clear"
              >
                Clear
              </button>
            </div>
            <div className="protocol-builder-page__summary-stats">
              <span className="protocol-builder-page__summary-stat">
                {summary.charCount.toLocaleString()} characters
              </span>
              <span className="protocol-builder-page__summary-stat">
                {summary.wordCount.toLocaleString()} words
              </span>
              <span className="protocol-builder-page__summary-stat">
                {summary.estimatedSteps} estimated steps
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Exported for testing
export { estimateStepCount, countWords }
