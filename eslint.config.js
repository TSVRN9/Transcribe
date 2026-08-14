import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	js.configs.recommended,
	...tseslint.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		},
		rules: {
			// TS (and ambient globals like YT from @types/youtube) already
			// catches undefined references; no-undef can't see TS-only
			// constructs and false-positives on them.
			'no-undef': 'off'
		}
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: {
				parser: tseslint.parser
			}
		},
		rules: {
			// Doesn't trace through destructuring (`const { fn } = obj`),
			// so it misattributes the whole object as the handler value.
			'svelte/no-not-function-handler': 'off'
		}
	},
	{
		ignores: ['build/', '.svelte-kit/', 'package/', '*.cjs']
	}
);
