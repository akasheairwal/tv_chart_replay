import type { PythonBridge } from './bridge/python-bridge';
import { ChartManager } from './chart/chart-manager';
import type { CompactCandleRow } from './chart/candle-series';
import type { DrawingDefinition } from './drawings/drawing-types';
import { IndicatorManager } from './indicators/indicator-manager';
import { ReplayBar } from './replay/replay-bar';
import { ReplayController, type ReplayState } from './replay/replay-controller';
import { SessionManager } from './sessions/session-manager';
import type { SessionDefinition } from './sessions/session-types';
import { DataStatus, type DatasetInfo } from './ui/data-status';
import { DrawingListDialog } from './ui/drawing-list-dialog';
import { DrawingStyleEditor } from './ui/drawing-style-editor';
import { DrawingToolbar } from './ui/drawing-toolbar';
import { IndicatorDialog } from './ui/indicator-dialog';
import { LogViewerDialog } from './ui/log-viewer-dialog';
import { OrderPanel } from './ui/order-panel';
import { QuickTradeOverlay } from './ui/quick-trade-overlay';
import { SessionDialog } from './ui/session-dialog';
import { SymbolSearch, type SymbolSearchResult } from './ui/symbol-search';
import { TradingDrawer } from './ui/trading-drawer';
import { Watchlist } from './ui/watchlist';
import { SlTpConfirmDialog, type SlTpModificationRequest } from './ui/sl-tp-confirm-dialog';
import { PartialCloseDialog, type PartialCloseRequest } from './ui/partial-close-dialog';
import type { PositionDefinition } from './trading/trading-types';

interface RequestResponse {
  ok: boolean;
  data?: { status: string; dataset?: DatasetInfo };
  error?: string;
}

interface LoadHistoryResponse {
  ok: boolean;
  data?: {
    columns: string[];
    count: number;
    rows: CompactCandleRow[];
  };
  error?: string;
}

function getTimeframeSeconds(tf: string): number {
  const map: Record<string, number> = {
    '1m': 60,
    '2m': 120,
    '3m': 180,
    '5m': 300,
    '10m': 600,
    '15m': 900,
    '30m': 1800,
    '45m': 2700,
    '1H': 3600,
    '2H': 7200,
    '4H': 14400,
    '6H': 21600,
    '12H': 43200,
    '1D': 86400,
    '1W': 604800,
    '1M': 2592000,
  };
  return map[tf] || 3600;
}

function requireElement<T extends HTMLElement = HTMLElement>(selector: string): T {
  let el = document.querySelector<T>(selector);
  if (!el) {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      const parent = document.querySelector('#chart-container') || document.body;
      const created = document.createElement('div') as unknown as T;
      created.id = id;
      parent.appendChild(created);
      return created;
    }
    throw new Error(`Missing element: ${selector}`);
  }
  return el;
}

export class App {
  private readonly chart: ChartManager;
  private readonly dataStatus: DataStatus;
  private readonly search: SymbolSearch;
  private readonly watchlist: Watchlist;
  private readonly replayController: ReplayController;
  private readonly replayBar: ReplayBar;
  private readonly indicatorManager: IndicatorManager;
  private readonly indicatorDialog: IndicatorDialog;
  private drawingStyleEditor: DrawingStyleEditor | null = null;
  private drawingListDialog: DrawingListDialog | null = null;
  private drawingToolbar: DrawingToolbar | null = null;
  private readonly sessionMgr: SessionManager;
  private sessionDialog: SessionDialog | null = null;
  private logViewerDialog: LogViewerDialog | null = null;
  private quickTrade: QuickTradeOverlay | null = null;
  private orderPanel: OrderPanel | null = null;
  private tradingDrawer: TradingDrawer | null = null;
  private slTpConfirmDialog: SlTpConfirmDialog | null = null;
  private partialCloseDialog: PartialCloseDialog | null = null;
  private activeSymbol = '';
  private activeTimeframe = '1H';

