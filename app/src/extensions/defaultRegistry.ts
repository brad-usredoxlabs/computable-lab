import type { ExtensionManifest } from '@cla-lab/ai-extension-api'

/**
 * In-host default registry. Each slot here keeps the current AI feature
 * available in bare CL when no overlay is loaded. Phase 3 of the AI-extension
 * split removes these entries (slots fall back to NullSlot); for Phase 1/2
 * they preserve byte-equivalent behavior while call sites migrate to <Slot>.
 */

import { EventEditorAiDock } from '../event-editor/ai/EventEditorAiDock'
import { FixItPanel } from '../event-editor/fix-it/FixItPanel'
import { FixItRoute } from '../event-editor/fixit-route/FixItRoute'
import { AiChatPanel } from '../shared/ai/AiChatPanel'
import { SourceKindSuggestionBadge } from '../ingestion/components/IngestionAiSuggestion'
import { AiAnalysisPanel } from '../ingestion/components/AiAnalysisPanel'
import { RunClaimDraftPanel } from '../graph/run-workspace/RunClaimDraftPanel'
import { AiSettingsSection } from '../shell/settings/AiSettingsSection'

export const defaultManifest: ExtensionManifest = {
  slots: {
    'event-editor.dock': EventEditorAiDock,
    'event-editor.fix-it-panel': FixItPanel,
    'event-editor.fix-it-route': FixItRoute,
    'chat.panel.global': AiChatPanel,
    'chat.panel.literature': AiChatPanel,
    'chat.panel.materials': AiChatPanel,
    'chat.panel.formulations': AiChatPanel,
    'chat.panel.ingestion': AiChatPanel,
    'chat.panel.protocol-ide': AiChatPanel,
    'chat.panel.run-workspace': AiChatPanel,
    'ingestion.ai-suggestion': SourceKindSuggestionBadge,
    'ingestion.ai-analysis': AiAnalysisPanel,
    'run-workspace.claim-draft': RunClaimDraftPanel,
    'settings.ai-section': AiSettingsSection,
  },
  aiClient: null,
}
