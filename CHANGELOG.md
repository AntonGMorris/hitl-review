# Changelog

All notable changes to this project are documented here. Follows [Keep a Changelog](https://keepachangelog.com/) and [Semantic Versioning](https://semver.org/).

## [0.2.0] — 2026-07-18

### Added
- **Web dashboard** (`npx hitl-review serve`) — a small vanilla-JS SPA served by a stdlib-only Node HTTP server. Zero new dependencies. Same semantics as the CLI (list, show, approve, edit, reject) with the same underlying storage.
- `startServer` / `startFromFile` exported from the main entrypoint for programmatic embedding.
- `hitl-review serve` CLI command with `--port` and `--host` flags. Binds to `127.0.0.1` by default; explicit warning printed when bound to a public interface.
- Vitest suite for the server (10 tests) covering list filtering, get/decide flows, double-decide rejection, and static HTML serving.

### Changed
- Package now ships `public/` (HTML + CSS + JS assets for the dashboard) in the published tarball.

## [0.1.1] — 2026-07-18

### Fixed
- `HitlQueue` now accepts thresholds > 1 (e.g. `Infinity`) as an "always review" mode. Previously it rejected any value outside `[0, 1]`, which blocked a legitimate high-stakes-agent use case. Discovered via `lead-qual-agent`'s e2e test — its default configuration passes 1.01 to route every submission through review regardless of confidence.

### Added
- `tests/threshold.test.ts` covering `Infinity`, negative, and `NaN` thresholds.

## [0.1.0] — 2026-07-18

### Added
- Core API: `HitlQueue.submit()` with threshold-based routing, `HitlQueue.decide()` for approve/edit/reject.
- Storage adapters: `MemoryStore` (in-process) and `FileStore` (atomic JSON, write-serialised for single-instance deployments).
- Notifiers: `ConsoleNotifier` and `SlackNotifier` (incoming webhook + optional `reviewUrlBuilder` for deep links).
- Reviewer CLI: `hitl-review list | show | approve | edit | reject`.
- Notifier-failure resilience — a failing notifier never loses the queued item.
- Vitest suite (17 tests) covering threshold routing, notifier failure resilience, edit/reject/approve state transitions, concurrent-write serialisation in `FileStore`, and cross-instance persistence.
- GitHub Actions CI on Node 20 & 22.
