/**
 * Antigravity Trading Platform - Risk/Reward Financial Position Calculation Engine
 * 
 * Implements ADR 0004 Phase 4: Financial Position Calculation Solver.
 * Provides accurate multi-asset lot sizing, contract sizing, margin requirements,
 * dynamic Risk:Reward solvers, range measurement metrics, and forecast evaluation.
 */

import { DrawingPoint, DrawingStyle } from './drawing-types';

export type AssetClass = 'forex' | 'crypto' | 'commodity' | 'index' | 'stock' | 'custom';
export type PositionRiskMode = 'PERCENT' | 'CASH';

export interface SymbolSpec {
  symbol: string;
  assetClass: AssetClass;
  contractSize: number;           // Multiplier (e.g. 100,000 for standard FX lot, 100 for Gold, 1 for crypto/stocks)
  pipSize: number;                // Smallest standard quotation step (e.g. 0.0001 FX, 0.01 JPY/Crypto)
  pipValuePerStandardLot: number; // Quote currency value of 1 pip per 1.0 standard lot
  minLot: number;                 // Minimum tradeable volume (e.g. 0.01)
  lotStep: number;                // Volume increment quantum (e.g. 0.01 or 0.001)
  defaultLeverage: number;        // Default margin leverage (e.g. 100:1, 20:1)
  quoteCurrency: string;          // Quote currency (USD, JPY, EUR, etc.)
}

/**
 * Heuristically inspects symbol string and reference price to determine institutional specifications.
 */
export function detectSymbolSpec(symbol = '', referencePrice = 1.0): SymbolSpec {
  const clean = symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

  // 1. Forex JPY Pairs (USDJPY, EURJPY, GBPJPY, AUDJPY, CADJPY, CHFJPY, NZDJPY)
  if (clean.endsWith('JPY') || clean.includes('JPY')) {
    return {
      symbol: clean || 'USDJPY',
      assetClass: 'forex',
      contractSize: 100000,
      pipSize: 0.01,
      pipValuePerStandardLot: referencePrice > 0 ? (1000 / referencePrice) : 7.0, // Normalized to USD
      minLot: 0.01,
      lotStep: 0.01,
      defaultLeverage: 100,
      quoteCurrency: 'JPY',
    };
  }

  // 2. Gold (XAUUSD, GOLD)
  if (clean.includes('XAU') || clean.includes('GOLD')) {
    return {
      symbol: clean || 'XAUUSD',
      assetClass: 'commodity',
      contractSize: 100, // 100 troy ounces
      pipSize: 0.01,
      pipValuePerStandardLot: 1.0, // 100 * 0.01 = $1 per 0.01 move per lot
      minLot: 0.01,
      lotStep: 0.01,
      defaultLeverage: 50,
      quoteCurrency: 'USD',
    };
  }

  // 3. Silver (XAGUSD, SILVER)
  if (clean.includes('XAG') || clean.includes('SILVER')) {
    return {
      symbol: clean || 'XAGUSD',
      assetClass: 'commodity',
      contractSize: 5000, // 5,000 troy ounces
      pipSize: 0.001,
      pipValuePerStandardLot: 5.0,
      minLot: 0.01,
      lotStep: 0.01,
      defaultLeverage: 50,
      quoteCurrency: 'USD',
    };
  }

  // 4. Crude Oil (USOIL, UKOIL, WTI, BRENT)
  if (clean.includes('OIL') || clean.includes('WTI') || clean.includes('BRENT')) {
    return {
      symbol: clean || 'USOIL',
      assetClass: 'commodity',
      contractSize: 1000, // 1,000 barrels
      pipSize: 0.01,
      pipValuePerStandardLot: 10.0,
      minLot: 0.01,
      lotStep: 0.01,
      defaultLeverage: 50,
      quoteCurrency: 'USD',
    };
  }

  // 5. Crypto (BTC, ETH, SOL, USDT, etc.)
  const isCrypto =
    clean.includes('BTC') ||
    clean.includes('ETH') ||
    clean.includes('SOL') ||
    clean.includes('USDT') ||
    clean.includes('DOGE') ||
    clean.includes('XRP');

  if (isCrypto || (clean.length === 0 && referencePrice > 10000)) {
    const pip = referencePrice >= 1000 ? 1.0 : referencePrice >= 1 ? 0.01 : 0.0001;
    return {
      symbol: clean || 'BTCUSDT',
      assetClass: 'crypto',
      contractSize: 1, // 1 coin per unit
      pipSize: pip,
      pipValuePerStandardLot: pip,
      minLot: 0.001,
      lotStep: 0.001,
      defaultLeverage: 20,
      quoteCurrency: 'USDT',
    };
  }

  // 6. Indices (US500, SPX, NAS100, NDX, US30, DJ30, GER40, DAX)
  if (
    clean.includes('SPX') ||
    clean.includes('US500') ||
    clean.includes('NAS') ||
    clean.includes('NDX') ||
    clean.includes('US30') ||
    clean.includes('GER40') ||
    clean.includes('DAX')
  ) {
    return {
      symbol: clean || 'US500',
      assetClass: 'index',
      contractSize: 1,
      pipSize: 0.1,
      pipValuePerStandardLot: 0.1,
      minLot: 0.1,
      lotStep: 0.1,
      defaultLeverage: 20,
      quoteCurrency: 'USD',
    };
  }

  // 7. Standard Forex Pairs (EURUSD, GBPUSD, AUDUSD, NZDUSD, USDCAD, USDCHF, etc.)
  const fxPairs = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF'];
  const matchesFx = fxPairs.some((curr) => clean.startsWith(curr)) && clean.length === 6;

  if (matchesFx || (referencePrice < 50 && referencePrice > 0.1)) {
    return {
      symbol: clean || 'EURUSD',
      assetClass: 'forex',
      contractSize: 100000,
      pipSize: 0.0001,
      pipValuePerStandardLot: 10.0,
      minLot: 0.01,
      lotStep: 0.01,
      defaultLeverage: 100,
      quoteCurrency: clean.slice(3) || 'USD',
    };
  }

  // 8. Equities / Stocks / Fallback
  const pip = referencePrice > 500 ? 0.1 : 0.01;
  return {
    symbol: clean || 'STOCK',
    assetClass: 'stock',
    contractSize: 1, // 1 share
    pipSize: pip,
    pipValuePerStandardLot: pip,
    minLot: 1.0,
    lotStep: 1.0,
    defaultLeverage: 5,
    quoteCurrency: 'USD',
  };
}

