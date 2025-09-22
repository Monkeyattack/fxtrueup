#!/usr/bin/env python3
"""
Fix GRID account positions to have correct 4% TP instead of 2%
"""

import asyncio
import os
from metaapi_cloud_sdk import MetaApi
from core.vault_config import vault_manager

# Load environment variables
# These should be set in your environment or .env file
# os.environ['VAULT_TOKEN'] = 'your-vault-token'
# os.environ['VAULT_ADDR'] = 'https://vault.profithits.app:8200'

async def fix_grid_positions():
    """Fix GRID account positions to have 4% TP"""
    print("Fixing GRID account positions to 4% TP...")
    
    # Get MetaAPI credentials
    metaapi_creds = vault_manager.get_metaapi_credentials()
    if not metaapi_creds:
        print("Failed to get MetaAPI credentials")
        return
    
    token = metaapi_creds.get('token')
    grid_account_id = metaapi_creds.get('grid_demo_account_id', '019ec0f0-09f5-4230-a7bd-fa2930af07a4')
    
    # Initialize MetaAPI
    meta_api = MetaApi(token)
    account = await meta_api.metatrader_account_api.get_account(grid_account_id)
    
    # Connect to account
    connection = account.get_rpc_connection()
    await connection.connect()
    await connection.wait_synchronized()
    
    # Get current positions
    positions = await connection.get_positions()
    
    # Fix each position
    for pos in positions:
        print(f"\nProcessing {pos['symbol']} position {pos['id']}:")
        print(f"  Open Price: {pos['openPrice']}")
        print(f"  Current TP: {pos.get('takeProfit', 'None')}")
        
        # Calculate correct 4% TP
        if pos['type'] == 'POSITION_TYPE_BUY':
            new_tp = pos['openPrice'] * 1.04  # 4% above entry
        else:  # SELL
            new_tp = pos['openPrice'] * 0.96  # 4% below entry
        
        # Round to appropriate decimal places
        if pos['symbol'] in ['BTCUSD', 'ETHUSD']:
            new_tp = round(new_tp, 2)
        else:
            new_tp = round(new_tp, 5)
        
        print(f"  New TP: {new_tp} (4% from entry)")
        
        try:
            # Modify position
            result = await connection.modify_position(
                position_id=pos['id'],
                take_profit=new_tp
            )
            print(f"  ✅ Successfully updated TP to {new_tp}")
        except Exception as e:
            print(f"  ❌ Failed to update: {e}")
    
    await connection.close()
    print("\n✅ GRID position fix complete")

if __name__ == "__main__":
    asyncio.run(fix_grid_positions())
