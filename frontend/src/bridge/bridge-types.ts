/**
 * Shared bridge contract types (see docs/bridge-contract.md).
 *
 * QWebChannel handles the transport; these types describe the command
 * surface and the structured event envelope shared with Python.
 */

/** A structured event emitted by Python (event name + JSON payload). */
export interface BridgeEventMessage {
  event: string;
  payload: unknown;
}

/** Listener signature for Python -> TypeScript events. */
export type EventListener = (payload: unknown) => void;

/** Result of a bridge connect() attempt. */
export interface BridgeConnectionInfo {
  connected: boolean;
  version?: string;
  reason?: string;
}

/** Watchlist item from Python (symbol + display info). */
export interface WatchlistItemBridge {
  symbol: string;
  display_name: string;
  asset_class: string;
  exchange: string;
  timezone: string;
  provider_candidates: string[];
}