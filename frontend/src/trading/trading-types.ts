/**
 * Trade Simulation TypeScript interfaces (Architecture §70–71 / ADR 0011).
 */

export interface OrderDefinition {
  order_id?: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  order_type: 'MARKET' | 'LIMIT' | 'STOP';
  quantity: number;
  lot_size?: number;
  price?: number;
  current_market_price?: number;
  stop_loss?: number;
  take_profit?: number;
  trailing_stop_pips?: number;
  status?: 'PENDING' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  created_at?: number;
  filled_at?: number;
  filled_price?: number;
  leverage?: number;
  required_margin?: number;
}

export interface PositionDefinition {
  position_id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  quantity: number;
  lot_size?: number;
  entry_price: number;
  current_price: number;
  unrealized_pnl: number;
  pips?: number;
  realized_pnl: number;
  stop_loss?: number;
  take_profit?: number;
  trailing_stop_pips?: number;
  opened_at: number;
  closed_at?: number;
  status: 'OPEN' | 'CLOSED';
  leverage?: number;
  required_margin?: number;
}

export interface AccountSummary {
  balance: number;
  equity: number;
  margin_used: number;
  free_margin: number;
  margin_level?: number;
  unrealized_pnl: number;
  realized_pnl: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
}

export interface TradeRecord {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL' | 'LONG' | 'SHORT';
  quantity: number;
  lot_size?: number;
  entry_price: number;
  exit_price: number;
  pnl: number;
  pnl_percent: number;
  commission: number;
  opened_at: number;
  closed_at: number;
  exit_reason: string;
}

export interface TradingState {
  account: AccountSummary;
  positions: PositionDefinition[];
  orders: OrderDefinition[];
  trades: TradeRecord[];
}

export type RiskUnit = 'PERCENT' | 'CURRENCY';
export type SlMode = 'PRICE' | 'PIPS' | 'PERCENT' | 'CURRENCY';
export type TpMode = 'PRICE' | 'PIPS' | 'RR' | 'CURRENCY';
export type SlInputMode = SlMode;
export type TpInputMode = TpMode;

export interface RiskCalculationParams {
  symbol: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  accountEquity: number;
  riskUnit: RiskUnit;
  riskValue: number;
  slMode: SlMode;
  slValue: number;
  tpMode: TpMode;
  tpValue: number;
  leverage: number;
}

export interface RiskCalculationResult {
  calculatedLots: number;
  contractSize: number;
  pipSize: number;
  pipValue: number;
  slPrice: number | null;
  slPips: number;
  tpPrice: number | null;
  tpPips: number;
  riskAmount: number;
  riskPercent: number;
  rewardAmount: number;
  rewardPercent: number;
  rrRatio: number;
  requiredMargin: number;
  marginWarning: boolean;
  isValid: boolean;
  errorMessage?: string;
}
