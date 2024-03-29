import { constants, createGzip } from 'zlib';
import { dirname, join } from 'path/posix';

import { Pack, pack } from 'tar-stream';

import { ArWriter } from './ar';
import { getDirectoryParents } from './utils';

import type { ControlSection, Namespace, PackageMetadata } from './declarations';

const NAMESPACE_MAP: Record<Namespace['type'], string> = {
	app: 'applications',
	service: 'services',
};

const ELF_MAGIC = 0x7f454c46;
const SHEBANG_MAGIC = 0x2321;

export class IPKBuilder {
	private readonly ar = new ArWriter();
	private readonly data = pack();
	private readonly namespaces: Record<Namespace['type'], Set<string>> = {
		app: new Set(),
		service: new Set(),
	};
	private readonly createdParents = new Set<string>();

	public constructor(private readonly metadata: PackageMetadata) {
		this.ar.append('debian-binary', '2.0\n');
	}

	public addEntries({ id, type }: Namespace, assets: { [path: string]: Buffer }) {
		const root = `usr/palm/${NAMESPACE_MAP[type]}/${id}`;
		const tree = new Set<string>(getDirectoryParents(root));

		this.namespaces[type].add(id);

		for (const path in assets) {
			tree.add(join(root, dirname(path)));
		}

		for (const name of tree) {
			if (!this.createdParents.has(name)) {
				this.data.entry({ name, type: 'directory' });
			}

			this.createdParents.add(name);
		}

		for (const [asset, buffer] of Object.entries(assets)) {
			const name = `${root}/${asset}`;
			const mode = this.isExecutable(buffer) ? 0o755 : 0o644;

			this.data.entry({ name, mode }, buffer);
		}
	}

	public async buffer(): Promise<Buffer> {
		if (!this.metadata) {
			throw new IPKBuilderError('Package metadata not set.');
		}

		await this.appendControlSection();
		await this.appendDataSection();

		return this.ar.buffer();
	}

	private isExecutable(buffer: Buffer): boolean {
		if (buffer.length < 4) {
			return false;
		}

		return (
			buffer.readUInt32BE() === ELF_MAGIC ||
			buffer.readUInt16BE() === SHEBANG_MAGIC
		);
	}

	private async collectTarball(packer: Pack): Promise<Buffer> {
		packer.finalize();

		const chunks = [];

		for await (const chunk of packer.pipe(
			createGzip({ level: constants.Z_BEST_COMPRESSION }),
		)) {
			chunks.push(chunk);
		}

		return Buffer.concat(chunks);
	}

	private async appendControlSection(overrides?: Partial<ControlSection>): Promise<void> {
		const tarball = pack();

		const control: ControlSection = {
			Package: this.metadata.id,
			Version: this.metadata.version,
			Section: 'misc',
			Priority: 'optional',
			Architecture: 'all',
			'webOS-Package-Format-Version': 2,
			...overrides,
		};

		const serialized = Object.entries(control).reduce(
			(accumulator, [key, value]) => `${accumulator}${key}: ${value}\n`,
			'',
		);

		tarball.entry({ name: 'control' }, serialized);

		this.ar.append('control.tar.gz', await this.collectTarball(tarball));
	}

	private async appendDataSection() {
		const packageInfo = {
			id: this.metadata.id,
			version: this.metadata.version,
			app: this.namespaces.app.values().next().value!,
			services: Array.from(this.namespaces.service.values()),
		};

		const root = `usr/palm/packages/${this.metadata.id}`;

		for (const name of getDirectoryParents(root)) {
			if (!this.createdParents.has(name)) {
				this.data.entry({ name, type: 'directory' });
			}
		}

		this.data.entry(
			{ name: join(root, 'packageinfo.json') },
			JSON.stringify(packageInfo, null, '\t'),
		);

		this.ar.append('data.tar.gz', await this.collectTarball(this.data));
	}
}

export class IPKBuilderError extends Error {
	public constructor(message: string) {
		super(message);

		Object.setPrototypeOf(this, IPKBuilderError.prototype);
	}
}
