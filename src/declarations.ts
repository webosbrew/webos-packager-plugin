import type { Compiler, Compilation, Configuration } from 'webpack';

export type WebpackEnvironment<Argv extends Record<string, any>> = Argv;

export type WebpackArgv<Argv extends Record<string, any>> = Partial<Pick<Configuration, 'mode'>> & {
	env: WebpackEnvironment<Argv>;
};

type WebpackConfigurationFn<
	Flavor extends Record<string, any>,
	Argv extends Record<string, any>,
> = (env: WebpackEnvironment<Argv>, argv: WebpackArgv<Argv>) => Configuration & Flavor;

type Config<Flavor extends Record<string, any>> =
	| (Configuration & Flavor)
	| WebpackConfigurationFn<Flavor, {}>;

export type Plugin = {
	apply(compiler: Compiler): void;
};

export type FlavoredConfig = Config<{ id: string }>;

export type Namespace = {
	id: string;
	type: 'app' | 'service';
};

export type PackageMetadata = {
	id: string;
	version: string;
};

export type ControlSection = Record<
	'Package' | 'Version' | 'Section' | 'Priority' | 'Architecture' | 'webOS-Package-Format-Version',
	string | number
>;

export type HookDeferredValue = {
	namespace: Namespace;
	assets: Compilation['assets'];
};

type HomebrewManifest = {
	title: string;
	description: string;
	iconUrl: string;
	sourceUrl: string;
	rootRequired?: boolean;
	type?: 'web' | 'native';
};

type MaybeHomebrewOptionsMixin = { emitManifest?: false; } | {
	emitManifest: true;
	manifest: HomebrewManifest;
};

export type PackagerOptions = MaybeHomebrewOptionsMixin & {
	filename?: string;
};

export type HOCDefinition = PackageMetadata & {
	options?: PackagerOptions;
	app: FlavoredConfig;
	services?: FlavoredConfig[];
};
