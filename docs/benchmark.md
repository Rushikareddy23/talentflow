# Query benchmark results

`npm run bench` (in `api/`) inserts synthetic candidates, then times the board query with `EXPLAIN ANALYZE`
(server-side execution time only: no network, API or rendering) and reports the median of 25 runs.
The index is dropped inside a transaction for the "no index" rows and restored afterwards.

These are **database execution times**, not the time to load the board in a browser.
Exact numbers vary between runs and machines, and so do the ratios: across the three recorded runs below,
keyset vs OFFSET ranged from 128x to 259x. Treat these as measured results for this setup, not guarantees.
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

| Query | Local run 1 | Local run 2 | GitHub Actions (4 vCPU) | Plan |
|---|---|---|---|---|
| First page, no index | 67.820 | 57.455 | 40.716 | Limit > Gather Merge > Sort > Seq Scan |
| Page 400 via OFFSET, no index | 91.113 | 81.645 | 54.208 | Limit > Gather Merge > Sort > Seq Scan |
| First page, with index | 0.053 | 0.034 | 0.031 | Limit > Index Scan |
| Page 400 via OFFSET, with index | 10.638 | 9.343 | 3.841 | Limit > Index Scan |
| Page 400 via keyset, with index | 0.041 | 0.037 | 0.030 | Limit > Index Scan |

**Summary:** across all three runs the composite index takes the first page from 40-68 ms to under 0.06 ms
(over 1,000x faster), and at page 400 keyset pagination is 128x-259x faster than OFFSET depending on the machine.
The GitHub Actions run used a 4 vCPU runner with PostgreSQL 16.15; local runs and CI were on Oct 12, 2026.

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
