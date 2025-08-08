/**
 * Trading Charts Module using Lightweight Charts
 * Provides equity curve, drawdown, and distribution charts
 */

class TradingCharts {
    constructor() {
        this.charts = {};
        this.chartContainers = {};
    }

    /**
     * Initialize all charts for an account
     * @param {Object} metrics - Trading metrics object
     * @param {Array} trades - Array of trade objects
     */
    initializeCharts(metrics, trades) {
        // Create equity curve chart
        this.createEquityCurve(trades);
        
        // Create drawdown chart
        this.createDrawdownChart(trades);
        
        // Create win/loss distribution
        this.createDistributionChart(metrics);
        
        // Create monthly performance chart
        this.createMonthlyChart(trades);
    }

    /**
     * Create equity curve chart
     */
    createEquityCurve(trades) {
        const container = document.getElementById('equityCurveChart');
        if (!container) return;

        // Clear existing chart
        container.innerHTML = '';
        
        const chart = LightweightCharts.createChart(container, {
            width: container.offsetWidth,
            height: 400,
            layout: {
                backgroundColor: '#ffffff',
                textColor: '#333333',
            },
            grid: {
                vertLines: {
                    color: '#e0e0e0',
                },
                horzLines: {
                    color: '#e0e0e0',
                },
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
            },
            rightPriceScale: {
                borderColor: '#e0e0e0',
            },
            timeScale: {
                borderColor: '#e0e0e0',
                timeVisible: true,
                secondsVisible: false,
            },
        });

        const lineSeries = chart.addLineSeries({
            color: '#1e40af',
            lineWidth: 2,
            priceFormat: {
                type: 'price',
                precision: 2,
                minMove: 0.01,
            },
        });

        // Calculate cumulative equity
        let balance = 10000; // Starting balance
        const equityData = trades
            .filter(t => t.time)
            .sort((a, b) => new Date(a.time) - new Date(b.time))
            .map(trade => {
                balance += (trade.profit || 0);
                return {
                    time: this.formatDate(trade.time),
                    value: balance
                };
            });

        // Add starting point
        if (equityData.length > 0) {
            equityData.unshift({
                time: this.formatDate(new Date(new Date(trades[0].time).getTime() - 86400000)),
                value: 10000
            });
        }

        lineSeries.setData(equityData);
        chart.timeScale().fitContent();

        // Store chart reference
        this.charts.equity = chart;
        
        // Make chart responsive
        this.makeChartResponsive(chart, container);
    }

    /**
     * Create drawdown chart
     */
    createDrawdownChart(trades) {
        const container = document.getElementById('drawdownChart');
        if (!container) return;

        container.innerHTML = '';
        
        const chart = LightweightCharts.createChart(container, {
            width: container.offsetWidth,
            height: 300,
            layout: {
                backgroundColor: '#ffffff',
                textColor: '#333333',
            },
            grid: {
                vertLines: {
                    color: '#e0e0e0',
                },
                horzLines: {
                    color: '#e0e0e0',
                },
            },
            rightPriceScale: {
                borderColor: '#e0e0e0',
                scaleMargins: {
                    top: 0.1,
                    bottom: 0.1,
                },
            },
            timeScale: {
                borderColor: '#e0e0e0',
            },
        });

        const areaSeries = chart.addAreaSeries({
            topColor: 'rgba(239, 68, 68, 0.4)',
            bottomColor: 'rgba(239, 68, 68, 0.1)',
            lineColor: 'rgba(239, 68, 68, 1)',
            lineWidth: 2,
            priceFormat: {
                type: 'percent',
                precision: 2,
            },
        });

        // Calculate drawdown percentages
        let balance = 10000;
        let peak = 10000;
        const drawdownData = trades
            .filter(t => t.time)
            .sort((a, b) => new Date(a.time) - new Date(b.time))
            .map(trade => {
                balance += (trade.profit || 0);
                if (balance > peak) peak = balance;
                const drawdownPercent = ((peak - balance) / peak) * 100;
                return {
                    time: this.formatDate(trade.time),
                    value: -drawdownPercent // Negative for visual effect
                };
            });

        areaSeries.setData(drawdownData);
        chart.timeScale().fitContent();

        this.charts.drawdown = chart;
        this.makeChartResponsive(chart, container);
    }

    /**
     * Create win/loss distribution chart
     */
    createDistributionChart(metrics) {
        const container = document.getElementById('distributionChart');
        if (!container) return;

        container.innerHTML = '';
        
        const chart = LightweightCharts.createChart(container, {
            width: container.offsetWidth,
            height: 300,
            layout: {
                backgroundColor: '#ffffff',
                textColor: '#333333',
            },
            rightPriceScale: {
                visible: false,
            },
            timeScale: {
                visible: false,
            },
            grid: {
                vertLines: {
                    visible: false,
                },
                horzLines: {
                    visible: false,
                },
            },
        });

        const histogramSeries = chart.addHistogramSeries({
            color: '#1e40af',
            priceFormat: {
                type: 'volume',
            },
        });

        // Create distribution data
        const data = [
            { time: 'Wins', value: metrics.winningTrades, color: '#10b981' },
            { time: 'Losses', value: metrics.losingTrades, color: '#ef4444' },
        ];

        histogramSeries.setData(data);
        
        this.charts.distribution = chart;
        this.makeChartResponsive(chart, container);
    }

    /**
     * Create monthly performance chart
     */
    createMonthlyChart(trades) {
        const container = document.getElementById('monthlyChart');
        if (!container) return;

        container.innerHTML = '';
        
        const chart = LightweightCharts.createChart(container, {
            width: container.offsetWidth,
            height: 300,
            layout: {
                backgroundColor: '#ffffff',
                textColor: '#333333',
            },
            rightPriceScale: {
                borderColor: '#e0e0e0',
            },
            timeScale: {
                borderColor: '#e0e0e0',
            },
        });

        const histogramSeries = chart.addHistogramSeries({
            priceFormat: {
                type: 'price',
                precision: 2,
                minMove: 0.01,
            },
        });

        // Group trades by month
        const monthlyData = {};
        trades.forEach(trade => {
            if (!trade.time) return;
            const date = new Date(trade.time);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = 0;
            }
            monthlyData[monthKey] += (trade.profit || 0);
        });

        // Convert to chart data
        const chartData = Object.entries(monthlyData)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, profit]) => ({
                time: month + '-01',
                value: profit,
                color: profit >= 0 ? '#10b981' : '#ef4444'
            }));

        histogramSeries.setData(chartData);
        chart.timeScale().fitContent();
        
        this.charts.monthly = chart;
        this.makeChartResponsive(chart, container);
    }

    /**
     * Make chart responsive to window resize
     */
    makeChartResponsive(chart, container) {
        const resizeObserver = new ResizeObserver(entries => {
            if (entries.length === 0 || entries[0].target !== container) return;
            const { width, height } = entries[0].contentRect;
            chart.applyOptions({ width, height });
        });

        resizeObserver.observe(container);
    }

    /**
     * Format date for Lightweight Charts
     */
    formatDate(dateStr) {
        const date = new Date(dateStr);
        return date.toISOString().split('T')[0];
    }

    /**
     * Destroy all charts
     */
    destroy() {
        Object.values(this.charts).forEach(chart => {
            if (chart && typeof chart.remove === 'function') {
                chart.remove();
            }
        });
        this.charts = {};
    }
}

// Export for use in account-detail.js
window.TradingCharts = TradingCharts;