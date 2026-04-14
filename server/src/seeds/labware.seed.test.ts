import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';

describe('Labware Seed Records', () => {
  const seedLabwareDir = path.resolve(__dirname, '..', '..', '..', 'records', 'seed', 'labware');

  it('should have at least 10 YAML files in records/seed/labware/', () => {
    const files = fs.readdirSync(seedLabwareDir).filter(f => f.endsWith('.yaml'));
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  it('should have all recordIds starting with lbw-seed-', () => {
    const files = fs.readdirSync(seedLabwareDir).filter(f => f.endsWith('.yaml'));
    const regex = /^lbw-seed-/;
    
    for (const file of files) {
      const filePath = path.join(seedLabwareDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const doc = yaml.load(content) as any;
      
      expect(doc.kind).toBe('labware');
      expect(doc.recordId).toMatch(regex);
    }
  });
});
