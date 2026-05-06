---
name: Cross-Cutting Data Patterns
description: Soft-delete (Discardable), Pundit authorization patterns, Flipper feature flags, PaperTrail auditing, access control conventions
type: project
---

# Cross-Cutting Patterns

Patterns that span the entire codebase. Understanding these is prerequisite to working on any feature.

**Critical gotchas** (the "this will break if you get it wrong" items):
- `User.verified` scope must use `where(type: nil)` — see §7 below
- Controllers without `index` must use blanket `skip_after_action` — see §2 below
- Relaxing directives use `only:`, restricting use `except:` — see §2 below
- All shared props are visible in browser devtools — never include secrets — see §6 below

## 1. Soft-Delete (Discardable)

**Concern**: `app/models/concerns/discardable.rb`

Adds `discarded_at` timestamp column to models. Used by: User, Project, JournalEntry, Collaborator, CollaborationInvite.

**API:**
- `record.discard` — sets `discarded_at = Time.current`
- `record.undiscard` — clears `discarded_at`
- `record.discarded?` — check
- `Model.kept` scope — `WHERE discarded_at IS NULL`
- `Model.discarded` scope — `WHERE discarded_at IS NOT NULL`

**Cascade behavior is explicit, not automatic:**
- `Project#discard` → transaction: soft-deletes collaborators, invites, journal entries (see [arch-projects-journals.md](arch-projects-journals.md))
- `JournalEntry#discard` → **destroys** Recording links (hard-delete the join, preserving underlying media for reuse by future journal entries)
- `User` discard → soft-delete only (no cascade)
- Trial user promotion → `TrialUser.kept.where(email:).update_all(discarded_at: Time.current)` — bulk soft-purge across all devices. This invalidates trial sessions on other devices, which is detected by `redirect_discarded_trial_user!` in the before-action chain (see [auth-architecture.md](auth-architecture.md))

**Why soft-delete**: data must be preservable and reversible per AGENTS.md. PII may need true deletion; other data needs soft-deletion for auditability. The developer decides each time.

## 2. Pundit Authorization

### Default Configuration — `app/controllers/application_controller.rb`

```ruby
after_action :verify_authorized, except: :index
after_action :verify_policy_scoped, only: :index
rescue_from Pundit::NotAuthorizedError, with: :user_not_authorized
```

Every action must call `authorize(resource)` or `policy_scope(collection)`. If neither is called, Pundit raises after the action completes (fail-closed).

### Base Policy — `app/policies/application_policy.rb`

**Default-deny**: all actions return `false`. Subclasses override only what they permit.

**Shared helpers:**
- `admin?` — `user&.admin?`
- `owner?` — `record.user == user`
- `collaborators_enabled?` — `Flipper.enabled?(:collaborators, user)`

### Rails 8.1 Callback Gotcha

`ApplicationController` defines `after_action :verify_authorized, except: :index`. Rails 8.1 validates that `:index` exists on the controller. Controllers without `index` get `AbstractController::ActionNotFound`.

**Fix**: Use blanket `skip_after_action` (no `only:` or `except:`):

```ruby
skip_after_action :verify_authorized   # No authorizable resource
skip_after_action :verify_policy_scoped # No index action
```

Still call `authorize`/`skip_authorization` in each action explicitly.

### `only:` vs `except:` Rule

The rule exists because **a forgotten new action must default to MORE restriction, not less**:

| Directive type | Use | Rationale |
|---|---|---|
| **Relaxing** (`skip_after_action :verify_authorized`, `allow_unauthenticated_access`, `allow_trial_access`, `skip_onboarding_redirect`) | `only:` | Forgotten action keeps default restriction |
| **Restricting** (`before_action :require_admin!`) | `except:` or blanket | Forgotten action still gets the check |

Never `except:` on relaxing. Never `only:` on restricting. Every access directive must have an inline comment explaining why.

### Policy Summary

| Model | Who can read | Who can write | Special |
|---|---|---|---|
| User | Admin (all), self (own) | Self (own), admin | `UserPolicy` — admins see all users, regular users see/update only themselves |
| Project | Admin, owner, collaborator (flagged), listed (public) | Admin, owner | Trial: max 1 project. `manage_collaborators?` requires verified + flag |
| JournalEntry | Admin, owner, collaborator (flagged) | Admin, owner, collaborator (flagged + verified) | Author must own/collaborate on project |
| Ship | Admin, staff reviewer | Admin, reviewer, assigned reviewer | Create: verified only. Frozen fields on submission |
| Collaborator | Implied by parent policies | Via invite flow | **No dedicated policy class** — access managed through parent (Project/JournalEntry) policies |
| CollaborationInvite | Admin, inviter, invitee | Inviter (create/revoke), invitee (accept/decline) | Flag-gated, must be pending for accept/decline/revoke |
| Critter | Owner only | Owner only | — |
| MailMessage | Visible per filter scope | Admin only | Has user-specific read/dismiss tracking via MailInteraction |
| Recording | Implied by journal entry | Any authenticated user (create) | `RecordingPolicy` — create gated by journal entry authorization |
| OnboardingResponse | Self | Self (create/update) | `OnboardingResponsePolicy` — any user can create, owner can update |
| LapseTimelapse | Admin, owner | — | Create: any authenticated user |
| LookoutTimelapse | Admin, owner | Any authenticated user | — |
| YouTubeVideo | — | — | `YouTubeVideoPolicy` — custom `lookup?` action, any authenticated user |

