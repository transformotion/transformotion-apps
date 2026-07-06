import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// Usage: node render-mock.mjs <input.html> <output.png> [width]
const [, , inHtml, outPng, widthArg] = process.argv;
if (!inHtml || !outPng) {
  console.error('usage: render-mock.mjs <input.html> <output.png> [width]');
  process.exit(1);
}
const width = widthArg ? parseInt(widthArg, 10) : 1440;

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width, height: 1000 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
const url = pathToFileURL(path.resolve(inHtml)).href;
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: path.resolve(outPng), fullPage: true });
await browser.close();
console.log('wrote', outPng);
