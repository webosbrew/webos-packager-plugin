import { createHash } from 'crypto';

import { Compilation, sources, type Compiler } from 'webpack';

import { AsyncIterableX } from 'ix/asynciterable/asynciterablex';
import { AsyncSink } from 'ix/asynciterable/asyncsink';
import { merge } from 'ix/asynciterable/merge';

import { IPKBuilder } from './ipk';

import type {
	FlavoredConfig,
	HOCDefinition,
	Namespace,
	PackageMetadata,
	PackagerOptions,
	SinkSource,
	WebpackArgv,
	WebpackEnvironment,
} from './declarations';

class AssetPackagerPlugin {
	protected pluginName = 'AssetPackagerPlugin';

	private sinks: AsyncSink<SinkSource>[] = [];
	private builder = new IPKBuilder();

	public constructor(
		private readonly options: PackagerOptions | null,
		private readonly metadata: PackageMetadata,
	) {
		this.builder.setMeta(metadata);
	}

	public apply(compiler: Compiler) {
		compiler.hooks.thisCompilation.tap(this.pluginName, compilation => {
			compilation.hooks.processAssets.tapPromise(
				{
					name: this.pluginName,
					stage: Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_TRANSFER,
				},
				async () => {
					// @ts-ignore bad typing
					const it: AsyncIterableX<SinkSource> = merge(...this.sinks);

					for await (const { namespace, assets } of it) {
						const map = Object.entries(assets).reduce(
							(accumulator, [path, asset]) => ({
								...accumulator,
								[path]: asset.buffer(),
							}),
							{} as Record<string, Buffer>,
						);

						this.builder.addEntries(namespace, map);
					}

					const filename = this.options?.filename ?? `${this.metadata.id}_${this.metadata.version}_all.ipk`;
					const buffer = await this.builder.buffer();

					compilation.emitAsset(filename, new sources.RawSource(buffer));

					if (this.options?.emitManifest) {
						const sha256 = createHash('sha256').update(buffer).digest('hex');

						compilation.emitAsset(
							`${this.metadata.id}.manifest.json`,
							this.createManifestAsset({
								ipkUrl: filename,
								ipkHash: { sha256 },
							}),
						);
					}
				},
			);
		});
	}

	public register(sink: AsyncSink<SinkSource>) {
		this.sinks.push(sink);
	}

	private createManifestAsset(fileInfo: { ipkUrl: string, ipkHash: { sha256: string } }) {
		if (!this.options?.emitManifest) {
			throw new TypeError('createManifestAsset: type guard');
		}

		const { id, version } = this.metadata;
		const {
			type = 'web',
			title,
			description: appDescription,
			iconUrl,
			sourceUrl: sourceUri,
			rootRequired = false,
		} = this.options.manifest;

		const manifest = {
			id, version, type, title, appDescription, iconUrl, sourceUri, rootRequired, ...fileInfo,
		};

		return new sources.RawSource(JSON.stringify(manifest, null, '\t'));
	}
}

class AssetHookPlugin {
	protected pluginName = 'AssetHookPlugin';

	private sink = new AsyncSink<SinkSource>();

	public constructor(packager: AssetPackagerPlugin, private readonly namespace: Namespace) {
		packager.register(this.sink);
	}

	public apply(compiler: Compiler) {
		compiler.hooks.thisCompilation.tap(this.pluginName, compilation => {
			compilation.hooks.processAssets.tap(
				{
					name: this.pluginName,
					stage: Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE,
				},
				() => {
					this.sink.write({
						namespace: this.namespace,
						assets: compilation.assets,
					});

					this.sink.end();
				},
			);
		});
	}
}

export const hoc =
	<E extends Record<string, any> = {}>(definition: HOCDefinition) =>
		(...argv: [WebpackEnvironment<E>, WebpackArgv<E>]) => {
			const invoke = (config: FlavoredConfig) =>
				Object.defineProperties(typeof config === 'function' ? config(...argv) : config, {
					id: { enumerable: false },
				});

			const app = invoke(definition.app);

			const packager = new AssetPackagerPlugin(
				definition.options ?? null,
				{
					id: definition.id,
					version: definition.version,
				},
			);

			const hook = new AssetHookPlugin(packager, { id: app.id, type: 'app' });

			app.plugins ??= [];
			app.plugins.push(packager, hook);

			const services = definition.services?.map(service => {
				const svc = invoke(service);
				const hook = new AssetHookPlugin(packager, { id: svc.id, type: 'service' });

				svc.plugins ??= [];
				svc.plugins.push(hook);

				return svc;
			});

			return [app, ...(services ?? [])];
		};
