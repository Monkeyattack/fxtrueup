import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const MetaApiService = require('./metaapi-service-simple.cjs');

export default MetaApiService;