import { describe, it, expect } from 'vitest';
import { parseCsv } from './csvParser';

describe('parseCsv', () => {
  it('parses basic CSV', () => {
    const result = parseCsv('name,age,city\nAlice,30,NYC\nBob,25,LA');
    expect(result.headers).toEqual(['name', 'age', 'city']);
    expect(result.rows).toEqual([
      { name: 'Alice', age: '30', city: 'NYC' },
      { name: 'Bob', age: '25', city: 'LA' }
    ]);
  });

  it('handles quoted fields with commas', () => {
    const result = parseCsv('name,description\n"Smith, John","A, B, C"');
    expect(result.headers).toEqual(['name', 'description']);
    expect(result.rows).toEqual([
      { name: 'Smith, John', description: 'A, B, C' }
    ]);
  });

  it('handles quoted fields with newlines', () => {
    const result = parseCsv('name,notes\nAlice,"Line1\nLine2"\nBob,Simple');
    expect(result.headers).toEqual(['name', 'notes']);
    expect(result.rows).toEqual([
      { name: 'Alice', notes: 'Line1\nLine2' },
      { name: 'Bob', notes: 'Simple' }
    ]);
  });

  it('handles empty cells', () => {
    const result = parseCsv('a,b,c\n1,,3\n,2,\n1,2,3');
    expect(result.rows).toEqual([
      { a: '1', b: '', c: '3' },
      { a: '', b: '2', c: '' },
      { a: '1', b: '2', c: '3' }
    ]);
  });

  it('handles escaped quotes', () => {
    const result = parseCsv('name,quote\nAlice,"He said ""Hello"""');
    expect(result.rows).toEqual([
      { name: 'Alice', quote: 'He said "Hello"' }
    ]);
  });

  it('handles CRLF line endings', () => {
    const result = parseCsv('a,b\r\n1,2\r\n3,4');
    expect(result.headers).toEqual(['a', 'b']);
    expect(result.rows).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' }
    ]);
  });

  it('trims headers but not values', () => {
    const result = parseCsv('  name  ,  age  \nAlice,  30  ');
    expect(result.headers).toEqual(['name', 'age']);
    expect(result.rows).toEqual([
      { name: 'Alice', age: '  30  ' }
    ]);
  });

  it('pads rows with fewer fields', () => {
    const result = parseCsv('a,b,c\n1,2');
    expect(result.rows).toEqual([
      { a: '1', b: '2', c: '' }
    ]);
  });

  it('ignores extra fields', () => {
    const result = parseCsv('a,b\n1,2,3,4');
    expect(result.rows).toEqual([
      { a: '1', b: '2' }
    ]);
  });

  it('skips empty lines', () => {
    const result = parseCsv('a,b\n1,2\n\n3,4');
    expect(result.rows).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' }
    ]);
  });
});