export interface PositionCalculationInput {
  type: 'long_position' | 'short_position';
  entryPrice: number;
  tpPrice?: number;
  slPrice?: number;
  startTimestamp?: number;
  endTimestamp?: number;
  accountSize?: number;
  riskMode?: PositionRiskMode;
  riskPercent?: number;
  riskAmount?: number;
  lotSize?: number;
  contractSize?: number;
  pipSize?: number;
  leverage?: number;
  commissionPerLot?: number; // E.g. $7 per standard round-turn lot
  commissionRatePct?: number; // E.g. 0.05%
  symbol?: string;
}

export interface PositionMetrics {
  isLong: boolean;
  entryPrice: number;
  tpPrice: number;
  slPrice: number;
  tpDistance: number;
  slDistance: number;
  pipSize: number;
  tpPips: number;
  slPips: number;
  tpPct: number;
  slPct: number;
  rrRatio: string;
  accountSize: number;
  riskMode?: PositionRiskMode;
  riskPercent: number;
  riskAmount: number;
  lotSize: number;
  profitDollar: number;
  lossDollar: number;
  endTimestamp: number;
}

export interface DetailedPositionMetrics extends PositionMetrics {
  riskRewardRatio: number;
  quantityUnits: number;
  notionalValue: number;
  leverage: number;
  requiredMargin: number;
  isMarginExceeded: boolean;
  grossLossDollar: number;
  grossProfitDollar: number;
  commissionTotal: number;
  startTimestamp: number;
  durationSeconds: number;
  symbolSpec: SymbolSpec;
}

/**
 * Calculates quantitative risk/reward analytics and institutional sizing for long/short positions.
 */
