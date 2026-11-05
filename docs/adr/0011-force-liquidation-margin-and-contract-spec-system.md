# ADR 0011: Institutional Margin Accounting, Contract Specifications, and Force Liquidation (Stop-Out) System

## Status

Accepted

## Context

During paper trading and market replay, users observed extreme, erratic swings in account balance and equity:

1. **Contract Multiplier & Asset Classification Anomalies**:
   - In `app/trading/models.py` (`get_symbol_contract_details`), any symbol with 6 alphabetical characters was treated as a standard 100,000x Forex lot (`if len(sym) == 6 and sym.isalpha(): return 100_000.0, 0.0001`). As a result, popular crypto pairs like `SOLUSD`, `XRPUSD`, `ADAUSD`, `DOGEUS`, `DOTUSD`, `LTCUSD`, `BCHUSD`, `NEARUS`, `LINKUS`, and `AVAXUS` had their PnL multiplied by 100,000. A $2 price move on 1 SOL resulted in a $200,000 balance shift instead of $2.
   - In `frontend/src/trading/risk-calculator.ts`, fallback contract sizing assigned `contractSize: 100_000.0` to any instrument with price $\le \$1000$, treating individual equities (e.g. `AAPL`, `TSLA`, `NVDA`, `MSFT`, `AMD`, `INTC`) and mid-priced cryptos as 100,000-unit Forex contracts.
   - In `frontend/src/app.ts` (`handleBrowserClosePosition`), browser mode hardcoded `const mult = pos.entry_price < 50 ? 100000 : 1;`, erroneously magnifying commodity and stock trades under $50 (e.g., Silver at $32, Crude Oil at $45, Ford at $10) by 100,000.
2. **Absence of Margin Accounting**:
   - Margin used was hardcoded to `0.00` across `AccountSummary`.
   - Free margin was calculated as `equity - 0.00`, allowing unlimited position sizing without collateral limits.
   - Position opening bypassed margin sufficiency checks, allowing users to over-leverage with no feedback.
3. **Absence of Force Liquidation / Stop-Out Protocol**:
   - When trades moved deeply against the trader, equity dropped into negative territory (e.g., -$200,000), transferring catastrophic debt to the balance without margin calls or stop-outs.
   - No negative balance protection existed to restore catastrophic accounts to zero.

## Decision

We establish an institutional-grade **Multi-Asset Contract Specification Matrix**, **Real-Time Margin Accounting Engine**, and **Automated Force Liquidation (Stop-Out) Protocol** with **Negative Balance Protection**.

### 1. Unified Contract Specification Matrix

Every symbol is classified into its exact asset class with standardized contract sizes and tick/pip resolutions across both Backend (Python) and Frontend (TypeScript):

| Asset Class               | Symbols / Patterns                                                                                                                                                               | Contract Size                    | Pip / Tick Size                                                              | Default Leverage |
| :------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------- | :--------------------------------------------------------------------------- | :--------------- |
| **Forex Majors & Minors** | ISO 4217 currency pairs (`EUR`, `USD`, `GBP`, `AUD`, `NZD`, `CAD`, `CHF`, `SGD`, `HKD`, `TRY`, `MXN`, `SEK`, `NOK`, `PLN`, `CNH`) without crypto bases                           | 100,000 units                    | `0.01` (JPY pairs)<br>`0.0001` (Others)                                      | 100:1            |
| **Crypto Assets**         | `BTC`, `ETH`, `SOL`, `XRP`, `DOGE`, `ADA`, `BNB`, `AVAX`, `DOT`, `LINK`, `MATIC`, `NEAR`, `LTC`, `BCH`, `UNI`, `ATOM`, `SHIB`, `PEPE`, or pairs ending in `USDT`, `USDC`, `-USD` | 1.0 coin                         | Price $\ge 1000 \to 1.0$<br>Price $\ge 1 \to 0.01$<br>Price $< 1 \to 0.0001$ | 20:1             |
| **Precious Metals**       | `XAU`, `GOLD` (100 troy oz)<br>`XAG`, `SILVER` (5,000 troy oz)                                                                                                                   | `100` (Gold)<br>`5,000` (Silver) | `0.01` (Gold)<br>`0.001` (Silver)                                            | 50:1             |
| **Energy & Commodities**  | `OIL`, `WTI`, `BRENT`, `USOIL`, `UKOIL`                                                                                                                                          | 1,000 barrels                    | `0.01`                                                                       | 50:1             |
| **Stock Indices**         | `SPX`, `US500`, `NAS100`, `NDX`, `US30`, `DJI`, `GER40`, `DAX`, `UK100`, `JP225`                                                                                                 | 1.0 index unit                   | `0.1` or `1.0`                                                               | 20:1             |
| **Equities / Stocks**     | All single-stock tickers (`AAPL`, `TSLA`, `NVDA`, `MSFT`, `AMZN`, `GOOGL`, etc.)                                                                                                 | 1.0 share                        | `0.01`                                                                       | 5:1              |

