# Bridge Contract (QWebChannel & Cloud API)

Local Python <-> TypeScript communication via `QWebChannel` on desktop and REST/WebSocket on cloud.

## Transport

- Python registers a single QWebChannel object named `bridge` (`app/bridge/channel.py`).
- The TypeScript client (`frontend/src/bridge/python-bridge.ts`) connects through `window.qt.webChannelTransport` (desktop) or HTTP `/api/*` and WebSocket `/ws` (cloud).
- Only `@Slot`-decorated methods are invokable from JS — this is the explicit-whitelist security boundary (§61, §77). No `eval`, no arbitrary method/object exposure.

## Naming

Exposed slot names use `camelCase` (matches the doc's bridge contract, §62).

## Commands (Python slots)

### System & Catalog (Wave 0-1)
| Command | Args | Returns |
|---|---|---|
| `systemVersion()` | — | `str` |
| `systemPing(message)` | `str` | `str` (`pong:<message>`) |
| `systemLog(message)` | `str` | `void` |
| `searchSymbols(query)` | `str` | `Symbol[]` |
| `requestDataset(request)` | `DatasetRequest` | `DatasetInfo` |
| `loadHistory(request)` | `HistoryRequest` | `Candle[]` (compact arrays) |

### Replay Engine (Wave 3)
| Command | Args | Returns |
|---|---|---|
| `createReplay(request)` | `ReplayRequest` | `ReplayInitData` |
| `createRandomReplay(request)` | `RandomReplayRequest` | `ReplayInitData` |
| `playReplay()` | — | `ReplayState` |
| `pauseReplay()` | — | `ReplayState` |
| `replayNext(step)` | `str` | `{ state, candles }` |
| `replayPrevious(step)` | `str` | `{ state, candles }` |
| `replayJumpTo(target)` | `str` | `{ state, candles }` |
| `replayReset()` | — | `{ state, candles }` |
| `setReplaySpeed(speed)` | `str` | `ReplayState` |

### Technical Indicators & Sessions (Wave 4 & 7)
| Command | Args | Returns |
|---|---|---|
| `getIndicatorCatalog()` | — | `IndicatorMetadata[]` |
| `calculateIndicator(request)` | `IndicatorRequest` | `IndicatorCalculationResult` |
| `saveSession(session)` / `loadSession(id)` | `Session` / `str` | `void` / `Session` |

### Paper Trading & Order Engine (Wave 9 & Multi-User Demo)
| Command | Args | Returns |
|---|---|---|
| `placeOrder(payload)` | `{ symbol, side, order_type, quantity, price?, stop_loss?, take_profit?, is_demo?, user_id? }` | `Order` |
| `cancelOrder(order_id)` | `str` | `{ order_id, cancelled }` |
| `closePosition(payload_or_id, price?, reason?)` | `str` or `{ position_id, current_price, reason, close_quantity? }` | `TradeRecord` |
| `modifyPosition(payload)` | `{ position_id, stop_loss?, take_profit? }` | `Position` |
| `getAccountSummary()` | — | `AccountSummary` |
| `getOpenPositions(payload?)` | `{ is_demo?, user_id? }` (optional) | `Position[]` |
| `getPendingOrders(payload?)` | `{ is_demo?, user_id? }` (optional) | `Order[]` |
| `getTradeJournal(payload?)` | `{ is_demo?, user_id?, limit? }` (optional) | `TradeRecord[]` |
| `resetAccount(payload?)` | `float` or `{ initial_balance?, is_demo?, user_id? }` | `AccountSummary` |

### User Authentication & Profile (Phase 1-3)
| Command | Args | Returns |
|---|---|---|
| `authRegister(payload)` | `{ username, email, password, initial_balance? }` | `{ user, token }` |
| `authLogin(payload)` | `{ login, password }` | `{ user, token }` |
| `authLogout(payload)` | `str` or `{ token }` | `{ logged_out: bool }` |
| `authGetMe(payload)` | `str` or `{ token }` | `{ user }` |
| `authGetUserStats(payload)` | `str` or `{ user_id }` | `UserTradingStats` |
| `authResetAccount(payload)` | `{ token, initial_balance? }` | `{ balance }` |
| `authGetOrCreateLocalUser()` | — | `{ user, token }` |

---

## Events (Python → TypeScript)

Python emits `(event_name, json_payload)` on the `eventEmitted` signal;
the TS client parses and dispatches to registered listeners.

```
download.started        download.progress       download.completed   download.failed
dataset.missing         dataset.ready           dataset.invalid      dataset.updated
replay.created          replay.started          replay.paused        replay.candle
replay.finished         drawing.created         drawing.updated      drawing.deleted
session.saved           session.loaded          system.ready
trading.account         trading.positions       trading.orders       trading.position_closed
trading.order_filled    trading.position_updated
```

## Serialization

- Timestamps: integer **epoch seconds (UTC)** or float timestamps everywhere over the wire.
- Candles: compact `[[time, open, high, low, close, volume], …]` arrays to minimize JSON overhead.
- Dates in payloads: ISO-8601 UTC strings.
- Payloads are always JSON objects; `null`/omission for absent optional data.
