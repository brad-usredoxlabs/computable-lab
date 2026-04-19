import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiClient } from '../shared/api/client'
import { useRegisterAiChat } from '../shared/context/AiPanelContext'
import { useAiChat } from '../shared/hooks/useAiChat'
import type { AiContext } from '../types/aiContext'
import type { IngestionJobDetail, IngestionJobSummary } from '../types/ingestion'
import { IngestionArtifactTree, type IngestionTreeNode } from './components/IngestionArtifactTree'
import { IngestionArtifactViewer } from './components/IngestionArtifactViewer'
import { IngestionPipelineTrace } from './components/IngestionPipelineTrace'
import { IngestionUploadModal, type UploadResult } from './components/IngestionUploadModal'

function humanize(value: string): string {
  return value.replace(/_/g, ' ')
}

export function IngestionPage() {
  const [jobs, setJobs] = useState<IngestionJobSummary[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [detail, setDetail] = useState<IngestionJobDetail | null>(null)
  const [selection, setSelection] = useState<IngestionTreeNode | null>(null)
  const [loading, setLoading] = useState(false)
  const [runningJobId, setRunningJobId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)

  const loadJobs = useCallback(async (selectJobId?: string) => {
    setLoading(true)
    setError(null)
    try {
      const response = await apiClient.listIngestionJobs()
      setJobs(response.items)
      const nextSelected = selectJobId ?? selectedJobId ?? response.items[0]?.id ?? null
      if (nextSelected !== selectedJobId) {
        setSelection(null)
      }
      setSelectedJobId(nextSelected)
      if (nextSelected) {
        const jobDetail = await apiClient.getIngestionJob(nextSelected)
        setDetail(jobDetail)
      } else {
        setDetail(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ingestion jobs')
    } finally {
      setLoading(false)
    }
  }, [selectedJobId])

  useEffect(() => {
    void loadJobs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!runningJobId) return undefined
    let cancelled = false
    const poll = async () => {
      try {
        const [jobsResponse, jobDetail] = await Promise.all([
          apiClient.listIngestionJobs(),
          apiClient.getIngestionJob(runningJobId),
        ])
        if (cancelled) return
        setJobs(jobsResponse.items)
        setDetail(jobDetail)
        setSelectedJobId(runningJobId)
        if (jobDetail.job.payload.status !== 'running' && jobDetail.job.payload.status !== 'queued') {
          setRunningJobId(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to refresh job')
        }
      }
    }
    void poll()
    const id = window.setInterval(() => { void poll() }, 1000)
    return () => { cancelled = true; window.clearInterval(id) }
  }, [runningJobId])

  async function handleSelectJob(jobId: string) {
    setSelectedJobId(jobId)
    setSelection(null)
    setLoading(true)
    try {
      const jobDetail = await apiClient.getIngestionJob(jobId)
      setDetail(jobDetail)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ingestion job')
    } finally {
      setLoading(false)
    }
  }

  async function handleRunJob() {
    if (!selectedJobId) return
    setError(null)
    setRunningJobId(selectedJobId)
    try {
      const updated = await apiClient.runIngestionJob(selectedJobId, {})
      setDetail(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run job')
      setRunningJobId(null)
    }
  }

  async function handleApproveBundle(bundleId: string) {
    if (!selectedJobId) return
    setError(null)
    try {
      const updated = await apiClient.approveIngestionBundle(selectedJobId, bundleId)
      setDetail(updated)
      await loadJobs(selectedJobId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve bundle')
    }
  }

  async function handlePublishBundle(bundleId: string) {
    if (!selectedJobId) return
    setError(null)
    try {
      const updated = await apiClient.publishIngestionBundle(selectedJobId, bundleId)
      setDetail(updated.detail)
      await loadJobs(selectedJobId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish bundle')
    }
  }

  const handleUploadCreated = useCallback(async (result: UploadResult) => {
    setUploadOpen(false)
    if (result.autoRun) {
      setRunningJobId(result.createdJobId)
    }
    await loadJobs(result.createdJobId)
  }, [loadJobs])

  const aiContext = useMemo((): AiContext => ({
    surface: 'ingestion',
    summary: `Ingestion IDE${selectedJobId ? `, selected job: ${selectedJobId}` : ''}`,
    surfaceContext: {
      selectedJobId,
      selectedNodeKind: selection?.kind ?? null,
      jobCount: jobs.length,
      detailStage: detail?.job?.payload?.stage || null,
      artifactCount: detail?.artifacts?.length || 0,
      candidateCount: detail?.candidates?.length || 0,
      issueCount: detail?.issues?.length || 0,
      bundleCount: detail?.bundles?.length || 0,
      issues: detail?.issues?.map((i) => ({
        id: i.recordId,
        type: i.payload.issue_type,
        title: i.payload.title,
        severity: i.payload.severity,
      })) || [],
    },
  }), [selectedJobId, selection, jobs.length, detail])
  const aiChat = useAiChat({ aiContext })
  useRegisterAiChat(aiChat)

  const runDisabled = loading
    || Boolean(runningJobId)
    || !selectedJobId
    || (detail?.job.payload.status !== 'queued')

  return (
    <div className="ingestion-ide">
      <header className="ingestion-ide__toolbar">
        <div className="ingestion-ide__title">
          <h1>Ingestion</h1>
          <p>Upload, compile, review, publish.</p>
        </div>
        <div className="ingestion-ide__actions">
          <button type="button" className="btn btn-primary" onClick={() => setUploadOpen(true)}>
            + New job
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => { void handleRunJob() }} disabled={runDisabled}>
            {runningJobId ? 'Running…' : 'Run'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => { void loadJobs() }} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <div className="ingestion-ide__body">
        <aside className="ingestion-ide__left">
          <section className="ingestion-ide__panel">
            <div className="ingestion-ide__panel-head">Jobs · {jobs.length}</div>
            {jobs.length === 0 ? (
              <div className="itree-empty">No jobs yet. Click “+ New job” to upload.</div>
            ) : (
              <div className="ijoblist">
                {jobs.map((job) => (
                  <button
                    key={job.id}
                    type="button"
                    className={`ijoblist__item ${selectedJobId === job.id ? 'ijoblist__item--selected' : ''}`}
                    onClick={() => { void handleSelectJob(job.id) }}
                  >
                    <div className="ijoblist__title">{job.name}</div>
                    <div className="ijoblist__meta">
                      <span>{humanize(job.sourceKind)}</span>
                      <span className={`ingestion-badge ${job.status === 'failed' ? 'ingestion-badge--error' : ''}`}>
                        {humanize(job.status)}
                      </span>
                    </div>
                    <div className="ijoblist__counts">
                      {job.candidateCount ? <span>{job.candidateCount} cand</span> : null}
                      {job.bundleCount ? <span>{job.bundleCount} bundle</span> : null}
                      {job.blockingIssueCount ? <span className="ijoblist__blocking">{job.blockingIssueCount} blocking</span> : null}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="ingestion-ide__panel ingestion-ide__panel--grow">
            <div className="ingestion-ide__panel-head">Explorer</div>
            <IngestionArtifactTree
              detail={detail}
              selection={selection}
              onSelect={(node) => setSelection(node)}
            />
          </section>
        </aside>

        <main className="ingestion-ide__center">
          {!detail ? (
            <div className="iview-empty">
              Select a job from the left, or click <strong>+ New job</strong> to upload a source.
            </div>
          ) : (
            <IngestionArtifactViewer
              detail={detail}
              selection={selection}
              jobId={selectedJobId}
              busy={loading}
              onApproveBundle={handleApproveBundle}
              onPublishBundle={handlePublishBundle}
            />
          )}
        </main>

        <aside className="ingestion-ide__right">
          <IngestionPipelineTrace detail={detail} onSelectIssue={(node) => setSelection(node)} />
        </aside>
      </div>

      <IngestionUploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onCreated={(r) => { void handleUploadCreated(r) }}
      />

      <style>{`
        .ingestion-ide { display: flex; flex-direction: column; height: 100%; min-height: calc(100vh - 4rem); padding: 0.75rem; gap: 0.75rem; box-sizing: border-box; }
        .ingestion-ide__toolbar {
          display: flex; justify-content: space-between; align-items: center;
          padding: 0.75rem 1rem; background: #fff; border: 1px solid #e9ecef; border-radius: 12px;
        }
        .ingestion-ide__title h1 { margin: 0; font-size: 1.1rem; }
        .ingestion-ide__title p { margin: 0.15rem 0 0; color: #868e96; font-size: 0.82rem; }
        .ingestion-ide__actions { display: flex; gap: 0.5rem; }
        .ingestion-ide__body {
          display: grid;
          grid-template-columns: 280px minmax(0, 1fr) 320px;
          gap: 0.75rem;
          flex: 1; min-height: 0;
        }
        .ingestion-ide__left, .ingestion-ide__center, .ingestion-ide__right {
          background: #fff; border: 1px solid #e9ecef; border-radius: 12px; overflow: hidden;
          display: flex; flex-direction: column; min-height: 0;
        }
        .ingestion-ide__left { display: flex; flex-direction: column; gap: 0; }
        .ingestion-ide__panel { display: flex; flex-direction: column; min-height: 0; }
        .ingestion-ide__panel + .ingestion-ide__panel { border-top: 1px solid #e9ecef; }
        .ingestion-ide__panel--grow { flex: 1; overflow: auto; }
        .ingestion-ide__panel-head {
          padding: 0.5rem 0.75rem; font-size: 0.72rem; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.08em; color: #6c757d; background: #f8f9fa; border-bottom: 1px solid #e9ecef;
        }
        .ingestion-ide__center { padding: 0; overflow: auto; }
        .ingestion-ide__right { padding: 0.75rem; overflow: auto; }

        .ijoblist { display: flex; flex-direction: column; max-height: 240px; overflow: auto; }
        .ijoblist__item {
          text-align: left; background: #fff; border: none; border-bottom: 1px solid #f1f3f5;
          padding: 0.55rem 0.75rem; cursor: pointer;
        }
        .ijoblist__item:hover { background: #f8f9fa; }
        .ijoblist__item--selected { background: #f0f7ff; box-shadow: inset 3px 0 0 #339af0; }
        .ijoblist__title { font-weight: 600; font-size: 0.88rem; margin-bottom: 0.15rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ijoblist__meta { display: flex; gap: 0.4rem; color: #868e96; font-size: 0.76rem; align-items: center; }
        .ijoblist__counts { display: flex; gap: 0.35rem; margin-top: 0.2rem; font-size: 0.72rem; color: #64748b; }
        .ijoblist__blocking { color: #c92a2a; font-weight: 600; }

        /* Tree */
        .itree { display: flex; flex-direction: column; gap: 0.15rem; padding: 0.4rem; }
        .itree-empty { padding: 0.6rem 0.75rem; color: #868e96; font-size: 0.82rem; }
        .itree-root {
          display: flex; align-items: center; gap: 0.4rem; width: 100%; text-align: left;
          padding: 0.4rem 0.5rem; border: none; background: transparent; border-radius: 6px; cursor: pointer;
        }
        .itree-root:hover { background: #f1f3f5; }
        .itree-root__label { font-weight: 600; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .itree-root__badge { font-size: 0.7rem; color: #495057; background: #e9ecef; padding: 0.1rem 0.4rem; border-radius: 999px; }
        .itree-group { display: flex; flex-direction: column; }
        .itree-group__head {
          display: flex; align-items: center; gap: 0.35rem; width: 100%; text-align: left;
          padding: 0.3rem 0.5rem; border: none; background: transparent; border-radius: 6px; cursor: pointer;
          font-size: 0.76rem; color: #495057; text-transform: uppercase; letter-spacing: 0.04em;
        }
        .itree-group__head:hover { background: #f1f3f5; }
        .itree-twisty { display: inline-block; width: 0.8rem; color: #adb5bd; }
        .itree-group__label { flex: 1; }
        .itree-group__count { font-size: 0.7rem; color: #adb5bd; }
        .itree-group__body { display: flex; flex-direction: column; padding-left: 0.5rem; gap: 0.1rem; }
        .itree-row {
          display: flex; align-items: center; gap: 0.4rem; width: 100%; text-align: left;
          padding: 0.25rem 0.5rem; border: none; background: transparent; border-radius: 6px; cursor: pointer;
          font-size: 0.82rem; color: #343a40;
        }
        .itree-row:hover { background: #f1f3f5; }
        .itree-row--selected { background: #d0ebff !important; color: #1864ab; }
        .itree-row--nested { padding-left: 1.25rem; }
        .itree-row__icon { flex: 0 0 1rem; text-align: center; }
        .itree-row__label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .itree-row__sub { font-size: 0.72rem; color: #868e96; }
        .itree-row--issue-error { color: #c92a2a; }
        .itree-row--issue-warning { color: #e67700; }
        .itree-bundle__children { display: flex; flex-direction: column; padding-left: 0.4rem; }

        /* Viewer */
        .iview { display: flex; flex-direction: column; gap: 1rem; padding: 1rem 1.25rem; }
        .iview-empty { padding: 2rem; color: #868e96; text-align: center; }
        .iview__head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; border-bottom: 1px solid #f1f3f5; padding-bottom: 0.75rem; }
        .iview__eyebrow { margin: 0 0 0.15rem; color: #868e96; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; }
        .iview__head h2 { margin: 0; font-size: 1.05rem; }
        .iview__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.5rem 1rem; }
        .iview__kv { display: flex; flex-direction: column; gap: 0.1rem; padding: 0.35rem 0; border-bottom: 1px solid #f8f9fa; }
        .iview__kv-k { font-size: 0.7rem; color: #868e96; text-transform: uppercase; letter-spacing: 0.04em; }
        .iview__kv-v { font-size: 0.88rem; color: #212529; word-break: break-word; }
        .iview__section { display: flex; flex-direction: column; gap: 0.5rem; }
        .iview__section h3 { margin: 0; font-size: 0.92rem; color: #343a40; }
        .iview__sub { color: #868e96; font-size: 0.82rem; font-weight: 400; }
        .iview__pre {
          margin: 0; padding: 0.75rem; background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 8px;
          max-height: 300px; overflow: auto; font-size: 0.78rem; line-height: 1.45; white-space: pre-wrap; word-break: break-word;
        }
        .iview__list { margin: 0; padding-left: 1.25rem; font-size: 0.85rem; }
        .iview__table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
        .iview__table th, .iview__table td { text-align: left; padding: 0.35rem 0.5rem; border-bottom: 1px solid #f1f3f5; }
        .iview__table th { background: #f8f9fa; font-weight: 600; color: #495057; }
        .iview__hint { color: #868e96; font-size: 0.82rem; }
        .iview__summary { color: #495057; margin: 0; }

        /* Trace */
        .itrace { display: flex; flex-direction: column; gap: 1rem; }
        .itrace-empty { padding: 1rem; color: #868e96; font-size: 0.85rem; }
        .itrace__title { margin: 0 0 0.4rem; font-size: 0.72rem; color: #6c757d; text-transform: uppercase; letter-spacing: 0.08em; }
        .itrace__section { display: flex; flex-direction: column; }
        .itrace__stages { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; }
        .itrace-stage { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: #adb5bd; }
        .itrace-stage__dot {
          display: inline-flex; align-items: center; justify-content: center;
          width: 1.1rem; height: 1.1rem; border-radius: 999px; border: 1px solid currentColor; font-size: 0.68rem;
        }
        .itrace-stage--pending { color: #ced4da; }
        .itrace-stage--active { color: #1864ab; }
        .itrace-stage--running { color: #1864ab; font-weight: 600; }
        .itrace-stage--running .itrace-stage__dot { background: #1864ab; color: #fff; animation: itrace-pulse 1.2s ease-in-out infinite; }
        .itrace-stage--done { color: #2f9e44; }
        .itrace-stage--done .itrace-stage__dot { background: #2f9e44; color: #fff; border-color: #2f9e44; }
        .itrace-stage--failed { color: #c92a2a; }
        .itrace-stage--failed .itrace-stage__dot { background: #c92a2a; color: #fff; border-color: #c92a2a; }
        @keyframes itrace-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
        .itrace__status-row { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
        .itrace__progress-bar { height: 0.45rem; background: #e9ecef; border-radius: 999px; overflow: hidden; }
        .itrace__progress-fill { height: 100%; background: #1864ab; transition: width 160ms ease; }
        .itrace__progress-label { font-size: 0.82rem; color: #495057; margin-top: 0.25rem; }
        .itrace__sub { font-size: 0.75rem; color: #868e96; }
        .itrace__issue-counts { display: flex; gap: 0.35rem; margin-bottom: 0.4rem; flex-wrap: wrap; }
        .itrace__issue-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.2rem; }
        .itrace__issue {
          display: flex; align-items: center; gap: 0.4rem; width: 100%; text-align: left;
          padding: 0.3rem 0.5rem; border: 1px solid #f1f3f5; background: #fff; border-radius: 6px; cursor: pointer;
          font-size: 0.8rem;
        }
        .itrace__issue:hover { background: #f8f9fa; }
        .itrace__issue-icon { flex: 0 0 1rem; }
        .itrace__issue-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .itrace__issue--error { border-color: #ffc9c9; }
        .itrace__issue--warning { border-color: #ffe8a1; }

        /* Upload modal */
        .iupload-backdrop {
          position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4);
          display: flex; align-items: center; justify-content: center; z-index: 100;
        }
        .iupload-modal {
          background: #fff; border-radius: 14px; width: min(640px, 92vw); max-height: 88vh;
          display: flex; flex-direction: column; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
        }
        .iupload-modal__head {
          display: flex; justify-content: space-between; align-items: center;
          padding: 1rem 1.25rem; border-bottom: 1px solid #e9ecef;
        }
        .iupload-modal__head h2 { margin: 0; font-size: 1.05rem; }
        .iupload-modal__close {
          background: transparent; border: none; font-size: 1.5rem; cursor: pointer; color: #868e96; line-height: 1;
        }
        .iupload-modal__body { padding: 1rem 1.25rem; overflow: auto; display: flex; flex-direction: column; gap: 0.9rem; }
        .iupload-modal__foot {
          display: flex; justify-content: flex-end; gap: 0.5rem;
          padding: 0.75rem 1.25rem; border-top: 1px solid #e9ecef;
        }
        .iupload-file-name { font-size: 0.82rem; color: #1864ab; margin-top: 0.3rem; }
        .iupload-toggle {
          display: flex; gap: 0.6rem; align-items: flex-start; padding: 0.6rem; border: 1px solid #e9ecef;
          border-radius: 10px; background: #f8f9fa; font-size: 0.85rem; color: #343a40;
        }
        .iupload-toggle input { margin-top: 0.15rem; }
        .iupload-ontology { display: flex; flex-direction: column; gap: 0.4rem; }
        .iupload-ontology__label { font-size: 0.82rem; color: #495057; }
        .iupload-ontology__list { display: flex; flex-wrap: wrap; gap: 0.4rem; }
        .iupload-ontology__item {
          display: inline-flex; align-items: center; gap: 0.4rem;
          padding: 0.35rem 0.55rem; border: 1px solid #e9ecef; border-radius: 999px; background: #fff; font-size: 0.82rem;
        }
        .iupload-ontology__rank {
          width: 1.2rem; height: 1.2rem; border-radius: 999px; background: #edf2ff; color: #364fc7;
          display: inline-flex; align-items: center; justify-content: center; font-size: 0.72rem; font-weight: 700;
        }
        .iupload-ontology__actions { display: inline-flex; gap: 0.2rem; }
        .iupload-ontology__actions button {
          width: 1.4rem; height: 1.4rem; border: 1px solid #dee2e6; background: #fff; border-radius: 4px; font-size: 0.72rem; cursor: pointer;
        }
        .iupload-ontology__actions button:disabled { opacity: 0.4; cursor: not-allowed; }

        /* Shared */
        .ingestion-field { display: flex; flex-direction: column; gap: 0.3rem; }
        .ingestion-field > span { font-size: 0.78rem; color: #495057; }
        .ingestion-field input, .ingestion-field select, .ingestion-field textarea {
          padding: 0.55rem 0.7rem; border: 1px solid #ced4da; border-radius: 8px; background: #fff;
          font-family: inherit; font-size: 0.88rem;
        }
        .ingestion-field textarea { resize: vertical; }
        .btn { padding: 0.5rem 0.9rem; border-radius: 8px; font-size: 0.85rem; cursor: pointer; border: 1px solid transparent; }
        .btn-primary { background: #1864ab; color: #fff; border-color: #1864ab; }
        .btn-primary:hover:not(:disabled) { background: #1971c2; }
        .btn-primary:disabled { background: #adb5bd; border-color: #adb5bd; cursor: not-allowed; }
        .btn-secondary { background: #fff; color: #495057; border-color: #ced4da; }
        .btn-secondary:hover:not(:disabled) { background: #f8f9fa; }
        .btn-secondary:disabled { color: #adb5bd; cursor: not-allowed; }
        .ingestion-badge {
          display: inline-flex; align-items: center; border-radius: 999px; padding: 0.15rem 0.5rem;
          background: #edf2ff; color: #364fc7; font-size: 0.72rem; text-transform: capitalize; font-weight: 500;
        }
        .ingestion-badge--warning { background: #fff3bf; color: #e67700; }
        .ingestion-badge--error { background: #ffe3e3; color: #c92a2a; }
        .ingestion-card {
          border: 1px solid #e9ecef; border-radius: 10px; padding: 0.75rem; background: #fff;
          display: flex; flex-direction: column; gap: 0.5rem;
        }
        .ingestion-card__head { display: flex; justify-content: space-between; gap: 1rem; }
        .ingestion-card__head h4 { margin: 0; font-size: 0.9rem; }
        .ingestion-card__head p { margin: 0.15rem 0 0; color: #868e96; font-size: 0.8rem; }
        .ingestion-card__summary { margin: 0; color: #495057; font-size: 0.85rem; }
        .ingestion-card__meta { display: flex; flex-wrap: wrap; gap: 0.5rem; color: #868e96; font-size: 0.78rem; }
        .ingestion-card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.6rem; }
        .ingestion-empty { padding: 0.75rem; border: 1px dashed #ced4da; border-radius: 8px; color: #868e96; background: #fafbfc; }
        .ingestion-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; }
        .error-banner {
          border: 1px solid #ffc9c9; background: #fff5f5; color: #c92a2a;
          border-radius: 10px; padding: 0.6rem 0.8rem; font-size: 0.85rem;
        }

        @media (max-width: 1100px) {
          .ingestion-ide__body { grid-template-columns: 240px minmax(0, 1fr) 280px; }
        }
        @media (max-width: 900px) {
          .ingestion-ide__body { grid-template-columns: 1fr; }
          .ingestion-ide__left, .ingestion-ide__right { max-height: 300px; }
        }
      `}</style>
    </div>
  )
}
