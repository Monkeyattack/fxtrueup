#!/usr/bin/env python3
"""
cTrader Connection Pool API Server
Manages cTrader connections using OpenApiPy
Runs on port 8088 (8089 for internal pool operations)
"""

import asyncio
import logging
import os
import json
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Dict, Optional, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Models for API requests/responses
class AccountRequest(BaseModel):
    account_id: str
    environment: str = 'demo'

class PositionRequest(BaseModel):
    account_id: str
    environment: str = 'demo'

class TradeRequest(BaseModel):
    account_id: str
    environment: str = 'demo'
    symbol: str
    actionType: str
    volume: float
    openPrice: Optional[float] = None
    stopLoss: Optional[float] = None
    takeProfit: Optional[float] = None
    comment: Optional[str] = ''
    clientId: Optional[str] = ''

class ModifyPositionRequest(BaseModel):
    account_id: str
    environment: str = 'demo'
    position_id: str
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None

class ClosePositionRequest(BaseModel):
    account_id: str
    environment: str = 'demo'
    position_id: str

class SubscribeRequest(BaseModel):
    symbol: str
    account_id: Optional[str] = None

# Lifespan manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("🚀 Starting cTrader Connection Pool API...")
    # Initialize connection pool
    from services.ctrader_connection_pool import get_pool
    pool = get_pool()
    await pool.initialize()

    yield

    # Shutdown
    logger.info("🛑 Shutting down cTrader Connection Pool...")
    await pool.cleanup()

# Create FastAPI app
app = FastAPI(title="cTrader Connection Pool API", lifespan=lifespan)

# Import pool after app creation
from services.ctrader_connection_pool import get_pool
from services.ctrader_data_mapper import CTraderDataMapper

# Initialize data mapper
data_mapper = CTraderDataMapper()

# ============= ACCOUNT OPERATIONS =============

@app.get("/account/{account_id}")
async def get_account_info(account_id: str, environment: str = 'demo'):
    """Get account information"""
    try:
        pool = get_pool()
        account_info = await pool.get_account_info(account_id, environment)

        if account_info:
            return data_mapper.map_account_info(account_info)
        else:
            raise HTTPException(status_code=404, detail="Account not found")
    except Exception as e:
        logger.error(f"Failed to get account info: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/positions/{account_id}")
