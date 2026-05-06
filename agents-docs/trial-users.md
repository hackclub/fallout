# Trial User Architecture

## Overview

Trial users let visitors try the app with just an email before committing to HCA (Hack Club Auth) sign-up. They are isolated by device cookie, cannot access other users' data, and are promoted to full accounts on HCA verification.

## Implementation: Rails STI (Single Table Inheritance)

`TrialUser` is a subclass of `User` in the same `users` table, discriminated by the `type` column.

- **Verified users**: `type = nil` (base class; existing users all have nil)
- **Trial users**: `type = 'TrialUser'`

**CRITICAL**: `User.verified` scope is `where(type: nil)` — NOT `where.not(type: "TrialUser")`. In PostgreSQL, `WHERE type != 'TrialUser'` excludes NULL rows, so users with `type: nil` would be invisible to the scope.

## Schema

**Migration** `add_sti_and_trial_fields_to_users`:
```ruby
add_column :users, :type, :string
add_column :users, :device_token, :string
add_index  :users, :device_token
change_column_null :users, :slack_id, true
change_column_null :users, :hca_id,   true

# Enforces verified user email uniqueness at DB level
add_index :users, :email, unique: true,
  where: "type IS NULL AND discarded_at IS NULL",
  name: "index_users_unique_verified_email"
```

## Key Files

### `app/models/user.rb`
- `scope :verified, -> { where(type: nil) }` — finds verified users only
- `def trial?; false; end` and `def verified?; true; end`
- Conditionals on validations: `validates :slack_id, :hca_id, :roles, presence: true, unless: :trial?`

### `app/models/trial_user.rb`
- Subclass of User; `type = 'TrialUser'`
- `def trial?; true; end` / `def verified?; false; end`
- `validates :device_token, presence: true`
- `validate :email_not_taken_by_verified_user` — rejects emails already taken by an active verified user
- `self.find_or_create_from_device(email:, device_token:)` — finds existing trial user for this device+email pair, or creates new one with defaults (`roles: []`, `avatar: pfp_fallback`, etc.)

### `app/controllers/trial_sessions_controller.rb`
- Action: `create` (POST `/trial_session`)
- `allow_unauthenticated_access only: %i[create]`
- Flow:
  1. Validate email format
  2. If `User.verified.exists?(email: email)` → redirect to `signin_path(login_hint: email)` (prefills HCA login)
  3. Read/generate `device_token` from `cookies.encrypted[:trial_device_token]`
  4. `TrialUser.find_or_create_from_device(email:, device_token:)`
  5. Set encrypted httponly cookie (`trial_device_token`, 1 year, same_site: strict)
  6. Set `session[:user_id] = trial_user.id`
  7. Redirect to `projects_path`

### `app/controllers/auth_controller.rb` — HCA promotion
On successful HCA verification (`create` action):
1. If `current_user&.trial?`:
   a. If `current_user.email != user.email` → redirect to `dashboard_path` with alert ("This email already has an account! Please sign out and log in with HCA.") and `return`
   b. Transfer trial data in a transaction:
      - `current_user.projects.update_all(user_id: user.id)`
      - Only transfer onboarding responses for keys the verified user doesn't have: `current_user.onboarding_responses.where.not(question_key: existing_keys).update_all(user_id: user.id)`
      - `user.update!(onboarded: true) if current_user.onboarded? && !user.onboarded?`
   c. `cookies.delete(:trial_device_token)`
2. Soft purge all trial users with the verified user's email: `TrialUser.kept.where(email: user.email).update_all(discarded_at: Time.current)`
3. `terminate_session` + `session[:user_id] = user.id`

`login_hint` param: `auth#new` passes `params[:login_hint]` to `HcaService.authorize_url` so HCA prefills the email field.

### `app/services/hca_service.rb`
`authorize_url(redirect_uri, state, login_hint: nil)` — appends `login_hint` to OAuth URL if present.

### `app/controllers/concerns/authentication.rb`
Before-action chain (order is critical):
```ruby
before_action :set_current_user
before_action :authenticate_user!          # redirects unauthenticated to root
before_action :redirect_banned_user!
before_action :redirect_discarded_trial_user!   # clears stale trial sessions
before_action :authenticate_verified_user!      # blocks trial users unless opted in
before_action :redirect_to_onboarding!
```

