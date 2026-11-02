import {
  DEFAULT_FIB_EXTENSION_LEVELS,
  DEFAULT_FIB_RETRACEMENT_LEVELS,
  FIB_TIMEZONE_FACTORS,
  GANN_BOX_LEVELS,
  GANN_FAN_RATIOS,
  calculateParallelChannel,
  calculatePitchfork,
  calculatePositionHandleCoords,
  calculatePositionMetrics,
  calculatePositionMetricsFromStyle,
  drawCatmullRomSpline,
  drawMidpointQuadraticSpline,
  formatCrosshairPrice,
  formatCrosshairTime,
  formatDuration,
  formatPriceChange,
  getRectangle8Handles,
  smoothFreehandPoints,
} from './drawing-math';
import type { DrawingDefinition, DrawingPoint } from './drawing-types';

export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  canvasWidth: number;
  canvasHeight: number;
  chartToPixel: (pt: DrawingPoint) => { x: number; y: number } | null;
  pixelToChart: (x: number, y: number) => DrawingPoint | null;
  getBarStats?: (t1: number, t2: number, p1?: number, p2?: number) => { barCount: number; durationText: string; volumeText?: string } | null;
}

function resolveBarStats(
  t1: number,
  t2: number,
  p1?: number,
  p2?: number,
  getBarStats?: (t1: number, t2: number, p1?: number, p2?: number) => { barCount: number; durationText: string; volumeText?: string } | null,
): { barCount: number; durText: string; volText: string } {
  const deltaT = t2 - t1;
  const stats = getBarStats ? getBarStats(t1, t2, p1, p2) : null;
  const barCount = stats ? stats.barCount : Math.max(1, Math.round(Math.abs(deltaT) / 3600));
  const durText = stats ? stats.durationText : formatDuration(deltaT);
  const volText = stats?.volumeText ? ` · Vol ${stats.volumeText}` : '';
  return { barCount, durText, volText };
}

