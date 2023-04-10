class ArFile {
	private static readonly MAX_IDENTIFIER_LENGTH = 16;

	private timestamp = Math.floor(Date.now() / 1000);
	private ownerId = 0;
	private groupId = 0;
	private fileMode = 100644;

	public constructor(private readonly identifier: string, private readonly content: Buffer) {
		if (identifier.length > ArFile.MAX_IDENTIFIER_LENGTH) {
			throw new ArError(`ArFile: Identifier (${identifier}) is too long.`);
		}
	}

	private header(): Buffer {
		return Buffer.from([
			this.identifier.padEnd(ArFile.MAX_IDENTIFIER_LENGTH),
			this.timestamp.toString().padEnd(12),
			this.ownerId.toString().padEnd(6),
			this.groupId.toString().padEnd(6),
			this.fileMode.toString().padEnd(8),
			this.content.length.toString().padEnd(10),
			'`\n',
		].join(''));
	}

	public buffer() {
		return Buffer.concat([
			this.header(),
			this.content,
			Buffer.from(this.content.length % 2 === 0 ? '' : '\n'),
		]);
	}
}

export class ArError extends Error {
	public constructor(message: string) {
		super(message);

		Object.setPrototypeOf(this, ArError.prototype);
	}
}

export class ArWriter {
	private readonly entities: ArFile[] = [];

	public append(identifier: string, content: Buffer | string) {
		this.entities.push(
			new ArFile(
				identifier,
				content instanceof Buffer ? content : Buffer.from(content),
			),
		);
	}

	public buffer() {
		return Buffer.concat([
			Buffer.from('!<arch>\n'),
			...this.entities.map(x => x.buffer()),
		]);
	}
}
