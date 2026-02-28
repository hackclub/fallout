import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

function vercelApiPlugin(): Plugin {
	return {
		name: 'vercel-api',
		configureServer(server) {
			server.middlewares.use(async (req, res, next) => {
				if (!req.url?.startsWith('/api/')) return next();
				const filePath = `.${req.url}.ts`;
				try {
					const mod = await server.ssrLoadModule(filePath);
					const request = new Request(`http://localhost${req.url}`, {
						method: req.method,
						headers: req.headers as Record<string, string>,
						body: req.method !== 'GET' && req.method !== 'HEAD'
							? await new Promise<Buffer>((resolve) => {
								const chunks: Buffer[] = [];
								req.on('data', (c) => chunks.push(c));
								req.on('end', () => resolve(Buffer.concat(chunks)));
							})
							: undefined,
						duplex: 'half',
					} as RequestInit);
					const response: Response = await mod.default(request);
					res.statusCode = response.status;
					response.headers.forEach((v, k) => res.setHeader(k, v));
					res.end(Buffer.from(await response.arrayBuffer()));
				} catch {
					next();
				}
			});
		},
	};
}

export default defineConfig({
	publicDir: 'static',
	plugins: [react(), tailwindcss(), vercelApiPlugin()],
});