**`authenticate_verified_user!`**: redirects trial users to `signin_path` unless controller has `allow_trial_access`. No-op for unauthenticated visitors (`current_user&.trial?` is nil-safe).

**`redirect_discarded_trial_user!`**: if the trial user's DB record was soft-purged (e.g., another device verified), clears the session and cookie, redirects to `signin_path`.

**`allow_trial_access(only: nil)`**: class method — `skip_before_action :authenticate_verified_user!, only: only`. Must be called explicitly on controllers that trial users can access.

### Controllers with `allow_trial_access`
| Controller | Actions | Reason |
|---|---|---|
| `AuthController` | `new, create, destroy` | Trial users must be able to start/complete HCA verification and sign out |
| `LandingController` | `index` | Trial users redirected to dashboard by `user_signed_in?` |
| `BansController` | `show` | Banned trial users must see ban notice |
| `DashboardController` | `index` | Trial users can view the dashboard |
| `ProjectsController` | all | Trial users create/view/edit projects |
| `MarkdownController` | `show` | Trial users can read docs |
| `OnboardingController` | `show, update` | Trial users complete onboarding |

### `app/controllers/application_controller.rb`
`inertia_share auth:` includes `is_trial: u.trial?` so frontend can check.
`inertia_share trial_session_path: -> { trial_session_path }`

## Frontend

### `app/frontend/types/index.ts`
- `User` interface includes `is_trial: boolean`
- `SharedProps` includes `trial_session_path: string`

### `app/frontend/pages/landing/index.tsx`
- Shows email form for unauthenticated visitors → POSTs to `shared.trial_session_path`
- `LandingController` redirects all signed-in users (`user_signed_in?`) to dashboard — trial users included

### `app/frontend/components/dashboard/SignUpCta.tsx`
- Shown in dashboard only when `shared.auth.user?.is_trial === true`
- "Go verify" button is an `<a href={signInPath}>` linking to HCA sign-in

### `app/frontend/components/FlashMessages.tsx`
- Renders flash alerts/notices
- Added to `dashboard/index.tsx` (fixed top-24, centered) since dashboard uses a custom layout that bypasses `DefaultLayout`

## Rails `skip_after_action` Pattern (IMPORTANT)

Controllers without an `index` action cannot use `only:` with `skip_after_action :verify_authorized` or `skip_after_action :verify_policy_scoped`. Rails 8.1 validates all action names referenced in `only:` clauses in the inherited callback chain — the parent's `after_action :verify_authorized, except: :index` references `:index` which doesn't exist in these controllers.

**Fix**: use unconditional (blanket) skips for non-resource controllers:
```ruby
skip_after_action :verify_authorized   # No authorizable resource on any action
skip_after_action :verify_policy_scoped # No index action; no policy-scoped queries
```
This is safe: `verify_policy_scoped` only runs for index actions anyway; `verify_authorized` is intentionally skipped for non-resource controllers (matching `AuthController` pattern).

**AGENTS.md `only:` rule does NOT apply here** — the rule is about access-control relaxing directives like `allow_trial_access` and `skip_before_action`, not about Pundit verification callbacks.

## Security Invariants

- `User.find_by(hca_id: ...)` never returns a TrialUser (they have nil `hca_id`)
- `User.verified` scope = `where(type: nil)` — correct for PostgreSQL (NOT `where.not(type: 'TrialUser')`)
- `device_token` stored in httponly encrypted cookie only; never in params/strong params
- Trial users have `roles: []` — `admin?` and `staff?` return false
- Multiple trial accounts with the same email on different devices cannot see each other's data (device_token uniqueness)
- DB partial unique index prevents two active verified users sharing an email
- On promotion, only the current device's projects transfer; ALL same-email trial users across all devices are soft-purged

## Promotion Flow

1. Trial user clicks "Go Verify" → HCA OAuth flow (`auth#new` → HCA → `auth#create`)
2. Email mismatch (HCA email ≠ trial email) → error alert, stay signed in as trial user
3. Email match → transfer projects + onboarding responses (skip existing keys) → delete cookie → soft-purge all trial users with that email → sign in as verified user
4. Other devices with stale trial sessions → `redirect_discarded_trial_user!` fires on next request, clears session, redirects to sign-in

## Soft Purge vs Hard Delete

Trial users are soft-purged (`discarded_at`) rather than hard deleted on promotion. This:
- Lets `redirect_discarded_trial_user!` detect stale sessions on other devices
- Preserves data for auditing
- Is reversible
