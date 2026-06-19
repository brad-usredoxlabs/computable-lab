// Bridge: vitest 1.x declares Assertion inside @vitest/expect, not in 'vitest'.
// The jest-dom augmentation of 'vitest' doesn't reach, so we re-target it.

import type { TestingLibraryMatchers } from '@testing-library/jest-dom/types/matchers';

declare global {
  // Create a global type that extends Assertion with jest-dom matchers
  namespace JestDOM {
    interface ExtendedAssertion<T> extends TestingLibraryMatchers<any, T> {
    }
  }
}

// This augmentation should merge with @vitest/expect's Assertion
declare module '@vitest/expect' {
  interface Assertion<T> extends TestingLibraryMatchers<any, T> {
  }
}
