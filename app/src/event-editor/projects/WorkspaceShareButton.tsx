/**
 * WorkspaceShareButton — share affordance for the active study, sitting next
 * to the ⚙ gear in the project tab strip. Opens the shared ShareRecordDialog
 * (visibility + user/group grants) for the current study. Studies are
 * policy-root records, so the dialog is editable for an admin.
 */

import { useState } from 'react'
import { ShareRecordDialog } from '../../shared/sharing/ShareRecordDialog'

export function WorkspaceShareButton({ studyId }: { studyId?: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="workspace-share-button" data-testid="workspace-share-button">
      <button
        type="button"
        className="workspace-share-button__trigger"
        aria-label="Share this study"
        title={studyId ? 'Share this study' : 'Open a study to share it'}
        disabled={!studyId}
        onClick={() => setOpen(true)}
        data-testid="workspace-share-trigger"
      >
        🔗
      </button>
      {open && studyId ? (
        <ShareRecordDialog recordId={studyId} onClose={() => setOpen(false)} />
      ) : null}
    </div>
  )
}
