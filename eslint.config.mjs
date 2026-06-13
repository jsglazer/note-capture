// Obsidian plugin ESLint flat config (from ~/Dev/devkit).
// typescript-eslint (type-checked) + eslint-plugin-obsidianmd + Prettier compat.
// Lint with: `eslint src`
import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
	{
		ignores: ['main.js', 'node_modules/', 'coverage/', '**/*.config.mjs', '**/*.config.ts'],
	},
	// Brings typescript-eslint base + recommended-type-checked + Obsidian rules.
	...obsidianmd.configs.recommended,
	{
		// obsidianmd enables type-checked rules but leaves project resolution to us.
		files: ['**/*.ts', '**/*.tsx'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		files: ['src/**/*.ts'],
		rules: {
			// "Note Capture" is the plugin's proper name (a brand). The ignored
			// strings are example/placeholder text where lowercasing reads wrong
			// ("e.g.", a literal key name, an illustrative citation example).
			'obsidianmd/ui/sentence-case': [
				'error',
				{
					brands: ['Note Capture'],
					ignoreRegex: [
						'^Text inserted before the page number',
						'^e\\.g\\. Smith,',
						'^Keypress \\(Enter\\)$',
					],
				},
			],
		},
	},
	// Turn off rules that conflict with Prettier — keep this last.
	prettier,
);
