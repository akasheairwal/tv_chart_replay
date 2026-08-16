/**
 * PositionOverlay — renders active trade positions, live PnL lines, SL/TP levels, lot sizes,
 * and supports interactive dragging of Stop Loss (SL) & Take Profit (TP) lines on chart.
 */

import type { PositionDefinition } from '../trading/trading-types';
import { getSymbolContractDetails } from '../trading/risk-calculator';
import type { RenderContext } from '../drawings/drawing-renderers';
import type { SlTpModificationRequest } from '../ui/sl-tp-confirm-dialog';

export interface SlTpHitItem {
  position: PositionDefinition;
  type: 'SL' | 'TP';
  originalPrice: number;
  lineY: number;
  badgeBounds: { x: number; y: number; w: number; h: number };
}

export interface ActiveSlTpDrag {
  position: PositionDefinition;
  type: 'SL' | 'TP';
  originalPrice: number;
  currentPrice: number;
  currentY: number;
}

export class PositionOverlay {
  private positions: PositionDefinition[] = [];
  private currentSymbol = '';
  private latestMarketPrice = 0;

  private closeBtnHits: { id: string; price: number; x: number; y: number; w: number; h: number }[] = [];
  private cardHits: { x: number; y: number; w: number; h: number }[] = [];
  private sltpHits: SlTpHitItem[] = [];

  private activeDrag: ActiveSlTpDrag | null = null;

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

  getActiveDrag(): ActiveSlTpDrag | null {
    return this.activeDrag;
  }

  /**
   * Check if coordinates hit any close button, position card, or SL/TP line/badge.
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
    for (const hit of this.sltpHits) {
      if (Math.abs(py - hit.lineY) <= 8) {
        return true;
      }
      const b = hit.badgeBounds;
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if mouse down hits close button OR starts dragging an SL/TP line.
   */
  handlePointerDown(px: number, py: number, rc?: RenderContext): boolean {
    // 1. Close button hit test
    for (const btn of this.closeBtnHits) {
      if (px >= btn.x && px <= btn.x + btn.w && py >= btn.y && py <= btn.y + btn.h) {
        if (this.onClosePosition) {
          this.onClosePosition(btn.id, btn.price);
        }
        return true;
      }
    }

    // 2. SL / TP line hit test for dragging
    for (const hit of this.sltpHits) {
      const isLineHit = Math.abs(py - hit.lineY) <= 8;
      const b = hit.badgeBounds;
      const isBadgeHit = px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;

      if (isLineHit || isBadgeHit) {
        let curPrice = hit.originalPrice;
        if (rc) {
          const pt = rc.pixelToChart(px, py);
          if (pt && pt.price > 0) curPrice = pt.price;
        }

        this.activeDrag = {
          position: hit.position,
          type: hit.type,
          originalPrice: hit.originalPrice,
          currentPrice: curPrice,
          currentY: hit.lineY,
        };
        return true;
      }
    }

    return false;
  }

  /**
   * Handle mouse move during SL/TP line drag or cursor hover checks.
   */
  handlePointerMove(px: number, py: number, rc?: RenderContext): { isDragging: boolean; cursor: string } {
    if (this.activeDrag) {
      this.activeDrag.currentY = py;
      if (rc) {
        const pt = rc.pixelToChart(px, py);
        if (pt && pt.price > 0) {
          this.activeDrag.currentPrice = pt.price;
        }
      }
      return { isDragging: true, cursor: 'ns-resize' };
    }

    // Check hover state over SL / TP lines
    for (const hit of this.sltpHits) {
      const isLineHit = Math.abs(py - hit.lineY) <= 8;
      const b = hit.badgeBounds;
      const isBadgeHit = px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
      if (isLineHit || isBadgeHit) {
        return { isDragging: false, cursor: 'ns-resize' };
      }
    }

    return { isDragging: false, cursor: 'default' };
  }

