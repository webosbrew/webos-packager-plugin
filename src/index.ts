import { createHash } from 'crypto';

import { Compilation, sources, type Compiler } from 'webpack';

import { IPKBuilder } from './ipk';
import { Deferred } from './utils';

import type {
	FlavoredConfig,
	HOCDefinition,
	Namespace,
	PackageMetadata,
	PackagerOptions,
	Plugin,
	HookDeferredValue,
	WebpackArgv,
	WebpackEnvironment,
} from './declarations';

export type { FlavoredConfig } from './declarations';

abstract class AssetPlugin implements Plugin {
	protected readonly abstract pluginName: string;

	protected constructor(private readonly stage: number) {}

	protected abstract hook(compilation: Compilation): Promise<void> | void;

	public apply(compiler: Compiler) {
		compiler.hooks.thisCompilation.tap(this.pluginName, compilation => {
			compilation.hooks.processAssets.tapPromise(
				{
					name: this.pluginName,
					stage: this.stage,
				},
				async () => await this.hook(compilation),
			);
		});
	}
}

class AssetPackagerPlugin extends AssetPlugin {
	protected pluginName = 'AssetPackagerPlugin';

	private promises: PromiseLike<HookDeferredValue>[] = [];
	private builder: IPKBuilder;

	public constructor(
		private readonly options: PackagerOptions | null,
		private readonly metadata: PackageMetadata,
	) {
		super(Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_TRANSFER);

		this.builder = new IPKBuilder(metadata);
	}

	public register(promise: PromiseLike<HookDeferredValue>) {
		this.promises.push(promise);
	}

	protected async hook(compilation: Compilation) {
		const compilations = await Promise.all(this.promises);

		for await (const { namespace, assets } of compilations) {
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

class AssetHookPlugin extends AssetPlugin {
	protected pluginName = 'AssetHookPlugin';

	private deferred = new Deferred<HookDeferredValue>();

	public constructor(private readonly namespace: Namespace) {
		super(Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE);
	}

	public get promise() {
		return this.deferred.promise;
	}

	protected hook(compilation: Compilation) {
		this.deferred.resolve({
			namespace: this.namespace,
			assets: compilation.assets,
		});
	}
}

export class WebOSPackagerPlugin implements Plugin {
	private readonly packager: AssetPackagerPlugin;
	private readonly hook: AssetHookPlugin;

	public constructor(options: PackageMetadata & PackagerOptions & Namespace) {
		this.packager = new AssetPackagerPlugin(options, options);
		this.hook = new AssetHookPlugin(options);

		this.packager.register(this.hook.promise);
	}

	public apply(compiler: Compiler) {
		this.packager.apply(compiler);
		this.hook.apply(compiler);
	}
}

export const hoc =
	<E extends Record<string, any> = {}>(definition: HOCDefinition) =>
		(...argv: [WebpackEnvironment<E>, WebpackArgv<E>]) => {
			const invoke = (config: FlavoredConfig) =>
				Object.defineProperties(typeof config === 'function' ? config(...argv) : config, {
					id: { enumerable: false },
				});

			const packager = new AssetPackagerPlugin(
				definition.options ?? null,
				{
					id: definition.id,
					version: definition.version,
				},
			);

			const app = invoke(definition.app);
			const hook = new AssetHookPlugin({ id: app.id, type: 'app' });

			app.plugins ??= [];
			app.plugins.push(packager, hook);

			packager.register(hook.promise);

			const services = definition.services?.map(service => {
				const svc = invoke(service);
				const hook = new AssetHookPlugin({ id: svc.id, type: 'service' });

				svc.plugins ??= [];
				svc.plugins.push(hook);

				packager.register(hook.promise);

				return svc;
			});

			return [app, ...(services ?? [])];
		};
