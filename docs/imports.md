# Dispatch Imports

Dispatch includes a guided import system at `/imports` for moving existing work into the app without writing directly to the database first. Every import runs through the same pipeline:

1. Parse the source file.
2. Normalize it into Dispatch's canonical import model.
3. Validate required fields and guardrails.
4. Apply field mapping and fallback rules.
5. Generate a dry-run preview.
6. Commit transactionally or fail without partial writes.

## Supported Sources

| Format | Best For | Notes |
| --- | --- | --- |
| Structured CSV / Spreadsheet | Flat task tables and generic app exports | Supports editable column mapping and duplicate handling. |
| Board-Style JSON | Kanban exports | Boards become projects, lists influence status, and checklists/comments become markdown sections. |
| Workspace ZIP | Mixed workspace exports | CSV becomes tasks, markdown/HTML becomes notes, dated files become dispatches, and assets can become manifest notes. |
| iCalendar (`.ics`) | Calendar/task exports | Accepts `VTODO` and `VEVENT` entries with timezone-aware date normalization. |
| Plain-Text Tasks | Text-first task exports | Understands completion markers, `due:` tokens, `@project`, and `#dispatch:` ids. |
| Dispatch Round-Trip | Phase 18 backups/restores | Restores Dispatch CSV, plain-text, and ICS exports with stronger source-id preservation. |

## Compatibility Matrix

| Format | Preserved Exactly | Approximated | Not Imported |
| --- | --- | --- | --- |
| CSV | Title, status, priority, due date, project name | Labels/comments become metadata blocks | Attachments, remote automations |
| Board JSON | Board names, card titles, due dates, checklist text | Comments become markdown history, list names map to task status | Board automations, members, covers |
| Workspace ZIP | Markdown pages, CSV tables, dated dispatch pages | HTML converts to text, assets become manifest references | Binary assets as native Dispatch attachments |
| ICS | Title, description, date values, completion state | `VEVENT` entries become tasks, datetimes collapse to the user's timezone date | Alarms, attendees, full recurrence fidelity |
| Plain Text | Completion markers, due tokens, project tags, Dispatch ids | Inline metadata becomes note-style sections | Rich attachments, nested subtasks beyond checklist text |
| Dispatch Round-Trip | Dispatch task ids and supported file fields | Project inference follows the exported shape | Deleted-state history and response headers outside the file body |

## Migration Caveats

- Preview counts and warnings are authoritative. Review skipped counts, inferred mappings, and attachment notes before committing.
- Date handling uses the signed-in user's profile timezone. Ambiguous datetimes are normalized to that timezone's calendar date.
- Duplicate behavior is chosen per run: `skip`, `merge`, or `create_copy`.
- Unsupported foreign concepts are preserved as markdown or metadata where possible rather than being silently dropped.
- Large imports are rejected early when file size, CSV rows, or ZIP entry counts exceed local guardrails.

## Round-Trip Expectations

- Phase 18 task exports are valid phase 19 import sources.
- Dispatch CSV exports round-trip through the `dispatch_roundtrip` adapter and preserve Dispatch task ids when present.
- Dispatch plain-text exports preserve `#dispatch:` identifiers and project tags.
- Dispatch ICS exports preserve UID-based identity when the file still contains Dispatch-style ids.
- Re-importing the same export is safe. Import sessions store file fingerprints and per-item mappings so repeated restores can skip duplicates or merge intentionally.

## Regression References

Sample fixtures live in `src/test/fixtures/imports/`. UI regression states are tracked by the import wizard tests:

- Empty/help state
- CSV mapping state
- Dry-run preview with warnings
- Successful commit result
- Recoverable failure banner
