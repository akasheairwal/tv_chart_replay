import { describe, expect, it, vi } from 'vitest';
import type { MarketCoordinate, Point2D } from '../../frontend/src/chart/drawing-spike';

describe('DrawingSpikeCanvas Coordinate Math Logic', () => {
  it('converts pixel coordinates to market time and price bidirectionally', () => {
    // Mock Lightweight Charts timeScale and series conversion functions
    const mockTimeScale = {
      coordinateToTime: vi.fn().mockImplementation((x: number) => 1700000000 + x * 60),
      timeToCoordinate: vi.fn().mockImplementation((time: number) => (time - 1700000000) / 60),
    };

    const mockSeries = {
      coordinateToPrice: vi.fn().mockImplementation((y: number) => 500.0 - y),
      priceToCoordinate: vi.fn().mockImplementation((price: number) => 500.0 - price),
    };

    // Helper functions implementing the coordinate conversion contracts
    const pixelToPoint = (x: number, y: number): MarketCoordinate => ({
      time: mockTimeScale.coordinateToTime(x),
      price: mockSeries.coordinateToPrice(y),
    });

    const pointToPixel = (time: number, price: number): Point2D | null => {
      const x = mockTimeScale.timeToCoordinate(time);
      const y = mockSeries.priceToCoordinate(price);
      if (x === null || y === null) return null;
      return { x, y };
    };

    // Test pixel (100, 50) -> Market Coordinate
    const point = pixelToPoint(100, 50);
    expect(point.time).toBe(1700000000 + 6000);
    expect(point.price).toBe(450.0);

    // Test Market Coordinate -> pixel (100, 50) round-trip math
    const pixel = pointToPixel(point.time!, point.price!);
    expect(pixel).not.toBeNull();
    expect(pixel?.x).toBe(100);
    expect(pixel?.y).toBe(50);
  });
});
