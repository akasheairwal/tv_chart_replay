/**
 * Single source of truth for per-symbol contract size / pip size.
 *
 * Previously three modules (position overlay drag preview, order panel,
 * browser-mode PnL) each had their own ad-hoc rules that disagreed by up
 * to 100x for gold/silver/JPY. All PnL + pip math must go through here.
 */

export interface SymbolContractDetails {
  /** Price increment of one pip. */
  pipSize: number;
  /** Units per 1.00 lot. */
  contractSize: number;
}

export function getSymbolContractDetails(symbol: string): SymbolContractDetails {
  const sym = (symbol || '').toUpperCase();

  if (sym.includes('XAU') || sym.includes('GOLD')) return { pipSize: 0.01, contractSize: 100 };
  if (sym.includes('XAG') || sym.includes('SILVER')) return { pipSize: 0.001, contractSize: 5000 };
  if (sym.endsWith('JPY')) return { pipSize: 0.01, contractSize: 100000 };

  if (sym.includes('BTC')) return { pipSize: 1.0, contractSize: 1 };
  if (sym.includes('ETH')) return { pipSize: 0.1, contractSize: 1 };

  if (sym.includes('SPX') || sym.includes('SPY') || sym.includes('NDX') ||
      sym.includes('NAS') || sym.includes('DJI') || sym.includes('US30') ||
      sym.includes('GER') || sym.includes('UK100')) {
    return { pipSize: 0.01, contractSize: 1 };
  }

  // Default FX pair
  return { pipSize: 0.0001, contractSize: 100000 };
}

/** Price change x quantity multiplier used for browser-mode PnL. */
export function contractMultiplierForSymbol(symbol: string): number {
  return getSymbolContractDetails(symbol).contractSize;
}
