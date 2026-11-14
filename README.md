# btc-cent-forecast-01 v1 — Diversified 5-signal ensemble

Forecast Bitcoin's price 4 hours ahead from the last 72 hours of 1-minute
closes (Coinbase Wrapped BTC / USDC, Orca pool).

## Method

```
forecast = close
  + 0.15 * (close - close_60)          # short momentum (1h)
  + 0.15 * (SMA240 - close)            # 4h mean reversion
  + 0.10 * (close - close_4320) / 18   # 72h drift spread over 18 x 4h blocks
  + 0.10 * (OLS slope last 720 closes, $/min, * 240)  # trend
  + 0.10 * (SMA60 - close)             # 1h mean reversion
```

Clamped to the scorer's grid (0.00001, 9,999,999.99999), rounded to 5
decimals. Deterministic, pure arithmetic, no network, Node 22 stdlib only.

## Where the weights come from

All weights were fitted on REAL market data: 62 Coinbase BTC-USD 1-minute
cases (checkpoints every 4h, Nov 4–14) plus the 6 practice cases — not on
a dev window, not guessed. Single signals were tested and rejected as
regime-unstable (SMA60 reversion: −2.2% on Coinbase but +15% worse on
practice; small-k momentum: better on practice, worse on Coinbase).

## Honest expectation

- Practice (6 cases): MAE ≈ 41,959 cents vs persistence 44,522 (−5.8%).
- Coinbase 62-case set: MAE 48,312 vs persistence 48,818 (−1.0%), wins
  63% of cases vs persistence.
- The edge is small and not statistically significant (no single signal has
  a t-stat beyond ±1 vs persistence). The final (12 unseen cases) is a coin
  flip tilted slightly our way at best. A prize needs a score strictly below
  the house persistence baseline on the final.

## Run

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

Reads every `<id>.in`, writes `<id>.out` with
`{"forecasts":[{"case":"<id>","price":<number>}]}`.
