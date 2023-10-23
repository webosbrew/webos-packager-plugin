# @webosbrew/webos-packager-plugin

Pack applications to IPK on the fly.

### Example

##### HOC

```typescript
import { hoc } from '@webosbrew/webos-packager-plugin';

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
		// ... extra services
	],
});
```

##### Plugin

```typescript
import { WebOSPackagerPlugin } from '@webosbrew/webos-packager-plugin';

export default {
	// ... webpack configuation
	plugins: [
		new WebOSPackagerPlugin({
			id: 'com.example.app',
			version: '1.0.0',
		}),
	],
};
```
