import { expect } from 'vitest';
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

declare module 'vitest' {
  interface Assertion<T> extends TestingLibraryMatchers<any, T> {
  }
}

// This should compile if augmentation works
const a = expect<HTMLElement>(null as any);
a.toHaveTextContent('hello');

export {};