export function calculateFinancialPosition(
  input: PositionCalculationInput,
  fallbackAccountBalance = 10000,
): DetailedPositionMetrics {
  const isLong = input.type === 'long_position';
  const entryPrice = Math.max(0.00000001, input.entryPrice ?? 1.0);
  const spec = detectSymbolSpec(input.symbol, entryPrice);

  const pipSize = input.pipSize ?? spec.pipSize;
  const contractSize = input.contractSize ?? spec.contractSize;
  const leverage = Math.max(1, input.leverage ?? spec.defaultLeverage);
  const minGap = pipSize * 0.5;

  // Default price levels if missing (Standard default: 2.0 Risk:Reward)
  const defaultDelta = entryPrice > 50 ? 0.4 : 0.004;

  let tpPrice = input.tpPrice;
  if (tpPrice === undefined || tpPrice === null) {
    tpPrice = isLong ? entryPrice + defaultDelta : entryPrice - defaultDelta;
  } else {
    tpPrice = isLong
      ? Math.max(entryPrice + minGap, tpPrice)
      : Math.min(entryPrice - minGap, tpPrice);
  }

  let slPrice = input.slPrice;
  if (slPrice === undefined || slPrice === null) {
    const halfDelta = Math.abs(tpPrice - entryPrice) / 2;
    slPrice = isLong ? entryPrice - halfDelta : entryPrice + halfDelta;
  } else {
    slPrice = isLong
      ? Math.min(entryPrice - minGap, slPrice)
      : Math.max(entryPrice + minGap, slPrice);
  }

  const startTimestamp = input.startTimestamp ?? Math.floor(Date.now() / 1000);
  const endTimestamp =
    input.endTimestamp ?? (startTimestamp + 3600 * 24); // Default 1 day extent
  const durationSeconds = Math.max(0, endTimestamp - startTimestamp);

  const tpDistance = Math.abs(tpPrice - entryPrice);
  const slDistance = Math.abs(entryPrice - slPrice);

  const tpPips = pipSize > 0 ? tpDistance / pipSize : 0;
  const slPips = pipSize > 0 ? slDistance / pipSize : 0;

  const tpPct = entryPrice > 0 ? (tpDistance / entryPrice) * 100 : 0;
  const slPct = entryPrice > 0 ? (slDistance / entryPrice) * 100 : 0;

  const riskRewardVal = slDistance > 0 ? tpDistance / slDistance : 1.0;
  const rrRatio = riskRewardVal.toFixed(2);

  // Risk Capital ($)
  const accountSize = Math.max(1, input.accountSize ?? fallbackAccountBalance);
  const riskMode: PositionRiskMode = input.riskMode ?? 'PERCENT';

  let riskAmount = 100;
  let riskPercent = 1.0;

  if (riskMode === 'CASH' && input.riskAmount && input.riskAmount > 0) {
    riskAmount = input.riskAmount;
    riskPercent = accountSize > 0 ? (riskAmount / accountSize) * 100 : 1.0;
  } else {
    riskPercent = input.riskPercent ?? 1.0;
    riskAmount = accountSize * (riskPercent / 100);
  }

  // Lot / Unit sizing
  // Formula: Units = RiskAmount / (StopDistancePerUnit)
  // StopDistancePerUnit = slDistance * contractSize
  let calculatedLots = 1.0;
  if (input.lotSize && input.lotSize > 0) {
    calculatedLots = input.lotSize;
  } else {
    const stopLossCapitalPerLot = slDistance * contractSize;
    if (stopLossCapitalPerLot > 0) {
      calculatedLots = riskAmount / stopLossCapitalPerLot;
    }
  }

  // Quantize according to symbol lot step and min lot
  const step = spec.lotStep || 0.01;
  const stepDecimals = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
  const clampedLots = Math.max(spec.minLot, Math.round(calculatedLots / step) * step);
  const lotSize = Number(clampedLots.toFixed(stepDecimals));

  const quantityUnits = lotSize * contractSize;
  const notionalValue = Number((quantityUnits * entryPrice).toFixed(2));
  const requiredMargin = Number((notionalValue / leverage).toFixed(2));
  const isMarginExceeded = requiredMargin > accountSize;

  // Monetary P&L calculations
  const grossLossDollar = Number((quantityUnits * slDistance).toFixed(2));
  const grossProfitDollar = Number((quantityUnits * tpDistance).toFixed(2));

  // Commission computation
  let commissionTotal = 0;
  if (input.commissionPerLot && input.commissionPerLot > 0) {
    commissionTotal += input.commissionPerLot * lotSize;
  }
  if (input.commissionRatePct && input.commissionRatePct > 0) {
    commissionTotal += notionalValue * (input.commissionRatePct / 100);
  }
  commissionTotal = Number(commissionTotal.toFixed(2));

  const lossDollar = Number((grossLossDollar + commissionTotal).toFixed(2));
  const profitDollar = Number(Math.max(0, grossProfitDollar - commissionTotal).toFixed(2));

  return {
    isLong,
    entryPrice,
    tpPrice,
    slPrice,
    tpDistance,
    slDistance,
    pipSize,
    tpPips,
    slPips,
    tpPct,
    slPct,
    rrRatio,
    riskRewardRatio: riskRewardVal,
    accountSize,
    riskMode,
    riskPercent,
    riskAmount,
    lotSize,
    quantityUnits,
    notionalValue,
    leverage,
    requiredMargin,
    isMarginExceeded,
    grossLossDollar,
    grossProfitDollar,
    commissionTotal,
    profitDollar,
    lossDollar,
    startTimestamp,
    endTimestamp,
    durationSeconds,
    symbolSpec: spec,
  };
}

