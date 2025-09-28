#!/usr/bin/env python3
"""
cTrader Data Mapper (Python version)
Converts between cTrader and MetaAPI formats
"""

import json
import os
from typing import Dict, Optional, Any, List
from datetime import datetime

class CTraderDataMapper:
    """Data mapper for cTrader to MetaAPI format conversion"""

    def __init__(self):
        self.symbol_mapping = {}
        self.reverse_symbol_mapping = {}
        self.load_symbol_mapping()

    def load_symbol_mapping(self):
        """Load symbol mapping from JSON config"""
        try:
            config_path = os.path.join(
                os.path.dirname(os.path.dirname(__file__)),
                'config',
                'symbols.json'
            )

            with open(config_path, 'r') as f:
                config = json.load(f)
                self.symbol_mapping = config.get('symbolMapping', {})

                # Create reverse mapping
                for mt5_symbol, mapping in self.symbol_mapping.items():
                    self.reverse_symbol_mapping[mapping['cTraderId']] = {
                        **mapping,
                        'mt5Symbol': mt5_symbol
                    }
        except Exception as e:
            print(f"Failed to load symbol mapping: {e}")
            self.symbol_mapping = {}
            self.reverse_symbol_mapping = {}

    def get_symbol_mapping(self, mt5_symbol: str) -> Optional[Dict]:
        """Get cTrader mapping for MT5 symbol"""
        return self.symbol_mapping.get(mt5_symbol)

    def get_all_symbols(self) -> List[str]:
        """Get all available MT5 symbols"""
        return list(self.symbol_mapping.keys())

    def map_position(self, ctrader_position: Any) -> Dict:
        """Convert cTrader position to MetaAPI format"""
        symbol_info = self.reverse_symbol_mapping.get(ctrader_position.symbolId, {})
        mt5_symbol = symbol_info.get('mt5Symbol', f'UNKNOWN_{ctrader_position.symbolId}')

        # cTrader uses volume * 100
        volume = getattr(ctrader_position, 'volume', 0) / 100

        # Determine position type
        is_buy = getattr(ctrader_position, 'tradeSide', 'BUY') == 'BUY'

        # Get prices
        entry_price = getattr(ctrader_position, 'entryPrice', 0)
        current_price = getattr(ctrader_position, 'currentPrice', entry_price)

        return {
            'id': str(getattr(ctrader_position, 'positionId', '')),
            'type': 'POSITION_TYPE_BUY' if is_buy else 'POSITION_TYPE_SELL',
            'symbol': mt5_symbol,
            'magic': int(getattr(ctrader_position, 'label', 0) or 0),
            'openPrice': entry_price,
            'currentPrice': current_price,
            'currentTickValue': symbol_info.get('tickValue', 1),
            'volume': volume,
            'swap': getattr(ctrader_position, 'swap', 0),
            'profit': getattr(ctrader_position, 'profit', 0),
            'commission': getattr(ctrader_position, 'commission', 0),
            'clientId': getattr(ctrader_position, 'comment', ''),
            'stopLoss': getattr(ctrader_position, 'stopLoss', 0),
            'takeProfit': getattr(ctrader_position, 'takeProfit', 0),
            'comment': getattr(ctrader_position, 'comment', ''),
            'updateTime': datetime.fromtimestamp(
                getattr(ctrader_position, 'utcLastUpdateTimestamp', 0) / 1000
            ).isoformat() if hasattr(ctrader_position, 'utcLastUpdateTimestamp') else datetime.now().isoformat(),
            'openTime': datetime.fromtimestamp(
                getattr(ctrader_position, 'utcTimestamp', 0) / 1000
            ).isoformat() if hasattr(ctrader_position, 'utcTimestamp') else datetime.now().isoformat(),
            'realizedProfit': getattr(ctrader_position, 'realizedProfit', 0),
            'unrealizedProfit': getattr(ctrader_position, 'unrealizedProfit', getattr(ctrader_position, 'profit', 0))
        }

    def map_order_request(self, metaapi_order: Dict) -> Dict:
        """Convert MetaAPI order format to cTrader format"""
        symbol_mapping = self.symbol_mapping.get(metaapi_order['symbol'])
        if not symbol_mapping:
            raise ValueError(f"Unknown symbol: {metaapi_order['symbol']}")

        # Convert volume (MetaAPI uses lots, cTrader uses volume * 100)
        volume = int((metaapi_order.get('volume', 0)) * 100)

        # Map order type
        order_type_map = {
            'ORDER_TYPE_BUY': 1,         # MARKET
            'ORDER_TYPE_SELL': 1,        # MARKET
            'ORDER_TYPE_BUY_LIMIT': 2,   # LIMIT
            'ORDER_TYPE_SELL_LIMIT': 2,  # LIMIT
            'ORDER_TYPE_BUY_STOP': 3,    # STOP
            'ORDER_TYPE_SELL_STOP': 3    # STOP
        }

        # Map trade side
        action_type = metaapi_order.get('actionType', 'ORDER_TYPE_BUY')
        trade_side = 'BUY' if 'BUY' in action_type else 'SELL'

        ctrader_order = {
            'symbolId': symbol_mapping['cTraderId'],
            'orderType': order_type_map.get(action_type, 1),
            'tradeSide': trade_side,
            'volume': volume,
            'comment': metaapi_order.get('comment', ''),
            'label': metaapi_order.get('clientId', '')
        }

        # Add price for limit/stop orders
        if 'LIMIT' in action_type:
            ctrader_order['limitPrice'] = metaapi_order.get('openPrice', 0)
        elif 'STOP' in action_type:
            ctrader_order['stopPrice'] = metaapi_order.get('openPrice', 0)

        # Add SL/TP if provided
        if metaapi_order.get('stopLoss'):
            ctrader_order['stopLoss'] = metaapi_order['stopLoss']
        if metaapi_order.get('takeProfit'):
            ctrader_order['takeProfit'] = metaapi_order['takeProfit']

        return ctrader_order

    def map_account_info(self, ctrader_account: Any) -> Dict:
        """Convert cTrader account info to MetaAPI format"""
        account_id = str(getattr(ctrader_account, 'accountId', '') or
                        getattr(ctrader_account, 'ctidTraderAccountId', ''))

        return {
            'id': account_id,
            'brokerTime': datetime.now().isoformat(),
            'broker': getattr(ctrader_account, 'brokerName', 'cTrader'),
            'currency': getattr(ctrader_account, 'currency', 'USD'),
            'server': getattr(ctrader_account, 'environment', 'demo'),
            'balance': getattr(ctrader_account, 'balance', 0),
            'equity': getattr(ctrader_account, 'equity', getattr(ctrader_account, 'balance', 0)),
            'margin': getattr(ctrader_account, 'margin', 0),
            'freeMargin': getattr(ctrader_account, 'freeMargin', getattr(ctrader_account, 'balance', 0)),
            'leverage': getattr(ctrader_account, 'leverage', 100),
            'marginLevel': getattr(ctrader_account, 'marginLevel', 0),
            'tradeAllowed': getattr(ctrader_account, 'tradeAllowed', True),
            'investorMode': False,
            'platform': 'ctrader'
        }

    def map_order(self, ctrader_order: Any) -> Dict:
        """Convert cTrader order to MetaAPI format"""
        symbol_info = self.reverse_symbol_mapping.get(ctrader_order.symbolId, {})
        mt5_symbol = symbol_info.get('mt5Symbol', f'UNKNOWN_{ctrader_order.symbolId}')

        volume = getattr(ctrader_order, 'volume', 0) / 100

        # Map cTrader order type to MetaAPI
        order_type_map = {
            1: 'ORDER_TYPE_BUY',      # MARKET
            2: 'ORDER_TYPE_BUY_LIMIT', # LIMIT
            3: 'ORDER_TYPE_BUY_STOP',  # STOP
            4: 'ORDER_TYPE_SELL',      # For SL/TP
            5: 'ORDER_TYPE_BUY',       # MARKET_RANGE
            6: 'ORDER_TYPE_BUY_STOP'   # STOP_LIMIT
        }

        order_type = order_type_map.get(getattr(ctrader_order, 'orderType', 1), 'ORDER_TYPE_BUY')
        if getattr(ctrader_order, 'tradeSide', 'BUY') == 'SELL':
            order_type = order_type.replace('BUY', 'SELL')

        return {
            'id': str(getattr(ctrader_order, 'orderId', '')),
            'type': order_type,
            'state': self.map_order_state(getattr(ctrader_order, 'orderStatus', 'PENDING')),
            'symbol': mt5_symbol,
            'magic': int(getattr(ctrader_order, 'label', 0) or 0),
            'openPrice': getattr(ctrader_order, 'limitPrice', 0) or getattr(ctrader_order, 'stopPrice', 0),
            'currentPrice': getattr(ctrader_order, 'executionPrice', 0),
            'volume': volume,
            'currentVolume': volume,
            'comment': getattr(ctrader_order, 'comment', ''),
            'clientId': getattr(ctrader_order, 'label', ''),
            'updateTime': datetime.fromtimestamp(
                getattr(ctrader_order, 'utcLastUpdateTimestamp', 0) / 1000
            ).isoformat() if hasattr(ctrader_order, 'utcLastUpdateTimestamp') else datetime.now().isoformat(),
            'openTime': datetime.fromtimestamp(
                getattr(ctrader_order, 'utcTimestamp', 0) / 1000
            ).isoformat() if hasattr(ctrader_order, 'utcTimestamp') else datetime.now().isoformat()
        }

    def map_order_state(self, ctrader_status: str) -> str:
        """Map cTrader order status to MetaAPI state"""
        state_map = {
            'PENDING': 'ORDER_STATE_PLACED',
            'ACCEPTED': 'ORDER_STATE_PLACED',
            'FILLED': 'ORDER_STATE_FILLED',
            'CANCELLED': 'ORDER_STATE_CANCELED',
            'EXPIRED': 'ORDER_STATE_EXPIRED',
            'REJECTED': 'ORDER_STATE_REJECTED'
        }
        return state_map.get(ctrader_status, 'ORDER_STATE_PLACED')

    def map_symbol_info(self, ctrader_symbol: Any, mt5_symbol: str) -> Dict:
        """Convert cTrader symbol info to MetaAPI format"""
        return {
            'symbol': mt5_symbol,
            'tickSize': getattr(ctrader_symbol, 'tickSize', 0.00001),
            'minVolume': getattr(ctrader_symbol, 'minVolume', 100) / 100,
            'maxVolume': getattr(ctrader_symbol, 'maxVolume', 10000000) / 100,
            'volumeStep': getattr(ctrader_symbol, 'volumeStep', 100) / 100,
            'contractSize': getattr(ctrader_symbol, 'contractSize', 100000),
            'pipPosition': getattr(ctrader_symbol, 'pipPosition', 4),
            'spreadFloating': True,
            'bid': getattr(ctrader_symbol, 'bid', 0),
            'ask': getattr(ctrader_symbol, 'ask', 0),
            'profitCurrency': getattr(ctrader_symbol, 'quoteCurrency', 'USD')
        }

    def map_price_data(self, symbol_id: int, bid: float, ask: float) -> Dict:
        """Map price/quote data from cTrader to MetaAPI format"""
        symbol_info = self.reverse_symbol_mapping.get(symbol_id, {})
        mt5_symbol = symbol_info.get('mt5Symbol', f'UNKNOWN_{symbol_id}')

        return {
            'symbol': mt5_symbol,
            'bid': bid or 0,
            'ask': ask or 0,
            'brokerTime': datetime.now().isoformat(),
            'spread': abs((ask or 0) - (bid or 0)),
            'profitTickValue': symbol_info.get('tickValue', 1),
            'lossTickValue': symbol_info.get('tickValue', 1)
        }

    def map_execution_event(self, execution_event: Any) -> Dict:
        """Convert cTrader execution event to MetaAPI trade format"""
        symbol_info = self.reverse_symbol_mapping.get(execution_event.symbolId, {})
        mt5_symbol = symbol_info.get('mt5Symbol', f'UNKNOWN_{execution_event.symbolId}')

        return {
            'id': str(getattr(execution_event, 'executionId', '')),
            'type': f"DEAL_TYPE_{getattr(execution_event, 'tradeSide', 'BUY')}",
            'symbol': mt5_symbol,
            'magic': int(getattr(execution_event, 'label', 0) or 0),
            'orderId': str(getattr(execution_event, 'orderId', '')),
            'positionId': str(getattr(execution_event, 'positionId', '')),
            'volume': getattr(execution_event, 'volume', 0) / 100,
            'price': getattr(execution_event, 'executionPrice', 0),
            'commission': getattr(execution_event, 'commission', 0),
            'swap': getattr(execution_event, 'swap', 0),
            'profit': getattr(execution_event, 'profit', 0),
            'time': datetime.fromtimestamp(
                getattr(execution_event, 'utcTimestamp', 0) / 1000
            ).isoformat() if hasattr(execution_event, 'utcTimestamp') else datetime.now().isoformat(),
            'clientId': getattr(execution_event, 'label', ''),
            'comment': getattr(execution_event, 'comment', '')
        }