## 3. Flipper Feature Flags

**Adapter**: ActiveRecord (stores in `flipper_features` and `flipper_gates` tables)
**Config**: `config/initializers/flipper.rb`
**User integration**: `include Flipper::Identifier` in User model
**Admin UI**: `/flipper` (admin-only route constraint)

**Active flags:**

| Flag | Controls | Checked in |
|---|---|---|
| `:collaborators` | Project/journal collaboration features | Policies, controllers, shared props |
| `:"03_18_collapse"` | Lookout video recording | Journal entry form, shared as `features.lookout` |

**Usage pattern:**
```ruby
# In policies
def collaborators_enabled?
  user.present? && Flipper.enabled?(:collaborators, user)
end

# In controllers (shared to frontend)
inertia_share features: -> {
  {
    collaborators: Flipper.enabled?(:collaborators, current_user),
    lookout: Flipper.enabled?(:"03_18_collapse", current_user)
  }
}
```

## 4. PaperTrail Auditing

**Models with `has_paper_trail`**: User, Project, JournalEntry, Ship, Collaborator, CollaborationInvite, MailMessage

Stores all changes in `versions` table. Particularly important for Ships (review workflow transparency — frozen fields + status changes + reviewer assignment all tracked) and MailMessages (notification audit trail).

## 5. Authentication Before-Action Chain

Defined in `app/controllers/concerns/authentication.rb`, included in `ApplicationController`. **Order is critical** — each step depends on previous steps having run.

```
set_current_user          → Load user from session[:user_id] (STI-aware)
authenticate_user!        → Redirect unauthenticated to root
redirect_banned_user!     → Redirect banned to /sorry
redirect_discarded_trial_user!  → Clear stale trial sessions (must precede verified check)
authenticate_verified_user!     → Block trial users (default-deny)
redirect_to_onboarding!         → Force onboarding completion
```

**Skip methods** (class-level, always use `only:`):
- `allow_unauthenticated_access only: %i[...]` — skips `authenticate_user!`
- `allow_trial_access only: %i[...]` — skips `authenticate_verified_user!`
- `skip_onboarding_redirect only: %i[...]` — skips `redirect_to_onboarding!`

**Common pitfall**: `allow_unauthenticated_access` does NOT skip `authenticate_verified_user!`. Public endpoints that signed-in trial users visit need BOTH `allow_unauthenticated_access` AND `allow_trial_access`.

## 6. Inertia Shared Props & Security

`ApplicationController` shares auth state, flash, feature flags, and paths with every page via `inertia_share`.

**All shared props are visible in browser devtools.** Never include:
- `hca_token`, `lapse_token` (server-only encrypted fields)
- Internal IDs that could enable enumeration
- Any data the user shouldn't see

## 7. User Types (STI)

| | Full User (`User`) | Trial User (`TrialUser`) |
|---|---|---|
| `type` column | `nil` | `'TrialUser'` |
| Auth | HCA OAuth | Email + device cookie |
| Scope | Cross-device | Device-scoped |
| `trial?` / `verified?` | false / true | true / false |
| `admin?` / `staff?` | Possible (via roles) | Always false |
| Can earn critters | Yes | No |
| Can collaborate | Yes (if flag enabled) | No |
| Can create ships | Yes | No |
| Project limit | Unlimited | 1 |

**Verified scope**: `User.verified` = `where(type: nil)`. See auth-architecture.md for the PostgreSQL NULL gotcha.

## 8. Encryption

Rails Active Record encryption enabled for sensitive fields:
- `user.hca_token` — HCA OAuth access token
- `user.lapse_token` — Lapse OAuth token
- `user.device_token` — deterministic encryption (for `find_by` lookups)
- `ship.frozen_hca_data` — user identity snapshot at submission

Session cookie: standard Rails cookie encryption (`_fallout_session`, 3-month expiry).
Trial device token: `cookies.encrypted[:trial_device_token]` (httponly, secure, strict, 1-year expiry).

## 9. Route Constraints

Admin routes protected at routing layer (defense in depth on top of Pundit):

```ruby
constraints AdminConstraint.new do   # user.admin?
  mount Flipper::UI, MissionControl::Jobs
  namespace :admin { resources :projects, :users }
end

constraints StaffConstraint.new do   # user.staff? (admin || reviewer)
  namespace :admin { resources :ships }
end
```

Constraints check `request.session[:user_id]` → `User.find_by` → role check. Trial users (`roles: []`) always fail.
