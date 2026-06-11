/**
 * Tracks in-flight interactive inference calls so background prompt warming
 * can defer until the GPU is free. Wrap the interactive InferenceClient with
 * withActivityTracking(); hand the warmer the RAW client plus the tracker so
 * warm requests are never counted against themselves.
 */

import type { InferenceClient, CompletionRequest, CompletionResponse, StreamChunk } from '../types.js';

export interface InferenceActivityTracker {
  /** Number of interactive requests currently in flight. */
  inFlight(): number;
}

interface MutableTracker extends InferenceActivityTracker {
  begin(): () => void;
}

export function createActivityTracker(): MutableTracker {
  let count = 0;
  return {
    inFlight: () => count,
    begin() {
      count += 1;
      let done = false;
      return () => {
        if (!done) {
          done = true;
          count -= 1;
        }
      };
    },
  };
}

export function withActivityTracking(
  client: InferenceClient,
  tracker: MutableTracker,
): InferenceClient {
  return {
    async complete(request: CompletionRequest): Promise<CompletionResponse> {
      const end = tracker.begin();
      try {
        return await client.complete(request);
      } finally {
        end();
      }
    },

    async *completeStream(request: CompletionRequest): AsyncIterable<StreamChunk> {
      const end = tracker.begin();
      try {
        yield* client.completeStream(request);
      } finally {
        end();
      }
    },
  };
}
