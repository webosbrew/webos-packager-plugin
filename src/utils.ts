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

export const getDirectoryParents = (child: string) => {
	const parents: string[] = [];

	for (let dir = child; dir !== '.'; dir = dirname(dir)) {
		parents.push(dir);
	}

	return parents.reverse();
};
