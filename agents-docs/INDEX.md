# Agents Docs — Index

> **⚠️ These docs may be out of date.** They are point-in-time snapshots written to give an agent (or human) a fast high-level overview of an unfamiliar area — not a substitute for the source of truth. Always verify against the current code before relying on file paths, line numbers, method names, or specific behaviors. If you find a doc has drifted, update it as part of your change.

This index points to the per-subsystem docs. Start with [Project Architecture](project-architecture.md) for the top-level map; jump to a specific area below.

## Architecture

- [Project Architecture](project-architecture.md) — Top-level map with subsystem links and critical gotchas
- [Auth & Users](auth-architecture.md) — HCA OAuth, trial users (STI), session management, before-action chain, Pundit
- [Projects & Journals](arch-projects-journals.md) — Core domain: projects, journal entries, recordings, ships, collaboration
- [Path & Gamification](arch-path-gamification.md) — 3D path progression, critters (gacha), koi/gold ledger, admin review pointers
- [Bulletin Board](arch-bulletin-board.md) — Public community hub at `/bulletin_board`, bulletin events lifecycle, admin event management
- [Explore Feed](arch-explore.md) — Public discovery for projects/journals (in-app feed + `/api/v1/explore` API), cursor pagination, search, live updates
- [Frontend](arch-frontend.md) — React 19 + Inertia + Tailwind 4, pages, components, styling, state management
- [Services & Infra](arch-services-infra.md) — HCA, Lapse, Lookout, Slack, YouTube, Airtable, jobs, storage, monitoring
- [Cross-Cutting Patterns](arch-data-patterns.md) — Soft-delete, Pundit conventions, Flipper flags, PaperTrail, encryption

## Deep-Dives

- [Ship Pipeline & Koi Economy](arch-ship-and-koi.md) — Preflight, identity gate, multi-stage review (TA/RC/DR/BR), claim/heartbeat, re-ship, koi/gold ledger, edge cases
- [HCB API v4 docs](hcb-api-docs.md) — OAuth flow, token lifecycle, scopes, card grants, transactions, organizations
- [Lookout API docs](lookout-api-docs.md) — Full endpoint reference for Lookout (video recording service)
- [Inertia Modal fork](inertia-modal-fork.md) — Custom duration prop, in-modal navigation, modified files
- [Path 3D rendering](test-page-architecture.md) — CSS perspective math, billboard system, canvas grass, curvature
- [Path performance](test-page-performance.md) — Optimization strategies (implemented and remaining)

## Legacy (Superseded)

- [Trial users](trial-users.md) — Superseded by [auth-architecture.md](auth-architecture.md)
