import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PreviewBanner } from './PreviewBanner';

const fakeEvent: any = { eventId: 'e1', event_type: 'add_material', details: { wells: ['A1'] } };
const fakeLabware: any = { recordId: 'lbw-1', reason: 'auto-create' };
const noop = () => {};

describe('PreviewBanner render gates', () => {
  it('does not render when both lists are empty', () => {
    const { container } = render(
      <PreviewBanner
        previewEvents={[]}
        previewLabwareAdditions={[]}
        unresolvedCount={0}
        onAccept={noop}
        onReject={noop}
        isAccepting={false}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders when only events are present', () => {
    const { container, getByText } = render(
      <PreviewBanner
        previewEvents={[fakeEvent]}
        previewLabwareAdditions={[]}
        unresolvedCount={0}
        onAccept={noop}
        onReject={noop}
        isAccepting={false}
      />
    );
    expect(container.firstChild).not.toBeNull();
    expect(() => getByText(/accept/i)).not.toThrow();
  });

  it('renders when only labware additions are present', () => {
    const { container, queryByText } = render(
      <PreviewBanner
        previewEvents={[]}
        previewLabwareAdditions={[fakeLabware]}
        unresolvedCount={0}
        onAccept={noop}
        onReject={noop}
        isAccepting={false}
      />
    );
    expect(container.firstChild).not.toBeNull();
    // Verify that '0 events' text is NOT present when there are no events
    expect(queryByText(/0 events/i)).toBeNull();
  });

  it('renders both sections when both are present', () => {
    const { container } = render(
      <PreviewBanner
        previewEvents={[fakeEvent]}
        previewLabwareAdditions={[fakeLabware]}
        unresolvedCount={0}
        onAccept={noop}
        onReject={noop}
        isAccepting={false}
      />
    );
    expect(container.firstChild).not.toBeNull();
  });
});
