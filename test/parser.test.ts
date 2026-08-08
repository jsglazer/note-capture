import { describe, it, expect } from 'vitest';
import { parseLine, splitBulletPrefix, isAlreadyFormatted } from '../src/parser';

describe('parseLine', () => {
	it('parses standard page and note with delimiter', () => {
		const result = parseLine('42/my note', '/', 'required');
		expect(result).toEqual({ page: '42', text: 'my note' });
	});

	it('parses sticky page (delimiter only)', () => {
		const result = parseLine('/my note', '/', 'required');
		expect(result).toEqual({ page: null, text: 'my note' });
	});

	it('parses nested page and note with delimiter', () => {
		const result = parseLine('\t42/my note', '/', 'required');
		expect(result).toEqual({ page: '42', text: 'my note' });
	});

	it('parses nested sticky page (delimiter only)', () => {
		const result = parseLine('\t/my note', '/', 'required');
		expect(result).toEqual({ page: null, text: 'my note' });
	});

	it('returns null for normal text line without delimiter', () => {
		const result = parseLine('just a normal line', '/', 'required');
		expect(result).toBeNull();
	});

	it('accepts well-formed roman numerals in either case', () => {
		expect(parseLine('xiv/my note', '/', 'required')).toEqual({ page: 'xiv', text: 'my note' });
		expect(parseLine('XIV/my note', '/', 'required')).toEqual({ page: 'XIV', text: 'my note' });
		expect(parseLine('mcmxciv/my note', '/', 'required')).toEqual({
			page: 'mcmxciv',
			text: 'my note',
		});
	});

	it('rejects words that only look like roman numerals', () => {
		// "civil/rights movement" is prose, not page xiv — the old [ivxlcdm]+ pattern
		// matched it and silently rewrote the line.
		for (const word of ['civil', 'did', 'lid', 'mill']) {
			expect(parseLine(`${word}/rights movement`, '/', 'required')).toBeNull();
		}
	});
});

describe('splitBulletPrefix', () => {
	it('handles no bullet prefix', () => {
		expect(splitBulletPrefix('42/hello')).toEqual({
			indent: '',
			bulletPrefix: '',
			content: '42/hello',
		});
		expect(splitBulletPrefix('\t42/hello')).toEqual({
			indent: '',
			bulletPrefix: '',
			content: '\t42/hello',
		});
	});

	it('splits standard bullet prefix', () => {
		expect(splitBulletPrefix('- 42/hello')).toEqual({
			indent: '',
			bulletPrefix: '- ',
			content: '42/hello',
		});
		expect(splitBulletPrefix('\t- 42/hello')).toEqual({
			indent: '\t',
			bulletPrefix: '- ',
			content: '42/hello',
		});
		expect(splitBulletPrefix('  * /sticky')).toEqual({
			indent: '  ',
			bulletPrefix: '* ',
			content: '/sticky',
		});
	});

	it('splits checklist bullet prefix', () => {
		expect(splitBulletPrefix('- [ ] 42/hello')).toEqual({
			indent: '',
			bulletPrefix: '- [ ] ',
			content: '42/hello',
		});
		expect(splitBulletPrefix('\t- [x] /sticky')).toEqual({
			indent: '\t',
			bulletPrefix: '- [x] ',
			content: '/sticky',
		});
	});
});

describe('isAlreadyFormatted', () => {
	it('matches formatted templates', () => {
		expect(isAlreadyFormatted('- my note (42)', '(${page})')).toBe(true);
		expect(isAlreadyFormatted('\t- [ ] a task (xiv)', '(${page})')).toBe(true);
		expect(isAlreadyFormatted('- my note p. 42', 'p. ${page}')).toBe(true);
		expect(isAlreadyFormatted('- my note [page 42]', '[page ${page}]')).toBe(true);
	});

	it('does not match raw input lines', () => {
		expect(isAlreadyFormatted('- 42/my note', '(${page})')).toBe(false);
		expect(isAlreadyFormatted('\t- /sticky note', '(${page})')).toBe(false);
		expect(isAlreadyFormatted('42/my note', '(${page})')).toBe(false);
	});

	it('does not treat a parenthesised word as a page reference', () => {
		expect(isAlreadyFormatted('- a note about (civil)', '(${page})')).toBe(false);
		expect(isAlreadyFormatted('- a note about (mill)', '(${page})')).toBe(false);
	});
});
