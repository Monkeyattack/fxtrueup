#!/usr/bin/env python3
"""
cTrader Connection Pool
Manages multiple cTrader connections with reuse and health monitoring
"""

import asyncio
import logging
from typing import Dict, Optional, List, Any
from datetime import datetime, timedelta
from collections import defaultdict

try:
    from ctrader_open_api import Client, Protobuf, TcpProtocol, Auth, EndPoints
    from ctrader_open_api.messages.OpenApiCommonMessages_pb2 import *
    from ctrader_open_api.messages.OpenApiMessages_pb2 import *
    from ctrader_open_api.messages.OpenApiModelMessages_pb2 import *
    from twisted.internet import reactor
    HAS_CTRADER_API = True
except ImportError:
    HAS_CTRADER_API = False
    logger = logging.getLogger(__name__)
    logger.warning("cTrader Open API not installed. Running in mock mode.")

# Import data mapper
from .ctrader_data_mapper import CTraderDataMapper

logger = logging.getLogger(__name__)

class CTraderConnectionWrapper:
    """Wrapper for individual cTrader connection"""

    def __init__(self, account_id: str, environment: str = 'demo'):
        self.account_id = account_id
        self.environment = environment
        self.client = None
        self.is_connected = False
        self.last_used = datetime.now()
        self.connection_count = 0
        self.error_count = 0
        self.positions_cache = {}
        self.orders_cache = {}
        self.account_info_cache = None
        self.cache_timestamp = None

    async def connect(self, access_token: str, ctid_account_id: int):
        """Connect to cTrader account"""
        if not HAS_CTRADER_API:
            logger.info(f"Mock connection to {self.account_id}")
            self.is_connected = True
            return True

        try:
            # Select host based on environment
            host = EndPoints.PROTOBUF_LIVE_HOST if self.environment == 'live' else EndPoints.PROTOBUF_DEMO_HOST

            # Create client
            self.client = Client(host, EndPoints.PROTOBUF_PORT, TcpProtocol)

            # Set access token
            self.client.set_access_token(access_token)

            # Connect
            await self.client.connect()

            # Authorize account
            auth_req = ProtoOAAccountAuthReq()
            auth_req.ctidTraderAccountId = ctid_account_id
            auth_req.accessToken = access_token

            await self.client.send(auth_req)

            self.is_connected = True
            self.connection_count += 1
            logger.info(f"Connected to cTrader account {self.account_id}")

            return True
        except Exception as e:
            logger.error(f"Failed to connect cTrader account {self.account_id}: {e}")
            self.error_count += 1
            self.is_connected = False
            raise

    async def disconnect(self):
        """Disconnect from cTrader"""
        try:
            if self.client and self.is_connected:
                await self.client.disconnect()

            self.is_connected = False
            logger.info(f"Disconnected cTrader account {self.account_id}")
        except Exception as e:
            logger.error(f"Error disconnecting cTrader: {e}")

    def update_last_used(self):
        """Update last used timestamp"""
        self.last_used = datetime.now()

    def is_cache_valid(self, max_age_seconds: int = 1):
        """Check if cache is still valid"""
        if not self.cache_timestamp:
            return False
        return (datetime.now() - self.cache_timestamp).total_seconds() < max_age_seconds


