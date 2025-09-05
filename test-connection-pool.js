#!/usr/bin/env node

import { getPool } from './src/services/connectionPool/pool.js';
import dotenv from 'dotenv';

dotenv.config();

async function testConnectionPool() {
  console.log('🧪 Testing Connection Pool...');
  
  try {
    const pool = getPool();
    console.log('✅ Pool instance created');
    
    // Test MetaAPI SDK loading
    await pool.loadMetaApi();
    console.log('✅ MetaAPI SDK loaded successfully');
    
    // Test the constructor check
    console.log('MetaAPI constructor type:', typeof pool.MetaApi);
    
    // Test pool stats
    const stats = pool.getStats();
    console.log('📊 Initial pool stats:', stats);
    
    console.log('🎉 Connection pool test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

testConnectionPool();