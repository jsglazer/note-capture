import { describe, it, expect } from 'vitest';
import { formatPage, buildBullet } from '../src/formatter';

describe('formatPage', () => {
	it('substitutes the page into the template', () => {
		expect(formatPage('(${page})', '42')).toBe('(42)');
	});

	it('applies the page prefix', () => {
		expect(formatPage('(${page})', '42', 'Smith, ')).toBe('(Smith, 42)');
	});

	it('replaces every occurrence of the placeholder', () => {
		expect(formatPage('${page}-${page}', '7')).toBe('7-7');
	});
});

describe('buildBullet', () => {
	it('builds a top-level bullet', () => {
		expect(buildBullet('the author argues X', '42', '(${page})', false, '\t')).toBe(
			'- the author argues X (42)',
		);
	});

	it('indents a nested bullet', () => {
		expect(buildBullet('a sub point', '42', '(${page})', true, '\t')).toBe('\t- a sub point (42)');
	});

	it('threads the page prefix through', () => {
		expect(buildBullet('the author argues X', '42', '(${page})', false, '\t', 'Smith, ')).toBe(
			'- the author argues X (Smith, 42)',
		);
	});
});