class CTraderConnectionPool:
    """Connection pool for cTrader accounts"""

    def __init__(self, max_connections: int = 50, idle_timeout: int = 300):
        self.connections: Dict[str, CTraderConnectionWrapper] = {}
        self.max_connections = max_connections
        self.idle_timeout = idle_timeout
        self.stats = defaultdict(int)
        self.data_mapper = CTraderDataMapper()
        self._cleanup_task = None
        self._prices_cache = {}
        self._mock_positions = {}  # For testing without API

    async def initialize(self):
        """Initialize the connection pool"""
        logger.info("Initializing cTrader connection pool")
        self._cleanup_task = asyncio.create_task(self._periodic_cleanup())

    async def cleanup(self):
        """Cleanup all connections"""
        logger.info("Cleaning up cTrader connection pool")

        if self._cleanup_task:
            self._cleanup_task.cancel()

        # Close all connections
        for conn in list(self.connections.values()):
            await conn.disconnect()

        self.connections.clear()

    async def get_connection(self, account_id: str, environment: str = 'demo',
                           access_token: str = None, ctid_account_id: int = None) -> CTraderConnectionWrapper:
        """Get or create a connection for account"""
        conn_key = f"{account_id}_{environment}"

        # Try to reuse existing connection
        if conn_key in self.connections:
            conn = self.connections[conn_key]
            if conn.is_connected:
                conn.update_last_used()
                self.stats['connections_reused'] += 1
                return conn
            else:
                # Remove stale connection
                del self.connections[conn_key]

        # Check connection limit
        if len(self.connections) >= self.max_connections:
            # Remove oldest idle connection
            await self._remove_oldest_idle_connection()

        # Create new connection
        conn = CTraderConnectionWrapper(account_id, environment)

        if access_token and ctid_account_id:
            await conn.connect(access_token, ctid_account_id)
            self.connections[conn_key] = conn
            self.stats['connections_created'] += 1
        else:
            # Mock connection for testing
            conn.is_connected = True
            self.connections[conn_key] = conn

        return conn

    async def _remove_oldest_idle_connection(self):
        """Remove the oldest idle connection"""
        if not self.connections:
            return

        oldest_key = None
        oldest_time = datetime.now()

        for key, conn in self.connections.items():
            if conn.last_used < oldest_time:
                oldest_time = conn.last_used
                oldest_key = key

        if oldest_key:
            conn = self.connections[oldest_key]
            await conn.disconnect()
            del self.connections[oldest_key]
            logger.info(f"Removed idle connection: {oldest_key}")

    async def _periodic_cleanup(self):
        """Periodically clean up idle connections"""
        while True:
            try:
                await asyncio.sleep(60)  # Check every minute

                now = datetime.now()
                idle_threshold = now - timedelta(seconds=self.idle_timeout)

                # Find idle connections
                idle_connections = []
                for key, conn in self.connections.items():
                    if conn.last_used < idle_threshold:
                        idle_connections.append(key)

                # Remove idle connections
                for key in idle_connections:
                    conn = self.connections[key]
                    await conn.disconnect()
                    del self.connections[key]
                    logger.info(f"Cleaned up idle connection: {key}")

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in periodic cleanup: {e}")

    # ============= ACCOUNT OPERATIONS =============

    async def get_account_info(self, account_id: str, environment: str = 'demo') -> Optional[Dict]:
        """Get account information"""
        try:
            conn = await self.get_connection(account_id, environment)

            if not HAS_CTRADER_API:
                # Return mock data
                return {
                    'accountId': account_id,
                    'balance': 10000.0,
                    'equity': 10000.0,
                    'margin': 0.0,
                    'freeMargin': 10000.0,
                    'currency': 'USD',
                    'leverage': 100,
                    'environment': environment
                }

            # Check cache
            if conn.account_info_cache and conn.is_cache_valid(5):
                return conn.account_info_cache

            # Get account info
            account_req = ProtoOAAccountsTokenRes()
            await conn.client.send(account_req)

            # Update cache
            conn.account_info_cache = account_info
            conn.cache_timestamp = datetime.now()

            return account_info
        except Exception as e:
            logger.error(f"Failed to get account info: {e}")
            self.stats['errors'] += 1
            return None

    async def get_positions(self, account_id: str, environment: str = 'demo') -> List[Dict]:
        """Get open positions"""
        try:
            conn = await self.get_connection(account_id, environment)

            if not HAS_CTRADER_API:
                # Return mock positions for testing
                return self._mock_positions.get(account_id, [])

            # Check cache
            if conn.positions_cache and conn.is_cache_valid(1):
                return list(conn.positions_cache.values())

            # Get positions
            reconcile_req = ProtoOAReconcileReq()
            reconcile_req.ctidTraderAccountId = conn.ctid_account_id

            response = await conn.client.send(reconcile_req)

            # Update cache
            conn.positions_cache = {pos.positionId: pos for pos in response.position}
            conn.cache_timestamp = datetime.now()

            return list(conn.positions_cache.values())
        except Exception as e:
            logger.error(f"Failed to get positions: {e}")
            self.stats['errors'] += 1
            return []

    async def get_orders(self, account_id: str, environment: str = 'demo') -> List[Dict]:
        """Get pending orders"""
        try:
            conn = await self.get_connection(account_id, environment)

            if not HAS_CTRADER_API:
                return []

            # Check cache
            if conn.orders_cache and conn.is_cache_valid(1):
                return list(conn.orders_cache.values())

            # Get orders
            reconcile_req = ProtoOAReconcileReq()
            reconcile_req.ctidTraderAccountId = conn.ctid_account_id

            response = await conn.client.send(reconcile_req)

            # Update cache
            conn.orders_cache = {order.orderId: order for order in response.order}
            conn.cache_timestamp = datetime.now()

            return list(conn.orders_cache.values())
        except Exception as e:
            logger.error(f"Failed to get orders: {e}")
            self.stats['errors'] += 1
            return []

    # ============= TRADING OPERATIONS =============

    async def execute_trade(self, account_id: str, environment: str, trade_data: Dict) -> Dict:
        """Execute a market order"""
        try:
            conn = await self.get_connection(account_id, environment)

            if not HAS_CTRADER_API:
                # Mock trade execution
                self.stats['trades_executed'] += 1
                return {
                    'success': True,
                    'orderId': f"mock_{datetime.now().timestamp()}",
                    'executedVolume': trade_data.get('volume', 0),
                    'executedPrice': 1.1000
                }

            # Map trade data to cTrader format
            order = self.data_mapper.map_order_request(trade_data)

            # Send order
            order_req = ProtoOANewOrderReq()
            order_req.ctidTraderAccountId = conn.ctid_account_id
            order_req.symbolId = order['symbolId']
            order_req.orderType = order['orderType']
            order_req.tradeSide = order['tradeSide']
            order_req.volume = order['volume']

            if 'stopLoss' in order:
                order_req.stopLoss = order['stopLoss']
            if 'takeProfit' in order:
                order_req.takeProfit = order['takeProfit']
            if 'comment' in order:
                order_req.comment = order['comment']

            response = await conn.client.send(order_req)

            self.stats['trades_executed'] += 1

            return {
                'success': True,
                'orderId': str(response.executionEvent.orderId),
                'positionId': str(response.executionEvent.position.positionId) if response.executionEvent.position else None,
                'executedVolume': response.executionEvent.executedVolume / 100,
                'executedPrice': response.executionEvent.executionPrice
            }
        except Exception as e:
            logger.error(f"Failed to execute trade: {e}")
            self.stats['errors'] += 1
            return {
                'success': False,
                'error': str(e)
            }

    async def modify_position(self, account_id: str, environment: str,
                            position_id: str, stop_loss: float = None, take_profit: float = None) -> bool:
        """Modify position SL/TP"""
        try:
            conn = await self.get_connection(account_id, environment)

            if not HAS_CTRADER_API:
                return True

            # Send modification request
            amend_req = ProtoOAAmendPositionSLTPReq()
            amend_req.ctidTraderAccountId = conn.ctid_account_id
            amend_req.positionId = int(position_id)

            if stop_loss is not None:
                amend_req.stopLoss = stop_loss
            if take_profit is not None:
                amend_req.takeProfit = take_profit

            await conn.client.send(amend_req)

            return True
        except Exception as e:
            logger.error(f"Failed to modify position: {e}")
            self.stats['errors'] += 1
            return False

    async def close_position(self, account_id: str, environment: str, position_id: str) -> bool:
        """Close a position"""
        try:
            conn = await self.get_connection(account_id, environment)

            if not HAS_CTRADER_API:
                # Remove from mock positions
                if account_id in self._mock_positions:
                    self._mock_positions[account_id] = [
                        p for p in self._mock_positions[account_id]
                        if p.get('id') != position_id
                    ]
                return True

            # Send close request
            close_req = ProtoOAClosePositionReq()
            close_req.ctidTraderAccountId = conn.ctid_account_id
            close_req.positionId = int(position_id)

            await conn.client.send(close_req)

            # Remove from cache
            if position_id in conn.positions_cache:
                del conn.positions_cache[position_id]

            return True
        except Exception as e:
            logger.error(f"Failed to close position: {e}")
            self.stats['errors'] += 1
            return False

    # ============= STREAMING OPERATIONS =============

    async def initialize_streaming(self, account_id: str, environment: str = 'demo') -> bool:
        """Initialize streaming connection"""
        try:
            conn = await self.get_connection(account_id, environment)
            return conn.is_connected
        except Exception as e:
            logger.error(f"Failed to initialize streaming: {e}")
            return False

    async def subscribe_to_symbol(self, symbol: str, account_id: str = None) -> bool:
        """Subscribe to symbol updates"""
        try:
            # Get symbol mapping
            symbol_info = self.data_mapper.get_symbol_mapping(symbol)
            if not symbol_info:
                logger.error(f"Unknown symbol: {symbol}")
                return False

            if not HAS_CTRADER_API:
                # Mock subscription
                return True

            # Subscribe for all active connections if no specific account
            if account_id:
                conn = await self.get_connection(account_id)
                if conn.is_connected:
                    # Send subscription request
                    sub_req = ProtoOASubscribeSpotsReq()
                    sub_req.ctidTraderAccountId = conn.ctid_account_id
                    sub_req.symbolId.append(symbol_info['cTraderId'])

                    await conn.client.send(sub_req)

            return True
        except Exception as e:
            logger.error(f"Failed to subscribe to symbol: {e}")
            return False

    async def get_price(self, symbol: str) -> Optional[Dict]:
        """Get current price for symbol"""
        try:
            # Check cache
            cached = self._prices_cache.get(symbol)
            if cached and (datetime.now() - cached['timestamp']).total_seconds() < 1:
                return cached['data']

            symbol_info = self.data_mapper.get_symbol_mapping(symbol)
            if not symbol_info:
                return None

            if not HAS_CTRADER_API:
                # Return mock price
                mock_price = {
                    'symbol': symbol,
                    'bid': 1.1000,
                    'ask': 1.1002,
                    'brokerTime': datetime.now().isoformat()
                }
                self._prices_cache[symbol] = {
                    'data': mock_price,
                    'timestamp': datetime.now()
                }
                return mock_price

            # Get price from any active connection
            for conn in self.connections.values():
                if conn.is_connected:
                    # Send spot request
                    spot_req = ProtoOASpotEvent()
                    response = await conn.client.send(spot_req)

                    # Find our symbol in response
                    for spot in response.spots:
                        if spot.symbolId == symbol_info['cTraderId']:
                            price_data = self.data_mapper.map_price_data(
                                spot.symbolId,
                                spot.bid,
                                spot.ask
                            )

                            # Cache price
                            self._prices_cache[symbol] = {
                                'data': price_data,
                                'timestamp': datetime.now()
                            }

                            return price_data

            return None
        except Exception as e:
            logger.error(f"Failed to get price: {e}")
            return None

    async def get_all_prices(self) -> Dict[str, Any]:
        """Get all current prices"""
        prices = {}

        # Get prices for all known symbols
        for symbol in self.data_mapper.get_all_symbols():
            price = await self.get_price(symbol)
            if price:
                prices[symbol] = price

        return prices

    # ============= POOL MANAGEMENT =============

    def get_stats(self) -> Dict[str, int]:
        """Get pool statistics"""
        return {
            'connectionsCreated': self.stats['connections_created'],
            'connectionsReused': self.stats['connections_reused'],
            'tradesExecuted': self.stats['trades_executed'],
            'errors': self.stats['errors'],
            'activeConnections': len(self.connections),
            'reuse_ratio': self.stats['connections_reused'] / max(1, self.stats['connections_created'])
        }

    async def get_accounts_summary(self) -> Dict[str, Any]:
        """Get summary of all accounts"""
        summary = {}

        for conn_key, conn in self.connections.items():
            if conn.is_connected:
                account_info = await self.get_account_info(conn.account_id, conn.environment)
                if account_info:
                    summary[conn.account_id] = {
                        'balance': account_info.get('balance', 0),
                        'equity': account_info.get('equity', 0),
                        'openPositions': len(conn.positions_cache),
                        'environment': conn.environment,
                        'lastActivity': conn.last_used.isoformat()
                    }

        return summary

    # ============= METASTATS OPERATIONS =============

    async def get_account_metrics(self, account_id: str) -> Dict[str, Any]:
        """Get trading metrics for account"""
        # This would require implementing trade history tracking
        # For now, return basic metrics
        return {
            'trades': 0,
            'wonTrades': 0,
            'lostTrades': 0,
            'winRate': 0,
            'profit': 0,
            'loss': 0,
            'averageWin': 0,
            'averageLoss': 0
        }

    async def get_trade_history(self, account_id: str, days: int = 30, limit: int = 100) -> Dict[str, Any]:
        """Get historical trades"""
        # This would require implementing deal history requests
        return {
            'trades': [],
            'count': 0
        }

    async def get_daily_growth(self, account_id: str, days: int = 30) -> List[Dict]:
        """Get daily growth data"""
        # This would require implementing historical balance tracking
        return []

    async def get_risk_status(self, account_id: str) -> Dict[str, Any]:
        """Get risk metrics"""
        account_info = await self.get_account_info(account_id)
        if account_info:
            balance = account_info.get('balance', 0)
            equity = account_info.get('equity', 0)

            drawdown = 0
            if balance > 0:
                drawdown = ((balance - equity) / balance) * 100

            return {
                'drawdown': drawdown,
                'maxDrawdown': drawdown,  # Would need historical tracking
                'riskLevel': 'low' if drawdown < 5 else 'medium' if drawdown < 10 else 'high',
                'marginLevel': account_info.get('marginLevel', 0)
            }

        return {
            'drawdown': 0,
            'maxDrawdown': 0,
            'riskLevel': 'low',
            'marginLevel': 0
        }

    async def get_available_symbols(self, account_id: str) -> List[str]:
        """Get available trading symbols"""
        return self.data_mapper.get_all_symbols()

    # ============= TEST HELPERS =============

    def add_mock_position(self, account_id: str, position: Dict):
        """Add mock position for testing"""
        if account_id not in self._mock_positions:
            self._mock_positions[account_id] = []
        self._mock_positions[account_id].append(position)

    def clear_mock_positions(self, account_id: str):
        """Clear mock positions"""
        if account_id in self._mock_positions:
            self._mock_positions[account_id] = []


# Global pool instance
_pool_instance = None

def get_pool() -> CTraderConnectionPool:
    """Get singleton pool instance"""
    global _pool_instance
    if _pool_instance is None:
        _pool_instance = CTraderConnectionPool()
    return _pool_instance