  constructor(private readonly bridge: PythonBridge | null) {
    this.sessionMgr = new SessionManager(bridge);
    this.chart = new ChartManager(
      requireElement('#chart-container'),
      (drawing) => void this.saveDrawing(drawing),
      (id) => void this.deleteDrawing(id),
      (selected) => {
        if (this.drawingStyleEditor) {
          if (selected) {
            this.drawingStyleEditor.show(selected);
          } else {
            const engine = this.chart.getDrawingEngine();
            const currentTool = engine?.getCurrentTool();
            if (currentTool && currentTool !== 'cursor') {
              this.drawingStyleEditor.showForTool(currentTool);
            } else {
              this.drawingStyleEditor.hide();
            }
          }
        }
      },
      (tool) => {
        const dTool = tool as import('./drawings/drawing-types').DrawingType;
        if (this.drawingToolbar) {
          this.drawingToolbar.syncTool(dTool);
        }
        if (this.drawingStyleEditor) {
          if (dTool && dTool !== 'cursor') {
            this.drawingStyleEditor.showForTool(dTool);
          } else {
            const engine = this.chart.getDrawingEngine();
            const selected = engine?.getSelectedDrawing();
            if (selected) {
              this.drawingStyleEditor.show(selected);
            } else {
              this.drawingStyleEditor.hide();
            }
          }
        }
      },
      (posId, price) => void this.handleClosePosition(posId, price),
      (req) => this.handleModifySlTpRequest(req),
    );
    this.dataStatus = new DataStatus(requireElement('#data-status'), bridge);

    this.indicatorManager = new IndicatorManager(
      bridge,
      this.chart,
      (active) => this.indicatorDialog.updateActive(active),
    );

    this.indicatorDialog = new IndicatorDialog(
      document.body,
      this.indicatorManager,
    );

    this.replayController = new ReplayController(
      bridge,
      this.chart,
      (state) => this.handleReplayStateChange(state),
    );

    this.replayBar = new ReplayBar(
      requireElement('#replay-bar-container'),
      this.replayController,
      () => void this.startRandomReplay(),
      (target_s) => void this.jumpToDateWindow(target_s),
    );

    this.watchlist = new Watchlist(
      requireElement('#watchlist-container'),
      (sym) => {
        this.selectSymbolByName(sym);
      },
      bridge ?? undefined,
      (collapsed) => {
        const toggleBtn = document.getElementById('watchlist-toggle-btn');
        if (toggleBtn) {
          if (collapsed) {
            toggleBtn.classList.remove('active');
          } else {
            toggleBtn.classList.add('active');
          }
        }
        this.animateChartResize();
      },
    );

    this.search = new SymbolSearch(
      requireElement('#symbol-results'),
      requireElement<HTMLInputElement>('#symbol-search'),
      bridge,
      (result) => this.selectSymbol(result),
    );

    const timeframeSelect = requireElement<HTMLSelectElement>('#timeframe-select');
    timeframeSelect.addEventListener('change', () => {
      this.activeTimeframe = timeframeSelect.value;
      if (this.activeSymbol) {
        void this.requestDataAndLoadHistory();
      }
    });

    const requestButton = requireElement<HTMLButtonElement>('#request-data');
    requestButton.addEventListener('click', () => void this.requestDataAndLoadHistory());

    const indicatorsButton = requireElement<HTMLButtonElement>('#indicators-btn');
    indicatorsButton.addEventListener('click', () => this.indicatorDialog.show());

    this.wireKeyboardShortcuts();
  }

