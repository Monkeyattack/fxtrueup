/**
 * Lightweight Charts Integration for Real Trading Data
 * Provides modern, performant charts for the FX True Up platform
 */

class TradingCharts {
    constructor() {
        this.charts = {};
        this.themes = {
            light: {
                layout: {
                    backgroundColor: '#ffffff',
                    textColor: '#333333',
                },
                grid: {
                    vertLines: {
                        color: '#e1e5e9',
                    },
                    horzLines: {
                        color: '#e1e5e9',
                    },
                },
                crosshair: {
                    mode: LightweightCharts.CrosshairMode.Normal,
                },
                rightPriceScale: {
                    borderColor: '#cccccc',
                },
                timeScale: {
                    borderColor: '#cccccc',
                },
            },
            dark: {
                layout: {
                    backgroundColor: '#1e1e1e',
                    textColor: '#d1d5db',
                },
                grid: {
                    vertLines: {
                        color: '#2d2d2d',
                    },
                    horzLines: {
                        color: '#2d2d2d',
                    },
                },
                crosshair: {
                    mode: LightweightCharts.CrosshairMode.Normal,
                },
                rightPriceScale: {
                    borderColor: '#2d2d2d',
                },
                timeScale: {
                    borderColor: '#2d2d2d',
                },
            }
        };
    }

