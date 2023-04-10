# @kitsuned/webos-packager-plugin

Webpack plugin that packages emitted files to IPK file that can be installed on LG webOS TV.

Additionally, this plugin can generate a webOS Homebrew Channel manifest by using the `emitManifest` property.

### Example

```typescript
import WebOSPackagerPlugin from '@kitsuned/webos-packager-plugin';

export default {
	// ...
	plugins: [
		new WebOSPackagerPlugin({
			id: 'com.example.app',
			version: '1.0.0',
		}),
	],
};
```
