/**
 * `useOpenStudies` — reactive wrapper over the openStudiesStorage helpers.
 *
 * The underlying localStorage isn't reactive, so this hook re-reads on a
 * tiny notifier signal that all openStudies mutators push into. Cross-tab
 * sync (other browser tabs editing the list) is handled by the `storage`
 * event.
 *
 * Returns the current list plus stable callbacks; consumers should NOT
 * call openStudy / closeStudy / reorder from openStudiesStorage directly
 * if they want their own component to re-render — use the callbacks here.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  closeStudy as storageCloseStudy,
  listOpenStudies,
  openStudy as storageOpenStudy,
  reorderOpenStudies as storageReorderOpenStudies,
  setOpenStudyTitle as storageSetOpenStudyTitle,
  OPEN_STUDIES_STORAGE_KEY,
  type OpenStudyEntry,
} from './openStudiesStorage'

// In-process notifier: every mutator bumps this counter; subscribers re-read.
// Cross-tab updates come through the `storage` event in useEffect below.
let notifyTick = 0
const notifySubscribers: Set<() => void> = new Set()
function notify() {
  notifyTick += 1
  for (const cb of notifySubscribers) cb()
}

export interface UseOpenStudiesValue {
  studies: OpenStudyEntry[]
  openStudy: (studyId: string, title?: string) => void
  closeStudy: (studyId: string) => void
  reorder: (studyIds: string[]) => void
  setTitle: (studyId: string, title: string) => void
}

export function useOpenStudies(): UseOpenStudiesValue {
  const [, setTick] = useState(notifyTick)

  useEffect(() => {
    const cb = () => setTick(notifyTick)
    notifySubscribers.add(cb)
    // Re-render when another browser tab edits localStorage. The storage
    // event only fires on OTHER tabs; same-tab updates use the notifier.
    const onStorage = (event: StorageEvent) => {
      if (event.key === OPEN_STUDIES_STORAGE_KEY) setTick((t) => t + 1)
    }
    window.addEventListener('storage', onStorage)
    return () => {
      notifySubscribers.delete(cb)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const studies = listOpenStudies()

  const openStudy = useCallback((studyId: string, title?: string) => {
    storageOpenStudy(studyId, title)
    notify()
  }, [])

  const closeStudy = useCallback((studyId: string) => {
    storageCloseStudy(studyId)
    notify()
  }, [])

  const reorder = useCallback((studyIds: string[]) => {
    storageReorderOpenStudies(studyIds)
    notify()
  }, [])

  const setTitle = useCallback((studyId: string, title: string) => {
    storageSetOpenStudyTitle(studyId, title)
    notify()
  }, [])

  return { studies, openStudy, closeStudy, reorder, setTitle }
}
