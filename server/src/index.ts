import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = await buildApp(config);

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(
    { project: config.projectId, mode: config.apiMode, store: config.store, locations: config.locations },
    'Policy console started',
  );
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