/**
 * Adapter mapping DrawingStyle & Points array into calculateFinancialPosition.
 * Maintains 1:1 drop-in compatibility with legacy calculatePositionMetrics.
 */
export function calculatePositionMetricsFromStyle(
  type: 'long_position' | 'short_position',
  points: DrawingPoint[],
  style: DrawingStyle,
  fallbackAccountBalance = 10000,
  symbol?: string,
): DetailedPositionMetrics {
  const p0 = points[0];
  const p1 = points[1];
  const p2 = points[2];
  const p3 = points[3];

  return calculateFinancialPosition(
    {
      type,
      entryPrice: style.entryPrice ?? p0?.price ?? 1.0,
      tpPrice: style.targetPrice ?? p1?.price,
      slPrice: style.stopPrice ?? p2?.price,
      startTimestamp: p0?.timestamp,
      endTimestamp: p3?.timestamp ?? (p1?.timestamp ? p1.timestamp + 3600 * 20 : undefined),
      accountSize: style.accountSize,
      riskMode: style.riskMode,
      riskPercent: style.riskPercent,
      riskAmount: style.riskAmount,
      lotSize: style.lotSize,
      leverage: style.leverage,
      symbol,
    },
    fallbackAccountBalance,
  );
}

/**
 * Solves Take Profit price given desired Risk-to-Reward ratio and Stop Loss distance.
 */
export function solveTargetForRiskReward(
  entryPrice: number,
  stopPrice: number,
  targetRR: number,
  isLong: boolean,
): number {
  const riskDistance = Math.abs(entryPrice - stopPrice);
  const targetDistance = riskDistance * Math.max(0.01, targetRR);
  return isLong ? entryPrice + targetDistance : entryPrice - targetDistance;
}

/**
 * Solves Stop Loss price given desired Risk-to-Reward ratio and Take Profit distance.
 */
export function solveStopForRiskReward(
  entryPrice: number,
  targetPrice: number,
  targetRR: number,
  isLong: boolean,
): number {
  const profitDistance = Math.abs(targetPrice - entryPrice);
  const safeRR = Math.max(0.01, targetRR);
  const stopDistance = profitDistance / safeRR;
  return isLong ? entryPrice - stopDistance : entryPrice + stopDistance;
}

/**
 * Calculates lot size for a specific dollar risk amount and stop loss distance.
 */
export function solveLotSizeForRisk(
  riskAmount: number,
  slDistance: number,
  contractSize = 100000,
  minLot = 0.01,
  lotStep = 0.01,
): number {
  const stopLossUnit = slDistance * contractSize;
  if (stopLossUnit <= 0 || riskAmount <= 0) return minLot;

  const rawLots = riskAmount / stopLossUnit;
  const rounded = Math.round(rawLots / lotStep) * lotStep;
  const stepDecimals = lotStep < 0.01 ? 3 : lotStep < 0.1 ? 2 : lotStep < 1 ? 1 : 0;
  return Math.max(minLot, Number(rounded.toFixed(stepDecimals)));
}

/**
 * Formats time duration into human-readable TradingView format (e.g. "12d 4h", "45m").
 */
