import { join } from 'path';

import { Configuration } from 'webpack';

import { WebOSPackagerPlugin } from '../src';

export default <Configuration>{
	mode: 'development',
	entry: './src/app.js',
	output: {
		filename: 'main.js',
		path: join(__dirname, 'dist/plugin'),
	},
	plugins: [
		new WebOSPackagerPlugin({
			id: 'com.example.app',
			version: '1.0.0',
			type: 'app',
		}),
	],
};
