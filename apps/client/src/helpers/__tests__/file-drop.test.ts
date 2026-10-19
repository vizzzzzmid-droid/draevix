import { describe, expect, test } from 'bun:test';
import { getFilesFromDataTransfer, hasFilesInDataTransfer } from '../file-drop';

const createDataTransfer = (overrides: Partial<DataTransfer>) =>
  overrides as DataTransfer;

describe('hasFilesInDataTransfer', () => {
  test('recognizes file drags while the file list is protected', () => {
    const dataTransfer = createDataTransfer({
      types: ['Files'] as unknown as DataTransfer['types'],
      files: [] as unknown as FileList,
      items: [] as unknown as DataTransferItemList
    });

    expect(hasFilesInDataTransfer(dataTransfer)).toBe(true);
  });

  test('ignores text drags', () => {
    const dataTransfer = createDataTransfer({
      types: ['text/plain'] as unknown as DataTransfer['types'],
      files: [] as unknown as FileList,
      items: [] as unknown as DataTransferItemList
    });

    expect(hasFilesInDataTransfer(dataTransfer)).toBe(false);
  });

  test('accepts a file item when the browser has no Files transfer type', () => {
    const dataTransfer = createDataTransfer({
      types: [] as unknown as DataTransfer['types'],
      files: [] as unknown as FileList,
      items: [{ kind: 'file' }] as unknown as DataTransferItemList
    });

    expect(hasFilesInDataTransfer(dataTransfer)).toBe(true);
  });
});

describe('getFilesFromDataTransfer', () => {
  test('uses the dropped FileList when available', () => {
    const file = new File(['content'], 'notes.txt', { type: 'text/plain' });
    const dataTransfer = createDataTransfer({
      files: [file] as unknown as FileList,
      items: [] as unknown as DataTransferItemList
    });

    expect(getFilesFromDataTransfer(dataTransfer)).toEqual([file]);
  });

  test('falls back to file items when the dropped FileList is empty', () => {
    const file = new File(['content'], 'notes.txt', { type: 'text/plain' });
    const dataTransfer = createDataTransfer({
      files: [] as unknown as FileList,
      items: [
        { kind: 'string', getAsFile: () => null },
        { kind: 'file', getAsFile: () => file },
        { kind: 'file', getAsFile: () => null }
      ] as unknown as DataTransferItemList
    });

    expect(getFilesFromDataTransfer(dataTransfer)).toEqual([file]);
  });

  test('returns no files when there is no transfer', () => {
    expect(getFilesFromDataTransfer(null)).toEqual([]);
  });
});
