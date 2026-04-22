# Export Command Design

## Summary

Add a separate `supertwee export` command that reads the local feed archive and writes:

- `feed.jsonl` for downstream analysis
- `report.md` for human-readable local review

The command must not fetch network data or mutate the existing archive. It should export the full archive by default and optionally support filtered slices.

## Command Interface

```bash
supertwee export [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--limit N] [--format jsonl,md] [--out-dir PATH]
```

Defaults:

- formats: `jsonl,md`
- scope: full local archive
- output directory: `./data/exports/<timestamp>/`

## Data Flow

1. Load normalized tweet records from the existing feed archive.
2. Apply optional `--since`, `--until`, and `--limit` filters.
3. Write `feed.jsonl` from the filtered slice.
4. Derive a lightweight summary from that same slice.
5. Write `report.md` using the derived summary.

The report should stay aligned with the exported slice rather than the full archive.

## Markdown Structure

- export metadata
- time range covered
- record count
- top authors by appearances
- top domains
- top hashtags and cashtags
- notable tweets
- filter values used

## Error Handling

- If no feed archive exists, fail with the same guidance as `trends`.
- If filters remove every record, still create the export folder and write both files.
- If `--since` is after `--until`, fail fast.
- If `--format` includes unknown values, fail fast with allowed values.
- If the output directory is invalid or unwritable, surface the filesystem error.

## Testing

- export format parsing
- filtered export behavior
- invalid date range validation
- empty export still writes both files
- markdown report stability with partial records
