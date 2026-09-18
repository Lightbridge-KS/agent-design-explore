import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { PDFDocument } from 'pdf-lib';
import puppeteer from 'puppeteer';

const host = '127.0.0.1';
const port = 4321;
const baseUrl = `http://${host}:${port}`;
const { values } = parseArgs({
	options: {
		'output-dir': {
			type: 'string',
			default: 'output/pdf',
		},
	},
});
const outputDirectory = values['output-dir'].trim();
if (!outputDirectory) throw new Error('--output-dir must not be empty.');
const outputFile = `${outputDirectory}/agent-design-explore.pdf`;
const pdfMermaidTheme = process.env.PDF_MERMAID_THEME || 'neutral';
const siteBuildEnvironment = {
	...process.env,
	PDF_EXPORT: '0',
};
const pdfBuildEnvironment = {
	...process.env,
	PDF_EXPORT: '1',
	PDF_MERMAID_THEME: pdfMermaidTheme,
};
const astroCli = fileURLToPath(
	new URL('../node_modules/astro/bin/astro.mjs', import.meta.url),
);

function run(command, args, { env = process.env } = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { env, stdio: 'inherit' });
		child.once('error', reject);
		child.once('exit', (code, signal) => {
			if (code === 0) {
				resolve();
				return;
			}

			reject(
				new Error(
					`${command} exited with ${signal ? `signal ${signal}` : `code ${code}`}`,
				),
			);
		});
	});
}

async function firstExecutable(candidates) {
	for (const candidate of candidates.filter(Boolean)) {
		try {
			await access(candidate, constants.X_OK);
			return candidate;
		} catch {
			// Try the next known browser location.
		}
	}

	return undefined;
}

async function findBrowserExecutable() {
	const browserExecutable = process.env.PDF_BROWSER_EXECUTABLE;
	if (browserExecutable) {
		try {
			await access(browserExecutable, constants.X_OK);
			return browserExecutable;
		} catch {
			throw new Error(
				`PDF_BROWSER_EXECUTABLE is not executable: ${browserExecutable}`,
			);
		}
	}

	let managedBrowser;
	try {
		managedBrowser = await puppeteer.launch({ headless: true });
		await managedBrowser.close();
		return undefined;
	} catch (error) {
		await managedBrowser?.close().catch(() => {});
		const fallbackExecutable = await firstExecutable([
			'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
			'/Applications/Chromium.app/Contents/MacOS/Chromium',
			'/usr/bin/google-chrome',
			'/usr/bin/google-chrome-stable',
			'/usr/bin/chromium',
			'/usr/bin/chromium-browser',
			process.env.PROGRAMFILES
				? `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`
				: undefined,
		]);

		if (fallbackExecutable) {
			console.warn(
				`Puppeteer's managed browser could not launch; using ${fallbackExecutable}.`,
			);
			return fallbackExecutable;
		}

		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Puppeteer's managed browser could not launch and no system fallback was found: ${reason}`,
		);
	}
}

async function waitForPreview(previewProcess) {
	const deadline = Date.now() + 60_000;

	while (Date.now() < deadline) {
		if (previewProcess.exitCode !== null) {
			throw new Error('Astro preview exited before becoming ready.');
		}

		try {
			const response = await fetch(baseUrl);
			if (response.ok) return;
		} catch {
			// The preview server is still starting.
		}

		await new Promise((resolve) => setTimeout(resolve, 250));
	}

	throw new Error(`Astro preview did not become ready at ${baseUrl}.`);
}

async function stopPreview(previewProcess) {
	if (previewProcess.exitCode !== null) return;

	previewProcess.kill('SIGTERM');
	await Promise.race([
		new Promise((resolve) => previewProcess.once('exit', resolve)),
		new Promise((resolve) => setTimeout(resolve, 5_000)),
	]);

	if (previewProcess.exitCode === null) previewProcess.kill('SIGKILL');
}

async function finalizePdf() {
	const pdfBytes = await readFile(outputFile);
	const pdfDocument = await PDFDocument.load(pdfBytes);
	const pageCount = pdfDocument.getPageCount();

	if (pageCount < 1) throw new Error('Generated PDF contains no pages.');

	pdfDocument.setTitle('Agent Design Explore');
	pdfDocument.setAuthor('Kittipos Sirivongrungson');
	pdfDocument.setSubject(
		'Ideas, architectural patterns, and real-world case studies for agentic system design.',
	);
	pdfDocument.setKeywords([
		'agentic systems',
		'agent harnesses',
		'system architecture',
		'AI agents',
	]);
	pdfDocument.setCreator('Agent Design Explore PDF build');
	pdfDocument.setProducer('Starlight to PDF and pdf-lib');
	pdfDocument.setModificationDate(new Date());

	await writeFile(outputFile, await pdfDocument.save());

	const finalizedBytes = await readFile(outputFile);
	const finalizedDocument = await PDFDocument.load(finalizedBytes);
	if (finalizedDocument.getPageCount() !== pageCount) {
		throw new Error('PDF page count changed while applying metadata.');
	}
	if (finalizedDocument.getTitle() !== 'Agent Design Explore') {
		throw new Error('Generated PDF metadata validation failed.');
	}

	return pageCount;
}

async function main() {
	await run('pnpm', ['build'], { env: siteBuildEnvironment });
	await run('pnpm', ['build'], { env: pdfBuildEnvironment });
	await mkdir(outputDirectory, { recursive: true });

	const previewProcess = spawn(
		process.execPath,
		[astroCli, 'preview', '--host', host, '--port', String(port)],
		{ env: pdfBuildEnvironment, stdio: 'inherit' },
	);

	try {
		await waitForPreview(previewProcess);

		const browserExecutable = await findBrowserExecutable();
		const exporterArgs = [
			'exec',
			'starlight-to-pdf',
			baseUrl,
			'--path',
			outputDirectory,
			'--filename',
			'agent-design-explore',
			'--format',
			'A4',
			'--margins',
			'18mm 13mm 18mm 18mm',
			'--contents-name',
			'Contents',
			'--contents-links',
			'internal',
			'--preceding-html',
			'pdf/cover.html',
			'--footer',
			'pdf/footer.html',
			'--header',
			'pdf/header.html',
			'--styles',
			'pdf/print.css',
			'--page-wait-until',
			'networkidle0',
			'--scroll-delay',
			'25',
			'--timeout',
			'600000',
			'--print-bg',
			'--pdf-outline',
		];

		if (browserExecutable) {
			exporterArgs.push('--browser-executable', browserExecutable);
		}

		await run('pnpm', exporterArgs);
		const pageCount = await finalizePdf();
		console.log(
			`Validated ${outputFile} (${pageCount} pages, Mermaid theme: ${pdfMermaidTheme}).`,
		);
	} finally {
		await stopPreview(previewProcess);
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
