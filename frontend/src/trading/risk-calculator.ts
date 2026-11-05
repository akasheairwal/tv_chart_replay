/**
 * Exness-style Risk Calculator core engine.
 * Computes lot size, pip values, risk/reward amounts, target SL/TP prices, and required margin (ADR 0011).
 */

import type { RiskCalculationParams, RiskCalculationResult } from './trading-types';

const FOREX_CURRENCIES = new Set([
  'EUR', 'USD', 'GBP', 'AUD', 'NZD', 'CAD', 'CHF', 'JPY',
  'SGD', 'HKD', 'TRY', 'MXN', 'SEK', 'NOK', 'PLN', 'CNH', 'ZAR',
]);

const CRYPTO_TOKENS = new Set([
  'BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'BNB', 'AVAX',
  'DOT', 'LINK', 'MATIC', 'NEAR', 'LTC', 'BCH', 'UNI', 'ATOM',
  'SHIB', 'PEPE', 'ALGO', 'FTM', 'FIL', 'TRX',
]);

const INDEX_TOKENS = new Set([
  'SPX', 'US500', 'NAS100', 'NDX', 'US30', 'DJI', 'DJ30',
  'GER40', 'DAX', 'UK100', 'JP225', 'NIKKEI',
]);

export function getSymbolContractDetails(symbol: string, price: number): { contractSize: number; pipSize: number } {
  const sym = (symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  // 1. Precious Metals & Commodities
  if (sym.includes('XAU') || sym.includes('GOLD')) {
    return { contractSize: 100.0, pipSize: 0.01 };
  }

  if (sym.includes('XAG') || sym.includes('SILVER')) {
    return { contractSize: 5000.0, pipSize: 0.001 };
  }

  if (sym.includes('OIL') || sym.includes('WTI') || sym.includes('BRENT') || sym.includes('USOIL') || sym.includes('UKOIL')) {
    return { contractSize: 1000.0, pipSize: 0.01 };
  }

  // 2. Stock Indices
  for (const idx of INDEX_TOKENS) {
    if (sym.includes(idx)) {
      return { contractSize: 1.0, pipSize: 0.1 };
    }
  }

  // 3. Cryptocurrencies
  let isCrypto = false;
  for (const tok of CRYPTO_TOKENS) {
    if (sym.includes(tok)) {
      isCrypto = true;
      break;
    }
  }
  if (isCrypto || sym.endsWith('USDT') || sym.endsWith('USDC') || price > 10000) {
    let pip = 0.0001;
    if (price >= 1000) pip = 1.0;
    else if (price >= 1) pip = 0.01;
    return { contractSize: 1.0, pipSize: pip };
  }

  // 4. Forex Currency Pairs (Strict ISO 4217 Pair Validation)
  if (sym.length === 6) {
    const base = sym.substring(0, 3);
    const quote = sym.substring(3, 6);
    if (FOREX_CURRENCIES.has(base) && FOREX_CURRENCIES.has(quote)) {
      if (sym.includes('JPY')) {
        return { contractSize: 100_000.0, pipSize: 0.01 };
      }
      return { contractSize: 100_000.0, pipSize: 0.0001 };
    }
  }

  // 5. Equities / Stocks / Fallback (e.g. AAPL, TSLA, NVDA)
  if (price > 1000) {
    return { contractSize: 1.0, pipSize: 1.0 };
  }

  return { contractSize: 1.0, pipSize: price >= 1 ? 0.01 : 0.0001 };
}

export function computePipValuePerLot(symbol: string, price: number): number {
  const { contractSize, pipSize } = getSymbolContractDetails(symbol, price);
  return contractSize * pipSize;
}

export function calculateRiskMetrics(params: RiskCalculationParams): RiskCalculationResult {
  const {
    symbol,
    side,
    entryPrice,
    accountEquity,
    riskUnit,
    riskValue,
    slMode,
    slValue,
    tpMode,
    tpValue,
    leverage,
  } = params;

  if (!entryPrice || entryPrice <= 0) {
    return {
      calculatedLots: 0.01,
      contractSize: 100000,
      pipSize: 0.0001,
      pipValue: 10,
      slPrice: null,
      slPips: 0,
      tpPrice: null,
      tpPips: 0,
      riskAmount: 0,
      riskPercent: 0,
      rewardAmount: 0,
      rewardPercent: 0,
      rrRatio: 0,
      requiredMargin: 0,
      marginWarning: false,
      isValid: false,
      errorMessage: 'Invalid entry price',
    };
  }

  const { contractSize, pipSize } = getSymbolContractDetails(symbol, entryPrice);
  const pipValuePerLot = contractSize * pipSize;
  const safeEquity = accountEquity > 0 ? accountEquity : 10000.0;

  // 1. Calculate Target Risk Amount ($)
  let riskAmount = 0;
  if (riskUnit === 'PERCENT') {
    riskAmount = (Math.max(0.01, riskValue) / 100) * safeEquity;
  } else {
    riskAmount = Math.max(0.1, riskValue);
  }
  const riskPercent = (riskAmount / safeEquity) * 100;

  // 2. Compute Stop Loss Pips and Price
  let slPrice: number | null = null;
  let slPips = 0;

  if (slMode === 'PRICE') {
    if (slValue > 0) {
      slPrice = slValue;
      const diff = side === 'BUY' ? entryPrice - slPrice : slPrice - entryPrice;
      slPips = Math.max(0, diff / pipSize);
    }
  } else if (slMode === 'PIPS') {
    if (slValue > 0) {
      slPips = slValue;
      slPrice = side === 'BUY' ? entryPrice - slPips * pipSize : entryPrice + slPips * pipSize;
    }
  } else if (slMode === 'CURRENCY' || slMode === 'PERCENT') {
    const targetRisk = slMode === 'PERCENT' ? (Math.max(0.01, slValue) / 100) * safeEquity : Math.max(0.1, slValue);
    riskAmount = targetRisk;
    // Derive slPips and slPrice based on standard unit lot size
    const defaultLots = 1.0;
    if (pipValuePerLot > 0) {
      slPips = Math.max(1, riskAmount / (defaultLots * pipValuePerLot));
      slPrice = side === 'BUY' ? entryPrice - slPips * pipSize : entryPrice + slPips * pipSize;
    }
  }

  // 3. Compute Lot Size
  let calculatedLots = 0.01;
  if (slPips > 0 && pipValuePerLot > 0) {
    const rawLots = riskAmount / (slPips * pipValuePerLot);
    calculatedLots = Math.max(0.01, Math.round(rawLots * 100) / 100);
  }

  const effectivePipValue = calculatedLots * pipValuePerLot;

  // 4. Compute Take Profit Pips and Price
  let tpPrice: number | null = null;
  let tpPips = 0;

  if (tpMode === 'PRICE') {
    if (tpValue > 0) {
      tpPrice = tpValue;
      const diff = side === 'BUY' ? tpPrice - entryPrice : entryPrice - tpPrice;
      tpPips = Math.max(0, diff / pipSize);
    }
  } else if (tpMode === 'PIPS') {
    if (tpValue > 0) {
      tpPips = tpValue;
      tpPrice = side === 'BUY' ? entryPrice + tpPips * pipSize : entryPrice - tpPips * pipSize;
    }
  } else if (tpMode === 'RR') {
    const rr = Math.max(0.1, tpValue);
    if (slPips > 0) {
      tpPips = slPips * rr;
      tpPrice = side === 'BUY' ? entryPrice + tpPips * pipSize : entryPrice - tpPips * pipSize;
    }
  } else if (tpMode === 'CURRENCY') {
    if (tpValue > 0 && effectivePipValue > 0) {
      tpPips = tpValue / effectivePipValue;
      tpPrice = side === 'BUY' ? entryPrice + tpPips * pipSize : entryPrice - tpPips * pipSize;
    }
  }

  // 5. Reward metrics & Risk:Reward ratio
  const rewardAmount = tpPips * effectivePipValue;
  const rewardPercent = (rewardAmount / safeEquity) * 100;
  const rrRatio = slPips > 0 ? tpPips / slPips : 0;

  // 6. Required Margin
  const effectiveLeverage = Math.max(1, leverage || 100);
  const NotionalValue = calculatedLots * contractSize * entryPrice;
  const requiredMargin = NotionalValue / effectiveLeverage;
  const marginWarning = requiredMargin > safeEquity;

  // Sanity Validation
  let isValid = true;
  let errorMessage: string | undefined = undefined;

  if (slPrice !== null && slPrice > 0) {
    if (side === 'BUY' && slPrice >= entryPrice) {
      isValid = false;
      errorMessage = 'BUY Stop Loss must be below Entry Price';
    } else if (side === 'SELL' && slPrice <= entryPrice) {
      isValid = false;
      errorMessage = 'SELL Stop Loss must be above Entry Price';
    }
  }

  if (tpPrice !== null && tpPrice > 0 && isValid) {
    if (side === 'BUY' && tpPrice <= entryPrice) {
      isValid = false;
      errorMessage = 'BUY Take Profit must be above Entry Price';
    } else if (side === 'SELL' && tpPrice >= entryPrice) {
      isValid = false;
      errorMessage = 'SELL Take Profit must be below Entry Price';
    }
  }

  return {
    calculatedLots,
    contractSize,
    pipSize,
    pipValue: effectivePipValue,
    slPrice: slPrice ? +slPrice.toFixed(5) : null,
    slPips: +slPips.toFixed(1),
    tpPrice: tpPrice ? +tpPrice.toFixed(5) : null,
    tpPips: +tpPips.toFixed(1),
    riskAmount: +riskAmount.toFixed(2),
    riskPercent: +riskPercent.toFixed(2),
    rewardAmount: +rewardAmount.toFixed(2),
    rewardPercent: +rewardPercent.toFixed(2),
    rrRatio: +rrRatio.toFixed(2),
    requiredMargin: +requiredMargin.toFixed(2),
    marginWarning,
    isValid,
    errorMessage,
  };
}
