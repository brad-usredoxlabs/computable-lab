import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { EventPillBar } from './EventPillBar'
import type { PlateEvent } from '../../../types/events'

describe('EventPillBar', () => {
  it('renders duplicate event ids only once', () => {
    const event: PlateEvent = {
      eventId: 'evt-add_material-py5cw3n0',
      event_type: 'add_material',
      details: { labwareId: 'plate-1', wells: ['A1'] },
    }

    const { container } = render(
      <EventPillBar
        events={[event, { ...event }]}
        selectedEventId={null}
        onSelectEvent={vi.fn()}
      />,
    )

    expect(container.querySelectorAll('.scrubber-tick')).toHaveLength(1)
  })
})
