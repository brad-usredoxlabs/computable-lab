import { describe, expect, it } from 'vitest';
import {
  detectDiffCorruption,
  checkDiffBalance,
  countChangedLines,
  filesOutsideBounds,
} from './FoundryCritic.js';

describe('FoundryCritic diff checks', () => {
  describe('detectDiffCorruption', () => {
    it('returns empty for clean diff', () => {
      const diff = `--- a/server/src/example.ts
+++ b/server/src/example.ts
@@ -1,3 +1,3 @@
 export function value(): number {
-  return 1;
+  return 2;
 }`;
      expect(detectDiffCorruption(diff)).toEqual([]);
    });

    it('detects literal \\n in added lines', () => {
      const diff = `--- a/server/src/example.ts
+++ b/server/src/example.ts
@@ -1,3 +1,3 @@
 export function value(): number {
-  return 1;
+  return \`hello\\nworld\`;
 }`;
      const findings = detectDiffCorruption(diff);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0]).toContain('literal');
    });

    it('detects floating case without nearby switch', () => {
      const diff = `--- a/server/src/example.ts
+++ b/server/src/example.ts
@@ -1,5 +1,6 @@
 export function classify(type: string) {
   const label = type;
+  case 'unknown': {
     return label;
   }
 }`;
      const findings = detectDiffCorruption(diff);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0]).toContain('floating');
    });

    it('does not flag case inside switch context', () => {
      const diff = `--- a/server/src/example.ts
+++ b/server/src/example.ts
@@ -1,5 +1,6 @@
 export function classify(type: string) {
   switch (type) {
+    case 'unknown': {
       return 'x';
     }
   }`;
      const findings = detectDiffCorruption(diff);
      // case 'unknown': is inside the switch block (8 lines of context)
      expect(findings.filter((f) => f.includes('floating'))).toEqual([]);
    });
  });

  describe('checkDiffBalance', () => {
    it('returns empty for balanced diff', () => {
      const diff = `--- a/server/src/example.ts
+++ b/server/src/example.ts
@@ -1,3 +1,3 @@
 export function value(): number {
-  return 1;
+  return 2;
 }`;
      expect(checkDiffBalance(diff)).toEqual([]);
    });

    it('detects unbalanced curly braces', () => {
      const diff = `--- a/server/src/example.ts
+++ b/server/src/example.ts
@@ -1,3 +1,4 @@
 export function value(): number {
+  if (true) {
   return 2;
 }`;
      const findings = checkDiffBalance(diff);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0]).toContain('curly braces');
    });

    it('detects unbalanced parentheses', () => {
      const diff = `--- a/server/src/example.ts
+++ b/server/src/example.ts
@@ -1,3 +1,3 @@
 export function value(): number {
-  return 1;
+  return foo(
 }`;
      const findings = checkDiffBalance(diff);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0]).toContain('parentheses');
    });
  });

  describe('countChangedLines', () => {
    it('counts added and removed lines correctly', () => {
      const diff = `--- a/server/src/example.ts
+++ b/server/src/example.ts
@@ -1,3 +1,3 @@
 export function value(): number {
-  return 1;
+  return 2;
 }`;
      expect(countChangedLines(diff)).toBe(2); // 1 added, 1 removed
    });

    it('ignores diff headers', () => {
      const diff = `--- a/server/src/example.ts
+++ b/server/src/example.ts`;
      expect(countChangedLines(diff)).toBe(0);
    });
  });

  describe('filesOutsideBounds', () => {
    it('returns empty when all files are within bounds', () => {
      expect(filesOutsideBounds(
        ['server/src/a.ts', 'server/src/b.ts'],
        ['server/src/a.ts', 'server/src/b.ts', 'server/src/c.ts'],
      )).toEqual([]);
    });

    it('returns files outside bounds', () => {
      expect(filesOutsideBounds(
        ['server/src/a.ts', 'server/src/z.ts'],
        ['server/src/a.ts'],
      )).toEqual(['server/src/z.ts']);
    });
  });
});
