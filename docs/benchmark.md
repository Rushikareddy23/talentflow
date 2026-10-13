# Query benchmark results

`npm run bench` (in `api/`) inserts synthetic candidates, then times the board query with `EXPLAIN ANALYZE`
(server-side execution time only: no network, API or rendering) and reports the median of 25 runs.
The index is dropped inside a transaction for the "no index" rows and restored afterwards.

These are **database execution times**, not the time to load the board in a browser.
Exact numbers vary between runs and machines; the ratios are what stay stable.
CI reruns this benchmark on every push and prints the output in the run's job summary.

## Setup

| | |
|---|---|
| Data | 400,000 candidates across 2 jobs; 100,000 in the measured job + stage |
| Query | one job, one stage, best score first, 25 rows |
| Machine | 2 vCPU Intel Xeon @ 2.80 GHz, 7 GB RAM (cloud Linux container) |
| Database | PostgreSQL 16.15, default settings (shared_buffers 128MB, work_mem 4MB, 2 parallel workers per gather) |
| Runtime | Node.js 22 |

## Results (median of 25 runs, ms)

| Query | Run 1 (Oct 12, 2026) | Run 2 (Oct 12, 2026) | Plan |
|---|---|---|---|
| First page, no index | 67.820 | 57.455 | Limit > Gather Merge > Sort > Seq Scan |
| Page 400 via OFFSET, no index | 91.113 | 81.645 | Limit > Gather Merge > Sort > Seq Scan |
| First page, with index | 0.053 | 0.034 | Limit > Index Scan |
| Page 400 via OFFSET, with index | 10.638 | 9.343 | Limit > Index Scan |
| Page 400 via keyset, with index | 0.041 | 0.037 | Limit > Index Scan |

**Summary:** the composite index takes the first page from roughly 60 ms to under 0.1 ms (over 1,000x), and at page 400
keyset pagination is about 250x faster than OFFSET.

## Raw output (run 2)

```
inserting 400,000 candidates...
target job has 100,000 candidates in 'applied'

median of 25 runs (server execution time)
  first page, no index                  57.455 ms   Limit > Gather Merge > Sort > Seq Scan
  page 400 via OFFSET, no index         81.645 ms   Limit > Gather Merge > Sort > Seq Scan
  first page, with index                 0.034 ms   Limit > Index Scan
  page 400 via OFFSET, with index        9.343 ms   Limit > Index Scan
  page 400 via keyset, with index        0.037 ms   Limit > Index Scan

index speedup (first page): 1690x
keyset vs OFFSET (page 400): 253x faster
```
