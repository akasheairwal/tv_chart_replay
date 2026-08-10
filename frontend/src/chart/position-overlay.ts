/**
 * PositionOverlay — renders active trade positions, live PnL lines, SL/TP levels, and lot sizes on chart.
 */

import type { PositionDefinition } from '../trading/trading-types';
import type { RenderContext } from '../drawings/drawing-renderers';

export class PositionOverlay {
  private positions: PositionDefinition[] = [];
  private currentSymbol = '';
  private latestMarketPrice = 0;
  private closeBtnHits: { id: string; price: number; x: number; y: number; w: number; h: number }[] = [];
  private cardHits: { x: number; y: number; w: number; h: number }[] = [];

  constructor(
    private readonly onClosePosition?: (positionId: string, currentPrice: number) => void,
  ) {}

  setSymbol(symbol: string): void {
    this.currentSymbol = (symbol || '').toUpperCase();
  }

  setPositions(positions: PositionDefinition[]): void {
    this.positions = (positions || []).filter((p) => p.status === 'OPEN');
  }

  setLatestPrice(price: number): void {
    if (price > 0) {
      this.latestMarketPrice = price;
    }
  }

  getPositions(): PositionDefinition[] {
    return this.positions;
  }

  /**
   * Check if coordinates hit any close button or position interactive card.
   */
  hitTest(px: number, py: number): boolean {
    for (const btn of this.closeBtnHits) {
      if (px >= btn.x - 2 && px <= btn.x + btn.w + 2 && py >= btn.y - 2 && py <= btn.y + btn.h + 2) {
        return true;
      }
    }
    for (const card of this.cardHits) {
      if (px >= card.x && px <= card.x + card.w && py >= card.y && py <= card.y + card.h) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if click hit a position's quick close button.
   */
  handlePointerDown(px: number, py: number): boolean {
    for (const btn of this.closeBtnHits) {
      if (px >= btn.x && px <= btn.x + btn.w && py >= btn.y && py <= btn.y + btn.h) {
        if (this.onClosePosition) {
          this.onClosePosition(btn.id, btn.price);
        }
        return true;
      }
    }
    return false;
  }

  /**
   * Render all open positions for current symbol on canvas.
   */
  render(rc: RenderContext): void {
    this.closeBtnHits = [];
    this.cardHits = [];

    const cleanSym = (s: string) => (s || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const curClean = cleanSym(this.currentSymbol);
    const activePositions = this.positions.filter((p) => {
      if (!curClean) return true;
      const posClean = cleanSym(p.symbol);
      return posClean === curClean || posClean.startsWith(curClean) || curClean.startsWith(posClean);
    });

    if (activePositions.length === 0) return;

    const { ctx, canvasWidth: w, canvasHeight: h } = rc;

    const priceToY = (price: number): number | null => {
      if (price === undefined || price === null || isNaN(price) || price <= 0) return null;
      const pt = rc.chartToPixel({ timestamp: 0, price });
      return pt ? pt.y : null;
    };

    ctx.save();

    for (let i = 0; i < activePositions.length; i++) {
      const pos = activePositions[i];
      const isLong = pos.side === 'LONG' || (pos.side as string) === 'BUY';
      const sideText = isLong ? 'BUY' : 'SELL';
      const sideColor = isLong ? '#089981' : '#f23645';
      const pipSize = pos.entry_price > 50 ? 0.01 : 0.0001;
      const multiplier = pos.entry_price < 50 && pos.quantity <= 100 ? 100000.0 : 1.0;

      // 1. Entry Price Y coordinate
      const entryY = priceToY(pos.entry_price);
      if (entryY === null || isNaN(entryY)) continue;

      const priceScaleWidth = 85;
      const rightBoundary = Math.max(50, w - priceScaleWidth);

      // 2. Current Market Price Y coordinate & live PnL
      const mktPrice =
        pos.current_price > 0
          ? pos.current_price
          : this.latestMarketPrice > 0
            ? this.latestMarketPrice
            : pos.entry_price;
      const curY = priceToY(mktPrice) ?? entryY;

      const priceDiff = (mktPrice - pos.entry_price) * (isLong ? 1 : -1);
      const pipsVal = pos.pips !== undefined ? pos.pips : priceDiff / pipSize;
      const unrealizedPnl =
        pos.unrealized_pnl !== 0
          ? pos.unrealized_pnl
          : priceDiff * pos.quantity * multiplier;
      const isProfit = unrealizedPnl >= 0;
      const pnlColor = isProfit ? '#089981' : '#f23645';

      // 3. Draw PnL Tracking Shaded Zone & Bracket
      if (Math.abs(curY - entryY) >= 2) {
        const topY = Math.min(entryY, curY);
        const zoneHeight = Math.abs(curY - entryY);

        // Shaded Profit/Loss Zone
        ctx.fillStyle = isProfit ? 'rgba(8, 153, 129, 0.15)' : 'rgba(242, 54, 69, 0.15)';
        ctx.fillRect(0, topY, rightBoundary, zoneHeight);

        // Current Price Tracking Line (dashed)
        ctx.strokeStyle = pnlColor;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, curY);
        ctx.lineTo(rightBoundary, curY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Vertical PnL Connector Line on right
        const connX = rightBoundary - 10;
        ctx.strokeStyle = pnlColor;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(connX, entryY);
        ctx.lineTo(connX, curY);
        ctx.stroke();

        // Connector PnL Badge
        const pnlSign = unrealizedPnl >= 0 ? '+' : '';
        const pipsSign = pipsVal >= 0 ? '+' : '';
        const pnlTagText = `${pnlSign}$${unrealizedPnl.toFixed(2)} (${pipsSign}${pipsVal.toFixed(1)}p)`;
        ctx.font = 'bold 10px monospace';
        const tagW = ctx.measureText(pnlTagText).width + 14;
        const tagX = connX - tagW - 4;
        const tagY = Math.max(5, Math.min((entryY + curY) / 2 - 10, h - 25));

        ctx.fillStyle = isProfit ? 'rgba(8, 153, 129, 0.94)' : 'rgba(242, 54, 69, 0.94)';
        ctx.beginPath();
        if (typeof (ctx as any).roundRect === 'function') {
          (ctx as any).roundRect(tagX, tagY, tagW, 20, 4);
        } else {
          ctx.rect(tagX, tagY, tagW, 20);
        }
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillText(pnlTagText, tagX + 7, tagY + 14);
      }

      // 4. Draw Entry Horizontal Line
      ctx.strokeStyle = sideColor;
      ctx.lineWidth = 1.8;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(0, entryY);
      ctx.lineTo(rightBoundary, entryY);
      ctx.stroke();
      ctx.setLineDash([]);

      // 5. Draw Main Position Badge Card (Anchored on Entry Line)
      const badgeX = 20;
      const badgeY = Math.max(6, Math.min(entryY - 14, h - 35));
      const badgeW = 340;
      const badgeH = 28;

      // Register card bounds for hit test
      this.cardHits.push({ x: badgeX, y: badgeY, w: badgeW, h: badgeH });

      // Background Card
      ctx.fillStyle = 'rgba(19, 23, 34, 0.96)';
      ctx.strokeStyle = sideColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (typeof (ctx as any).roundRect === 'function') {
        (ctx as any).roundRect(badgeX, badgeY, badgeW, badgeH, 6);
      } else {
        ctx.rect(badgeX, badgeY, badgeW, badgeH);
      }
      ctx.fill();
      ctx.stroke();

      // Side Chip
      ctx.fillStyle = sideColor;
      ctx.beginPath();
      if (typeof (ctx as any).roundRect === 'function') {
        (ctx as any).roundRect(badgeX + 5, badgeY + 4, 46, 20, 4);
      } else {
        ctx.rect(badgeX + 5, badgeY + 4, 46, 20);
      }
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(sideText, badgeX + 11, badgeY + 18);

      // Lot Size (Bold Gold Text)
      const lotText = `${pos.quantity.toFixed(2)} Lots`;
      ctx.fillStyle = '#ffb703';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(lotText, badgeX + 58, badgeY + 18);

      // Entry Price
      ctx.fillStyle = '#9aa0a6';
      ctx.font = '11px sans-serif';
      ctx.fillText(`@ ${pos.entry_price.toFixed(4)}`, badgeX + 130, badgeY + 18);

      // Live PnL ($ + pips)
      const pnlSign = unrealizedPnl >= 0 ? '+' : '';
      const pipsSign = pipsVal >= 0 ? '+' : '';
      const pnlText = `${pnlSign}$${unrealizedPnl.toFixed(2)} (${pipsSign}${pipsVal.toFixed(1)}p)`;

      ctx.fillStyle = pnlColor;
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(pnlText, badgeX + 195, badgeY + 18);

      // Close [✕] Button
      const closeX = badgeX + badgeW - 24;
      const closeY = badgeY + 4;
      const closeW = 20;
      const closeH = 20;

      ctx.fillStyle = 'rgba(242, 54, 69, 0.25)';
      ctx.beginPath();
      if (typeof (ctx as any).roundRect === 'function') {
        (ctx as any).roundRect(closeX, closeY, closeW, closeH, 4);
      } else {
        ctx.rect(closeX, closeY, closeW, closeH);
      }
      ctx.fill();

      ctx.fillStyle = '#f23645';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('✕', closeX + 5, closeY + 15);

      this.closeBtnHits.push({
        id: pos.position_id,
        price: mktPrice,
        x: closeX,
        y: closeY,
        w: closeW,
        h: closeH,
      });

      // 6. Right Entry Tag (cleanly positioned inside chart area before price scale)
      const entryTagText = `${sideText} ${pos.quantity.toFixed(1)}L`;
      ctx.font = 'bold 10px monospace';
      const entryTagW = ctx.measureText(entryTagText).width + 12;
      const entryTagX = rightBoundary - entryTagW - 4;
      const entryTagY = Math.max(4, Math.min(entryY - 10, h - 24));

      ctx.fillStyle = sideColor;
      ctx.beginPath();
      if (typeof (ctx as any).roundRect === 'function') {
        (ctx as any).roundRect(entryTagX, entryTagY, entryTagW, 20, 4);
      } else {
        ctx.rect(entryTagX, entryTagY, entryTagW, 20);
      }
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(entryTagText, entryTagX + 6, entryTagY + 14);

      // 7. Stop Loss (SL) Line & Badge
      if (pos.stop_loss !== undefined && pos.stop_loss !== null && pos.stop_loss > 0) {
        const slY = priceToY(pos.stop_loss);
        if (slY !== null) {
          ctx.strokeStyle = '#f23645';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(0, slY);
          ctx.lineTo(rightBoundary, slY);
          ctx.stroke();
          ctx.setLineDash([]);

          // SL Tag
          const slDelta = (pos.stop_loss - pos.entry_price) * (isLong ? 1 : -1);
          const slPips = (slDelta / pipSize).toFixed(1);
          const slRisk = (slDelta * pos.quantity * multiplier).toFixed(2);

          const slBadgeW = 210;
          const slBadgeX = 20;
          const slBadgeY = Math.max(5, Math.min(slY - 11, h - 25));

          this.cardHits.push({ x: slBadgeX, y: slBadgeY, w: slBadgeW, h: 22 });

          ctx.fillStyle = 'rgba(19, 23, 34, 0.94)';
          ctx.strokeStyle = '#f23645';
          ctx.lineWidth = 1;
          ctx.beginPath();
          if (typeof (ctx as any).roundRect === 'function') {
            (ctx as any).roundRect(slBadgeX, slBadgeY, slBadgeW, 22, 4);
          } else {
            ctx.rect(slBadgeX, slBadgeY, slBadgeW, 22);
          }
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#f23645';
          ctx.font = 'bold 10px sans-serif';
          ctx.fillText(
            `SL: ${pos.stop_loss.toFixed(4)} (${slPips}p | $${slRisk}) · ${pos.quantity.toFixed(2)}L`,
            slBadgeX + 6,
            slBadgeY + 15,
          );

          // SL Price Scale Badge (anchored inside chart boundary)
          const slTagText = `SL ${pos.stop_loss.toFixed(4)}`;
          ctx.font = 'bold 10px monospace';
          const slTagW = ctx.measureText(slTagText).width + 12;
          const slTagX = rightBoundary - slTagW - 4;
          const slTagY = Math.max(4, Math.min(slY - 9, h - 22));

          ctx.fillStyle = '#f23645';
          ctx.beginPath();
          if (typeof (ctx as any).roundRect === 'function') {
            (ctx as any).roundRect(slTagX, slTagY, slTagW, 18, 4);
          } else {
            ctx.rect(slTagX, slTagY, slTagW, 18);
          }
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.fillText(slTagText, slTagX + 6, slTagY + 13);
        }
      }

      // 8. Take Profit (TP) Line & Badge
      if (pos.take_profit !== undefined && pos.take_profit !== null && pos.take_profit > 0) {
        const tpY = priceToY(pos.take_profit);
        if (tpY !== null) {
          ctx.strokeStyle = '#089981';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(0, tpY);
          ctx.lineTo(rightBoundary, tpY);
          ctx.stroke();
          ctx.setLineDash([]);

          // TP Tag
          const tpDelta = (pos.take_profit - pos.entry_price) * (isLong ? 1 : -1);
          const tpPips = (tpDelta / pipSize).toFixed(1);
          const tpReward = (tpDelta * pos.quantity * multiplier).toFixed(2);

          const tpBadgeW = 210;
          const tpBadgeX = 20;
          const tpBadgeY = Math.max(5, Math.min(tpY - 11, h - 25));

          this.cardHits.push({ x: tpBadgeX, y: tpBadgeY, w: tpBadgeW, h: 22 });

          ctx.fillStyle = 'rgba(19, 23, 34, 0.94)';
          ctx.strokeStyle = '#089981';
          ctx.lineWidth = 1;
          ctx.beginPath();
          if (typeof (ctx as any).roundRect === 'function') {
            (ctx as any).roundRect(tpBadgeX, tpBadgeY, tpBadgeW, 22, 4);
          } else {
            ctx.rect(tpBadgeX, tpBadgeY, tpBadgeW, 22);
          }
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#089981';
          ctx.font = 'bold 10px sans-serif';
          ctx.fillText(
            `TP: ${pos.take_profit.toFixed(4)} (+${tpPips}p | +$${tpReward}) · ${pos.quantity.toFixed(2)}L`,
            tpBadgeX + 6,
            tpBadgeY + 15,
          );

          // TP Price Scale Badge (anchored inside chart boundary)
          const tpTagText = `TP ${pos.take_profit.toFixed(4)}`;
          ctx.font = 'bold 10px monospace';
          const tpTagW = ctx.measureText(tpTagText).width + 12;
          const tpTagX = rightBoundary - tpTagW - 4;
          const tpTagY = Math.max(4, Math.min(tpY - 9, h - 22));

          ctx.fillStyle = '#089981';
          ctx.beginPath();
          if (typeof (ctx as any).roundRect === 'function') {
            (ctx as any).roundRect(tpTagX, tpTagY, tpTagW, 18, 4);
          } else {
            ctx.rect(tpTagX, tpTagY, tpTagW, 18);
          }
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.fillText(tpTagText, tpTagX + 6, tpTagY + 13);
        }
      }
    }

    ctx.restore();
  }
}
