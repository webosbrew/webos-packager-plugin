import { createGzip, constants } from 'node:zlib';
import { createHash } from 'node:crypto';

import { pack, type Pack } from 'tar-stream';

import { validate } from 'schema-utils';

import { ArWriter } from './ar';

import schema from './schema.json';

import { Compilation, sources, type Compiler } from 'webpack';

import type { Schema } from 'schema-utils/declarations/validate';

export type HomebrewMetadata = {
	title: string;
	iconUrl: string;
	sourceUrl: string;
	rootRequired?: boolean;
	type?: 'web' | 'native';
}

type MaybeHomebrewOptionsMixin = {
	emitManifest: true;
	description: string;
	metadata: HomebrewMetadata;
} | {
	emitManifest?: false;
	metadata?: never;
};

export type WebOSPackagerOptions = MaybeHomebrewOptionsMixin & {
	id: string;
	version: string;
	filename?: string;
	description?: string;
	setExecutableBit?: boolean;
}

export class WebOSPackagerPlugin {
	public static readonly pluginName = 'webos-packager-plugin';

	private readonly ar = new ArWriter();

	public constructor(private readonly options: WebOSPackagerOptions) {
		validate(schema as Schema, options, {
			name: WebOSPackagerPlugin.pluginName,
		});
	}

	public apply(compiler: Compiler) {
		compiler.hooks.beforeRun.tapPromise(WebOSPackagerPlugin.pluginName, async () => {
			this.appendPackageSection();

			await this.appendControlSection();
		});

		compiler.hooks.thisCompilation.tap(WebOSPackagerPlugin.pluginName, compilation => {
			compilation.hooks.processAssets.tapPromise(
				{
					name: WebOSPackagerPlugin.pluginName,
					stage: Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_TRANSFER,
				},
				async () => {
					await this.appendDataSection(compilation.assets);

					const filename = this.options.filename ?? `${this.options.id}_${this.options.version}_all.ipk`;
					const buffer = this.ar.buffer();

					compilation.emitAsset(filename, new sources.RawSource(buffer));

					if (!this.options.emitManifest) {
						return;
					}

					const sha256 = createHash('sha256').update(buffer).digest('hex');

					compilation.emitAsset(
						`${this.options.id}.manifest.json`,
						new sources.RawSource(JSON.stringify({
							...this.createHomebrewManifest(),
							ipkUrl: filename,
							ipkHash: { sha256 },
						}, null, '\t')),
					);
				},
			);
		});
	}

	private appendPackageSection() {
		this.ar.append('debian-binary', '2.0\n');
	}

	private async appendControlSection() {
		const meta = this.serializeControlMeta();
		const tarball = pack();

		tarball.entry({ name: 'control' }, meta);

		this.ar.append('control.tar.gz', await this.collectTarball(tarball));
	}

	private async appendDataSection(assets: Record<string, sources.Source>) {
		const tarball = pack();

		for (const [asset, source] of Object.entries(assets)) {
			const buffer = source.buffer();
			const name = `usr/palm/applications/${this.options.id}/${asset}`;
			const mode = this.options.setExecutableBit && this.isExecutable(buffer) ? 755 : 644;

			tarball.entry({ name, mode }, buffer);
		}

		tarball.entry(
			{ name: `usr/palm/packages/${this.options.id}/packageinfo.json` },
			JSON.stringify({
				id: this.options.id,
				version: this.options.version,
				app: this.options.id,
			}, null, '\t'),
		);

		this.ar.append('data.tar.gz', await this.collectTarball(tarball));
	}

	private isExecutable(buffer: Buffer): boolean {
		if (buffer.length < 4) {
			return false;
		}

		return buffer.readUInt32BE() === 0x7f454c46 // elf
			|| buffer.readUInt16BE() === 0x2321; // shebang
	}

	private async collectTarball(packer: Pack): Promise<Buffer> {
		packer.finalize();

		const chunks = [];

		for await (const chunk of packer.pipe(createGzip({ level: constants.Z_BEST_COMPRESSION }))) {
			chunks.push(chunk);
		}

		return Buffer.concat(chunks);
	}

	private serializeControlMeta() {
		const control = {
			'Package': this.options.id,
			'Version': this.options.version,
			'Section': 'misc',
			'Priority': 'optional',
			'Architecture': 'all',
			'Description': this.options.description ?? 'webOS application.',
			'webOS-Package-Format-Version': 2,
		};

		let serialized = '';

		for (const [key, value] of Object.entries(control)) {
			serialized += `${key}: ${value}\n`;
		}

		return serialized;
	}

	private createHomebrewManifest() {
		return {
			id: this.options.id,
			version: this.options.version,
			type: this.options.metadata!.type,
			title: this.options.metadata!.title,
			appDescription: this.options.description,
			iconUri: this.options.metadata!.iconUrl,
			sourceUrl: this.options.metadata!.sourceUrl,
			rootRequired: this.options.metadata!.rootRequired,
		};
	}
}

export default WebOSPackagerPlugin;