export function formatDurationHuman(seconds: number): string {
  const abs = Math.abs(seconds);
  const days = Math.floor(abs / 86400);
  const hours = Math.floor((abs % 86400) / 3600);
  const mins = Math.floor((abs % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export interface RangeMetrics {
  deltaPrice: number;
  absDeltaPrice: number;
  percentChange: number;
  deltaPips: number;
  deltaTimeSeconds: number;
  direction: 'up' | 'down' | 'flat';
  formattedPriceDelta: string;
  formattedPercent: string;
  formattedPips: string;
  formattedDuration: string;
}

/**
 * Computes exact quantitative measurement metrics between two chart coordinates.
 * Used for `date_range`, `price_range`, `date_and_price_range`, and `measurement`.
 */
export function calculateRangeMetrics(
  p1: { timestamp: number; price: number },
  p2: { timestamp: number; price: number },
  symbol?: string,
): RangeMetrics {
  const deltaPrice = p2.price - p1.price;
  const absDeltaPrice = Math.abs(deltaPrice);
  const percentChange = p1.price !== 0 ? (deltaPrice / p1.price) * 100 : 0;

  const spec = detectSymbolSpec(symbol, p1.price);
  const pipSize = spec.pipSize || 0.0001;
  const deltaPips = deltaPrice / pipSize;

  const deltaTimeSeconds = p2.timestamp - p1.timestamp;
  const direction: 'up' | 'down' | 'flat' =
    deltaPrice > 0.0000001 ? 'up' : deltaPrice < -0.0000001 ? 'down' : 'flat';

  const sign = deltaPrice >= 0 ? '+' : '';
  const priceDecimals = pipSize < 0.001 ? 4 : pipSize < 0.1 ? 2 : 1;

  return {
    deltaPrice,
    absDeltaPrice,
    percentChange,
    deltaPips,
    deltaTimeSeconds,
    direction,
    formattedPriceDelta: `${sign}${deltaPrice.toFixed(priceDecimals)}`,
    formattedPercent: `${sign}${percentChange.toFixed(2)}%`,
    formattedPips: `${sign}${deltaPips.toFixed(1)} pips`,
    formattedDuration: formatDurationHuman(deltaTimeSeconds),
  };
}

export type ForecastStatus = 'pending' | 'success' | 'failure';

export interface ForecastCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ForecastEvaluationResult {
  status: ForecastStatus;
  targetPrice: number;
  entryPrice: number;
  expirationTimestamp: number;
  isBullish: boolean;
  barsEvaluated: number;
  resolutionTimestamp?: number;
  resolutionPrice?: number;
  finalPnlPct: number;
}

/**
 * Evaluates the outcome of a Projection / Forecast tool against candle history.
 */
export function evaluateForecastOutcome(
  p1: { timestamp: number; price: number },
  p2: { timestamp: number; price: number },
  candles: ForecastCandle[],
  failureBoundaryPct = 0.05, // E.g. -5% adverse movement = failure
): ForecastEvaluationResult {
  const isBullish = p2.price >= p1.price;
  const entryPrice = p1.price;
  const targetPrice = p2.price;
  const expirationTimestamp = p2.timestamp;

  const failurePrice = isBullish
    ? entryPrice * (1 - failureBoundaryPct)
    : entryPrice * (1 + failureBoundaryPct);

  let barsEvaluated = 0;
  let status: ForecastStatus = 'pending';
  let resolutionTimestamp: number | undefined;
  let resolutionPrice: number | undefined;

  for (const bar of candles) {
    if (bar.timestamp < p1.timestamp) continue;
    barsEvaluated++;

    // 1. Check if Target reached
    if (isBullish) {
      if (bar.high >= targetPrice) {
        status = 'success';
        resolutionTimestamp = bar.timestamp;
        resolutionPrice = targetPrice;
        break;
      }
      if (bar.low <= failurePrice) {
        status = 'failure';
        resolutionTimestamp = bar.timestamp;
        resolutionPrice = failurePrice;
        break;
      }
    } else {
      if (bar.low <= targetPrice) {
        status = 'success';
        resolutionTimestamp = bar.timestamp;
        resolutionPrice = targetPrice;
        break;
      }
      if (bar.high >= failurePrice) {
        status = 'failure';
        resolutionTimestamp = bar.timestamp;
        resolutionPrice = failurePrice;
        break;
      }
    }

    // 2. Check Expiration
    if (bar.timestamp >= expirationTimestamp) {
      status = 'failure';
      resolutionTimestamp = bar.timestamp;
      resolutionPrice = bar.close;
      break;
    }
  }

  const finalPx = resolutionPrice ?? (candles.length > 0 ? candles[candles.length - 1].close : entryPrice);
  const rawPnl = ((finalPx - entryPrice) / entryPrice) * 100;
  const finalPnlPct = isBullish ? rawPnl : -rawPnl;

  return {
    status,
    targetPrice,
    entryPrice,
    expirationTimestamp,
    isBullish,
    barsEvaluated,
    resolutionTimestamp,
    resolutionPrice,
    finalPnlPct,
  };
}
