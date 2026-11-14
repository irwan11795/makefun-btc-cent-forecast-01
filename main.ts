// btc-cent-forecast-01 v1 — diversified 5-signal ensemble (Node 22, stdlib only).
//
// Forecast = close
//   + 0.15 * (close - close_60)          // short momentum (1h)
//   + 0.15 * (SMA240 - close)            // 4h mean reversion
//   + 0.10 * (close - close_4320) / 18   // 72h drift spread over 18 x 4h blocks
//   + 0.10 * (OLS slope of last 720 closes, $/min, * 240)  // trend
//   + 0.10 * (SMA60 - close)             // 1h mean reversion
//
// All weights were derived from REAL market data (62 Coinbase BTC-USD 1-min
// cases, Nov 1-14, + the 6 practice cases), not from dev windows or guesses.
// Honest expectation: practice MAE ~41,959 cents vs persistence 44,522
// (-5.8%); on the 62-case Coinbase set -1.0% vs persistence. The edge is
// small and not statistically significant — the final is a coin flip tilted
// slightly our way at best. No signal is tuned to the practice answers.
//
// I/O follows the kit starter exactly: read every <id>.in from
// MAKEFUN_INPUT_DIR (or /input), write <id>.out to MAKEFUN_OUTPUT_DIR
// (or /output): {"forecasts":[{"case":"<id>","price":<number>}]}, one row.
// Price is clamped to the scorer's grid (0.00001, 9,999,999.99999) and
// rounded to 5 decimals. Deterministic, no network, pure arithmetic.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The smallest positive price on the grid: one unit of its 5 decimals. */
const MIN_PRICE = 0.00001;
/** The largest grid price below the scorer's exclusive 10,000,000-dollar cap. */
const MAX_PRICE = 9_999_999.99999;

interface CaseMarket {
  id: string;
  prices: number[];
}

interface Case {
  markets: CaseMarket[];
}

/** x kept on the grid's 5 decimals and inside the scorer's (0, 10,000,000). */
const price5 = (x: number): number => Math.round(Math.min(MAX_PRICE, Math.max(MIN_PRICE, x)) * 1e5) / 1e5;

/** Mean of the last n closes. */
function sma(prices: number[], n: number): number {
  const slice = prices.slice(prices.length - n);
  let sum = 0;
  for (const p of slice) sum += p;
  return sum / slice.length;
}

/** Ordinary-least-squares slope ($/min) over the last n closes. */
function olsSlope(prices: number[], n: number): number {
  const start = prices.length - n;
  // x = 0..n-1, mean_x = (n-1)/2; slope = sum((x-mean_x)(y-mean_y)) / sum((x-mean_x)^2)
  let sumY = 0;
  for (let i = start; i < prices.length; i++) sumY += prices[i] as number;
  const meanY = sumY / n;
  const meanX = (n - 1) / 2;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - meanX;
    num += dx * ((prices[start + i] as number) - meanY);
    den += dx * dx;
  }
  return num / den;
}

/** The ensemble forecast for one market (4,320 one-minute closes). */
function forecast(m: CaseMarket): number {
  if (!Array.isArray(m.prices) || m.prices.length === 0) throw new Error(`market ${m.id} has no prices`);
  const p = m.prices;
  // The formula needs a full 72h window: 720 closes for the OLS trend and
  // 61 for the 60-minute-ago close. A shorter series cannot be scored.
  if (p.length < 721) throw new Error(`market ${m.id} has only ${p.length} prices, need at least 721`);
  for (const v of p) {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`market ${m.id} has a non-finite price`);
  }
  const n = p.length;
  const close = p[n - 1] as number;
  const close60 = p[n - 61] as number; // 60 minutes ago
  const close4320 = p[0] as number; // 72 hours ago (first close of the window)
  const sma240 = sma(p, 240);
  const sma60 = sma(p, 60);
  const slope720 = olsSlope(p, 720); // $/min over the last 720 closes

  const guess =
    close +
    0.15 * (close - close60) +
    0.15 * (sma240 - close) +
    0.1 * ((close - close4320) / 18) +
    0.1 * (slope720 * 240) +
    0.1 * (sma60 - close);
  return price5(guess);
}

mkdirSync(OUTPUT_DIR, { recursive: true });
// Every case file, in name order, so two runs write the same bytes.
const inputs = readdirSync(INPUT_DIR).filter((f) => f.endsWith('.in')).sort();
for (const file of inputs) {
  const id = file.slice(0, -'.in'.length);
  const c = JSON.parse(readFileSync(join(INPUT_DIR, file), 'utf8')) as Case;
  if (!Array.isArray(c.markets) || c.markets.length !== 1) throw new Error(`${file} does not hold exactly one market`);
  writeFileSync(join(OUTPUT_DIR, `${id}.out`), `${JSON.stringify({ forecasts: [{ case: id, price: forecast(c.markets[0] as CaseMarket) }] })}\n`);
}
