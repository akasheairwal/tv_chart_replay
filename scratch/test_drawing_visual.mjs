import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const artifactDir = 'C:\\Users\\akash\\.gemini\\antigravity-ide\\brain\\5c980dfa-3385-4acb-ad34-e63e59cf4155';
  
  console.log('Launching browser...');
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
  });
  
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  });
  
  const page = await context.newPage();
  
  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE ${msg.type()}]:`, msg.text());
  });
  page.on('pageerror', err => {
    console.error('[BROWSER PAGE ERROR]:', err);
  });
  
  console.log('Navigating to http://127.0.0.1:5173/ ...');
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  // Click on "Lines" category button
  console.log('Clicking "Lines" category button...');
  const linesBtn = await page.$('#drawing-toolbar-container button[title="Lines"]');
  if (!linesBtn) {
    throw new Error('Lines button not found!');
  }
  await linesBtn.click();
  await page.waitForTimeout(500);

  await page.screenshot({ path: path.join(artifactDir, 'debug_flyout_open.png') });
  console.log('Saved debug_flyout_open.png');

  // Find and click "Trend Line" in the flyout menu
  const flyoutItems = await page.$$('.drawing-flyout-item');
  console.log(`Found ${flyoutItems.length} flyout items.`);
  if (flyoutItems.length > 0) {
    console.log('Clicking first flyout item (Trend Line)...');
    await flyoutItems[0].click();
    await page.waitForTimeout(500);
  }

  // Check state after selecting Trend Line
  const state = await page.evaluate(() => {
    const canvas = document.querySelector('.drawing-canvas-overlay');
    return {
      pointerEvents: canvas?.style?.pointerEvents,
      computedPointerEvents: canvas ? window.getComputedStyle(canvas).pointerEvents : null,
      cursor: canvas?.style?.cursor,
      canvasZIndex: canvas ? window.getComputedStyle(canvas).zIndex : null
    };
  });
  console.log('State after selecting Trend Line:', JSON.stringify(state, null, 2));

  // Perform drawing gesture on chart container
  const chartBox = await page.$eval('#chart-container', el => {
    const rect = el.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  console.log('Chart container bounding box:', chartBox);

  // Test 1: Click-Click Mode
  const p1 = { x: chartBox.x + chartBox.width * 0.25, y: chartBox.y + chartBox.height * 0.35 };
  const p2 = { x: chartBox.x + chartBox.width * 0.65, y: chartBox.y + chartBox.height * 0.55 };

  console.log('Drawing Test 1 (Click-Click mode):');
  console.log('Click 1 at:', p1);
  await page.mouse.click(p1.x, p1.y);
  await page.waitForTimeout(300);

  await page.mouse.move(p2.x, p2.y, { steps: 5 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(artifactDir, 'debug_drawing_in_progress.png') });
  console.log('Saved debug_drawing_in_progress.png');

  console.log('Click 2 at:', p2);
  await page.mouse.click(p2.x, p2.y);
  await page.waitForTimeout(500);

  await page.screenshot({ path: path.join(artifactDir, 'debug_drawing_committed.png') });
  console.log('Saved debug_drawing_committed.png');

  // Check non-zero alpha pixels on drawing canvas
  const canvasPixels = await page.evaluate(() => {
    const canvas = document.querySelector('.drawing-canvas-overlay');
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let nonZero = 0;
    for (let i = 3; i < imgData.data.length; i += 4) {
      if (imgData.data[i] > 0) nonZero++;
    }
    return {
      width: canvas.width,
      height: canvas.height,
      totalPixels: canvas.width * canvas.height,
      drawnPixels: nonZero
    };
  });
  console.log('Canvas Pixels Analysis:', JSON.stringify(canvasPixels, null, 2));

  // Test 2: Select Rectangle from Shapes category and test Drag-Release mode
  console.log('\nDrawing Test 2 (Drag-Release mode with Rectangle):');
  const shapesBtn = await page.$('#drawing-toolbar-container button[title="Shapes"]');
  if (shapesBtn) {
    await shapesBtn.click();
    await page.waitForTimeout(300);
    const rectItem = await page.$('.drawing-flyout-item');
    if (rectItem) {
      await rectItem.click();
      await page.waitForTimeout(300);
    }
  }

  const r1 = { x: chartBox.x + chartBox.width * 0.15, y: chartBox.y + chartBox.height * 0.2 };
  const r2 = { x: chartBox.x + chartBox.width * 0.45, y: chartBox.y + chartBox.height * 0.5 };

  console.log(`Dragging rectangle from (${r1.x}, ${r1.y}) to (${r2.x}, ${r2.y})...`);
  await page.mouse.move(r1.x, r1.y);
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.mouse.move(r2.x, r2.y, { steps: 10 });
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.waitForTimeout(500);

  await page.screenshot({ path: path.join(artifactDir, 'debug_rectangle_drawn.png') });
  console.log('Saved debug_rectangle_drawn.png');

  const finalCanvasPixels = await page.evaluate(() => {
    const canvas = document.querySelector('.drawing-canvas-overlay');
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let nonZero = 0;
    for (let i = 3; i < imgData.data.length; i += 4) {
      if (imgData.data[i] > 0) nonZero++;
    }
    return {
      totalPixels: canvas.width * canvas.height,
      drawnPixels: nonZero
    };
  });
  console.log('Final Canvas Pixels Analysis:', JSON.stringify(finalCanvasPixels, null, 2));

  await browser.close();
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
