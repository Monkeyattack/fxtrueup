/**
 * Telegram notification service for copy trader
 */

import fetch from 'node-fetch';

const BOT_TOKEN = '8174053596:AAEmua_6LaAMLfA3JHHFrc86nTZ7I2C3VrE';
const CHAT_ID = '6585156851';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

class TelegramNotifier {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  async sendMessage(text, parseMode = 'HTML') {
    try {
      const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text,
          parse_mode: parseMode,
          disable_web_page_preview: true
        })
      });

      const result = await response.json();
      if (!result.ok) {
        console.error('Telegram send failed:', result);
      }
      return result;
    } catch (error) {
      console.error('Telegram send error:', error);
    }
  }

  /**
   * Format and send position detected notification
   */
  async notifyPositionDetected(position, sourceAccount) {
    const message = `<b>🎯 NEW POSITION DETECTED</b>

<b>Source:</b> ${sourceAccount.substring(0, 8)}...
<b>Symbol:</b> ${position.symbol}
<b>Type:</b> ${position.type || 'BUY'}
<b>Volume:</b> ${position.volume} lots
<b>Open Price:</b> ${position.openPrice}
<b>Stop Loss:</b> ${position.stopLoss || 'None'}
<b>Take Profit:</b> ${position.takeProfit || 'None'}
<b>Time:</b> ${new Date(position.time || Date.now()).toISOString()}

<i>Evaluating filters...</i>`;

    await this.sendMessage(message);
  }

  /**
   * Notify successful copy
   */
  async notifyCopySuccess(position, destAccount, result) {
    const message = `<b>✅ TRADE COPIED SUCCESSFULLY</b>

<b>Original:</b> ${position.symbol} ${position.volume} lots
<b>Copied:</b> ${result.volume || position.volume} lots
<b>Order ID:</b> ${result.orderId}
<b>Destination:</b> ${destAccount.substring(0, 8)}...

<b>Execution Time:</b> ${new Date().toISOString()}`;

    await this.sendMessage(message);
  }

  /**
   * Notify copy failure
   */
  async notifyCopyFailure(position, reason, details = '') {
    const message = `<b>❌ TRADE NOT COPIED</b>

<b>Symbol:</b> ${position.symbol}
<b>Volume:</b> ${position.volume} lots
<b>Reason:</b> ${reason}
${details ? `<b>Details:</b> ${details}` : ''}

<b>Time:</b> ${new Date().toISOString()}`;

    await this.sendMessage(message);
  }

  /**
   * Notify filter rejection
   */
  async notifyFilterRejection(position, filters) {
    const filterList = filters.map(f => `• ${f}`).join('\n');

    const message = `<b>🚫 TRADE FILTERED OUT</b>

<b>Symbol:</b> ${position.symbol}
<b>Volume:</b> ${position.volume} lots

<b>Failed Filters:</b>
${filterList}

<b>Time:</b> ${new Date().toISOString()}`;

    await this.sendMessage(message);
  }

  /**
   * Daily summary
   */
  async notifyDailySummary(stats) {
    const message = `<b>📊 DAILY SUMMARY</b>

<b>Date:</b> ${stats.date}
<b>Trades Detected:</b> ${stats.detected}
<b>Trades Copied:</b> ${stats.copied}
<b>Trades Filtered:</b> ${stats.filtered}
<b>Daily P&L:</b> $${stats.profit.toFixed(2)}

<b>Active Positions:</b> ${stats.activePositions}`;

    await this.sendMessage(message);
  }

  /**
   * Notify position exit detected
   */
  async notifyExitDetected(position, sourceAccount, closeInfo) {
    const message = `<b>📉 POSITION EXIT DETECTED</b>

<b>Source:</b> ${sourceAccount.substring(0, 8)}...
<b>Position:</b> ${position.id}
<b>Symbol:</b> ${position.symbol}
<b>Volume:</b> ${position.volume} lots
<b>Close Reason:</b> ${closeInfo.reason}
<b>Profit:</b> $${closeInfo.profit?.toFixed(2) || '0.00'}
<b>Close Time:</b> ${closeInfo.closeTime}

<i>Checking for mapped positions...</i>`;

    await this.sendMessage(message);
  }

  /**
   * Notify successful exit copy
   */
  async notifyExitCopied(mapping, closeInfo, result) {
    const message = `<b>✅ EXIT COPIED SUCCESSFULLY</b>

<b>Route:</b> ${mapping.sourceAccountId.substring(0, 8)}... → ${mapping.destAccountId.substring(0, 8)}...
<b>Symbol:</b> ${mapping.sourceSymbol}

<b>Source Exit:</b>
• Volume: ${mapping.sourceVolume} lots
• Profit: $${closeInfo.profit?.toFixed(2) || '0.00'}
• Reason: ${closeInfo.reason}

<b>Destination Exit:</b>
• Volume: ${mapping.destVolume} lots
• Profit: $${result.destProfit?.toFixed(2) || '0.00'}
• P&L Variance: ${((result.destProfit - (closeInfo.profit * mapping.destVolume / mapping.sourceVolume)) / (closeInfo.profit * mapping.destVolume / mapping.sourceVolume) * 100).toFixed(1)}%

<b>Exit Time:</b> ${new Date().toISOString()}`;

    await this.sendMessage(message);
  }

  /**
   * Notify exit copy failure
   */
  async notifyExitCopyFailure(mapping, error) {
    const message = `<b>❌ EXIT COPY FAILED</b>

<b>Route:</b> ${mapping.sourceAccountId.substring(0, 8)}... → ${mapping.destAccountId.substring(0, 8)}...
<b>Symbol:</b> ${mapping.sourceSymbol}
<b>Source Position:</b> ${mapping.sourcePositionId}
<b>Dest Position:</b> ${mapping.destPositionId}
<b>Error:</b> ${error}

<b>Time:</b> ${new Date().toISOString()}

<i>⚠️ Manual intervention may be required</i>`;

    await this.sendMessage(message);
  }
}

// Export singleton instance
export const telegram = new TelegramNotifier();
export default telegram;