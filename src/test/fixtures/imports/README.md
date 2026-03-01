# Import Fixtures

These fixtures back the phase 19 import parser and wizard regression tests.

## Source Samples

- `csv-sample.csv`: spreadsheet-style task export with custom headers
- `board-sample.json`: kanban board export with lists, checklist items, and comments
- `plain-sample.txt`: plain-text tasks with completion, due, project, and Dispatch id tokens
- `calendar-sample.ics`: `VTODO` / `VEVENT` calendar export
- `workspace-bundle/`: ZIP-oriented workspace sample containing CSV, notes, dated dispatch content, and assets

## Screenshot References

Use these named UI states when capturing visual regressions for `/imports`:

1. `imports-empty-state`: format guide visible before upload
2. `imports-csv-mapping`: CSV mapping controls after analyzer detects columns
3. `imports-preview-warning`: dry-run preview with skipped counts and warning list
4. `imports-success-result`: commit result with migration notes and links
5. `imports-failure-banner`: recoverable error state with rollback copy
