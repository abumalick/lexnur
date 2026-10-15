import { describe, expect, it } from 'vitest';
import { encodeModifiedUtf7 } from './utf7';

describe('modified UTF-7', () => {
  it('keeps printable ASCII', () => expect(encodeModifiedUtf7('write')).toBe('write'));
  it('escapes ampersand', () => expect(encodeModifiedUtf7('a&b')).toBe('a&-b'));
  it('encodes Arabic as one base64 run', () => expect(encodeModifiedUtf7('كتب')).toBe('&BkMGKgYo-'));
  it('keeps ASCII around an Arabic run', () => expect(encodeModifiedUtf7('a&كتبb')).toBe('a&-&BkMGKgYo-b'));
  it('writes / as , in the base64', () => expect(encodeModifiedUtf7('Ͽ')).toBe('&A,8-'));
  it('encodes a single UTF-16 unit', () => expect(encodeModifiedUtf7('ك')).toBe('&BkM-'));
  it('encodes a surrogate pair as two units', () => expect(encodeModifiedUtf7('\u{1F600}')).toBe('&2D3eAA-'));
});