export function renderDrawingOnCanvas(
  d: DrawingDefinition,
  isSelected: boolean,
  rc: RenderContext,
): void {
  const { ctx, canvasWidth: w, canvasHeight: h, chartToPixel, getBarStats } = rc;

  /** roundRect with feature fallback - bare calls abort the whole redraw
   *  loop on engines without Path2D.roundRect (Safari < 16). */
  const safeRoundRect = (
    x: number,
    y: number,
    rw: number,
    rh: number,
    radii: number,
  ): void => {
    ctx.beginPath();
    if (typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(x, y, rw, rh, radii);
    } else {
      ctx.rect(x, y, rw, rh);
    }
  };


  if (!d.points || d.points.length === 0) return;
  const pixels = d.points.map((p) => chartToPixel(p));
  if (pixels.some((p) => p === null)) return;
  const pts = pixels as { x: number; y: number }[];
  const [p1, p2, p3] = pts;

  ctx.save();
  ctx.strokeStyle = d.style.color || '#2962ff';
  ctx.lineWidth = d.style.width || 2;
  ctx.fillStyle = d.style.fillColor || 'rgba(41, 98, 255, 0.15)';

  if (d.style.lineStyle === 'dashed') {
    ctx.setLineDash([6, 4]);
  } else if (d.style.lineStyle === 'dotted') {
    ctx.setLineDash([2, 2]);
  } else {
    ctx.setLineDash([]);
  }

  switch (d.type) {
    // -- 1. Basic Lines & Shapes -------------------------------------
    case 'trend_line': {
      if (p2) {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
      break;
    }
    case 'info_line': {
      if (p2) {
        // Line segment
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        // Quantitative analytics
        const deltaP = d.points[1].price - d.points[0].price;
        const { text, pctText, pipsText, isPositive } = formatPriceChange(deltaP, d.points[0].price);
        const { barCount, durText } = resolveBarStats(
          d.points[0].timestamp,
          d.points[1].timestamp,
          d.points[0].price,
          d.points[1].price,
          getBarStats,
        );

        // Screen angle in degrees
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const angleDeg = -Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
        const signAngle = angleDeg > 0 ? `+${angleDeg}°` : `${angleDeg}°`;

        // Midpoint HUD Statistics Card
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const cardW = 185;
        const cardH = 38;
        const cx = Math.max(8, Math.min(w - cardW - 8, midX - cardW / 2));
        const cy = Math.max(8, Math.min(h - cardH - 8, midY - cardH - 10));

        ctx.fillStyle = 'rgba(19, 23, 34, 0.94)';
        ctx.strokeStyle = isPositive ? '#089981' : '#f23645';
        ctx.lineWidth = 1;
        safeRoundRect(cx, cy, cardW, cardH, 5);
        ctx.fill();
        ctx.stroke();

        // Line 1: Price Delta, %, Pips
        ctx.fillStyle = isPositive ? '#089981' : '#f23645';
        ctx.font = 'bold 10.5px sans-serif';
        ctx.fillText(`${text} (${pctText}) · ${pipsText}`, cx + 8, cy + 15);

        // Line 2: Bar count, duration, angle, pixel distance
        const lenPx = Math.round(Math.hypot(dx, dy));
        ctx.fillStyle = '#d1d4dc';
        ctx.font = '9.5px sans-serif';
        ctx.fillText(`📊 ${barCount} bars, ${durText} · ∠ ${signAngle} (${lenPx}px)`, cx + 8, cy + 30);
      }
      break;
    }
    case 'trend_angle': {
      if (p2) {
        // Trendline
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        // Horizontal dotted reference baseline from P1
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const lineLen = Math.hypot(dx, dy);
        const arcRadius = Math.min(45, Math.max(22, lineLen * 0.35));

        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = '#787b86';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p1.x + (dx >= 0 ? arcRadius + 18 : -(arcRadius + 18)), p1.y);
        ctx.stroke();

        // Subtended arc
        const endAngle = Math.atan2(dy, dx);
        const startAngle = dx >= 0 ? 0 : Math.PI;
        const counterClockwise = dy < 0;

        ctx.setLineDash([]);
        ctx.strokeStyle = d.style.color || '#2962ff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, arcRadius, startAngle, endAngle, !counterClockwise);
        ctx.stroke();

        // Angle badge
        const angleDeg = Math.round(Math.abs((Math.atan2(-dy, dx) * 180) / Math.PI));
        const badgeX = p1.x + (dx >= 0 ? arcRadius + 6 : -(arcRadius + 30));
        const badgeY = p1.y - 6;

        ctx.fillStyle = 'rgba(19, 23, 34, 0.92)';
        ctx.strokeStyle = d.style.color || '#2962ff';
        ctx.lineWidth = 1;
        safeRoundRect(badgeX - 4, badgeY - 10, 36, 18, 3);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = d.style.color || '#2962ff';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText(`${angleDeg}°`, badgeX, badgeY + 3);
        ctx.restore();
      }
      break;
    }
    case 'ray': {
      if (p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const extent = Math.max(w, h) * 2;
        const unitX = len > 0 ? dx / len : 1;
        const unitY = len > 0 ? dy / len : 0;

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p1.x + unitX * extent, p1.y + unitY * extent);
        ctx.stroke();
      }
      break;
    }
    case 'extended_line': {
      if (p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const extent = Math.max(w, h) * 3;
        const unitX = len > 0 ? dx / len : 1;
        const unitY = len > 0 ? dy / len : 0;

        ctx.beginPath();
        ctx.moveTo(p1.x - unitX * extent, p1.y - unitY * extent);
        ctx.lineTo(p1.x + unitX * extent, p1.y + unitY * extent);
        ctx.stroke();
      }
      break;
    }
    case 'horizontal_line': {
      ctx.beginPath();
      ctx.moveTo(0, p1.y);
      ctx.lineTo(w, p1.y);
      ctx.stroke();

      // Right price badge
      ctx.setLineDash([]);
      ctx.fillStyle = d.style.color || '#2962ff';
      ctx.fillRect(w - 75, p1.y - 10, 75, 20);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(d.points[0].price.toFixed(4), w - 70, p1.y + 4);
      break;
    }
    case 'horizontal_ray': {
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(w, p1.y);
      ctx.stroke();

      // Right price badge
      ctx.setLineDash([]);
      ctx.fillStyle = d.style.color || '#2962ff';
      ctx.fillRect(w - 75, p1.y - 10, 75, 20);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(d.points[0].price.toFixed(4), w - 70, p1.y + 4);
      break;
    }
    case 'vertical_line': {
      ctx.beginPath();
      ctx.moveTo(p1.x, 0);
      ctx.lineTo(p1.x, h);
      ctx.stroke();

      // Bottom date badge
      const dateStr = new Date(d.points[0].timestamp * 1000).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      ctx.setLineDash([]);
      ctx.fillStyle = d.style.color || '#2962ff';
      ctx.fillRect(p1.x - 30, h - 22, 60, 20);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText(dateStr, p1.x - 22, h - 8);
      break;
    }
    case 'cross_line': {
      ctx.beginPath();
      ctx.moveTo(0, p1.y);
      ctx.lineTo(w, p1.y);
      ctx.moveTo(p1.x, 0);
      ctx.lineTo(p1.x, h);
      ctx.stroke();

      // Right price badge
      ctx.setLineDash([]);
      ctx.fillStyle = d.style.color || '#2962ff';
      ctx.fillRect(w - 75, p1.y - 10, 75, 20);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(d.points[0].price.toFixed(4), w - 70, p1.y + 4);

      // Bottom date badge
      const timeStr = formatCrosshairTime(d.points[0].timestamp, '1h');
      ctx.fillRect(p1.x - 45, h - 22, 90, 20);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText(timeStr, p1.x - 38, h - 8);
      break;
    }
    case 'arrow': {
      if (p2) {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        // Arrow head
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const headLen = 14;
        ctx.setLineDash([]);
        ctx.fillStyle = d.style.color || '#2962ff';
        ctx.beginPath();
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(
          p2.x - headLen * Math.cos(angle - Math.PI / 6),
          p2.y - headLen * Math.sin(angle - Math.PI / 6),
        );
        ctx.lineTo(
          p2.x - headLen * Math.cos(angle + Math.PI / 6),
          p2.y - headLen * Math.sin(angle + Math.PI / 6),
        );
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'rectangle': {
      if (p2) {
        const minX = Math.min(p1.x, p2.x);
        const minY = Math.min(p1.y, p2.y);
        const rw = Math.abs(p2.x - p1.x);
        const rh = Math.abs(p2.y - p1.y);
        ctx.fillRect(minX, minY, rw, rh);
        ctx.strokeRect(minX, minY, rw, rh);
      }
      break;
    }
    case 'rotated_rectangle': {
      if (p2) {
        if (p3) {
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const len = Math.hypot(dx, dy);
          if (len > 0) {
            const nx = -dy / len;
            const ny = dx / len;
            const vx = p3.x - p2.x;
            const vy = p3.y - p2.y;
            const perpDist = vx * nx + vy * ny;
            const hx = nx * perpDist;
            const hy = ny * perpDist;

            const p3Calc = { x: p2.x + hx, y: p2.y + hy };
            const p4Calc = { x: p1.x + hx, y: p1.y + hy };

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.lineTo(p3Calc.x, p3Calc.y);
            ctx.lineTo(p4Calc.x, p4Calc.y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }
        } else {
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }
      break;
    }
    case 'ellipse': {
      if (p2) {
        const cx = (p1.x + p2.x) / 2;
        const cy = (p1.y + p2.y) / 2;
        const rx = Math.abs(p2.x - p1.x) / 2;
        const ry = Math.abs(p2.y - p1.y) / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case 'circle': {
      if (p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const r = Math.sqrt(dx * dx + dy * dy);
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case 'triangle': {
      if (p2 && p3) {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case 'polyline':
    case 'path': {
      if (pts.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
        if (d.style.fillColor && d.style.fillColor !== 'transparent') {
          ctx.closePath();
          ctx.fill();
        }
        ctx.stroke();
      }
      break;
    }

    // -- 2. Fibonacci Tools ------------------------------------------
    case 'fib_retracement': {
      if (p2) {
        const minX = Math.min(p1.x, p2.x);
        const maxX = Math.max(p1.x, p2.x, minX + 160);
        const levels = d.style.levels || DEFAULT_FIB_RETRACEMENT_LEVELS;
        const p1Price = d.points[0].price;
        const p2Price = d.points[1].price;

        for (let i = 0; i < levels.length; i++) {
          const ratio = levels[i];
          const levelPrice = p1Price + (p2Price - p1Price) * ratio;
          const levelPixel = chartToPixel({ timestamp: d.points[0].timestamp, price: levelPrice });
          if (!levelPixel) continue;

          ctx.beginPath();
          ctx.moveTo(minX, levelPixel.y);
          ctx.lineTo(maxX, levelPixel.y);
          ctx.stroke();

          ctx.font = '10px sans-serif';
          ctx.fillStyle = d.style.color || '#ff9800';
          ctx.fillText(
            `${(ratio * 100).toFixed(1)}% (${levelPrice.toFixed(4)})`,
            minX + 6,
            levelPixel.y - 3,
          );
        }
      }
      break;
    }

    case 'fib_extension':
    case 'fib_projection': {
      if (p2 && p3) {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.stroke();

        const levels = d.style.levels || DEFAULT_FIB_EXTENSION_LEVELS;
        const p1Price = d.points[0].price;
        const p2Price = d.points[1].price;
        const p3Price = d.points[2].price;
        const rightX = Math.max(p1.x, p2.x, p3.x) + 160;
        const leftX = p3.x;

        for (const ratio of levels) {
          const extPrice = p3Price + (p2Price - p1Price) * ratio;
          const extPixel = chartToPixel({ timestamp: d.points[2].timestamp, price: extPrice });
          if (!extPixel) continue;

          ctx.beginPath();
          ctx.moveTo(leftX, extPixel.y);
          ctx.lineTo(rightX, extPixel.y);
          ctx.stroke();

          ctx.font = '10px sans-serif';
          ctx.fillStyle = d.style.color || '#ff9800';
          ctx.fillText(
            `Ext ${(ratio * 100).toFixed(1)}% (${extPrice.toFixed(4)})`,
            leftX + 6,
            extPixel.y - 3,
          );
        }
      }
      break;
    }

    case 'fib_timezones': {
      if (p2) {
        const baseInterval = d.points[1].timestamp - d.points[0].timestamp;
        const t0 = d.points[0].timestamp;

        for (const f of FIB_TIMEZONE_FACTORS) {
          const t = t0 + f * baseInterval;
          const pt = chartToPixel({ timestamp: t, price: d.points[0].price });
          if (pt && pt.x >= 0 && pt.x <= w) {
            ctx.beginPath();
            ctx.moveTo(pt.x, 0);
            ctx.lineTo(pt.x, h);
            ctx.stroke();

            ctx.fillStyle = d.style.color || '#ff9800';
            ctx.font = '10px sans-serif';
            ctx.fillText(`F${f}`, pt.x + 3, 20);
          }
        }
      }
      break;
    }

    case 'fib_channel':
    case 'parallel_channel':
    case 'equidistant_channel': {
      if (p2 && p3) {
        const geo = calculateParallelChannel(p1, p2, p3);

        ctx.beginPath();
        ctx.moveTo(geo.p1.x, geo.p1.y);
        ctx.lineTo(geo.p2.x, geo.p2.y);
        ctx.lineTo(geo.p4.x, geo.p4.y);
        ctx.lineTo(geo.p3.x, geo.p3.y);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(geo.p1.x, geo.p1.y);
        ctx.lineTo(geo.p2.x, geo.p2.y);
        ctx.moveTo(geo.p3.x, geo.p3.y);
        ctx.lineTo(geo.p4.x, geo.p4.y);
        ctx.stroke();

        // Median dashed line
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(geo.medianStart.x, geo.medianStart.y);
        ctx.lineTo(geo.medianEnd.x, geo.medianEnd.y);
        ctx.stroke();
        ctx.restore();
      }
      break;
    }

    case 'regression_channel': {
      if (p2) {
        const channelHeight = Math.abs(p2.y - p1.y) * 0.4 + 30;

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y - channelHeight);
        ctx.lineTo(p2.x, p2.y - channelHeight);
        ctx.moveTo(p1.x, p1.y + channelHeight);
        ctx.lineTo(p2.x, p2.y + channelHeight);
        ctx.stroke();
        ctx.restore();
      }
      break;
    }

    case 'pitchfork':
    case 'schiff_pitchfork':
    case 'modified_schiff_pitchfork': {
      if (p2 && p3) {
        const variant =
          d.type === 'schiff_pitchfork'
            ? 'schiff'
            : d.type === 'modified_schiff_pitchfork'
              ? 'modified_schiff'
              : 'standard';
        const geo = calculatePitchfork(p1, p2, p3, variant);

        ctx.beginPath();
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.stroke();

        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(geo.origin.x, geo.origin.y);
        ctx.lineTo(geo.medianEnd.x, geo.medianEnd.y);
        ctx.stroke();
        ctx.restore();

        ctx.beginPath();
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(geo.upperEnd.x, geo.upperEnd.y);
        ctx.moveTo(p3.x, p3.y);
        ctx.lineTo(geo.lowerEnd.x, geo.lowerEnd.y);
        ctx.stroke();
      }
      break;
    }

    case 'gann_fan': {
      if (p2) {
        const len = Math.max(w, h);
        const a = d.points[0];
        const b = d.points[1];

        for (const ray of GANN_FAN_RATIOS) {
          let ux = 1;
          let uy = 0;

          // Anchor rays in DATA space (bar/price deltas of the seed
          // segment) so the 1x1 ray stays 45 degrees-in-price at any zoom;
          // pixel-space ratios warped with every pan/zoom.
          let projected = false;
          if (a && b && b.timestamp !== undefined && b.timestamp !== a.timestamp) {
            const endChart: DrawingPoint = {
              timestamp: a.timestamp + (b.timestamp - a.timestamp),
              price: a.price + (b.price - a.price) * ray.ratio,
            };
            const endPix = chartToPixel(endChart);
            if (endPix) {
              const rdx = endPix.x - p1.x;
              const rdy = endPix.y - p1.y;
              const rlen = Math.sqrt(rdx * rdx + rdy * rdy);
              if (rlen > 0.0001) {
                ux = rdx / rlen;
                uy = rdy / rlen;
                projected = true;
              }
            }
          }

          if (!projected) {
            // Fallback to the legacy pixel-space direction.
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const targetY = p1.y + dy * ray.ratio;
            const targetX = p1.x + dx;
            const rdx = targetX - p1.x;
            const rdy = targetY - p1.y;
            const rlen = Math.sqrt(rdx * rdx + rdy * rdy);
            ux = rlen > 0 ? rdx / rlen : 1;
            uy = rlen > 0 ? rdy / rlen : 0;
          }

          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p1.x + ux * len, p1.y + uy * len);
          ctx.stroke();

          ctx.font = '9px sans-serif';
          ctx.fillStyle = d.style.color || '#ff9800';
          ctx.fillText(ray.label, p1.x + ux * 120, p1.y + uy * 120 - 2);
        }
      }
      break;
    }

    case 'gann_box': {
      if (p2) {
        const minX = Math.min(p1.x, p2.x);
        const maxX = Math.max(p1.x, p2.x);
        const minY = Math.min(p1.y, p2.y);
        const maxY = Math.max(p1.y, p2.y);
        const boxW = maxX - minX;
        const boxH = maxY - minY;

        ctx.strokeRect(minX, minY, boxW, boxH);

        for (const l of GANN_BOX_LEVELS) {
          ctx.beginPath();
          ctx.moveTo(minX, minY + boxH * l);
          ctx.lineTo(maxX, minY + boxH * l);
          ctx.moveTo(minX + boxW * l, minY);
          ctx.lineTo(minX + boxW * l, maxY);
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.moveTo(minX, minY);
        ctx.lineTo(maxX, maxY);
        ctx.moveTo(minX, maxY);
        ctx.lineTo(maxX, minY);
        ctx.stroke();
      }
      break;
    }

    // -- 3. Annotations & Labels -------------------------------------
    case 'text': {
      const text = d.style.text || 'Text';
      ctx.fillStyle = d.style.color || '#ffffff';
      ctx.font = `${d.style.fontSize || 13}px sans-serif`;
      ctx.fillText(text, p1.x, p1.y);
      break;
    }

    case 'callout': {
      if (p2) {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        const boxW = 120;
        const boxH = 34;
        const bx = p2.x - boxW / 2;
        const by = p2.y - boxH / 2;

        ctx.fillStyle = 'rgba(26, 26, 33, 0.9)';
        ctx.fillRect(bx, by, boxW, boxH);
        ctx.strokeRect(bx, by, boxW, boxH);

        ctx.fillStyle = '#ffffff';
        ctx.font = '12px sans-serif';
        ctx.fillText(d.style.text || 'Callout Note', bx + 8, by + 21);
      }
      break;
    }

    case 'price_label': {
      const priceText = d.points[0].price.toFixed(4);
      ctx.fillStyle = d.style.color || '#2962ff';
      safeRoundRect(
      p1.x, p1.y - 12, 75, 24, 4);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(priceText, p1.x + 8, p1.y + 4);
      break;
    }

    case 'date_label': {
      const dateText = new Date(d.points[0].timestamp * 1000).toLocaleString();
      ctx.fillStyle = d.style.color || '#2962ff';
      safeRoundRect(
      p1.x - 55, p1.y - 24, 110, 22, 4);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = '10px sans-serif';
      ctx.fillText(dateText, p1.x - 48, p1.y - 9);
      break;
    }

    // -- 4. Complete Measurement & Forecasting (TradingView style) ----
    case 'price_range': {
      if (p2) {
        const deltaP = d.points[1].price - d.points[0].price;
        const { text, pctText, pipsText, isPositive } = formatPriceChange(deltaP, d.points[0].price);
        const minX = Math.min(p1.x, p2.x);
        const maxX = Math.max(p1.x, p2.x);
        const midX = (minX + maxX) / 2;
        const minY = Math.min(p1.y, p2.y);
        const maxY = Math.max(p1.y, p2.y);

        ctx.fillStyle = isPositive ? 'rgba(38, 166, 154, 0.15)' : 'rgba(239, 83, 80, 0.15)';
        ctx.strokeStyle = isPositive ? '#26a69a' : '#ef5350';
        ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
        ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);

        const { barCount, durText, volText } = resolveBarStats(
          d.points[0].timestamp,
          d.points[1].timestamp,
          d.points[0].price,
          d.points[1].price,
          getBarStats,
        );

        // Center card
        const cardW = 180;
        const cardH = 42;
        const cx = midX - cardW / 2;
        const cy = (minY + maxY) / 2 - cardH / 2;
        ctx.fillStyle = 'rgba(19, 23, 34, 0.94)';
        ctx.strokeStyle = isPositive ? '#089981' : '#f23645';
        ctx.lineWidth = 1;
        safeRoundRect(
        cx, cy, cardW, cardH, 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isPositive ? '#089981' : '#f23645';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(`${text} (${pctText}) · ${pipsText}`, cx + 8, cy + 16);

        ctx.fillStyle = '#d1d4dc';
        ctx.font = '10px sans-serif';
        ctx.fillText(`📊 ${barCount} bars · ${durText}${volText}`, cx + 8, cy + 32);
      }
      break;
    }

    case 'date_range': {
      if (p2) {
        const { barCount, durText, volText } = resolveBarStats(
          d.points[0].timestamp,
          d.points[1].timestamp,
          undefined,
          undefined,
          getBarStats,
        );

        const minX = Math.min(p1.x, p2.x);
        const maxX = Math.max(p1.x, p2.x);
        const midX = (minX + maxX) / 2;

        ctx.strokeStyle = d.style.color || '#2962ff';
        ctx.beginPath();
        ctx.moveTo(minX, p1.y - 12);
        ctx.lineTo(minX, p1.y + 12);
        ctx.moveTo(minX, p1.y);
        ctx.lineTo(maxX, p1.y);
        ctx.moveTo(maxX, p1.y - 12);
        ctx.lineTo(maxX, p1.y + 12);
        ctx.stroke();

        // Duration badge
        const cardW = 150;
        const cardH = 24;
        ctx.fillStyle = 'rgba(19, 23, 34, 0.92)';
        ctx.strokeStyle = '#2962ff';
        ctx.lineWidth = 1;
        safeRoundRect(
        midX - cardW / 2, p1.y - 28, cardW, cardH, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#d1d4dc';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText(`${barCount} bars, ${durText}${volText}`, midX - cardW / 2 + 8, p1.y - 12);
      }
      break;
    }

    case 'bars_count': {
      if (p2) {
        const { barCount, durText } = resolveBarStats(
          d.points[0].timestamp,
          d.points[1].timestamp,
          undefined,
          undefined,
          getBarStats,
        );

        const minX = Math.min(p1.x, p2.x);
        const maxX = Math.max(p1.x, p2.x);
        const midX = (minX + maxX) / 2;

        ctx.strokeStyle = '#ff9800';
        ctx.beginPath();
        ctx.moveTo(minX, p1.y - 12);
        ctx.lineTo(minX, p1.y + 12);
        ctx.moveTo(minX, p1.y);
        ctx.lineTo(maxX, p1.y);
        ctx.moveTo(maxX, p1.y - 12);
        ctx.lineTo(maxX, p1.y + 12);
        ctx.stroke();

        const cardW = 130;
        ctx.fillStyle = '#ff9800';
        ctx.fillRect(midX - cardW / 2, p1.y - 24, cardW, 20);
        ctx.fillStyle = '#131722';
        ctx.font = 'bold 10.5px sans-serif';
        ctx.fillText(`🔢 ${barCount} Bars (${durText})`, midX - cardW / 2 + 8, p1.y - 10);
      }
      break;
    }

    case 'date_and_price_range':
    case 'measurement': {
      if (p2) {
        const deltaP = d.points[1].price - d.points[0].price;
        const { text, pctText, pipsText, isPositive } = formatPriceChange(deltaP, d.points[0].price);

        const { barCount, durText, volText } = resolveBarStats(
          d.points[0].timestamp,
          d.points[1].timestamp,
          d.points[0].price,
          d.points[1].price,
          getBarStats,
        );

        const minX = Math.min(p1.x, p2.x);
        const maxX = Math.max(p1.x, p2.x);
        const minY = Math.min(p1.y, p2.y);
        const maxY = Math.max(p1.y, p2.y);

        // Translucent Shaded Box
        ctx.fillStyle = isPositive ? 'rgba(8, 153, 129, 0.18)' : 'rgba(242, 54, 69, 0.18)';
        ctx.strokeStyle = isPositive ? '#089981' : '#f23645';
        ctx.lineWidth = 1.5;
        ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
        ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);

        // Directional ticks on corners
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = isPositive ? 'rgba(8, 153, 129, 0.6)' : 'rgba(242, 54, 69, 0.6)';
        ctx.stroke();

        // TradingView Stats Card in center
        const cardW = 185;
        const cardH = 46;
        const cx = (minX + maxX) / 2 - cardW / 2;
        const cy = (minY + maxY) / 2 - cardH / 2;

        ctx.fillStyle = 'rgba(19, 23, 34, 0.94)';
        ctx.strokeStyle = isPositive ? '#089981' : '#f23645';
        ctx.lineWidth = 1;
        safeRoundRect(cx, cy, cardW, cardH, 5);
        ctx.fill();
        ctx.stroke();

        // Line 1: Price Delta, Percentage, Pips
        ctx.fillStyle = isPositive ? '#089981' : '#f23645';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(`${text} (${pctText}) · ${pipsText}`, cx + 8, cy + 16);

        // Line 2: Bar count, Duration, Volume
        ctx.fillStyle = '#d1d4dc';
        ctx.font = '10.5px sans-serif';
        ctx.fillText(`📊 ${barCount} bars, ${durText}${volText}`, cx + 8, cy + 34);
      }
      break;
    }

    case 'forecast': {
      if (p2) {
        const deltaP = d.points[1].price - d.points[0].price;
        const { text, pctText, isPositive } = formatPriceChange(deltaP, d.points[0].price);
        const { barCount, durText } = resolveBarStats(
          d.points[0].timestamp,
          d.points[1].timestamp,
          d.points[0].price,
          d.points[1].price,
          getBarStats,
        );

        const minX = Math.min(p1.x, p2.x);
        const maxX = Math.max(p1.x, p2.x);
        const minY = Math.min(p1.y, p2.y);
        const maxY = Math.max(p1.y, p2.y);

        // Shaded forecast region
        ctx.fillStyle = isPositive ? 'rgba(8, 153, 129, 0.15)' : 'rgba(242, 54, 69, 0.15)';
        ctx.strokeStyle = isPositive ? '#089981' : '#f23645';
        ctx.lineWidth = 1.5;

        ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
        ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);

        // Projection rays
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p1.y);
        ctx.stroke();
        ctx.restore();

        // Status badge
        const badgeW = 165;
        const badgeH = 40;
        const bx = Math.max(8, Math.min(w - badgeW - 8, maxX - badgeW));
        const by = Math.max(8, Math.min(h - badgeH - 8, p2.y - (isPositive ? 44 : -8)));

        ctx.fillStyle = 'rgba(19, 23, 34, 0.94)';
        ctx.strokeStyle = isPositive ? '#089981' : '#f23645';
        ctx.lineWidth = 1;
        safeRoundRect(bx, by, badgeW, badgeH, 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isPositive ? '#089981' : '#f23645';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(`Target: ${text} (${pctText})`, bx + 8, by + 16);

        ctx.fillStyle = '#d1d4dc';
        ctx.font = '10px sans-serif';
        ctx.fillText(`⏳ ${barCount} bars (${durText})`, bx + 8, by + 32);
      }
      break;
    }

    // -- 5. Dynamic Long & Short Position (Full TradingView Style) -----
    case 'long_position':
    case 'short_position': {
      if (p1) {
        const metrics = calculatePositionMetricsFromStyle(
          d.type,
          d.points,
          d.style,
          undefined,
          d.symbol,
        );
        const {
          isLong,
          entryPrice,
          tpPrice,
          slPrice,
          tpPips,
          slPips,
          tpPct,
          slPct,
          rrRatio,
          lotSize,
          riskAmount,
          profitDollar,
          lossDollar,
          endTimestamp,
          isMarginExceeded,
        } = metrics;

        const tpPixel = chartToPixel({ timestamp: d.points[0].timestamp, price: tpPrice });
        const slPixel = chartToPixel({ timestamp: d.points[0].timestamp, price: slPrice });
        const endPixel = chartToPixel({ timestamp: endTimestamp, price: entryPrice });

        const entryY = p1.y;
        const tpY = tpPixel ? tpPixel.y : (isLong ? p1.y - 60 : p1.y + 60);
        const slY = slPixel ? slPixel.y : (isLong ? p1.y + 30 : p1.y - 30);

        const leftX = p1.x;
        const rightX = Math.max(leftX + 5, endPixel?.x ?? (leftX + 30));
        const width = rightX - leftX;

        const stats = getBarStats ? getBarStats(d.points[0].timestamp, endTimestamp) : null;
        const barCount = stats
          ? stats.barCount
          : Math.max(1, Math.round(Math.abs(endTimestamp - d.points[0].timestamp) / 3600));
        const durText = stats
          ? stats.durationText
          : formatDuration(endTimestamp - d.points[0].timestamp);

        const targetColor = d.style.targetColor || '#089981';
        const stopColor = d.style.stopColor || '#f23645';

        const showStats = isSelected || (d.style.alwaysShowStats ?? false);

        // 1. Target Box (Profit)
        const topProfitY = Math.min(entryY, tpY);
        const profitHeight = Math.max(2, Math.abs(tpY - entryY));
        ctx.fillStyle = 'rgba(8, 153, 129, 0.20)';
        ctx.strokeStyle = targetColor;
        ctx.lineWidth = 1.5;
        ctx.fillRect(leftX, topProfitY, width, profitHeight);
        ctx.strokeRect(leftX, topProfitY, width, profitHeight);

        // Target Tag Header/Footer (only rendered when selected or alwaysShowStats)
        if (showStats) {
          const tagY = isLong ? topProfitY - 20 : Math.max(entryY, tpY);
          ctx.fillStyle = 'rgba(8, 153, 129, 0.95)';
          const targetTagText = `Target: ${formatCrosshairPrice(tpPrice, d.symbol)} (+${tpPips.toFixed(1)} pips, +${tpPct.toFixed(2)}%) · +$${profitDollar.toFixed(2)}`;
          ctx.font = 'bold 10px sans-serif';
          const textLen = ctx.measureText ? ctx.measureText(targetTagText).width : targetTagText.length * 6;
          const targetTagW = Math.max(170, textLen + 14);

          ctx.beginPath();
          if (typeof (ctx as any).roundRect === 'function') {
            (ctx as any).roundRect(leftX, tagY, targetTagW, 20, 3);
          } else {
            ctx.rect(leftX, tagY, targetTagW, 20);
          }
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.fillText(targetTagText, leftX + 6, tagY + 14);
        }

        // 2. Stop Box (Loss)
        const topLossY = Math.min(entryY, slY);
        const lossHeight = Math.max(2, Math.abs(slY - entryY));
        ctx.fillStyle = 'rgba(242, 54, 69, 0.20)';
        ctx.strokeStyle = stopColor;
        ctx.lineWidth = 1.5;
        ctx.fillRect(leftX, topLossY, width, lossHeight);
        ctx.strokeRect(leftX, topLossY, width, lossHeight);

        // Stop Tag Header/Footer (only rendered when selected or alwaysShowStats)
        if (showStats) {
          const stopTagY = isLong ? Math.max(entryY, slY) : topLossY - 20;
          ctx.fillStyle = 'rgba(242, 54, 69, 0.95)';
          const stopTagText = `Stop: ${formatCrosshairPrice(slPrice, d.symbol)} (-${slPips.toFixed(1)} pips, -${slPct.toFixed(2)}%) · -$${lossDollar.toFixed(2)}`;
          const stopTextLen = ctx.measureText ? ctx.measureText(stopTagText).width : stopTagText.length * 6;
          const stopTagW = Math.max(170, stopTextLen + 14);

          ctx.beginPath();
          if (typeof (ctx as any).roundRect === 'function') {
            (ctx as any).roundRect(leftX, stopTagY, stopTagW, 20, 3);
          } else {
            ctx.rect(leftX, stopTagY, stopTagW, 20);
          }
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.fillText(stopTagText, leftX + 6, stopTagY + 14);
        }

        // 3. Entry Center Line
        ctx.strokeStyle = d.style.color || '#2962ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(leftX, entryY);
        ctx.lineTo(rightX, entryY);
        ctx.stroke();

        // 4. Center Summary Card (only rendered when selected)
        if (showStats) {
          const isCompact = d.style.compactStats ?? false;
          const cardW = isCompact ? 140 : 210;
          const cardH = isCompact ? 28 : isMarginExceeded ? 58 : 46;
          const cardX = (leftX + rightX) / 2 - cardW / 2;
          const cardY = entryY - cardH / 2;

          ctx.fillStyle = 'rgba(19, 23, 34, 0.94)';
          ctx.strokeStyle = d.style.color || '#2962ff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          if (typeof (ctx as any).roundRect === 'function') {
            (ctx as any).roundRect(cardX, cardY, cardW, cardH, 6);
          } else {
            ctx.rect(cardX, cardY, cardW, cardH);
          }
          ctx.fill();
          ctx.stroke();

          if (isCompact) {
            ctx.fillStyle = isLong ? '#089981' : '#f23645';
            ctx.font = 'bold 11px sans-serif';
            ctx.fillText(`${isLong ? '🟢 LONG' : '🔴 SHORT'} R:R ${rrRatio}`, cardX + 8, cardY + 18);
          } else {
            ctx.fillStyle = isLong ? '#089981' : '#f23645';
            ctx.font = 'bold 11px sans-serif';
            ctx.fillText(
              `${isLong ? '🟢 LONG' : '🔴 SHORT'} · Risk/Reward: ${rrRatio}`,
              cardX + 8,
              cardY + 16,
            );

            ctx.fillStyle = '#d1d4dc';
            ctx.font = '10px sans-serif';
            ctx.fillText(
              `Open: ${formatCrosshairPrice(entryPrice, d.symbol)} · Qty: ${lotSize.toFixed(2)} Lots ($${riskAmount.toFixed(0)})`,
              cardX + 8,
              cardY + 30,
            );

            ctx.fillStyle = '#787b86';
            ctx.font = '9.5px sans-serif';
            ctx.fillText(`${barCount} bars (${durText})`, cardX + 8, cardY + 42);

            if (isMarginExceeded) {
              ctx.fillStyle = '#ff9800';
              ctx.font = 'bold 9px sans-serif';
              ctx.fillText('⚠️ Margin Required > Equity', cardX + 8, cardY + 53);
            }
          }
        }
      }
      break;
    }

    // -- 5. Freehand & Vector Drawing Tools ---------------------------
    case 'highlighter': {
      if (pts.length > 0) {
        ctx.save();
        ctx.strokeStyle = d.style.color || '#ffeb3b';
        ctx.lineWidth = Math.max(12, (d.style.width || 1) * 6);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = 0.35;

        if (pts.length === 1) {
          ctx.beginPath();
          ctx.arc(pts[0].x, pts[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
          ctx.fillStyle = ctx.strokeStyle;
          ctx.fill();
        } else {
          ctx.beginPath();
          drawMidpointQuadraticSpline(ctx, pts);
          ctx.stroke();
        }
        ctx.restore();
      }
      break;
    }

    case 'brush': {
      if (pts.length > 0) {
        ctx.save();
        ctx.strokeStyle = d.style.color || '#2962ff';
        ctx.lineWidth = d.style.width || 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const sPts = smoothFreehandPoints(pts, 1);

        ctx.beginPath();
        if (sPts.length === 1) {
          ctx.arc(sPts[0].x, sPts[0].y, (d.style.width || 4) / 2, 0, Math.PI * 2);
          ctx.fillStyle = d.style.color || '#2962ff';
          ctx.fill();
        } else {
          drawMidpointQuadraticSpline(ctx, sPts);
          if (d.style.fillColor && d.style.fillColor !== 'transparent') {
            ctx.fillStyle = d.style.fillColor;
            ctx.fill();
          }
          ctx.stroke();
        }
        ctx.restore();
      }
      break;
    }

    case 'pencil': {
      if (pts.length > 0) {
        ctx.save();
        ctx.strokeStyle = d.style.color || '#2962ff';
        ctx.lineWidth = Math.max(1, d.style.width || 2);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const sPts = smoothFreehandPoints(pts, 1);

        ctx.beginPath();
        if (sPts.length === 1) {
          ctx.arc(sPts[0].x, sPts[0].y, Math.max(1, (d.style.width || 2) / 2), 0, Math.PI * 2);
          ctx.fillStyle = d.style.color || '#2962ff';
          ctx.fill();
        } else {
          drawMidpointQuadraticSpline(ctx, sPts);
          ctx.stroke();
        }
        ctx.restore();
      }
      break;
    }

    case 'pen': {
      if (pts.length > 0) {
        ctx.save();
        ctx.strokeStyle = d.style.color || '#2962ff';
        ctx.lineWidth = d.style.width || 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const sPts = smoothFreehandPoints(pts, 2);

        ctx.beginPath();
        if (sPts.length === 1) {
          ctx.arc(sPts[0].x, sPts[0].y, (d.style.width || 2.5) / 2, 0, Math.PI * 2);
          ctx.fillStyle = d.style.color || '#2962ff';
          ctx.fill();
        } else {
          drawCatmullRomSpline(ctx, sPts, 0.5);
          if (d.style.fillColor && d.style.fillColor !== 'transparent') {
            ctx.fillStyle = d.style.fillColor;
            ctx.fill();
          }
          ctx.stroke();
        }
        ctx.restore();
      }
      break;
    }
  }

  // 6. Render selection handles & lock badge
  if (isSelected) {
    if (d.type === 'long_position' || d.type === 'short_position') {
      const metrics = calculatePositionMetrics(d.type, d.points, d.style);
      const { leftX, rightX, midX, tpY, slY } = calculatePositionHandleCoords(
        p1,
        metrics,
        chartToPixel,
        d.points[0].timestamp,
      );

      const handles = [
        { x: leftX, y: p1.y, color: '#2962ff', title: 'Entry Anchor' },
        { x: midX, y: tpY, color: '#089981', title: 'Take Profit' },
        { x: midX, y: slY, color: '#f23645', title: 'Stop Loss' },
        { x: rightX, y: p1.y, color: '#00bcd4', title: 'Duration' },
        { x: rightX, y: tpY, color: '#089981', title: 'Top Right' },
        { x: rightX, y: slY, color: '#f23645', title: 'Bottom Right' },
      ];

      for (const h of handles) {
        ctx.beginPath();
        ctx.arc(h.x, h.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = h.color;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    } else if (d.type === 'rectangle' && d.points.length >= 2) {
      const handles8 = getRectangle8Handles(d.points);
      for (const h of handles8) {
        const pix = chartToPixel(h.point);
        if (!pix) continue;
        ctx.beginPath();
        ctx.arc(pix.x, pix.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = d.style.color || '#2962ff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    } else if (
      (d.type === 'trend_line' || d.type === 'info_line' || d.type === 'trend_angle') &&
      p1 &&
      p2
    ) {
      const midPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      for (const pt of [p1, p2, midPoint]) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = d.style.color || '#2962ff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    } else if (
      d.type === 'brush' ||
      d.type === 'pencil' ||
      d.type === 'pen' ||
      d.type === 'highlighter'
    ) {
      const handleIndices = [0, Math.floor((pts.length - 1) / 2), pts.length - 1];
      for (const idx of handleIndices) {
        if (pts[idx]) {
          ctx.beginPath();
          ctx.arc(pts[idx].x, pts[idx].y, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.strokeStyle = '#2962ff';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    } else {
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#2962ff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    if (d.locked && p1) {
      ctx.font = '12px sans-serif';
      ctx.fillText('🔒', p1.x - 14, p1.y - 8);
    }
  }

  ctx.restore();
}

/**
 * Render a full-canvas crosshair extending vertically and horizontally across the whole chart,
 * with center reticle and price/time axis badges.
 */
export function renderFullCrosshair(
  pos: { x: number; y: number },
  symbol: string,
  timeframe: string,
  rc: RenderContext,
): void {
  const { ctx, canvasWidth: w, canvasHeight: h, pixelToChart } = rc;
  if (!pos || pos.x < 0 || pos.x > w || pos.y < 0 || pos.y > h) return;

  const chartPt = pixelToChart(pos.x, pos.y);
  const px = Math.round(pos.x) + 0.5;
  const py = Math.round(pos.y) + 0.5;

  ctx.save();

  // 1. Draw Full Horizontal & Vertical Guidelines extending all the way across the canvas
  ctx.strokeStyle = 'rgba(150, 160, 180, 0.75)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);

  // Full Vertical Line (from top 0 to bottom h)
  ctx.beginPath();
  ctx.moveTo(px, 0);
  ctx.lineTo(px, h);
  ctx.stroke();

  // Full Horizontal Line (from left 0 to right w)
  ctx.beginPath();
  ctx.moveTo(0, py);
  ctx.lineTo(w, py);
  ctx.stroke();

  // Reset line dash for reticle and badges
  ctx.setLineDash([]);

  // 2. Center Reticle / Intersection Indicator
  ctx.beginPath();
  ctx.arc(px, py, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = '#2962ff';
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 3. Axis Price Badge on the Right Edge (Y-Axis)
  if (chartPt && chartPt.price !== undefined && !isNaN(chartPt.price)) {
    const priceText = formatCrosshairPrice(chartPt.price, symbol);
    ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif';
    const textMetrics = ctx.measureText(priceText);
    const badgeW = textMetrics.width + 14;
    const badgeH = 20;
    const badgeX = Math.max(2, w - badgeW - 2);
    const badgeY = Math.max(2, Math.min(h - badgeH - 2, py - badgeH / 2));

    // TradingView vibrant blue price badge
    ctx.fillStyle = '#2962ff';
    ctx.strokeStyle = '#3d7aff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(badgeX, badgeY, badgeW, badgeH, 3);
    } else {
      ctx.rect(badgeX, badgeY, badgeW, badgeH);
    }
    ctx.fill();
    ctx.stroke();

    // Price text
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(priceText, badgeX + badgeW / 2, badgeY + badgeH / 2);
  }

  // 4. Axis Time Badge on the Bottom Edge (X-Axis)
  if (chartPt && chartPt.timestamp !== undefined && !isNaN(chartPt.timestamp)) {
    const timeText = formatCrosshairTime(chartPt.timestamp, timeframe);
    if (timeText) {
      ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif';
      const textMetrics = ctx.measureText(timeText);
      const badgeW = textMetrics.width + 16;
      const badgeH = 20;
      const badgeX = Math.max(4, Math.min(w - badgeW - 4, px - badgeW / 2));
      const badgeY = Math.max(4, h - badgeH - 4);

      // Dark pill background with border
      ctx.fillStyle = '#1e222d';
      ctx.strokeStyle = '#363a45';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (typeof (ctx as any).roundRect === 'function') {
        (ctx as any).roundRect(badgeX, badgeY, badgeW, badgeH, 3);
      } else {
        ctx.rect(badgeX, badgeY, badgeW, badgeH);
      }
      ctx.fill();
      ctx.stroke();

      // Time text
      ctx.fillStyle = '#f0f3fa';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(timeText, badgeX + badgeW / 2, badgeY + badgeH / 2);
    }
  }

  ctx.restore();
}

