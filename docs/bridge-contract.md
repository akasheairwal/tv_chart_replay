# Bridge Contract (QWebChannel)

Local Python <-> TypeScript communication. No HTTP server.

## Transport

- Python registers a single QWebChannel object named `bridge`
  (`app/bridge/channel.py`).
- The TypeScript client (`frontend/src/bridge/python-bridge.ts`) connects
  through `window.qt.webChannelTransport` and wraps commands as Promises.
- Only `@Slot`-decorated methods are invokable from JS — this is the
  explicit-whitelist security boundary (§61, §77). No `eval`, no arbitrary
  method/object exposure.

## Naming

Exposed slot names use `camelCase` (matches the doc's bridge contract, §62).

## Commands (Python slots)

| Command | Args | Returns | Wave |
|---|---|---|---|
| `systemVersion()` | — | `str` | 0 |
| `systemPing(message)` | `str` | `str` (`pong:<message>`) | 0 |
| `systemLog(message)` | `str` | `void` | 0 |
| `searchSymbols(query)` | `str` | `Symbol[]` | 1 |
| `requestDataset(request)` | `DatasetRequest` | `DatasetInfo` | 1 |
| `loadHistory(request)` | `HistoryRequest` | `Candle[]` (compact arrays) | 1 |
| `createReplay(request)` | `ReplayRequest` | `ReplayInitData` | 3 |
| `createRandomReplay(request)` | `RandomReplayRequest` | `ReplayInitData` | 3 |
| `playReplay()` | — | `ReplayState` | 3 |
| `pauseReplay()` | — | `ReplayState` | 3 |
| `replayNext(step)` | `str` | `{ state, candles }` | 3 |
| `replayPrevious(step)` | `str` | `{ state, candles }` | 3 |
| `replayJumpTo(target)` | `str` | `{ state, candles }` | 3 |
| `replayReset()` | — | `{ state, candles }` | 3 |
| `setReplaySpeed(speed)` | `str` | `ReplayState` | 3 |
| `getIndicatorCatalog()` | — | `IndicatorMetadata[]` | 4 |
| `calculateIndicator(request)` | `IndicatorRequest` | `IndicatorCalculationResult` | 4 |
| `saveSession(session)` / `loadSession(id)` | `Session` / `str` | `void` / `Session` | 7 |

*(Drawings and session commands land with their waves.)*

## Events (Python → TypeScript)

Python emits `(event_name, json_payload)` on the `eventEmitted` signal;
the TS client parses and dispatches to registered listeners.

```
download.started        download.progress       download.completed   download.failed
dataset.missing         dataset.ready           dataset.invalid      dataset.updated
replay.created          replay.started          replay.paused        replay.candle
replay.finished         drawing.created         drawing.updated      drawing.deleted
session.saved           session.loaded          system.ready
```

## Serialization

- Timestamps: integer **epoch seconds (UTC)** everywhere over the wire.
- Candles: compact `[[time, open, high, low, close, volume], …]` arrays to
  minimize JSON overhead (Chunked initial loads; incremental updates after).
- Dates in payloads: ISO-8601 UTC strings.
- Payloads are always JSON objects; `null`/omission for absent optional data.