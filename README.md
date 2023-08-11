# @kitsuned/webos-packager-plugin

Webpack plugin that packages emitted files to IPK file that can be installed on LG webOS TV.

Additionally, this plugin can generate a webOS Homebrew Channel manifest by using the `emitManifest` property.

### Example

##### HOC

```typescript
import { hoc } from '@kitsuned/webos-packager-plugin';

export default hoc({
	id: 'org.acme.product',
	version: '1.0.0',
	options: {
		// if you want to publish app in homebrew channel repo
		emitManifest: true,
		manifest: {
			title: 'ACME Goods',
			description: '',
			iconUrl: '',
			sourceUrl: '',
		},
	},
	app: {
		id: 'org.acme.product',
		// ... webpack configuation
	},
	services: [
		{
			id: 'org.acme.product.service',
			// ... webpack configuation
		},
		// ... other services
	],
});
```

##### Plugin

```typescript
import { WebOSPackagerPlugin } from '@kitsuned/webos-packager-plugin';

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
