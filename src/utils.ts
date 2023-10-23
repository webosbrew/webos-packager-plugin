import { dirname } from 'path/posix';

export class Deferred<T> {
	public promise: Promise<T>;
	public resolve!: (value: T | PromiseLike<T>) => void;
	public reject!: (reason?: any) => void;

	public constructor() {
		this.promise = new Promise((resolve, reject) => {
			this.resolve = resolve;
			this.reject = reject;
		});
	}
}

export const getDirectoryParents = (dir: string) => {
	const parents: string[] = [];

	while (dir !== '.') {
		parents.push(dir);
		dir = dirname(dir);
	}

	return parents.reverse();
};
