import { describe, expect, test } from 'bun:test';
import { parseServersRegistry } from '../servers';

describe('parseServersRegistry', () => {
  test('should keep well formed entries', () => {
    expect(
      parseServersRegistry([
        {
          name: 'Official',
          address: 'official.draevix.bond',
          description: 'Official server'
        }
      ])
    ).toEqual([
      {
        name: 'Official',
        address: 'official.draevix.bond',
        description: 'Official server'
      }
    ]);
  });

  test('should allow entries without a description', () => {
    expect(
      parseServersRegistry([{ name: 'Local', address: 'localhost:4991' }])
    ).toEqual([{ name: 'Local', address: 'localhost:4991' }]);
  });

  test('should drop malformed entries instead of failing the whole registry', () => {
    expect(
      parseServersRegistry([
        { name: 'Good', address: 'good.example.com' },
        { name: '', address: 'empty-name.example.com' },
        { name: 'No address' },
        { name: 'With path', address: 'example.com/server' },
        { name: 'With scheme', address: 'https://example.com' },
        'just a string',
        null
      ])
    ).toEqual([{ name: 'Good', address: 'good.example.com' }]);
  });

  test('should return nothing for a registry that is not a list', () => {
    expect(parseServersRegistry({})).toEqual([]);
    expect(parseServersRegistry(null)).toEqual([]);
    expect(parseServersRegistry('nope')).toEqual([]);
  });
});