  async start(): Promise<void> {
    this.chart.init();
    await this.indicatorManager.init();

    const drawingEngine = this.chart.getDrawingEngine();
    if (drawingEngine) {
      this.drawingStyleEditor = new DrawingStyleEditor(
        requireElement('#chart-area'),
        drawingEngine,
      );
      this.drawingStyleEditor.onCreateOrder = (params) => {
        this.orderPanel?.populateFromPositionDrawing(params);
      };

      drawingEngine.onOpenDrawingSettings = (drawing) => {
        this.drawingStyleEditor?.openSettingsDialog(drawing);
      };

      this.drawingListDialog = new DrawingListDialog(
        document.body,
        drawingEngine,
      );

      this.drawingToolbar = new DrawingToolbar(
        requireElement('#drawing-toolbar-container'),
        drawingEngine,
        () => this.drawingListDialog?.show(),
      );
    }

    // Session dialog
    this.sessionDialog = new SessionDialog(
      document.body,
      this.sessionMgr,
      () => this.getSessionContext(),
      (session) => void this.applySession(session),
    );

    // Log viewer dialog
    this.logViewerDialog = new LogViewerDialog(document.body, this.bridge);

    // Top-Left Quick Buy / Sell Buttons Overlay on Chart
    const chartContainer = requireElement('#chart-container');
    this.quickTrade = new QuickTradeOverlay(
      chartContainer,
      this.bridge,
      (order) => this.handleOrderPlacement(order),
    );

    // Right Side Collapsible Trade Panel
    const tradePanelContainer = requireElement('#trade-panel');
    this.orderPanel = new OrderPanel(
      tradePanelContainer,
      this.bridge,
      (order) => this.handleOrderPlacement(order),
      (collapsed) => {
        const tradeBtn = document.getElementById('trading-btn');
        if (tradeBtn) {
          if (collapsed) {
            tradeBtn.classList.remove('active');
          } else {
            tradeBtn.classList.add('active');
          }
        }
        this.animateChartResize();
      },
    );

    const drawerContainer = document.getElementById('trading-drawer-container');
    if (drawerContainer) {
      this.tradingDrawer = new TradingDrawer(
        drawerContainer,
        this.bridge,
        (positions) => {
          this.chart.setPositions(positions);
          this.orderPanel?.setPositions(positions);
        },
        (account) => {
          this.orderPanel?.setAccountSummary(account);
        },
        (pos) => this.handleOpenModifySlTpModal(pos),
        (pos, price) => this.handleOpenPartialCloseModal(pos, price),
      );
      this.tradingDrawer.start();
    }

    // Wire toolbar buttons
    document.getElementById('sessions-btn')?.addEventListener('click', () => {
      void this.sessionDialog?.show();
    });
    document.getElementById('save-session-btn')?.addEventListener('click', () => {
      void this.quickSaveSession();
    });
    document.getElementById('logs-btn')?.addEventListener('click', () => {
      void this.logViewerDialog?.show();
    });

    // Watchlist top nav button toggle
    const watchlistToggleBtn = document.getElementById('watchlist-toggle-btn');
    watchlistToggleBtn?.addEventListener('click', () => {
      this.watchlist.toggleCollapse();
    });

    // Trade top nav button toggle
    const tradeToggleBtn = document.getElementById('trading-btn');
    tradeToggleBtn?.addEventListener('click', () => {
      this.orderPanel?.toggle();
    });

    // Sync initial state of top bar toggle buttons
    if (this.orderPanel && !this.orderPanel.isCollapsed()) {
      tradeToggleBtn?.classList.add('active');
    } else {
      tradeToggleBtn?.classList.remove('active');
    }
    if (this.watchlist && !this.watchlist.isCollapsed()) {
      watchlistToggleBtn?.classList.add('active');
    } else {
      watchlistToggleBtn?.classList.remove('active');
    }

    // Layout switcher
    const layout1Btn = document.getElementById('layout-1-btn');
    const layout2Btn = document.getElementById('layout-2-btn');
    const layout4Btn = document.getElementById('layout-4-btn');
    const setLayoutActive = (activeBtn: HTMLElement | null) => {
      [layout1Btn, layout2Btn, layout4Btn].forEach((b) => b?.classList.remove('active'));
      activeBtn?.classList.add('active');
    };
    layout1Btn?.addEventListener('click', () => {
      setLayoutActive(layout1Btn);
      this.showToast('📐 Layout: Single Chart');
    });
    layout2Btn?.addEventListener('click', () => {
      setLayoutActive(layout2Btn);
      this.showToast('📐 Layout: Dual Chart');
    });
    layout4Btn?.addEventListener('click', () => {
      setLayoutActive(layout4Btn);
      this.showToast('📐 Layout: Quad Chart');
    });

    await this.watchlist.init();
    this.search.wire();
    this.dataStatus.wire();
    this.subscribeBridgeEvents();

    // Default to EURUSD on startup
    this.selectSymbolByName('EURUSD');

    // Check for autosave on startup
    void this.checkAutosave();
  }

