import { describe, expect, it } from 'vitest';
import {
  calculateFibExtensionPrice,
  calculateFibRetracementPrice,
  calculateParallelChannel,
  calculatePitchfork,
  distanceToInfiniteLine,
  distanceToPoint,
  distanceToRay,
  distanceToSegment,
  formatDuration,
  formatPriceChange,
  formatVolume,
  getPipSize,
  isPointInEllipse,
  isPointInPolygon,
  isPointInRect,
} from '../../frontend/src/drawings/drawing-math';

describe('Drawing Geometric Math', () => {
  it('calculates point distance accurately', () => {
    expect(distanceToPoint(0, 0, 3, 4)).toBe(5);
  });

  it('calculates line segment distance correctly', () => {
    // Point directly on segment
    expect(distanceToSegment(5, 0, 0, 0, 10, 0)).toBe(0);
    // Point perpendicular to segment
    expect(distanceToSegment(5, 5, 0, 0, 10, 0)).toBe(5);
    // Point past start endpoint
    expect(distanceToSegment(-3, 4, 0, 0, 10, 0)).toBe(5);
    // Point past end endpoint
    expect(distanceToSegment(13, 4, 0, 0, 10, 0)).toBe(5);
  });

  it('calculates ray distance correctly', () => {
    // Point on positive ray
    expect(distanceToRay(20, 0, 0, 0, 10, 0)).toBe(0);
    // Point behind ray start
    expect(distanceToRay(-4, 3, 0, 0, 10, 0)).toBe(5);
  });

  it('calculates infinite line distance correctly', () => {
    expect(distanceToInfiniteLine(5, 5, 0, 0, 10, 0)).toBe(5);
    expect(distanceToInfiniteLine(20, 0, 0, 0, 10, 0)).toBe(0);
  });

  it('tests rectangle containment', () => {
    expect(isPointInRect(50, 50, 0, 0, 100, 100)).toBe(true);
    expect(isPointInRect(150, 150, 0, 0, 100, 100)).toBe(false);
  });

  it('tests ellipse containment', () => {
    // Center point
    expect(isPointInEllipse(50, 50, 0, 0, 100, 100)).toBe(true);
    // Corner outside ellipse
    expect(isPointInEllipse(5, 5, 0, 0, 100, 100)).toBe(false);
  });

  it('tests polygon containment', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    expect(isPointInPolygon(50, 50, square)).toBe(true);
    expect(isPointInPolygon(150, 50, square)).toBe(false);
  });

  it('calculates Fibonacci retracement prices', () => {
    const low = 100;
    const high = 200;
    expect(calculateFibRetracementPrice(low, high, 0.0)).toBe(100);
    expect(calculateFibRetracementPrice(low, high, 0.5)).toBe(150);
    expect(calculateFibRetracementPrice(low, high, 0.618)).toBeCloseTo(161.8, 1);
    expect(calculateFibRetracementPrice(low, high, 1.0)).toBe(200);
  });

  it('calculates Fibonacci extension prices', () => {
    const pA = 100;
    const pB = 150; // swing +50
    const pC = 120; // anchor C
    expect(calculateFibExtensionPrice(pA, pB, pC, 1.0)).toBe(170); // 120 + 50
    expect(calculateFibExtensionPrice(pA, pB, pC, 1.618)).toBeCloseTo(200.9, 1); // 120 + 80.9
  });

  it('calculates Parallel Channel geometry correctly', () => {
    const p1 = { x: 0, y: 100 };
    const p2 = { x: 100, y: 100 };
    const p3 = { x: 50, y: 50 }; // offset -50 in y

    const geo = calculateParallelChannel(p1, p2, p3);
    expect(geo.p1).toEqual({ x: 0, y: 100 });
    expect(geo.p2).toEqual({ x: 100, y: 100 });
    expect(geo.p3.y).toBe(50);
    expect(geo.p4.y).toBe(50);
    expect(geo.medianStart.y).toBe(75);
    expect(geo.medianEnd.y).toBe(75);
  });

  it('calculates Pitchfork and Schiff pitchfork geometry', () => {
    const p1 = { x: 0, y: 100 };
    const p2 = { x: 100, y: 150 };
    const p3 = { x: 100, y: 50 };

    const standard = calculatePitchfork(p1, p2, p3, false);
    expect(standard.midpoint).toEqual({ x: 100, y: 100 });
    expect(standard.origin).toEqual({ x: 0, y: 100 });

    const schiff = calculatePitchfork(p1, p2, p3, 'schiff');
    expect(schiff.origin).toEqual({ x: 50, y: 125 });

    const modSchiff = calculatePitchfork(p1, p2, p3, 'modified_schiff');
    expect(modSchiff.origin).toEqual({ x: 0, y: 125 });
  });

  it('formats price changes and durations accurately', () => {
    const change = formatPriceChange(12.5, 100);
    expect(change.isPositive).toBe(true);
    expect(change.text).toBe('+12.5000');
    expect(change.pctText).toBe('(+12.50%)');

    const negChange = formatPriceChange(-5, 100);
    expect(negChange.isPositive).toBe(false);
    expect(negChange.text).toBe('-5.0000');

    expect(formatDuration(86400 * 2 + 3600 * 4)).toBe('2d 4h');
    expect(formatDuration(3600 * 5 + 60 * 30)).toBe('5h 30m');
    expect(formatDuration(180)).toBe('3m');
  });

  it('calculates pip sizes and formats volume correctly', () => {
    expect(getPipSize(1.0850)).toBe(0.0001); // Forex
    expect(getPipSize(150.25)).toBe(0.01); // JPY / Metals
    expect(getPipSize(65000)).toBe(1.0); // Crypto

    expect(formatVolume(500)).toBe('500');
    expect(formatVolume(2500)).toBe('2.5K');
    expect(formatVolume(1500000)).toBe('1.50M');
    expect(formatVolume(2500000000)).toBe('2.50B');
  });
});
