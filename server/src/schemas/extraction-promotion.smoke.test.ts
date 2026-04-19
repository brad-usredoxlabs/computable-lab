import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

describe('extraction-promotion schema triplet', () => {
  const schemaPath = join(process.cwd(), 'schema/workflow/extraction-promotion.schema.yaml');
  const lintPath = join(process.cwd(), 'schema/workflow/extraction-promotion.lint.yaml');
  const uiPath = join(process.cwd(), 'schema/workflow/extraction-promotion.ui.yaml');

  describe('schema file', () => {
    it('exists', () => {
      expect(readFileSync(schemaPath, 'utf-8')).toBeTruthy();
    });

    it('parses as valid YAML', () => {
      const content = readFileSync(schemaPath, 'utf-8');
      const parsed = parseYaml(content);
      expect(parsed).toBeInstanceOf(Object);
    });

    it('has kind const set to extraction-promotion', () => {
      const content = readFileSync(schemaPath, 'utf-8');
      const parsed = parseYaml(content);
      expect(parsed.properties.kind.const).toBe('extraction-promotion');
    });

    it('has all 11 required fields', () => {
      const content = readFileSync(schemaPath, 'utf-8');
      const parsed = parseYaml(content);
      const requiredFields = [
        'kind',
        'recordId',
        'source_draft_ref',
        'candidate_path',
        'source_artifact_ref',
        'source_content_hash',
        'output_kind',
        'output_ref',
        'promoted_at',
        'version',
        'status',
      ];
      expect(parsed.required).toEqual(expect.arrayContaining(requiredFields));
      expect(parsed.required.length).toBe(11);
    });

    it('has recordId pattern XPR-*', () => {
      const content = readFileSync(schemaPath, 'utf-8');
      const parsed = parseYaml(content);
      const pattern = parsed.properties.recordId.pattern;
      expect(typeof pattern).toBe('string');
      expect(pattern).toContain('XPR-');
    });

    it('has source_content_hash field with 64-char hex pattern', () => {
      const content = readFileSync(schemaPath, 'utf-8');
      const parsed = parseYaml(content);
      expect(parsed.properties.source_content_hash).toBeDefined();
      const pattern = parsed.properties.source_content_hash.pattern;
      expect(typeof pattern).toBe('string');
      expect(pattern).toContain('[0-9a-f]');
      expect(pattern).toContain('{64}');
    });
  });

  describe('lint file', () => {
    it('exists', () => {
      expect(readFileSync(lintPath, 'utf-8')).toBeTruthy();
    });

    it('parses as valid YAML', () => {
      const content = readFileSync(lintPath, 'utf-8');
      const parsed = parseYaml(content);
      expect(parsed).toBeInstanceOf(Object);
    });

    it('has at least 5 rules', () => {
      const content = readFileSync(lintPath, 'utf-8');
      const parsed = parseYaml(content);
      expect(parsed.rules).toBeInstanceOf(Array);
      expect(parsed.rules.length).toBeGreaterThanOrEqual(5);
    });

    it('has xpr-recordid-pattern rule', () => {
      const content = readFileSync(lintPath, 'utf-8');
      const parsed = parseYaml(content);
      const recordIdRule = parsed.rules.find((r: any) => r.id === 'xpr-recordid-pattern');
      expect(recordIdRule).toBeDefined();
      expect(recordIdRule.check).toBe('regex');
      expect(recordIdRule.value).toContain('XPR-');
    });

    it('has xpr-hash-64 rule', () => {
      const content = readFileSync(lintPath, 'utf-8');
      const parsed = parseYaml(content);
      const hashRule = parsed.rules.find((r: any) => r.id === 'xpr-hash-64');
      expect(hashRule).toBeDefined();
      expect(hashRule.check).toBe('regex');
      expect(hashRule.value).toContain('[0-9a-f]');
      expect(hashRule.value).toContain('{64}');
    });

    it('has xpr-promoted-at-iso rule', () => {
      const content = readFileSync(lintPath, 'utf-8');
      const parsed = parseYaml(content);
      const promotedAtRule = parsed.rules.find((r: any) => r.id === 'xpr-promoted-at-iso');
      expect(promotedAtRule).toBeDefined();
      expect(promotedAtRule.check).toBe('iso-datetime');
    });

    it('has xpr-version-1 rule', () => {
      const content = readFileSync(lintPath, 'utf-8');
      const parsed = parseYaml(content);
      const versionRule = parsed.rules.find((r: any) => r.id === 'xpr-version-1');
      expect(versionRule).toBeDefined();
      expect(versionRule.check).toBe('eq');
      expect(versionRule.value).toBe(1);
    });

    it('has xpr-status-enum rule', () => {
      const content = readFileSync(lintPath, 'utf-8');
      const parsed = parseYaml(content);
      const statusRule = parsed.rules.find((r: any) => r.id === 'xpr-status-enum');
      expect(statusRule).toBeDefined();
      expect(statusRule.check).toBe('enum');
      expect(statusRule.value).toEqual(expect.arrayContaining(['active', 'retracted']));
    });
  });

  describe('ui file', () => {
    it('exists', () => {
      expect(readFileSync(uiPath, 'utf-8')).toBeTruthy();
    });

    it('parses as valid YAML', () => {
      const content = readFileSync(uiPath, 'utf-8');
      const parsed = parseYaml(content);
      expect(parsed).toBeInstanceOf(Object);
    });

    it('has kind set to extraction-promotion', () => {
      const content = readFileSync(uiPath, 'utf-8');
      const parsed = parseYaml(content);
      expect(parsed.kind).toBe('extraction-promotion');
    });

    it('has read_only set to true', () => {
      const content = readFileSync(uiPath, 'utf-8');
      const parsed = parseYaml(content);
      expect(parsed.display.read_only).toBe(true);
    });

    it('has title_template with recordId and output_ref.id', () => {
      const content = readFileSync(uiPath, 'utf-8');
      const parsed = parseYaml(content);
      expect(parsed.display.title_template).toContain('{{recordId}}');
      expect(parsed.display.title_template).toContain('{{output_ref.id}}');
    });

    it('has subtitle_template with output_kind and status', () => {
      const content = readFileSync(uiPath, 'utf-8');
      const parsed = parseYaml(content);
      expect(parsed.display.subtitle_template).toContain('{{output_kind}}');
      expect(parsed.display.subtitle_template).toContain('{{status}}');
    });

    it('has fields array with expected display fields', () => {
      const content = readFileSync(uiPath, 'utf-8');
      const parsed = parseYaml(content);
      const fieldPaths = parsed.display.fields.map((f: any) => f.path);
      expect(fieldPaths).toContain('recordId');
      expect(fieldPaths).toContain('kind');
      expect(fieldPaths).toContain('source_draft_ref.id');
      expect(fieldPaths).toContain('candidate_path');
      expect(fieldPaths).toContain('source_content_hash');
      expect(fieldPaths).toContain('output_kind');
      expect(fieldPaths).toContain('output_ref.id');
      expect(fieldPaths).toContain('promoted_at');
      expect(fieldPaths).toContain('status');
    });
  });
});
