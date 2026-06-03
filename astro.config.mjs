// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mermaid from 'astro-mermaid';

// https://astro.build/config
export default defineConfig({
	integrations: [
		starlight({
			title: 'Agent Design Explore',
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/Lightbridge-KS/agent-design-explore',
				},
			],
			sidebar: [
				{
					label: 'Case Studies (OSS)',
					collapsed: false,
					items: [
						{
							label: 'agent-scripts',
							slug: 'oss/agent-scripts-system-architecture',
						},
					],
				},
				{
					label: 'Ideas-to-Implement ML',
					collapsed: false,
					items: [
						{
							label: 'Agent-Driven Prostate-Cancer ML',
							slug: 'idea-to-ml/agent-driven-prostate-ml-system-architecture',
						},
					],
				},
				// Future groups (e.g. "Concepts & Patterns") are added here as
				// synthesized pages land. See CLAUDE.md for the content model.
			],
		}),
		mermaid({
			theme: 'forest',
			autoTheme: true,
		}),
	],
});
