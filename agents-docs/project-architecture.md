---
name: Project Architecture Index
description: Top-level architecture map of the Fallout platform — links to detailed docs for each subsystem
type: project
originSessionId: bb8ce051-7e1a-4ccd-bd96-7b3a575d339a
---
# Fallout Architecture

## What This Platform Does

Fallout is a grant/hackathon program for students. The user journey:

1. **Sign up** — enter email (trial) or authenticate via HCA (full account)
2. **Create a project** — describe what you're building
3. **Log work** — create journal entries with markdown, images, and timelapse recordings (Lapse, Lookout, YouTube)
4. **Submit for review** — ship the project for reviewer approval, get hours credited
5. **Earn rewards** — each journal entry awards a random critter (gacha). Koi (and parallel gold) currency are ledger-backed; earning sources today are streak goal completion + admin adjustments. Spending: shop items, project grants (koi → USD via HCB).
6. **Progress on the path** — a 3D perspective ground plane where each journal entry advances you one node

## Stack

**Backend:** Ruby 3.4.4, Rails 8.1.2, PostgreSQL, Solid Queue, Solid Cache, Pundit, Flipper, PaperTrail
**Frontend:** React 19 + TypeScript, Tailwind 4.1.18, Vite 7.3.1, Inertia Rails
**Infra:** Kamal (Docker), Puma, Redis, Cloudflare R2 (Active Storage), Sentry, Skylight

## Where Do I Look When...

| Task | Start here |
|------|------------|
| Adding a new page | [Frontend](arch-frontend.md) — page structure, Inertia config, component library |
| Adding a new model | [Projects & Journals](arch-projects-journals.md) for domain models, then [Cross-Cutting](arch-data-patterns.md) for Pundit/soft-delete setup |
| Touching auth or access control | [Auth Architecture](auth-architecture.md) — read the summary flows at the top first |
| Adding a feature flag | [Cross-Cutting](arch-data-patterns.md) §3 (Flipper) |
| Working with an external API | [Services & Infra](arch-services-infra.md) — all service wrappers documented |
| Understanding the path/gamification | [Path & Gamification](arch-path-gamification.md) |
| Modifying the 3D path rendering | [Path 3D rendering](test-page-architecture.md) (deep-dive) |

## Subsystem Map

| Area | Doc | Key Files |
|------|-----|-----------|
| **Auth & Users** | [auth-architecture.md](auth-architecture.md) | `concerns/authentication.rb`, `auth_controller.rb`, `trial_sessions_controller.rb`, `user.rb`, `trial_user.rb`, `hca_service.rb` |
| **Projects & Journals** | [arch-projects-journals.md](arch-projects-journals.md) | `project.rb`, `journal_entry.rb`, `recording.rb`, `ship.rb`, `collaborator.rb`, `collaboration_invite.rb` |
| **The Path & Gamification** | [arch-path-gamification.md](arch-path-gamification.md) | `path_controller.rb`, `critter.rb`, `clearing_controller.rb`, `pages/path/index.tsx` |
| **Frontend** | [arch-frontend.md](arch-frontend.md) | `entrypoints/inertia.ts`, `layouts/`, `components/`, `pages/`, `styles/application.css` |
| **Services & Infra** | [arch-services-infra.md](arch-services-infra.md) | `app/services/`, `app/jobs/`, `config/initializers/`, `config/recurring.yml` |
| **Cross-Cutting Patterns** | [arch-data-patterns.md](arch-data-patterns.md) | `application_policy.rb`, `application_controller.rb`, `concerns/discardable.rb` |

## Existing Deep-Dives

- [Lookout API docs](lookout-api-docs.md) — Full endpoint reference for the video recording service
- [Inertia Modal fork](inertia-modal-fork.md) — Custom `duration` prop, in-modal navigation, setup
- [Path 3D rendering](test-page-architecture.md) — CSS perspective math, billboard system, canvas grass
- [Path performance](test-page-performance.md) — Optimization strategies (implemented and remaining)

## Critical Gotchas (Quick Reference)

1. **STI NULL scope**: `User.verified` must be `where(type: nil)` not `where.not(type: "TrialUser")` — PostgreSQL excludes NULL from `!=`
2. **Rails 8.1 callback validation**: Controllers without `index` must use blanket `skip_after_action` (no `only:`) — Rails validates action names in inherited chains
3. **`only:` vs `except:` rule**: Relaxing directives use `only:` (fail-closed); restricting directives use `except:` or blanket
4. **Lookout signed URLs expire after 1 hour** — always fetch fresh via `/video` or `/thumbnail` endpoints
5. **Active Storage direct uploads** require auth — patched in `active_storage_auth.rb` because `DirectUploadsController` bypasses `ApplicationController`
6. **Inertia exposes all props** to browser devtools — never pass secrets or tokens to the frontend
7. **Soft-delete cascades are explicit** — `Project#discard` manually cascades to collaborators, invites, and journal entries in a transaction
8. **Recording deletion ≠ timelapse deletion** — destroying a `Recording` unlinks but preserves the underlying timelapse/video for reuse
9. **HCB is off-limits** — do not edit HCB-related code without explicit written approval
10. **Koi awarding flows downstream into HCB** — approving a ship issues a `ship_review` `KoiTransaction` (7 koi/hour of user-facing time + DR/BR `koi_adjustment`), which is later spendable on `ProjectGrantOrder` → real HCB topup. Treat the awarding code as financial. See [arch-ship-and-koi.md](arch-ship-and-koi.md) §10 for the awarding formula and §7 for the user-facing-vs-internal hours distinction (koi follows user-facing only).
11. **Ship `pending` and `awaiting_identity` both block resubmission** — `ProjectPolicy#ship?` excludes both, so an unverified user with a held submission cannot ship a different project either.
12. **Reviewer claim is global across types** — claiming any review releases the user's claims on all other review types (one active claim at a time).
