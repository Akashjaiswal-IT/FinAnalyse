# Client fixtures

Recorded upstream responses, trimmed, for the client parse tests in `packages/services/clients/`. Tests never call live HTTP.

| File | Source | Recorded |
|---|---|---|
| `fred-*.json` | FRED API (`DCOILWTICO`; the `"."` row is the real 2021-12-24 holiday value) | 2026-10-03 |
| `eia-WGTSTUS1.json` | EIA API v2 `seriesid/PET.WGTSTUS1.W` | 2026-10-03 |
| `gdelt-*.json`, `gdelt-rate-limited.txt` | GDELT DOC 2.0 (`artlist` for Hurricane Ida, timelines for Harvey, a real HTTP 429 body) | 2026-10-03 |
| `alphavantage-news-energy.json` | Alpha Vantage `NEWS_SENTIMENT`, `topics=energy_transportation` | 2026-10-03 |
| `nhc-*.json` | NHC `CurrentStorms.json` and the NOAA tropical MapServer (`EP3 Forecast Points`, Hurricane Rachel advisory 25) | 2026-10-03 |
| `openmeteo-hubs.json` | Open-Meteo forecast for the seven `HUBS` (first 6 hours) | 2026-10-03 |
| `hurdat2-two-storms.txt` | HURDAT2 `hurdat2-1851-2025-092326.txt`, storms AL092021 (Ida) and AL102021 (Kate) | 2026-10-03 |
| `tiingo-daily-synthetic.json` | **Synthetic values**, real Tiingo field names. Tiingo's licence forbids committing its data. | n/a |