    /**
     * Create a P&L chart for dashboard or analytics
     */
    createProfitLossChart(containerId, data, options = {}) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Container ${containerId} not found`);
            return null;
        }

        const defaultOptions = {
            width: container.clientWidth,
            height: options.height || 300,
            ...this.themes.light,
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderColor: '#cccccc',
            },
        };

        const chart = LightweightCharts.createChart(container, {
            ...defaultOptions,
            ...options
        });

        // Create line series for cumulative P&L
        const plSeries = chart.addLineSeries({
            color: data.some(d => d.value < 0) ? '#ef4444' : '#10b981',
            lineWidth: 2,
            priceFormat: {
                type: 'currency',
                symbol: '$',
                precision: 2,
            },
        });

        // Format data for lightweight charts
        const formattedData = data.map(item => ({
            time: this.formatTimeForChart(item.time),
            value: item.value || item.cumulativePL || item.pl || 0
        }));

        plSeries.setData(formattedData);

        // Store reference
        this.charts[containerId] = chart;

        // Handle resize
        this.setupResize(containerId, chart);

        return chart;
    }

    /**
     * Create equity curve chart showing account balance over time
     */
    createEquityCurveChart(containerId, data, options = {}) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Container ${containerId} not found`);
            return null;
        }

        const chart = LightweightCharts.createChart(container, {
            width: container.clientWidth,
            height: options.height || 400,
            ...this.themes.light,
            ...options
        });

        // Balance line
        const balanceSeries = chart.addLineSeries({
            color: '#3b82f6',
            lineWidth: 2,
            title: 'Balance',
            priceFormat: {
                type: 'currency',
                symbol: '$',
                precision: 2,
            },
        });

        // Equity line
        const equitySeries = chart.addLineSeries({
            color: '#10b981',
            lineWidth: 2,
            title: 'Equity',
            priceFormat: {
                type: 'currency',
                symbol: '$',
                precision: 2,
            },
        });

        // Format and set data
        const balanceData = data.balance?.map(item => ({
            time: this.formatTimeForChart(item.time),
            value: item.value
        })) || [];

        const equityData = data.equity?.map(item => ({
            time: this.formatTimeForChart(item.time),
            value: item.value
        })) || [];

        balanceSeries.setData(balanceData);
        equitySeries.setData(equityData);

        this.charts[containerId] = chart;
        this.setupResize(containerId, chart);

        return chart;
    }

    /**
     * Create trade volume histogram
     */
    createVolumeChart(containerId, data, options = {}) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Container ${containerId} not found`);
            return null;
        }

        const chart = LightweightCharts.createChart(container, {
            width: container.clientWidth,
            height: options.height || 200,
            ...this.themes.light,
            ...options
        });

        const volumeSeries = chart.addHistogramSeries({
            color: '#26a69a',
            priceFormat: {
                type: 'volume',
            },
            priceScaleId: '',
            scaleMargins: {
                top: 0.1,
                bottom: 0,
            },
        });

        const formattedData = data.map(item => ({
            time: this.formatTimeForChart(item.time),
            value: item.volume || item.value || 0,
            color: item.profit >= 0 ? '#26a69a' : '#ef5350'
        }));

        volumeSeries.setData(formattedData);

        this.charts[containerId] = chart;
        this.setupResize(containerId, chart);

        return chart;
    }

    /**
     * Create drawdown chart
     */
    createDrawdownChart(containerId, data, options = {}) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Container ${containerId} not found`);
            return null;
        }

        const chart = LightweightCharts.createChart(container, {
            width: container.clientWidth,
            height: options.height || 250,
            ...this.themes.light,
            ...options
        });

        const drawdownSeries = chart.addAreaSeries({
            topColor: 'rgba(239, 68, 68, 0.3)',
            bottomColor: 'rgba(239, 68, 68, 0.1)',
            lineColor: '#ef4444',
            lineWidth: 2,
            priceFormat: {
                type: 'percent',
            },
        });

        const formattedData = data.map(item => ({
            time: this.formatTimeForChart(item.time),
            value: -(item.drawdown || item.value || 0) // Negative for drawdown
        }));

        drawdownSeries.setData(formattedData);

        this.charts[containerId] = chart;
        this.setupResize(containerId, chart);

        return chart;
    }

    /**
     * Create candlestick chart for price action
     */
    createCandlestickChart(containerId, data, options = {}) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Container ${containerId} not found`);
            return null;
        }

        const chart = LightweightCharts.createChart(container, {
            width: container.clientWidth,
            height: options.height || 400,
            ...this.themes.light,
            ...options
        });

        const candleSeries = chart.addCandlestickSeries({
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderVisible: false,
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350',
        });

        const formattedData = data.map(item => ({
            time: this.formatTimeForChart(item.time),
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close
        }));

        candleSeries.setData(formattedData);

        this.charts[containerId] = chart;
        this.setupResize(containerId, chart);

        return chart;
    }

    /**
     * Create performance comparison chart for multiple accounts
     */
    createComparisonChart(containerId, accountsData, options = {}) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Container ${containerId} not found`);
            return null;
        }

        const chart = LightweightCharts.createChart(container, {
            width: container.clientWidth,
            height: options.height || 300,
            ...this.themes.light,
            ...options
        });

        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
        
        accountsData.forEach((account, index) => {
            const series = chart.addLineSeries({
                color: colors[index % colors.length],
                lineWidth: 2,
                title: account.name,
                priceFormat: {
                    type: 'percent',
                },
            });

            const formattedData = account.data.map(item => ({
                time: this.formatTimeForChart(item.time),
                value: item.returnPercent || item.value || 0
            }));

            series.setData(formattedData);
        });

        this.charts[containerId] = chart;
        this.setupResize(containerId, chart);

        return chart;
    }

    /**
     * Update chart data without recreating the chart
     */
    updateChartData(containerId, newData, seriesIndex = 0) {
        const chart = this.charts[containerId];
        if (!chart) {
            console.error(`Chart ${containerId} not found`);
            return;
        }

        const series = chart.series();
        if (series && series[seriesIndex]) {
            const formattedData = newData.map(item => ({
                time: this.formatTimeForChart(item.time),
                value: item.value || item.cumulativePL || item.pl || 0
            }));
            
            series[seriesIndex].setData(formattedData);
        }
    }

    /**
     * Format time for lightweight charts (expects UNIX timestamp)
     */
    formatTimeForChart(time) {
        if (typeof time === 'string') {
            return Math.floor(new Date(time).getTime() / 1000);
        }
        if (time instanceof Date) {
            return Math.floor(time.getTime() / 1000);
        }
        if (typeof time === 'number' && time > 1000000000000) {
            // Already in milliseconds, convert to seconds
            return Math.floor(time / 1000);
        }
        return time;
    }

    /**
     * Setup responsive resize handling
     */
    setupResize(containerId, chart) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                chart.applyOptions({ width, height });
            }
        });

        resizeObserver.observe(container);

        // Store observer reference for cleanup
        if (!this.resizeObservers) {
            this.resizeObservers = {};
        }
        this.resizeObservers[containerId] = resizeObserver;
    }

    /**
     * Remove chart and cleanup
     */
    removeChart(containerId) {
        const chart = this.charts[containerId];
        if (chart) {
            chart.remove();
            delete this.charts[containerId];
        }

        const observer = this.resizeObservers?.[containerId];
        if (observer) {
            observer.disconnect();
            delete this.resizeObservers[containerId];
        }
    }

    /**
     * Remove all charts and cleanup
     */
    cleanup() {
        Object.keys(this.charts).forEach(chartId => {
            this.removeChart(chartId);
        });
    }

    /**
     * Set theme for all charts
     */
    setTheme(theme = 'light') {
        const themeOptions = this.themes[theme];
        if (!themeOptions) {
            console.warn(`Theme ${theme} not found`);
            return;
        }

        Object.values(this.charts).forEach(chart => {
            chart.applyOptions(themeOptions);
        });
    }

    /**
     * Get chart instance
     */
    getChart(containerId) {
        return this.charts[containerId];
    }

    /**
     * Fit chart content
     */
    fitContent(containerId) {
        const chart = this.charts[containerId];
        if (chart) {
            chart.timeScale().fitContent();
        }
    }
}

// Export for use in other modules
window.TradingCharts = TradingCharts;