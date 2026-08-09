import { describe, expect, it } from 'vitest';
import { PythonBridge } from '../../frontend/src/bridge/python-bridge';

describe('PythonBridge outside the Qt shell', () => {
  it('reports not connected when the Qt transport is missing', async () => {
    const bridge = new PythonBridge();
    expect(await bridge.connect()).toBe(false);
    expect(bridge.connected).toBe(false);
  });

  it('rejects calls when not connected', async () => {
    const bridge = new PythonBridge();
    await expect(bridge.call('systemPing', 'hello')).rejects.toThrow(/not connected/);
  });

  it('returns a failure info() payload', async () => {
    const bridge = new PythonBridge();
    const info = await bridge.info();
    expect(info.connected).toBe(false);
    expect(info.reason).toBeTruthy();
  });
});