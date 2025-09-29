import axios from 'axios';
import { logger } from '../../utils/logger.js';

const poolUrl = process.env.POOL_API_URL || 'http://localhost:8087';
const accountId = '019ec0f0-09f5-4230-a7bd-fa2930af07a4';

async function testRegion(region) {
  logger.info(`\n🧪 Testing GridDemo with region: ${region}`);

  try {
    // Try account info
    const infoRes = await axios.get(`${poolUrl}/account/${accountId}?region=${region}`, {
      timeout: 10000
    });
    logger.info(`✅ Account info retrieved successfully`);
    logger.info(`   Server: ${infoRes.data.server}`);
    logger.info(`   Broker: ${infoRes.data.broker}`);

    // Try positions
    const posRes = await axios.get(`${poolUrl}/positions/${accountId}?region=${region}`, {
      timeout: 10000
    });
    logger.info(`✅ Positions retrieved: ${posRes.data.length} open positions`);

    return true;
  } catch (error) {
    logger.error(`❌ Failed with ${region}: ${error.message}`);
    if (error.response) {
      logger.error(`   Status: ${error.response.status}`);
      logger.error(`   Message: ${error.response.data?.detail || error.response.data}`);
    }
    return false;
  }
}

async function findCorrectRegion() {
  const regions = ['new-york', 'london', 'singapore', 'frankfurt'];

  for (const region of regions) {
    const success = await testRegion(region);
    if (success) {
      logger.info(`\n🎯 CORRECT REGION FOUND: ${region}`);
      return region;
    }
  }

  logger.error('\n❌ No working region found for GridDemo');
  return null;
}

findCorrectRegion()
  .then(region => {
    if (region) {
      logger.info(`\n📝 GridDemo should use region: "${region}"`);
      if (region !== 'new-york') {
        logger.warn(`\n⚠️  REGION MISMATCH! Config says "new-york" but account is in "${region}"`);
      }
    }
    process.exit(region ? 0 : 1);
  })
  .catch(error => {
    logger.error('Fatal error:', error);
    process.exit(1);
  });