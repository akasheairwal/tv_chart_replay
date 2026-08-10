import { chromium } from 'playwright';
import * as path from 'path';

async function main() {
  const artifactDir = 'C:\\Users\\akash\\.gemini\\antigravity-ide\\brain\\5c980dfa-3385-4acb-ad34-e63e59cf4155';
  
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
  });
  
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  });
  
  const page = await context.newPage();
  
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Inject sample candles directly to test with real candlestick data
  console.log('Injecting sample candlestick data...');
  await page.evaluate(() => {
    const baseTime = 1700000000;
    const rows = [];
    let price = 1.0850;
    for (let i = 0; i < 200; i++) {
      const time = baseTime + i * 3600;
      const open = price;
      const change = (Math.sin(i / 10) + (Math.random() - 0.48)) * 0.0020;
      const close = open + change;
      const high = Math.max(open, close) + Math.random() * 0.0010;
      const low = Math.min(open, close) - Math.random() * 0.0010;
      const volume = Math.floor(1000 + Math.random() * 5000);
      rows.push([time, open, high, low, close, volume]);
      price = close;
    }
    // Access chart manager through app if available or load directly
    if (window.__app && window.__app.chart) {
      window.__app.chart.loadHistory(rows);
    }
  });

  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(artifactDir, 'debug_candles_loaded.png') });
  console.log('Saved debug_candles_loaded.png');

  // Select Fibonacci tool
  console.log('Selecting Fibonacci tool...');
  const fibBtn = await page.$('#drawing-toolbar-container button[title="Fibonacci"]');
  if (fibBtn) {
    await fibBtn.click();
    await page.waitForTimeout(300);
    const fibItem = await page.$('.drawing-flyout-item');
    if (fibItem) {
      await fibItem.click();
      await page.waitForTimeout(300);
    }
  }

  const chartBox = await page.$eval('#chart-container', el => {
    const rect = el.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });

  // Draw Fibonacci Retracement from bottom-left to top-right
  const f1 = { x: chartBox.x + chartBox.width * 0.2, y: chartBox.y + chartBox.height * 0.65 };
  const f2 = { x: chartBox.x + chartBox.width * 0.7, y: chartBox.y + chartBox.height * 0.25 };

  console.log('Drawing Fibonacci from', f1, 'to', f2);
  await page.mouse.move(f1.x, f1.y);
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.mouse.move(f2.x, f2.y, { steps: 10 });
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.waitForTimeout(500);

  await page.screenshot({ path: path.join(artifactDir, 'debug_fibonacci_drawn.png') });
  console.log('Saved debug_fibonacci_drawn.png');

  // Test Paper Trading Panel Toggle
  console.log('Testing Paper Trading Panel toggle...');
  const tradeBtn = await page.$('#trading-btn');
  if (tradeBtn) {
    await tradeBtn.click();
    await page.waitForTimeout(500);
  }

  await page.screenshot({ path: path.join(artifactDir, 'debug_trade_panel_open.png') });
  console.log('Saved debug_trade_panel_open.png');

  await browser.close();
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