  private animateChartResize(durationMs = 300): void {
    const startTime = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startTime;
      const chartContainer = document.getElementById('chart-container');
      if (chartContainer) {
        const w = chartContainer.clientWidth;
        const h = chartContainer.clientHeight;
        if (w > 0 && h > 0) {
          this.chart.resize(w, h);
        }
      }
      if (elapsed < durationMs) {
        requestAnimationFrame(tick);
      } else {
        const finalContainer = document.getElementById('chart-container');
        if (finalContainer) {
          this.chart.resize(finalContainer.clientWidth, finalContainer.clientHeight);
        }
      }
    };
    requestAnimationFrame(tick);
  }

  private stateUpdateTimer: ReturnType<typeof setTimeout> | null = null;

  private handleReplayStateChange(state: ReplayState): void {
    this.replayBar?.update(state);

    if (state.status === 'PLAYING') {
      // Throttle heavy indicator and position recalculations during rapid playback
      if (this.stateUpdateTimer === null) {
        this.stateUpdateTimer = setTimeout(() => {
          this.stateUpdateTimer = null;
          void this.indicatorManager.recalculateAll();
          void this.refreshPositions();
        }, 250);
      }
    } else {
      if (this.stateUpdateTimer !== null) {
        clearTimeout(this.stateUpdateTimer);
        this.stateUpdateTimer = null;
      }
      void this.indicatorManager.recalculateAll();
      void this.refreshPositions();
    }
  }

  private inMemoryPositions: PositionDefinition[] = [];
  private lastPrice = 1.0850;

  private handleOrderPlacement(order: any): void {
    const sideText = order.side === 'BUY' ? 'BUY' : 'SELL';
    const lotText = order.quantity ? `${Number(order.quantity).toFixed(2)} Lots` : '';
    this.showToast(`⚡ Order Executed: ${sideText} ${lotText} (${order.order_type || 'MARKET'})`);
    if (!this.bridge) {
      this.handleBrowserOrder(order);
    } else {
      void this.refreshPositions();
    }
  }

  private handleBrowserOrder(order: any): void {
    const execPrice = order.current_market_price > 0 ? order.current_market_price : this.lastPrice;
    const posId = `pos_${Math.random().toString(36).substring(2, 9)}`;
    const newPos: PositionDefinition = {
      position_id: posId,
      symbol: order.symbol || this.activeSymbol || 'EURUSD',
      side: order.side === 'BUY' ? 'LONG' : 'SHORT',
      quantity: order.quantity || 1.0,
      lot_size: order.quantity || 1.0,
      entry_price: execPrice,
      current_price: execPrice,
      unrealized_pnl: 0,
      pips: 0,
      realized_pnl: 0,
      stop_loss: order.stop_loss,
      take_profit: order.take_profit,
      opened_at: Math.floor(Date.now() / 1000),
      status: 'OPEN',
    };
    this.inMemoryPositions.push(newPos);
    this.chart.setPositions(this.inMemoryPositions);
    if (this.orderPanel) {
      this.orderPanel.setPositions(this.inMemoryPositions);
    }
    if (this.tradingDrawer) {
      this.tradingDrawer.setInMemoryPositions(this.inMemoryPositions);
    }
  }

  private handleBrowserClosePosition(posId: string, currentPrice: number): void {
    const idx = this.inMemoryPositions.findIndex((p) => p.position_id === posId);
    if (idx >= 0) {
      const pos = this.inMemoryPositions[idx];
      const isLong = pos.side === 'LONG' || (pos.side as string) === 'BUY';
      const diff = (currentPrice - pos.entry_price) * (isLong ? 1 : -1);
      const mult = pos.entry_price < 50 ? 100000 : 1;
      const pnl = diff * pos.quantity * mult;
      this.inMemoryPositions.splice(idx, 1);
      this.chart.setPositions(this.inMemoryPositions);
      if (this.orderPanel) {
        this.orderPanel.setPositions(this.inMemoryPositions);
      }
      if (this.tradingDrawer) {
        this.tradingDrawer.setInMemoryPositions(this.inMemoryPositions);
      }
      this.showToast(`🔒 Position Closed · PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`);
    }
  }

  private handleModifySlTpRequest(req: SlTpModificationRequest): void {
    if (!this.slTpConfirmDialog) {
      this.slTpConfirmDialog = new SlTpConfirmDialog(document.body);
    }
    this.slTpConfirmDialog.show(req, (confirmedReq) => {
      void this.applyPositionModification(confirmedReq);
    });
  }

  private async applyPositionModification(req: SlTpModificationRequest): Promise<void> {
    const { position, type, newPrice, newSlPrice, newTpPrice } = req;

    let targetSl: number | null = position.stop_loss !== undefined && position.stop_loss !== null && position.stop_loss > 0 ? position.stop_loss : null;
    let targetTp: number | null = position.take_profit !== undefined && position.take_profit !== null && position.take_profit > 0 ? position.take_profit : null;

    if (type === 'SL') {
      targetSl = newPrice > 0 ? newPrice : null;
    } else if (type === 'TP') {
      targetTp = newPrice > 0 ? newPrice : null;
    } else if (type === 'BOTH') {
      if (newSlPrice !== undefined) {
        targetSl = newSlPrice && newSlPrice > 0 ? newSlPrice : null;
      }
      if (newTpPrice !== undefined) {
        targetTp = newTpPrice && newTpPrice > 0 ? newTpPrice : null;
      }
    }

    const payload = {
      position_id: position.position_id,
      stop_loss: targetSl,
      take_profit: targetTp,
    };

    if (this.bridge) {
      try {
        await this.bridge.callJson('modifyPosition', payload);
        await this.refreshPositions();
        this.showToast(`🎯 Position SL/TP targets updated`);
      } catch (err) {
        this.showToast(`❌ Failed to update SL/TP: ${err}`);
      }
    } else {
      const pos = this.inMemoryPositions.find((p) => p.position_id === position.position_id);
      if (pos) {
        pos.stop_loss = targetSl ?? undefined;
        pos.take_profit = targetTp ?? undefined;
        this.chart.setPositions(this.inMemoryPositions);
        this.orderPanel?.setPositions(this.inMemoryPositions);
        this.tradingDrawer?.setInMemoryPositions(this.inMemoryPositions);
        this.showToast(`🎯 Position SL/TP updated`);
      }
    }
  }

  private handleOpenModifySlTpModal(pos: PositionDefinition): void {
    if (!this.slTpConfirmDialog) {
      this.slTpConfirmDialog = new SlTpConfirmDialog(document.body);
    }
    this.slTpConfirmDialog.showEditModal(pos, (confirmedReq) => {
      void this.applyPositionModification(confirmedReq);
    });
  }

  private handleOpenPartialCloseModal(pos: PositionDefinition, price: number): void {
    if (!this.partialCloseDialog) {
      this.partialCloseDialog = new PartialCloseDialog(document.body);
    }
    this.partialCloseDialog.show(pos, price, (req) => {
      void this.applyPartialClose(req);
    });
  }

  private async applyPartialClose(req: PartialCloseRequest): Promise<void> {
    const { position, closeQuantity, currentPrice } = req;
    if (this.bridge) {
      try {
        const res = await this.bridge.callJson<{ ok: boolean }>('closePosition', {
          position_id: position.position_id,
          current_price: currentPrice,
          close_quantity: closeQuantity,
          reason: 'PARTIAL_CLOSE',
        });
        if (res.ok) {
          this.showToast(`✂️ Closed ${closeQuantity.toFixed(2)} Lots of ${position.symbol}`);
        }
      } catch (err) {
        this.showToast(`❌ Failed partial close: ${err}`);
      }
      await this.refreshPositions();
    } else {
      const pos = this.inMemoryPositions.find((p) => p.position_id === position.position_id);
      if (pos) {
        if (closeQuantity >= pos.quantity) {
          this.handleBrowserClosePosition(pos.position_id, currentPrice);
        } else {
          pos.quantity = Math.round((pos.quantity - closeQuantity) * 100) / 100;
          this.chart.setPositions(this.inMemoryPositions);
          this.orderPanel?.setPositions(this.inMemoryPositions);
          this.tradingDrawer?.setInMemoryPositions(this.inMemoryPositions);
          this.showToast(`✂️ Closed ${closeQuantity.toFixed(2)} Lots of ${position.symbol}`);
        }
      }
    }
  }

  private updatePricesAcrossUI(price: number): void {
    if (!price || isNaN(price) || price <= 0) return;
    this.lastPrice = price;
    this.updateHeaderBadge(price);
    this.chart.setLatestPrice(price);
    if (this.quickTrade) {
      this.quickTrade.setPrice(price);
    }
    if (this.orderPanel) {
      this.orderPanel.setCurrentPrice(price);
    }

    if (!this.bridge && this.inMemoryPositions.length > 0) {
      const closedPosIds: string[] = [];
      for (const pos of this.inMemoryPositions) {
        const isLong = pos.side === 'LONG' || (pos.side as string) === 'BUY';
        if (pos.stop_loss !== undefined && pos.stop_loss !== null && pos.stop_loss > 0) {
          const slHit = isLong ? price <= pos.stop_loss : price >= pos.stop_loss;
          if (slHit) {
            closedPosIds.push(pos.position_id);
            this.showToast(`🛑 Stop Loss Hit (${pos.symbol})`);
            continue;
          }
        }
        if (pos.take_profit !== undefined && pos.take_profit !== null && pos.take_profit > 0) {
          const tpHit = isLong ? price >= pos.take_profit : price <= pos.take_profit;
          if (tpHit) {
            closedPosIds.push(pos.position_id);
            this.showToast(`🎯 Take Profit Hit (${pos.symbol})`);
            continue;
          }
        }
      }
      for (const id of closedPosIds) {
        this.handleBrowserClosePosition(id, price);
      }
    }
  }

  private updateHeaderBadge(price?: number): void {
    const symEl = document.getElementById('header-sym-name');
    const tfEl = document.getElementById('header-sym-tf');
    const priceEl = document.getElementById('header-price-badge');
    if (symEl) symEl.textContent = this.activeSymbol || 'EURUSD';
    if (tfEl) tfEl.textContent = this.activeTimeframe || '1H';
    if (price !== undefined && priceEl) {
      priceEl.textContent =
        price > 1000 ? price.toFixed(2) : price > 50 ? price.toFixed(3) : price.toFixed(5);
    }
  }

  private selectSymbol(result: SymbolSearchResult): void {
    this.selectSymbolByName(result.symbol);
  }

  private selectSymbolByName(symbol: string): void {
    this.activeSymbol = symbol;
    this.chart.setSymbol(this.activeSymbol);
    this.updateHeaderBadge(this.lastPrice);
    if (this.quickTrade) {
      this.quickTrade.setSymbol(this.activeSymbol);
      this.quickTrade.setPrice(this.lastPrice);
    }
    if (this.orderPanel) {
      this.orderPanel.setSymbol(this.activeSymbol);
      this.orderPanel.setCurrentPrice(this.lastPrice);
    }
    this.indicatorManager.setContext(this.activeSymbol, this.activeTimeframe);
    const drawingEngine = this.chart.getDrawingEngine();
    if (drawingEngine) {
      drawingEngine.setContext(this.activeSymbol, this.activeTimeframe);
    }
    this.watchlist.setActive(this.activeSymbol);
    this.dataStatus.setActive(this.activeSymbol, this.activeTimeframe);
    void this.requestDataAndLoadHistory();
  }

  private async jumpToDateWindow(target_s: number): Promise<void> {
    if (!this.activeSymbol || !this.bridge) return;

    const tfSeconds = getTimeframeSeconds(this.activeTimeframe);
    const start_s = Math.max(0, target_s - 250 * tfSeconds);
    const end_s = target_s + 500 * tfSeconds;

    this.chart.showLoading(
      `Loading window around ${new Date(target_s * 1000).toLocaleDateString()} (-250 to +500 candles)…`,
    );

    // 1. Request dataset for the 750-candle window (-250 to +500)
    const reqRes = await this.bridge.callJson<RequestResponse>('requestDataset', {
      symbol: this.activeSymbol,
      timeframe: this.activeTimeframe,
      start_s,
      end_s,
    });

    if (!reqRes.ok) {
      this.chart.hideLoading();
      this.dataStatus.onEvent('download.failed', { error: reqRes.error });
      return;
    }

    // 2. Fetch local candle history for window
    const historyRes = await this.bridge.callJson<LoadHistoryResponse>('loadHistory', {
      symbol: this.activeSymbol,
      timeframe: this.activeTimeframe,
      start_s,
      end_s,
    });

    if (historyRes.ok && historyRes.data?.rows && historyRes.data.rows.length > 0) {
      this.chart.loadHistory(historyRes.data.rows, this.activeSymbol);
      const lastRow = historyRes.data.rows[historyRes.data.rows.length - 1];
      this.updatePricesAcrossUI(lastRow[4]);

      // 3. Initialize replay starting at target_s (with 250 candles warmup)
      await this.replayController.createReplay(
        this.activeSymbol,
        this.activeTimeframe,
        250,
      );
      // 4. Jump engine playhead precisely to target_s
      await this.replayController.jumpTo(target_s);
      await this.indicatorManager.recalculateAll();
      this.showToast(
        `🎯 Replay jumped to ${new Date(target_s * 1000).toLocaleDateString()} (-250 to +500 candles loaded)`,
      );
    } else {
      this.chart.hideLoading();
      this.showToast(`⚠️ No candles found around selected date`);
    }
  }

  private async requestDataAndLoadHistory(): Promise<void> {
    if (!this.activeSymbol) return;

    if (!this.bridge) {
      // Browser mode: load simulated candle history immediately
      await this.loadHistory();
      return;
    }

    this.chart.showLoading(`Loading ${this.activeSymbol} ${this.activeTimeframe}…`);

    // 1. Request dataset (checks local coverage / triggers download if missing)
    const response = await this.bridge.callJson<RequestResponse>('requestDataset', {
      symbol: this.activeSymbol,
      timeframe: this.activeTimeframe,
    });

    if (!response.ok) {
      this.chart.hideLoading();
      this.dataStatus.onEvent('download.failed', { error: response.error });
      return;
    }

    // 2. Fetch local candle history and populate interactive Lightweight Chart
    await this.loadHistory();
    await this.loadDrawings();

    if (response.data?.status === 'ready' && response.data.dataset) {
      this.dataStatus.showInfo(response.data.dataset);
    }
  }

  private getSymbolBasePrice(symbol: string): number {
    const sym = (symbol || '').toUpperCase();
    if (sym.includes('BTC')) return 64500.0;
    if (sym.includes('ETH')) return 3450.0;
    if (sym.includes('XAU') || sym.includes('GOLD')) return 2385.5;
    if (sym.includes('GBP')) return 1.2845;
    if (sym.includes('JPY')) return 155.4;
    if (sym.includes('SPY')) return 545.2;
    return 1.085;
  }

  private async loadHistory(): Promise<void> {
    if (!this.activeSymbol) return;

    if (!this.bridge) {
      // Generate sample candles scaled for the active symbol
      const base = this.getSymbolBasePrice(this.activeSymbol);
      const rows = this.generateSampleCandles(300, base);
      this.chart.loadHistory(rows, this.activeSymbol);
      if (rows.length > 0) {
        const lastRow = rows[rows.length - 1];
        this.updatePricesAcrossUI(lastRow[4]);
      }
      this.chart.setPositions(this.inMemoryPositions);
      this.orderPanel?.setPositions(this.inMemoryPositions);
      this.replayController.setBrowserCandles(rows, 100);
      return;
    }

    try {
      const response = await this.bridge.callJson<LoadHistoryResponse>('loadHistory', {
        symbol: this.activeSymbol,
        timeframe: this.activeTimeframe,
      });

      if (response.ok && response.data?.rows) {
        this.chart.loadHistory(response.data.rows, this.activeSymbol);
        if (response.data.rows.length > 0) {
          const lastRow = response.data.rows[response.data.rows.length - 1];
          this.updatePricesAcrossUI(lastRow[4]);
        }
        // Automatically initialize replay session over the loaded history
        await this.replayController.createReplay(this.activeSymbol, this.activeTimeframe);
        await this.indicatorManager.recalculateAll();
        void this.refreshPositions();
      } else {
        this.chart.loadHistory([], this.activeSymbol);
      }
    } catch (err) {
      this.chart.showLoading(`Failed to load history: ${String(err)}`);
    }
  }

  private generateSampleCandles(count = 300, basePrice = 1.0850): CompactCandleRow[] {
    const rows: CompactCandleRow[] = [];
    let price = basePrice;
    const now = Math.floor(Date.now() / 1000);
    const step = 3600; // 1H
    const start = now - count * step;
    const volatility =
      basePrice > 1000 ? 50.0 : basePrice > 100 ? 1.5 : basePrice > 10 ? 0.05 : 0.0015;
    const decimals = basePrice > 1000 ? 2 : basePrice > 100 ? 3 : basePrice > 10 ? 2 : 5;

    for (let i = 0; i < count; i++) {
      const t = start + i * step;
      const change = (Math.random() - 0.49) * volatility;
      const open = price;
      const close = +(open + change).toFixed(decimals);
      const high = +(Math.max(open, close) + Math.random() * (volatility * 0.6)).toFixed(decimals);
      const low = +(Math.min(open, close) - Math.random() * (volatility * 0.6)).toFixed(decimals);
      const volume = Math.floor(500 + Math.random() * 2000);
      rows.push([t, open, high, low, close, volume]);
      price = close;
    }
    return rows;
  }

  private async loadDrawings(): Promise<void> {
    if (!this.activeSymbol || !this.bridge) return;
    try {
      const res = await this.bridge.callJson<{ ok: boolean; data?: { drawings: DrawingDefinition[] } }>(
        'loadDrawings',
        { symbol: this.activeSymbol, timeframe: this.activeTimeframe },
      );
      if (res.ok && res.data?.drawings) {
        const engine = this.chart.getDrawingEngine();
        if (engine) {
          engine.setDrawings(res.data.drawings);
        }
      }
    } catch {
      // Ignore drawing load failures
    }
  }

  private async saveDrawing(drawing: DrawingDefinition): Promise<void> {
    if (!this.bridge) return;
    try {
      await this.bridge.callJson('saveDrawing', drawing);
    } catch {
      // Ignore save failures
    }
  }

  private async deleteDrawing(id: string): Promise<void> {
    if (!this.bridge) return;
    try {
      await this.bridge.callJson('deleteDrawing', id);
    } catch {
      // Ignore delete failures
    }
  }

  private async startRandomReplay(): Promise<void> {
    if (!this.activeSymbol || !this.bridge) return;
    await this.replayController.createRandomReplay(this.activeSymbol, this.activeTimeframe);
    await this.indicatorManager.recalculateAll();
  }

  private wireKeyboardShortcuts(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      // Ignore shortcut keys when focus is in an input or select
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        void this.replayController.togglePlayPause();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        const step = e.ctrlKey ? 24 : e.shiftKey ? 10 : 1;
        void this.replayController.stepForward(step);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        const step = e.ctrlKey ? 24 : e.shiftKey ? 10 : 1;
        void this.replayController.stepBackward(step);
      } else if (e.code === 'Home') {
        e.preventDefault();
        void this.replayController.reset();
      } else if (e.code === 'End') {
        e.preventDefault();
        const state = this.replayController.state;
        if (state) {
          void this.replayController.jumpTo(state.end_index);
        }
      } else if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        void this.startRandomReplay();
      } else if (e.code === 'KeyS' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void this.quickSaveSession();
      } else if (e.code === 'KeyT' && !e.ctrlKey && !e.metaKey) {
        // Toggle Trade Panel
        e.preventDefault();
        this.orderPanel?.toggle();
      } else if (e.code === 'KeyW' && !e.ctrlKey && !e.metaKey) {
        // Toggle Watchlist
        e.preventDefault();
        this.watchlist?.toggleCollapse();
      }
    });
  }

  private subscribeBridgeEvents(): void {
    if (!this.bridge) return;

    // Reload history automatically when background download completes
    this.bridge.onEvent('dataset.ready', (payload: unknown) => {
      const data = payload as { symbol?: string; timeframe?: string };
      if (
        data &&
        data.symbol &&
        data.symbol.toUpperCase() === this.activeSymbol.toUpperCase()
      ) {
        void this.loadHistory();
      }
    });

    this.bridge.onEvent('dataset.updated', (payload: unknown) => {
      const data = payload as { symbol?: string; timeframe?: string };
      if (
        data &&
        data.symbol &&
        data.symbol.toUpperCase() === this.activeSymbol.toUpperCase()
      ) {
        void this.loadHistory();
      }
    });

    // Real-time trading position and PnL updates
    this.bridge.onEvent('trading.positions', (payload: unknown) => {
      if (Array.isArray(payload)) {
        this.chart.setPositions(payload as PositionDefinition[]);
        this.orderPanel?.setPositions(payload as PositionDefinition[]);
      }
    });

    this.bridge.onEvent('trading.account', () => {
      void this.tradingDrawer?.refresh();
    });

    this.bridge.onEvent('replay.candle', (payload: unknown) => {
      const data = payload as { candle?: [number, number, number, number, number, number] };
      if (data?.candle && typeof data.candle[4] === 'number') {
        const close = data.candle[4];
        this.updatePricesAcrossUI(close);
      }
    });

    this.bridge.onEvent('trading.position_closed', (payload: unknown) => {
      const trade = payload as { symbol?: string; pnl?: number; exit_reason?: string };
      if (trade && typeof trade.pnl === 'number') {
        const pnlSign = trade.pnl >= 0 ? '+' : '';
        const reason = trade.exit_reason || 'MANUAL';
        this.showToast(`🎯 Position Closed (${reason}): ${pnlSign}$${trade.pnl.toFixed(2)}`, 3500);
      }
      void this.refreshPositions();
    });

    this.bridge.onEvent('trading.order_filled', (payload: unknown) => {
      const ord = payload as { symbol?: string; side?: string; quantity?: number; order_type?: string };
      if (ord) {
        this.showToast(`⚡ Order Filled: ${ord.side} ${ord.quantity} ${ord.symbol} (${ord.order_type})`);
      }
      void this.refreshPositions();
    });
  }

  async refreshPositions(): Promise<void> {
    if (this.tradingDrawer) {
      await this.tradingDrawer.refresh();
    }
    if (this.bridge) {
      try {
        const res = await this.bridge.callJson<{ ok: boolean; data?: PositionDefinition[] }>('getOpenPositions', {});
        if (res.ok && Array.isArray(res.data)) {
          this.chart.setPositions(res.data);
          this.orderPanel?.setPositions(res.data);
        }
      } catch {
        /* ignore */
      }
    }
  }

  private async handleClosePosition(posId: string, currentPrice: number): Promise<void> {
    if (!this.bridge) {
      this.handleBrowserClosePosition(posId, currentPrice);
      return;
    }
    try {
      const res = await this.bridge.callJson<{ ok: boolean; data?: { pnl?: number; symbol?: string } }>('closePosition', {
        position_id: posId,
        current_price: currentPrice,
      });
      if (res.ok) {
        const pnl = res.data?.pnl ?? 0;
        const sign = pnl >= 0 ? '+' : '';
        this.showToast(`🔒 Position Closed · PnL: ${sign}$${pnl.toFixed(2)}`);
      }
    } catch {
      /* ignore */
    }
    await this.refreshPositions();
  }

  // ─── Session helpers ────────────────────────────────────────────────────

  private getSessionContext() {
    return {
      symbol: this.activeSymbol,
      timeframe: this.activeTimeframe,
      replayController: this.replayController,
      indicatorManager: this.indicatorManager,
      drawingEngine: this.chart.getDrawingEngine() ?? null,
    };
  }

  private async quickSaveSession(): Promise<void> {
    if (!this.activeSymbol) return;
    const ctx = this.getSessionContext();
    const name = `${this.activeSymbol} ${this.activeTimeframe} — ${new Date().toLocaleString()}`;
    const id = await this.sessionMgr.saveSession(ctx, name);
    if (id) {
      this.showToast(`💾 Session saved: ${name}`);
    }
  }

  private async applySession(session: SessionDefinition): Promise<void> {
    // Navigate to session's symbol/timeframe first
    if (session.symbol && session.timeframe) {
      this.activeSymbol = session.symbol;
      this.activeTimeframe = session.timeframe;
      const tfSelect = document.querySelector<HTMLSelectElement>('#timeframe-select');
      if (tfSelect && session.timeframe) tfSelect.value = session.timeframe;
      await this.requestDataAndLoadHistory();
    }

    const ctx = this.getSessionContext();
    await this.sessionMgr.applySession(
      session,
      ctx,
      (msg) => this.showToast(`⚠️ ${msg}`, 5000),
    );

    // Start autosave now that a session is active
    this.sessionMgr.startAutosave(ctx);
  }

  private async checkAutosave(): Promise<void> {
    const autosave = await this.sessionMgr.loadAutosave();
    if (autosave && this.sessionDialog) {
      this.sessionDialog.showAutosaveBanner(autosave, () => {
        void this.applySession(autosave);
      });
    }
  }

  private showToast(msg: string, durationMs = 2500): void {
    const toast = document.createElement('div');
    toast.className = 'app-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, durationMs);
  }
}