### 2. Margin Accounting Formulas

For each open position $i$:
$$\text{Notional Value}_i = \text{Quantity}_i \times \text{Contract Size}_i \times \text{Entry Price}_i$$
$$\text{Required Margin}_i = \frac{\text{Notional Value}_i}{\text{Leverage}_i}$$

Account Totals:
$$\text{Margin Used} = \sum_{i \in \text{Open Positions}} \text{Required Margin}_i$$
$$\text{Equity} = \text{Balance} + \text{Unrealized PnL}$$
$$\text{Free Margin} = \text{Equity} - \text{Margin Used}$$
$$\text{Margin Level \%} = \begin{cases} \left( \frac{\text{Equity}}{\text{Margin Used}} \right) \times 100\% & \text{if } \text{Margin Used} > 0 \\ \infty & \text{if } \text{Margin Used} = 0 \end{cases}$$

### 3. Pre-Trade Margin Validation

Before any new order is executed:

- If $\text{Required Margin} > \text{Free Margin}$, the order is rejected with status `"REJECTED"` and error reason `"INSUFFICIENT_MARGIN"`.

### 4. Automated Force Liquidation (Stop-Out) Protocol

Evaluated on every replay tick and live market price update:

1. **Margin Call Warning**: When $\text{Margin Level \%} \le 100\%$, emit `"trading.margin_call"` warning event and highlight telemetry cards in amber.
2. **Stop-Out Execution**: When $\text{Margin Level \%} \le 30\%$ OR $\text{Equity} \le 0.00$:
   - Fetch all open positions for the target account (demo or user).
   - Sort positions in ascending order of unrealized PnL (largest floating loss closed first).
   - Sequentially force close positions at current tick's adverse market price (`low_p` for LONG, `high_p` for SHORT) with reason `"FORCE_LIQUIDATION"`.
   - After each position closure, recalculate $\text{Equity}$, $\text{Margin Used}$, and $\text{Margin Level \%}$. If $\text{Margin Level \%} > 30\%$, stop liquidation.
   - If all positions are closed and $\text{Balance} < 0.00$, invoke **Negative Balance Protection**:
     $$\text{Balance} = \max(0.00, \text{Balance})$$
   - Cancel all pending orders with reason `"LIQUIDATION_CANCEL"`.
   - Emit `"trading.liquidation"` event with trade details and updated account summary.

## Consequences

- **Positive**:
  - Eliminates false $100,000 profit/loss spikes on Crypto, Stocks, and Commodities.
  - Accurate, institutional-grade margin utilization and leverage accounting.
  - Guaranteed account solvency via automated 30% stop-out threshold.
  - Zero-balance floor via Negative Balance Protection prevents negative account balances.
  - Full synchronization between Desktop (PySide6), Cloud (FastAPI), and Offline Browser mode.