async def get_positions(account_id: str, environment: str = 'demo'):
    """Get all open positions"""
    try:
        pool = get_pool()
        positions = await pool.get_positions(account_id, environment)

        # Map to MetaAPI format
        mapped_positions = [data_mapper.map_position(pos) for pos in positions]

        return {"positions": mapped_positions, "count": len(mapped_positions)}
    except Exception as e:
        logger.error(f"Failed to get positions: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============= TRADING OPERATIONS =============

@app.post("/trade/execute")
async def execute_trade(request: TradeRequest):
    """Execute a market order"""
    try:
        pool = get_pool()

        # Execute trade
        result = await pool.execute_trade(
            request.account_id,
            request.environment,
            {
                'symbol': request.symbol,
                'actionType': request.actionType,
                'volume': request.volume,
                'stopLoss': request.stopLoss,
                'takeProfit': request.takeProfit,
                'comment': request.comment,
                'clientId': request.clientId
            }
        )

        return result
    except Exception as e:
        logger.error(f"Failed to execute trade: {e}")
        return {"success": False, "error": str(e)}

@app.post("/position/modify")
async def modify_position(request: ModifyPositionRequest):
    """Modify position SL/TP"""
    try:
        pool = get_pool()

        success = await pool.modify_position(
            request.account_id,
            request.environment,
            request.position_id,
            request.stop_loss,
            request.take_profit
        )

        return {"success": success}
    except Exception as e:
        logger.error(f"Failed to modify position: {e}")
        return {"success": False, "error": str(e)}

@app.post("/position/close")
async def close_position(request: ClosePositionRequest):
    """Close a position"""
    try:
        pool = get_pool()

        success = await pool.close_position(
            request.account_id,
            request.environment,
            request.position_id
        )

        return {"success": success}
    except Exception as e:
        logger.error(f"Failed to close position: {e}")
        return {"success": False, "error": str(e)}

# ============= STREAMING OPERATIONS =============

@app.post("/streaming/initialize")
async def initialize_streaming(account_id: str, environment: str = 'demo'):
    """Initialize streaming connection"""
    try:
        pool = get_pool()
        success = await pool.initialize_streaming(account_id, environment)
        return {"success": success}
    except Exception as e:
        logger.error(f"Failed to initialize streaming: {e}")
        return {"success": False, "error": str(e)}

@app.post("/streaming/subscribe")
async def subscribe_to_symbol(request: SubscribeRequest):
    """Subscribe to symbol updates"""
    try:
        pool = get_pool()
        success = await pool.subscribe_to_symbol(request.symbol, request.account_id)
        return {"success": success}
    except Exception as e:
        logger.error(f"Failed to subscribe to symbol: {e}")
        return {"success": False, "error": str(e)}

@app.get("/prices/{symbol}")
async def get_price(symbol: str):
    """Get current price for symbol"""
    try:
        pool = get_pool()
        price_data = await pool.get_price(symbol)

        if price_data:
            return price_data
        else:
            raise HTTPException(status_code=404, detail="Price not available")
    except Exception as e:
        logger.error(f"Failed to get price: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/prices")
async def get_all_prices():
    """Get all current prices"""
    try:
        pool = get_pool()
        prices = await pool.get_all_prices()
        return prices
    except Exception as e:
        logger.error(f"Failed to get prices: {e}")
        return {}

# ============= POOL MANAGEMENT =============

@app.get("/pool/stats")
async def get_pool_stats():
    """Get connection pool statistics"""
    try:
        pool = get_pool()
        return pool.get_stats()
    except Exception as e:
        logger.error(f"Failed to get pool stats: {e}")
        return {
            "connectionsCreated": 0,
            "connectionsReused": 0,
            "tradesExecuted": 0,
            "errors": 0,
            "activeConnections": 0
        }

@app.get("/accounts/summary")
async def get_accounts_summary():
    """Get summary of all accounts"""
    try:
        pool = get_pool()
        return await pool.get_accounts_summary()
    except Exception as e:
        logger.error(f"Failed to get accounts summary: {e}")
        return {}

# ============= HEALTH CHECK =============

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        pool = get_pool()
        stats = pool.get_stats()

        return {
            "status": "healthy",
            "service": "cTrader Connection Pool",
            "stats": stats,
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "cTrader Connection Pool API",
        "version": "1.0.0",
        "endpoints": [
            "/health",
            "/account/{account_id}",
            "/positions/{account_id}",
            "/trade/execute",
            "/position/modify",
            "/position/close",
            "/streaming/initialize",
            "/streaming/subscribe",
            "/prices/{symbol}",
            "/prices",
            "/pool/stats",
            "/accounts/summary"
        ]
    }

# ============= METASTATS OPERATIONS =============

@app.get("/accounts/{account_id}/metrics")
async def get_account_metrics(account_id: str):
    """Get account trading metrics"""
    try:
        pool = get_pool()
        metrics = await pool.get_account_metrics(account_id)
        return metrics
    except Exception as e:
        logger.error(f"Failed to get account metrics: {e}")
        return {
            "trades": 0,
            "wonTrades": 0,
            "lostTrades": 0,
            "winRate": 0,
            "profit": 0,
            "loss": 0
        }

@app.get("/accounts/{account_id}/trades")
async def get_trade_history(account_id: str, days: int = 30, limit: int = 100):
    """Get trade history"""
    try:
        pool = get_pool()
        trades = await pool.get_trade_history(account_id, days, limit)
        return trades
    except Exception as e:
        logger.error(f"Failed to get trade history: {e}")
        return {"trades": [], "count": 0}

@app.get("/accounts/{account_id}/daily-growth")
async def get_daily_growth(account_id: str, days: int = 30):
    """Get daily growth data"""
    try:
        pool = get_pool()
        growth = await pool.get_daily_growth(account_id, days)
        return {"growth": growth}
    except Exception as e:
        logger.error(f"Failed to get daily growth: {e}")
        return {"growth": []}

@app.get("/accounts/{account_id}/risk-status")
async def get_risk_status(account_id: str):
    """Get account risk status"""
    try:
        pool = get_pool()
        risk = await pool.get_risk_status(account_id)
        return risk
    except Exception as e:
        logger.error(f"Failed to get risk status: {e}")
        return {
            "drawdown": 0,
            "maxDrawdown": 0,
            "riskLevel": "low",
            "marginLevel": 0
        }

# ============= cTRADER SPECIFIC ENDPOINTS =============

@app.get("/orders/{account_id}")
async def get_pending_orders(account_id: str, environment: str = 'demo'):
    """Get all pending orders"""
    try:
        pool = get_pool()
        orders = await pool.get_orders(account_id, environment)

        # Map to MetaAPI format
        mapped_orders = [data_mapper.map_order(order) for order in orders]

        return {"orders": mapped_orders, "count": len(mapped_orders)}
    except Exception as e:
        logger.error(f"Failed to get orders: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/symbols/mapping/{mt5_symbol}")
async def get_symbol_mapping(mt5_symbol: str):
    """Get symbol mapping info"""
    try:
        mapping = data_mapper.get_symbol_mapping(mt5_symbol)
        if mapping:
            return mapping
        else:
            raise HTTPException(status_code=404, detail="Symbol mapping not found")
    except Exception as e:
        logger.error(f"Failed to get symbol mapping: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/accounts/{account_id}/symbols")
async def get_available_symbols(account_id: str):
    """Get available trading symbols"""
    try:
        pool = get_pool()
        symbols = await pool.get_available_symbols(account_id)
        return {"symbols": symbols}
    except Exception as e:
        logger.error(f"Failed to get available symbols: {e}")
        return {"symbols": []}

# Run the server
if __name__ == "__main__":
    port = int(os.getenv('CTRADER_POOL_PORT', '8088'))
    uvicorn.run(
        "ctrader_pool_api:app",
        host="0.0.0.0",
        port=port,
        reload=False,
        log_level="info"
    )