# Changelog

## 2.0.0 (2026-10-20)

Breaking fixes from a catalogue review. Version 1.0.0 could report CLEARED for things it had not checked.

- The CLI no longer falls back to the first registry product (or an invented "standalone-app") when nothing matches. It exits 2.
- The registry is no longer loaded from this skill's own examples folder by default. Product paths resolve relative to the registry file.
- Gate 0 no longer passes a page that loads a tracker directly just because the word "consent" appears on it, and no longer passes on a registry `mechanism` string alone: a consent file must exist. Products declared as collecting no analytics fail if they load a tracker.
- Gate 1 checks that the registered measurement ID is actually in the code.
- Gate 3 no longer states a traffic figure it was never given. It reads `metrics.weekly_conversions` if supplied.
- Gate 4 calls `wb4g-invariants --dir` without a shell, and uses exit codes instead of matching output text. It no longer claims a visual audit it never ran.
- Gate 5 checks the record can be written. The record now holds the final status.
- New: CLEARED_WITH_GAPS status, `--strict`, strict option parsing, exit code 2.
