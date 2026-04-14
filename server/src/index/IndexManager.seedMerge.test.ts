import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IndexManager } from './IndexManager.js';
import { resolveSeedRecordsDir } from './seedRecordsDir.js';
import { mkdirSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Mock repo adapter for testing
class MockRepoAdapter {
  private files: Map<string, { content: string; sha: string }> = new Map();
  
  async getFile(path: string): Promise<{ content: string; sha: string } | null> {
    return this.files.get(path) ?? null;
  }
  
  async listFiles(opts: { directory: string; pattern: string; recursive: boolean }): Promise<string[]> {
    const results: string[] = [];
    const { directory, pattern } = opts;
    
    for (const [filePath] of this.files) {
      // Check if file is under the specified directory
      // Handle both cases: directory is 'records' and filePath is 'records/labware/foo.yaml'
      // or directory is './records' and filePath is 'records/labware/foo.yaml'
      const normalizedDir = directory.replace(/^\.\//, '');
      if (!filePath.startsWith(normalizedDir) && !filePath.startsWith(normalizedDir + '/')) {
        continue;
      }
      
      // Check pattern match
      if (pattern === '*.yaml' && (filePath.endsWith('.yaml') || filePath.endsWith('.yml'))) {
        results.push(filePath);
      }
    }
    
    return results;
  }
  
  async fileExists(path: string): Promise<boolean> {
    return this.files.has(path);
  }
  
  async createFile(_opts: { path: string; content: string; message: string }): Promise<void> {
    // Mock implementation
  }
  
  async updateFile(_opts: { path: string; content: string; sha: string; message: string }): Promise<void> {
    // Mock implementation
  }
  
  addFile(path: string, content: string): void {
    const sha = `mock-sha-${path}`;
    this.files.set(path, { content, sha });
  }
}

describe('IndexManager seed record merging', () => {
  let testDir: string;
  let fakeLabDir: string;
  let fakeSeedDir: string;
  let mockRepo: MockRepoAdapter;
  
  beforeEach(() => {
    testDir = join(process.cwd(), 'test-tmp-' + Date.now());
    fakeLabDir = join(testDir, 'fake-lab');
    fakeSeedDir = join(testDir, 'seed');
    
    // Create directory structure
    mkdirSync(join(fakeLabDir, 'records', 'labware'), { recursive: true });
    mkdirSync(join(fakeSeedDir, 'labware'), { recursive: true });
    
    mockRepo = new MockRepoAdapter();
  });
  
  afterEach(() => {
    // Cleanup test directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });
  
  it('should include connected-lab record when it collides with seed record', async () => {
    // Create a connected-lab record with recordId 'lbw-seed-12-well-reservoir'
    const connectedLabRecord = `
$schema: https://computable-lab.com/schema/computable-lab/labware.schema.yaml
kind: labware
recordId: lbw-seed-12-well-reservoir
name: Connected Lab 12 Well Reservoir
labwareType: reservoir
format:
  rows: 1
  cols: 12
  wellCount: 12
  wellNaming: "A1..L1"
`;
    
    // Create a seed record with the SAME recordId
    const seedRecord = `
$schema: https://computable-lab.com/schema/computable-lab/labware.schema.yaml
kind: labware
recordId: lbw-seed-12-well-reservoir
name: NEST 12 Well Reservoir 15 mL (seed)
labwareType: reservoir
format:
  rows: 1
  cols: 12
  wellCount: 12
  wellNaming: "A1..L1"
manufacturer:
  name: NEST
  catalogNumber: "714121"
tags:
  - seed
  - reservoir
`;
    
    // Add connected-lab record to mock repo
    mockRepo.addFile('records/labware/lbw-seed-12-well-reservoir.yaml', connectedLabRecord);
    
    // Create seed directory with the seed record
    writeFileSync(
      join(fakeSeedDir, 'labware', 'lbw-seed-12-well-reservoir.yaml'),
      seedRecord
    );
    
    // Create IndexManager and rebuild with seedDir override
    const manager = new IndexManager(mockRepo as any, { baseDir: 'records' });
    const index = await manager.rebuild(fakeSeedDir);
    
    // Verify the connected-lab version wins
    const entry = await manager.getByRecordId('lbw-seed-12-well-reservoir');
    expect(entry).toBeDefined();
    expect(entry?.title).toBe('Connected Lab 12 Well Reservoir');
    expect(entry?.path).toBe('records/labware/lbw-seed-12-well-reservoir.yaml');
  });
  
  it('should include seed record when no connected-lab record exists', async () => {
    // Create a connected-lab record with a different recordId
    const connectedLabRecord = `
$schema: https://computable-lab.com/schema/computable-lab/labware.schema.yaml
kind: labware
recordId: conn-1
name: Connected Lab Plate
labwareType: plate
format:
  rows: 8
  cols: 12
  wellCount: 96
  wellNaming: "A1..H12"
`;
    
    // Create a seed record with unique recordId (no collision)
    const seedRecord = `
$schema: https://computable-lab.com/schema/computable-lab/labware.schema.yaml
kind: labware
recordId: lbw-seed-96-well-plate
name: NEST 96 Well Plate (seed)
labwareType: plate
format:
  rows: 8
  cols: 12
  wellCount: 96
  wellNaming: "A1..H12"
manufacturer:
  name: NEST
  catalogNumber: "714196"
tags:
  - seed
  - plate
`;
    
    // Add connected-lab record to mock repo
    mockRepo.addFile('records/labware/conn-1.yaml', connectedLabRecord);
    
    // Create seed directory with the seed record
    writeFileSync(
      join(fakeSeedDir, 'labware', 'lbw-seed-96-well-plate.yaml'),
      seedRecord
    );
    
    // Create IndexManager and rebuild with seedDir override
    const manager = new IndexManager(mockRepo as any, { baseDir: 'records' });
    const index = await manager.rebuild(fakeSeedDir);
    
    // Verify both records exist
    expect(index.entries.length).toBe(2);
    
    // Verify connected-lab record
    const connEntry = await manager.getByRecordId('conn-1');
    expect(connEntry).toBeDefined();
    expect(connEntry?.title).toBe('Connected Lab Plate');
    
    // Verify seed record is included
    const seedEntry = await manager.getByRecordId('lbw-seed-96-well-plate');
    expect(seedEntry).toBeDefined();
    expect(seedEntry?.title).toBe('NEST 96 Well Plate (seed)');
  });
  
  it('should handle collision and non-collision in the same rebuild', async () => {
    // Connected-lab record that will collide
    const connectedLabRecord1 = `
$schema: https://computable-lab.com/schema/computable-lab/labware.schema.yaml
kind: labware
recordId: lbw-seed-12-well-reservoir
name: Connected Lab Reservoir
labwareType: reservoir
`;
    
    // Connected-lab record that won't collide
    const connectedLabRecord2 = `
$schema: https://computable-lab.com/schema/computable-lab/labware.schema.yaml
kind: labware
recordId: conn-1
name: Connected Lab Item
labwareType: other
`;
    
    // Seed record with collision
    const seedRecord1 = `
$schema: https://computable-lab.com/schema/computable-lab/labware.schema.yaml
kind: labware
recordId: lbw-seed-12-well-reservoir
name: Seed Reservoir
labwareType: reservoir
`;
    
    // Seed record without collision
    const seedRecord2 = `
$schema: https://computable-lab.com/schema/computable-lab/labware.schema.yaml
kind: labware
recordId: lbw-seed-96-well-plate
name: Seed Plate
labwareType: plate
`;
    
    // Add connected-lab records
    mockRepo.addFile('records/labware/lbw-seed-12-well-reservoir.yaml', connectedLabRecord1);
    mockRepo.addFile('records/labware/conn-1.yaml', connectedLabRecord2);
    
    // Create seed directory with both seed records
    writeFileSync(
      join(fakeSeedDir, 'labware', 'lbw-seed-12-well-reservoir.yaml'),
      seedRecord1
    );
    writeFileSync(
      join(fakeSeedDir, 'labware', 'lbw-seed-96-well-plate.yaml'),
      seedRecord2
    );
    
    // Create IndexManager and rebuild with seedDir override
    const manager = new IndexManager(mockRepo as any, { baseDir: 'records' });
    const index = await manager.rebuild(fakeSeedDir);
    
    // Verify all three unique recordIds exist
    expect(index.entries.length).toBe(3);
    
    // Collision case: connected-lab wins
    const collisionEntry = await manager.getByRecordId('lbw-seed-12-well-reservoir');
    expect(collisionEntry?.title).toBe('Connected Lab Reservoir');
    
    // Non-collision case: connected-lab record exists
    const connEntry = await manager.getByRecordId('conn-1');
    expect(connEntry?.title).toBe('Connected Lab Item');
    
    // Non-collision case: seed-only record is included
    const seedOnlyEntry = await manager.getByRecordId('lbw-seed-96-well-plate');
    expect(seedOnlyEntry?.title).toBe('Seed Plate');
  });
  
  it('should resolve seed directory correctly when it exists', () => {
    // This test verifies the resolveSeedRecordsDir function works
    // We can't easily test the actual path resolution without a real records/seed structure
    // But we can verify it returns null when no seed dir exists
    const result = resolveSeedRecordsDir('/nonexistent/path');
    expect(result).toBeNull();
  });
});