  /**
   * Mouse release: completes dragging and returns modification request for confirmation modal.
   */
  handlePointerUp(): SlTpModificationRequest | null {
    if (!this.activeDrag) return null;

    const drag = this.activeDrag;
    this.activeDrag = null;

    if (drag.currentPrice > 0 && Math.abs(drag.currentPrice - drag.originalPrice) > 0.000001) {
      return {
        position: drag.position,
        type: drag.type,
        originalPrice: drag.originalPrice,
        newPrice: drag.currentPrice,
      };
    }

    return null;
  }

  /**
   * Render all open positions, SL/TP lines, and active drag preview ghost lines.
   */
  render(rc: RenderContext): void {
    this.closeBtnHits = [];
    this.cardHits = [];
    this.sltpHits = [];

    const cleanSym = (s: string) => (s || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const curClean = cleanSym(this.currentSymbol);
    const activePositions = this.positions.filter((p) => {
      if (!curClean) return true;
      const posClean = cleanSym(p.symbol);
      return posClean === curClean || posClean.startsWith(curClean) || curClean.startsWith(posClean);
    });

    if (activePositions.length === 0 && !this.activeDrag) return;

    const { ctx, canvasWidth: w, canvasHeight: h } = rc;

    const priceToY = (price: number): number | null => {
      if (price === undefined || price === null || isNaN(price) || price <= 0) return null;
      const pt = rc.chartToPixel({ timestamp: 0, price });
      return pt ? pt.y : null;
    };

    ctx.save();

    const priceScaleWidth = 85;
    const rightBoundary = Math.max(50, w - priceScaleWidth);

    for (let i = 0; i < activePositions.length; i++) {
      const pos = activePositions[i];
      const isLong = pos.side === 'LONG' || (pos.side as string) === 'BUY';
      const sideText = isLong ? 'BUY' : 'SELL';
      const sideColor = isLong ? '#089981' : '#f23645';
      const { contractSize: multiplier, pipSize } = getSymbolContractDetails(pos.symbol, pos.entry_price);

      // 1. Entry Price Y coordinate
      const entryY = priceToY(pos.entry_price);
      if (entryY === null || isNaN(entryY)) continue;

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

        ctx.fillStyle = isProfit ? 'rgba(8, 153, 129, 0.15)' : 'rgba(242, 54, 69, 0.15)';
        ctx.fillRect(0, topY, rightBoundary, zoneHeight);

        ctx.strokeStyle = pnlColor;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, curY);
        ctx.lineTo(rightBoundary, curY);
        ctx.stroke();
        ctx.setLineDash([]);

        const connX = rightBoundary - 10;
        ctx.strokeStyle = pnlColor;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(connX, entryY);
        ctx.lineTo(connX, curY);
        ctx.stroke();

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

      // 5. Draw Main Position Badge Card
      const badgeX = 20;
      const badgeY = Math.max(6, Math.min(entryY - 14, h - 35));
      const badgeW = 340;
      const badgeH = 28;

      this.cardHits.push({ x: badgeX, y: badgeY, w: badgeW, h: badgeH });

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

      const lotText = `${pos.quantity.toFixed(2)} Lots`;
      ctx.fillStyle = '#ffb703';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(lotText, badgeX + 58, badgeY + 18);

      ctx.fillStyle = '#9aa0a6';
      ctx.font = '11px sans-serif';
      ctx.fillText(`@ ${pos.entry_price.toFixed(4)}`, badgeX + 130, badgeY + 18);

      const pnlSign = unrealizedPnl >= 0 ? '+' : '';
      const pipsSign = pipsVal >= 0 ? '+' : '';
      const pnlText = `${pnlSign}$${unrealizedPnl.toFixed(2)} (${pipsSign}${pipsVal.toFixed(1)}p)`;

      ctx.fillStyle = pnlColor;
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(pnlText, badgeX + 195, badgeY + 18);

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

      // Entry Tag
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

      // 6. Stop Loss (SL) Line & Badge (with Drag Handle Hit Box)
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

          const slDelta = (pos.stop_loss - pos.entry_price) * (isLong ? 1 : -1);
          const slPips = (slDelta / pipSize).toFixed(1);
          const slRisk = (slDelta * pos.quantity * multiplier).toFixed(2);

          const slBadgeW = 210;
          const slBadgeX = 20;
          const slBadgeY = Math.max(5, Math.min(slY - 11, h - 25));

          const badgeBounds = { x: slBadgeX, y: slBadgeY, w: slBadgeW, h: 22 };
          this.sltpHits.push({
            position: pos,
            type: 'SL',
            originalPrice: pos.stop_loss,
            lineY: slY,
            badgeBounds,
          });

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

      // 7. Take Profit (TP) Line & Badge (with Drag Handle Hit Box)
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

          const tpDelta = (pos.take_profit - pos.entry_price) * (isLong ? 1 : -1);
          const tpPips = (tpDelta / pipSize).toFixed(1);
          const tpReward = (tpDelta * pos.quantity * multiplier).toFixed(2);

          const tpBadgeW = 210;
          const tpBadgeX = 20;
          const tpBadgeY = Math.max(5, Math.min(tpY - 11, h - 25));

          const badgeBounds = { x: tpBadgeX, y: tpBadgeY, w: tpBadgeW, h: 22 };
          this.sltpHits.push({
            position: pos,
            type: 'TP',
            originalPrice: pos.take_profit,
            lineY: tpY,
            badgeBounds,
          });

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

    // 8. Render Active Drag Ghost Preview Line & Live Metrics Badge
    if (this.activeDrag) {
      const drag = this.activeDrag;
      const isSl = drag.type === 'SL';
      const color = isSl ? '#f23645' : '#089981';
      const pos = drag.position;
      const isLong = pos.side === 'LONG' || (pos.side as any) === 'BUY';
      const isCrypto = pos.entry_price > 1000;
      const isJpy = pos.symbol.includes('JPY');
      const pipSize = isCrypto ? 1.0 : isJpy ? 0.01 : 0.0001;
      const multiplier = pos.entry_price < 50 && pos.quantity <= 100 ? 100000.0 : 1.0;

      const delta = (drag.currentPrice - pos.entry_price) * (isLong ? 1 : -1);
      const pips = (delta / pipSize).toFixed(1);
      const dollars = (delta * pos.quantity * multiplier).toFixed(2);
      const sign = delta >= 0 ? '+' : '';

      const dragY = drag.currentY;

      // Bright glowing preview line
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(0, dragY);
      ctx.lineTo(rightBoundary, dragY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;

      // Drag preview floating card at left
      const cardText = `NEW ${drag.type}: ${drag.currentPrice.toFixed(4)} (${sign}${pips}p | ${sign}$${dollars})`;
      ctx.font = 'bold 11px sans-serif';
      const cardW = ctx.measureText(cardText).width + 20;
      const cardX = 20;
      const cardY = Math.max(5, Math.min(dragY - 14, h - 30));

      ctx.fillStyle = isSl ? 'rgba(242, 54, 69, 0.95)' : 'rgba(8, 153, 129, 0.95)';
      ctx.beginPath();
      if (typeof (ctx as any).roundRect === 'function') {
        (ctx as any).roundRect(cardX, cardY, cardW, 26, 6);
      } else {
        ctx.rect(cardX, cardY, cardW, 26);
      }
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillText(cardText, cardX + 10, cardY + 17);

      // Price scale tag
      const scaleText = `RELEASE TO MODIFY ${drag.type}`;
      ctx.font = 'bold 9px monospace';
      const scaleW = ctx.measureText(scaleText).width + 12;
      const scaleX = rightBoundary - scaleW - 4;
      const scaleY = Math.max(4, Math.min(dragY - 9, h - 22));

      ctx.fillStyle = color;
      ctx.beginPath();
      if (typeof (ctx as any).roundRect === 'function') {
        (ctx as any).roundRect(scaleX, scaleY, scaleW, 18, 4);
      } else {
        ctx.rect(scaleX, scaleY, scaleW, 18);
      }
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(scaleText, scaleX + 6, scaleY + 13);
    }

    ctx.restore();
  }
}
