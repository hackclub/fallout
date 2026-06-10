# Authentication & Authorization Architecture

## How Auth Works (Start Here)

**Full user sign-in:**
```
Landing page → "Sign in with HCA" → HCA OAuth (external) → callback validates CSRF
→ find/create User by hca_id → refresh Slack profile → session[:user_id] = user.id
→ redirect to / → landing redirects logged-in users to /path
```

**Trial user sign-in:**
```
Landing page → enter email → POST /trial_session → validate email
→ if email belongs to verified user: X-Inertia-Location header → HCA with login_hint (prefills email)
→ else: find/create TrialUser by email+device_token → set encrypted cookie (1yr)
→ session[:user_id] = trial_user.id → redirect to return_to or /path
```

**Trial → Full promotion:**
```
Trial user clicks "Go Verify" → HCA OAuth → callback:
→ email mismatch? abort, stay as trial
→ email match? transaction: transfer projects + onboarding responses + ahoy visits
→ delete device cookie → soft-purge ALL same-email trial users (all devices)
→ fire Slack welcome message + channel invite jobs
→ apply pending professor enrollment + claim pending collaboration invites
→ sign in as verified user → redirect to return_to or /
```

**Before-action pipeline (every request):**
```
set_current_user → authenticate_user! → redirect_banned_user!
→ redirect_discarded_trial_user! → authenticate_verified_user! → redirect_to_onboarding!
```

Each step depends on previous steps. Order is critical. Default: everything locked down. Controllers opt in to relaxations with `allow_unauthenticated_access`, `allow_trial_access`, `skip_onboarding_redirect`.

### Where to Look

| Question | File |
|---|---|
| How does the before-action chain work? | `app/controllers/concerns/authentication.rb` |
| How does HCA OAuth work? | `app/controllers/auth_controller.rb`, `app/services/hca_service.rb` |
| Where is the OAuth CSRF state stored? | `app/controllers/concerns/oauth_state.rb` (encrypted cookie, not session) |
| How do trial sessions work? | `app/controllers/trial_sessions_controller.rb` |
| What data do users have? | `app/models/user.rb`, `app/models/trial_user.rb` |
| What's shared with the frontend? | `app/controllers/application_controller.rb` (inertia_share) |
| How does Pundit authorization work? | `app/policies/`, `app/controllers/application_controller.rb` |

---

## Two User Types

The system has two distinct user types stored in one `users` table via Rails STI (Single Table Inheritance):

| | Full User (`User`) | Trial User (`TrialUser`) |
|---|---|---|
| `type` column | `nil` (base class) | `'TrialUser'` |
| Auth method | HCA OAuth | Email + device cookie |
| Scope | Cross-device | Device-cookie-scoped |
| Data access | All their data | Only data created on this device |
| `hca_id` | Required (present) | `nil` |
| `slack_id` | Required | `nil` |
| `roles` | `["user"]` etc. | `[]` |
| `device_token` | `nil` | 64-char hex token |
| `trial?` | `false` | `true` |
| `verified?` | `true` | `false` |
| `admin?`/`staff?` | Possible (via roles) | Always `false` |

---

## Database Schema (`users` table)

```
id                  bigint PK
type                string          -- nil=User, 'TrialUser'=TrialUser
email               string NOT NULL
display_name        string NOT NULL
avatar              string NOT NULL
timezone            string NOT NULL
roles               string[] NOT NULL default=[]
is_banned           boolean NOT NULL default=false
ban_type            string          -- one of BAN_PRIORITY (fallout/hcb/hardware/age/hackatime)
ban_reason          text
onboarded           boolean NOT NULL default=false
hca_id              string          -- nil for trial users
slack_id            string          -- nil for trial users
hca_token           text encrypted  -- nil for trial users
lapse_token         text encrypted
slack_token         text encrypted
device_token        text encrypted (deterministic) -- nil for full users; deterministic so find_by works
discarded_at        datetime        -- soft delete timestamp
is_adult            boolean NOT NULL default=false
verification_status string
has_hca_address     boolean NOT NULL default=false
professor_enrolled_at datetime      -- nil until enrolled in the Professor/mentor program
first_name          string          -- cached from HCA identity for batch sync use
last_name           string          -- cached from HCA identity for batch sync use
country             string          -- ISO2 code from HCA primary address (normalized)
created_at/updated_at datetime
```
(Other columns exist — streak_*, hcb_email, bio, pronouns, etc. — but are unrelated to auth.)

**Indexes:**
- `index_users_on_device_token` — for `find_by(device_token: ...)` (deterministic-encrypted)
- `index_users_on_discarded_at` — for `kept`/`discarded` scope queries
- `index_users_on_hca_id` — `UNIQUE WHERE (hca_id IS NOT NULL)` — enforces one full user per HCA ID
- `index_users_unique_verified_email` — `UNIQUE WHERE (type IS NULL AND discarded_at IS NULL)` — enforces no two active full users share an email at the DB level

**Why partial index instead of regular unique index?**
- Trial users can share email with (discarded) trial users from other devices
- Discarded records must be preserved for audit but shouldn't block re-use
- A regular unique index on `email` would fail when soft-purging trial users and creating a new verified user with the same email

---

## Routes

```
GET    /                         landing#index       (root)
GET    /auth/hca/start           auth#new            (signin)
GET    /auth/hca/callback        auth#create         (hca_callback)
DELETE /auth/signout             auth#destroy        (signout)
POST   /trial_session            trial_sessions#create (trial_session)
POST   /rsvp                     rsvps#create        (rsvp)
GET    /path                     path#index
GET    /sorry                    bans#show           (sorry)
GET    /onboarding               onboarding#show
POST   /onboarding               onboarding#update
```

---

## `app/models/user.rb` — Full User

### STI scope
```ruby
scope :verified, -> { where(type: nil) }
```

**CRITICAL GOTCHA**: Do NOT use `where.not(type: "TrialUser")`. In PostgreSQL, `WHERE type != 'TrialUser'` excludes NULL rows (SQL NULL comparisons return NULL, not TRUE/FALSE). Users with `type: nil` would be invisible. `where(type: nil)` correctly generates `WHERE type IS NULL`.

### Identity methods
```ruby
def trial?;    false; end
def verified?; true;  end
def admin?;    has_role?(:admin); end
def staff?;    admin? || reviewer?; end
```

### Conditional validations
```ruby
validates :slack_id, presence: true, unless: :trial?
validates :hca_id,   presence: true, unless: :trial?
validates :roles,    presence: true, unless: :trial?
validate  :roles_must_be_valid,       unless: :trial?
```
These are `nil`/empty for trial users, so the validations must be conditional. `roles_must_be_valid` rejects any role not in `VALID_ROLES` (`user admin time_auditor requirements_checker pass2_reviewer hcb`).

### `User.exchange_hca_token(code, redirect_uri)` — HCA token exchange
1. `HcaService.exchange_code_for_token` → POST to HCA `/oauth/token` with code + redirect_uri → get `access_token`
2. `HcaService.me(access_token)` → GET `/api/v1/me` with Bearer token → response hash; `identity = hca_response["identity"]`
3. `identity["id"]` = `hca_id`, `identity["primary_email"]` = email
4. `User.find_by(hca_id: hca_id)` — look up by HCA ID first
5. If found: update `hca_token` + `email`, call `apply_identity_cache!(identity)` (syncs verification_status/address/name/country) + `refresh_profile_from_slack`, return user
6. If not found: `create_from_hca(identity, access_token)` (which also calls `apply_identity_cache!`) then `refresh_profile_from_slack`

Note: `find_by(hca_id: ...)` only searches base `User` class (type=nil), never TrialUser (they have nil hca_id).

---

## `app/models/trial_user.rb` — Trial User (STI subclass)

```ruby
class TrialUser < User
  validates :device_token, presence: true
  validate :email_not_taken_by_verified_user

  def trial?;    true;  end
  def verified?; false; end

  def self.find_or_create_from_device(email:, device_token:)
    find_by(email: email, device_token: device_token) ||
      create!(
        email:        email,
        device_token: device_token,
        display_name: email.split("@").first.presence || "Guest",
        avatar:       "/static-assets/pfp_fallback.webp",
        timezone:     "UTC",
        is_banned:    false,
        roles:        []
      )
  end

  private

  def email_not_taken_by_verified_user
    errors.add(:email, "is associated with an existing account") if User.verified.kept.exists?(email: email)
  end
end
```

**`find_or_create_from_device`**: scopes by BOTH email AND device_token. Two users on different devices with the same email get separate TrialUser records and cannot see each other's data. If the same device revisits with the same email, they get the same record back.

**`email_not_taken_by_verified_user`**: model-level guard. Also enforced at controller level and DB level (partial index).

---

## `app/controllers/concerns/authentication.rb` — Before-Action Chain

The `Authentication` concern is included in `ApplicationController`. Every controller in the app inherits this chain:

```ruby
before_action :set_current_user
before_action :authenticate_user!
before_action :redirect_banned_user!
before_action :redirect_discarded_trial_user!
before_action :authenticate_verified_user!
before_action :redirect_to_onboarding!
```

**Order is critical** — each action below depends on the ones above having run.

### `set_current_user`
```ruby
def set_current_user
  @current_user = User.find_by(id: session[:user_id]) if session[:user_id]
end
```
- `User.find_by(id: ...)` uses Rails STI automatically — returns `TrialUser` instance if `type='TrialUser'`, `User` instance if `type=nil`.
- Sets `@current_user = nil` if no session or user not found.

### `authenticate_user!`
```ruby
def authenticate_user!
  unless current_user
    redirect_to root_path, alert: "You need to be logged in to see this!"
  end
end
```
Blocks unauthenticated access. Skipped with `allow_unauthenticated_access only: %i[action]`.

### `redirect_banned_user!`
```ruby
def redirect_banned_user!
  redirect_to sorry_path if current_user&.is_banned?
end
```
Sends banned users to `/sorry`. Skipped on `bans#show` itself (that's the destination) and `auth#destroy` (banned users must be able to sign out).

### `redirect_discarded_trial_user!`
```ruby
def redirect_discarded_trial_user!
  return unless current_user&.discarded?

  is_trial = current_user.trial?
  email = current_user.email
  @current_user = nil
  terminate_session

  if is_trial
    cookies.delete(:trial_device_token)
    redirect_to signin_path(login_hint: email), notice: "Your trial session has expired. Please sign in to continue."
  else
    redirect_to root_path, notice: "Your account is no longer active."
  end
end
```
Catches **stale trial sessions**: when Device B's trial user is soft-purged because Device A verified, Device B's session still has the now-discarded trial user's ID. This before-action detects that, clears the session and device cookie, and redirects to HCA sign-in.

Must run **before** `authenticate_verified_user!` — if it redirected first, the stale trial user would get the generic "verify your account" error instead of the informative expiry message.

### `authenticate_verified_user!`
```ruby
def authenticate_verified_user!
  redirect_to signin_path(login_hint: current_user.email), alert: "Please verify your account to access this." if current_user&.trial?
end
```
The **default-deny gate for trial users**. Blocks trial users from every action unless the controller explicitly opts in with `allow_trial_access`.

`current_user&.trial?` is nil-safe: unauthenticated visitors have `current_user = nil`, so `nil&.trial?` returns `nil` (falsy) — unauthenticated users are unaffected.

### `redirect_to_onboarding!`
```ruby
def redirect_to_onboarding!
  redirect_to onboarding_path if current_user&.needs_onboarding?
end
```
Sends users who haven't completed onboarding to `/onboarding`. Skipped on `onboarding#show` and `onboarding#update` (the destination itself).

---

## Class-Level Access Control Methods

These are defined on `Authentication` as `class_methods` and called at the class level in controllers:

### `allow_unauthenticated_access(only:)`
```ruby
def self.allow_unauthenticated_access(only: nil)
  skip_before_action :authenticate_user!, only: only
end
```
Skips the `authenticate_user!` check. Does NOT affect `authenticate_verified_user!`. A nil/unauthenticated `current_user` doesn't trigger `authenticate_verified_user!` (nil-safe).

### `allow_trial_access(only:)`
```ruby
def self.allow_trial_access(only: nil)
  skip_before_action :authenticate_verified_user!, only: only
end
```
Allows trial users into specific actions. Must be called on any controller that trial users need to access.

### `skip_onboarding_redirect(only:)`
```ruby
def self.skip_onboarding_redirect(only: nil)
  skip_before_action :redirect_to_onboarding!, only: only
end
```

### `only:` vs no `only:` — CRITICAL Rails 8.1 Behavior

**The problem**: Rails 8.1 validates ALL action names referenced in `only:` or `except:` clauses across the entire inherited callback chain. `ApplicationController` defines:
```ruby
after_action :verify_authorized, except: :index
after_action :verify_policy_scoped, only: :index
```
Both reference `:index`. Any subcontroller WITHOUT an `index` action triggers `AbstractController::ActionNotFound` if it tries to use `only:` or `except:` on `skip_after_action`.

**The fix**: Controllers without an `index` action use **unconditional** (blanket) skips:
```ruby
skip_after_action :verify_authorized   # comment: No authorizable resource on any action
skip_after_action :verify_policy_scoped # comment: No index action; no policy-scoped queries
```

Controllers WITH an `index` action (e.g. `ProjectsController`, `PathController`) can safely use `only:`:
```ruby
skip_after_action :verify_authorized, only: %i[index]
```

This is safe: `verify_policy_scoped` only runs for `index` anyway; blanket-skipping `verify_authorized` on non-resource controllers is the established convention (same as `AuthController`).

---

## `allow_trial_access` — Which Controllers Need It

| Controller | Actions | Reason |
|---|---|---|
| `AuthController` | `new, create, destroy` | **Critical**: trial users must be able to start HCA verification (`new`), complete it (`create`), and sign out (`destroy`). Without this, `authenticate_verified_user!` blocks them before they can verify. |
| `LandingController` | `index` | Redirects `user_signed_in?` to path. Without `allow_trial_access`, `authenticate_verified_user!` fires first and sends trial users to HCA sign-in instead. |
| `BansController` | `show` | Banned trial users must see the ban notice. Without this: `redirect_banned_user!` sends them to `/sorry`, then `authenticate_verified_user!` kicks them out of `/sorry` → redirect loop. |
| `PathController` | `index` | Trial users view their path (main experience page). |
| `ProjectsController` | `index show new create edit update destroy onboarding export_journal` | Trial users create/view/edit their single project and export its journal. (`show` is also `allow_unauthenticated_access` — listed project pages are public from Explore/the public API.) |
| `JournalEntriesController` | `preview` | Trial users can preview journal markdown (but cannot create entries — unverified emails prevent abuse). |
| `YouTubeVideosController` | `lookup` | Trial users can look up video metadata during journal creation. |
| `MarkdownController` | `show` | Trial users can read docs. Also has `allow_unauthenticated_access` but that only skips `authenticate_user!`, not `authenticate_verified_user!`. |
| `OnboardingController` | `show, update` | Both trial and full users complete onboarding. |

**Notable omission**: `RsvpsController` has `allow_unauthenticated_access` but **not** `allow_trial_access`. This means logged-in trial users are blocked from submitting RSVPs by `authenticate_verified_user!`. Only unauthenticated visitors (no session) can submit. This appears intentional — RSVPs are for the landing page email form, and trial users have already entered the platform.

**Why `allow_unauthenticated_access` is not sufficient for public endpoints that trial users visit**: `allow_unauthenticated_access` only skips `authenticate_user!`. If a trial user is signed in, `authenticate_verified_user!` still fires and redirects them to HCA sign-in. Public endpoints that need to be accessible to trial users need BOTH:
- `allow_unauthenticated_access` (for truly unauthenticated visitors)
- `allow_trial_access` (for trial users who are signed in)

---

## HCA OAuth Flow — `auth_controller.rb`

`AuthController` includes the `OauthState` concern (`app/controllers/concerns/oauth_state.rb`) for storing the CSRF state in a dedicated encrypted cookie rather than the session.

### `GET /auth/hca/start` → `auth#new`

```ruby
def new
  state = SecureRandom.hex(24)
  # Store OAuth state in a dedicated cookie (not the session) so it survives
  # cross-site redirects and reset_session. Keep the last 4 so concurrent tabs
  # don't overwrite each other.
  existing = Array(cookies.encrypted[:oauth_state]).last(4)
  set_oauth_cookie(:oauth_state, existing + [ state ])
  redirect_to HcaService.authorize_url(hca_callback_url, state, login_hint: params[:login_hint]), allow_other_host: true
end
```

1. Generate 48-char CSRF state token, append it to the `oauth_state` encrypted cookie (keeps up to the last 4 states so concurrent tabs don't clobber each other; cookie expires in 10 min, `same_site: :lax`)
2. Build HCA OAuth URL with client_id, redirect_uri, scopes, state, and optional `login_hint`
3. Redirect to HCA (external host, hence `allow_other_host: true`)

**Why a cookie instead of `session[:state]`**: the session cookie can be dropped during cross-site OAuth redirects under strict browser privacy settings, and `terminate_session`/`reset_session` would wipe it. The `oauth_state` cookie survives both. Multiple states are stored so a user with several tabs mid-flow doesn't fail CSRF.

**`login_hint`**: If `params[:login_hint]` is present, appended to the HCA authorize URL. HCA uses this to prefill the email field. Set when `TrialSessionsController` detects the entered email belongs to a verified user.

### `GET /auth/hca/callback` → `auth#create`

```ruby
def create
  # 1. CSRF validation: state must be one of the stored oauth_state cookie values
  valid_states = Array(cookies.encrypted[:oauth_state])
  delete_oauth_cookie(:oauth_state)
  unless valid_states.include?(params[:state])
    # ErrorReporter.capture_message(...), redirect_to root_path, alert: "Authentication failed due to CSRF token mismatch"
    return
  end

  begin
    # 2. Exchange code for user
    user = User.exchange_hca_token(params[:code], hca_callback_url)

    # 3. Trial promotion (if applicable)
    trial_conversion = current_user&.trial?

    if trial_conversion
      if current_user.email != user.email
        redirect_to path_path, alert: "This email already has an account! Please sign out and log in with HCA."
        return
      end

      ActiveRecord::Base.transaction do
        current_user.projects.update_all(user_id: user.id)
        existing_keys = user.onboarding_responses.pluck(:question_key)
        current_user.onboarding_responses.where.not(question_key: existing_keys).update_all(user_id: user.id)
        current_user.ahoy_visits.update_all(user_id: user.id) # Transfer attribution data
        user.update!(onboarded: true) if current_user.onboarded? && !user.onboarded?
      end
      cookies.delete(:trial_device_token)
    end

    # 4. Soft-purge all trial users with this email
    TrialUser.kept.where(email: user.email).update_all(discarded_at: Time.current)

    # 5. Slack welcome for trial conversions
    if trial_conversion && user.slack_id.present?
      SlackMsgJob.perform_later(user.slack_id, welcome_message)
      SlackChannelInviteJob.perform_later(user.slack_id, User::SLACK_WELCOME_CHANNELS)
    end

    # 6. Apply pending professor enrollment (intent stored in onboarding_responses,
    #    applied here once HCA promotion grants a slack_id). Non-blocking.
    # ...

    # 7. Claim any pending collaboration invites matching this email
    PendingCollaborationInvite.claim_all_for_email!(user.email, user)

    # 8. Sign in as verified user
    terminate_session
    session[:user_id] = user.id
    redirect_to_return_to_or(root_path, notice: "Welcome back, #{user.display_name}!")
  rescue StandardError => e
    ErrorReporter.capture_exception(e)
    redirect_to root_path, alert: "Authentication failed. Please try again."
  end
end
```

**CSRF validation**: `params[:state]` must match one of the values in the `oauth_state` cookie (multiple states for concurrent tabs). The cookie is deleted before the check (single-use). A mismatch is logged via `ErrorReporter.capture_message` with a "CSRF validation failed" message and redirects to `root_path` with a CSRF-mismatch alert.

**Pending professor enrollment**: if the trial user signed up for a mentor during onboarding (intent stored in `onboarding_responses` under `professor_enrollment`), it's applied here once they have a `slack_id` via `ProfessorService.manual_add`. Non-blocking — a failure leaves `professor_enrolled_at` nil and the auth flow continues.

**Pending collaboration invites**: `PendingCollaborationInvite.claim_all_for_email!` attaches any invites that were sent to this user's email before they had an account.

**Post-auth redirect**: uses `redirect_to_return_to_or(root_path, ...)` — honors `session[:return_to]` if set (preserved across `terminate_session`), otherwise falls back to `root_path`.

**Email mismatch guard**: If the trial user's email doesn't match the HCA account's email, abort. This prevents cross-contamination where a user accidentally verifies with the wrong HCA account.

**Onboarding response transfer**: Only transfer responses for `question_key` values the verified user doesn't already have. `update_all(user_id: user.id)` on the full set would throw `PG::UniqueViolation` if the verified user has already answered some questions.

**Soft purge scope**: `TrialUser.kept.where(email: user.email)` — purges ALL active trial users with that email across ALL devices, not just the current one. Uses `update_all(discarded_at: Time.current)` instead of Discard's `discard_all` to stay efficient.

### `DELETE /auth/signout` → `auth#destroy`

```ruby
def destroy
  terminate_session
  redirect_to root_path, notice: "Signed out successfully. Cya!"
end
```

`terminate_session` calls `reset_session` but preserves `session[:return_to]` across the reset (so post-auth redirects survive the OAuth flow). Does NOT delete the `trial_device_token` cookie — that persists so the user can resume their trial session if they re-enter the same email.

---

## Trial Session Flow — `trial_sessions_controller.rb`

### `POST /trial_session` → `trial_sessions#create`

```ruby
def create
  redirect_to path_path and return if user_signed_in? && !current_user.trial?

  email = params[:email].to_s.strip.downcase

  # 1. Validate email format
  unless email.match?(URI::MailTo::EMAIL_REGEXP)
    redirect_to root_path, alert: "Please enter a valid email."
    return
  end

  # 2. Redirect known verified users to HCA with email prefilled
  if User.verified.exists?(email: email)
    # Inertia XHR can't follow external redirects (CORS). Use X-Inertia-Location
    # so the client does window.location.href = url, letting the browser navigate natively.
    response.headers["X-Inertia-Location"] = signin_path(login_hint: email)
    head :conflict
    return
  end

  # 3. Find or create trial user for this device+email
  device_token = cookies.encrypted[:trial_device_token] || SecureRandom.hex(32)

  begin
    trial_user = TrialUser.find_or_create_from_device(email: email, device_token: device_token)
  rescue ActiveRecord::RecordInvalid
    # TOCTOU race: a verified user was created between the exists? check and create!
    response.headers["X-Inertia-Location"] = signin_path(login_hint: email)
    head :conflict
    return
  end

  # 4. Set/refresh device cookie
  cookies.encrypted[:trial_device_token] = {
    value:     device_token,
    httponly:  true,
    secure:    Rails.env.production?,
    same_site: :strict,
    expires:   1.year
  }

  # 5. Sign in as trial user
  session[:user_id] = trial_user.id
  redirect_to_return_to_or(path_path)
end
```

**Verified user redirect**: Uses `X-Inertia-Location` header (not a standard redirect) because Inertia XHR requests can't follow cross-origin redirects due to CORS. The client reads this header and does `window.location.href = url`. `login_hint: email` prefills HCA's email field.

**TOCTOU race condition**: Between `User.verified.exists?(email:)` and `TrialUser.create!`, another request could create a verified user with the same email. The `RecordInvalid` rescue catches the model-level `email_not_taken_by_verified_user` validation failure.

**Device token lifecycle**:
- First visit: `SecureRandom.hex(32)` generates a fresh 64-char hex token
- Return visit (same browser): cookie already set, token reused → same TrialUser record returned by `find_or_create_from_device`
- Different browser/device: no cookie → new token → separate TrialUser record even with same email

**Cookie security**: `httponly: true` (JS cannot read), `secure: true` in production (HTTPS only), `same_site: :strict` (no cross-site requests). Encrypted by Rails cookie encryption.

**`allow_unauthenticated_access only: %i[create]`**: Skips the inherited `authenticate_user!` check so unauthenticated visitors can reach this action. `skip_onboarding_redirect only: %i[create]` is also required — without it, a signed-in user who hasn't completed onboarding would be redirected away before the action body runs.

---

## Session Management

Sessions are standard Rails cookie-backed sessions:
- `session[:user_id]` — ID of the signed-in user (full or trial)
- `session[:return_to]` — optional post-auth redirect target; preserved across `terminate_session` and consumed by `redirect_to_return_to_or`
- `set_current_user` → `User.find_by(id: session[:user_id])` → Rails STI returns correct subclass
- `terminate_session` → `reset_session` (regenerates session ID and clears all session data, but re-stores `return_to`)

OAuth CSRF `state` is NOT stored in the session — it lives in a dedicated encrypted `oauth_state` cookie (see `OauthState` concern) so it survives `reset_session` and cross-site redirects that can drop session cookies.

There is no JWT, no server-side session store — purely cookie-based Rails sessions.

---

## Pundit Authorization

Every controller action must satisfy both Pundit checks by default:

```ruby
after_action :verify_authorized, except: :index   # every action except index called authorize(resource)
after_action :verify_policy_scoped, only: :index   # index actions called policy_scope(collection)
```

Controllers that don't work with Pundit resources skip these:
```ruby
skip_after_action :verify_authorized   # (no only: — see Rails 8.1 gotcha above)
skip_after_action :verify_policy_scoped
```

`rescue_from Pundit::NotAuthorizedError` in `ApplicationController` handles unauthorized access with a flash alert + redirect back.

---

## `app/services/hca_service.rb`

### `authorize_url(redirect_uri, state, login_hint: nil)`
Builds the HCA OAuth authorize URL. Appends `login_hint` to the query string if present (HCA uses it to prefill the email field).

Production host: `https://auth.hackclub.com`
Development host: `https://hca.dinosaurbbq.org`

### `exchange_code_for_token(code, redirect_uri)`
POST to `/oauth/token` with `grant_type: "authorization_code"`. Returns parsed JSON or nil on failure.

### `me(access_token)`
GET `/api/v1/me` with Bearer authorization. Returns the parsed response hash (the identity is nested under the `"identity"` key, containing `id`, `primary_email`, `first_name`, `last_name`, `slack_id`, `profile_picture`, `verification_status`, `addresses`, `birthday`). Raises `HcaService::InvalidToken` on 401/403 so callers can clear a dead stored token; returns nil on transient network errors.

### `identity(access_token)`
Convenience wrapper: calls `me` and returns the inner `"identity"` hash (or `{}`). Used by the periodic identity refresh job.

### `verify_portal_url(return_to:)` / `address_portal_url(return_to:)`
Build HCA portal URLs (`/portal/verify`, `/portal/address`) with a `return_to` query param. Powers the identity-gate CTAs shared to the frontend.

---

## Inertia Shared Props — Frontend Auth State

`ApplicationController` shares these with every page via `inertia_share`:

```ruby
inertia_share auth: -> {
  {
    user: current_user&.then { |u|
      {
        id:                             u.id,
        display_name:                   u.display_name,
        avatar:                         u.avatar,
        roles:                          u.roles,
        is_admin:                       u.admin?,
        is_staff:                       u.staff?,
        is_banned:                      u.is_banned,
        ban_type:                       u.ban_type,
        is_trial:                       u.trial?,
        is_onboarded:                   u.onboarded?,
        professor_enrolled:             u.professor_enrolled?,
        professor_recently_enrolled:    u.professor_enrolled? && u.professor_enrolled_at > 24.hours.ago,
        professor_enrollment_eligible:  u.professor_enrollment_eligible? && !u.professor_enrolled?
      }
    }
  }
}
inertia_share flash:                -> { flash.to_hash }
inertia_share sign_in_path:         -> { signin_path(login_hint: current_user&.trial? ? current_user.email : nil) }
inertia_share sign_out_path:        -> { signout_path }
inertia_share trial_session_path:   -> { trial_session_path }
inertia_share rsvp_path:            -> { rsvp_path }
inertia_share features:             -> { ... }  # per-user Flipper flags (empty {} for trial/unauth users)
inertia_share streak_freezes:       -> { ... }  # 0 for trial/unauth users
inertia_share identity_gate:        -> { ... }  # nil for trial/unauth users; { state, verify_url, address_url }
inertia_share show_feedback_banner: -> { ... }  # true only for full users with an email
```

**Note**: `email` is intentionally NOT included in the shared `auth.user` props — it's PII. Frontend code that needs it must obtain it from an admin-only/authorized page prop.

**`has_unread_mail` and `current_streak` are scoped to `PathController` only** (declared via `inertia_share` inside `PathController`, not `ApplicationController`) — they're only consumed by the path page header, so they aren't shared on every other authenticated request (saves 2 queries/page).

**IMPORTANT**: `sign_in_path`, `sign_out_path`, `trial_session_path`, `rsvp_path` are **top-level** shared props, NOT nested under `auth`. Access as `shared.sign_in_path`, not `shared.auth.sign_in_path`.

**`sign_in_path` is dynamic**: for trial users, it includes `login_hint: current_user.email` so HCA prefills their email field. For full users or unauthenticated visitors, no hint.

**`features`**: returns empty `{}` for trial/unauthenticated users (feature flags are full-user only). Otherwise based on Flipper: `{ collaborators: bool, shop: bool, grant_fulfillment: true, hcb_top_ups: bool }`.

**`identity_gate`**: `nil` for trial/unauthenticated users (no HCA account to link). Otherwise `{ state: identity_gate_state, verify_url:, address_url: }` driving the AnnouncementsBar identity card.

**Security note**: All attributes passed to the frontend are visible in browser devtools. `hca_token`, `lapse_token`, `slack_token`, and `email` are never exposed in shared props.

### TypeScript types (`app/frontend/types/index.ts`)
```ts
interface SharedProps {
  auth: { user: User | null }         // just user, nothing else nested
  flash: FlashData                    // Record<string, string>
  features: Features                  // { collaborators?, shop?, grant_fulfillment: true }
  sign_in_path: string                // top-level, NOT under auth
  sign_out_path: string
  trial_session_path: string
  rsvp_path: string
  has_unread_mail: boolean            // only present on the path page
  current_streak: number              // only present on the path page
  unsubmitted_hours: number | null
  streak_freezes: number
  identity_gate: IdentityGate | null
  show_feedback_banner: boolean
  errors: Record<string, string[]>
  [key: string]: unknown
}

interface User {
  id: number
  display_name: string
  avatar: string
  roles: string[]
  is_admin: boolean
  is_staff: boolean
  is_banned: boolean
  ban_type: BanType | null
  is_trial: boolean
  is_onboarded: boolean
  professor_enrolled: boolean
  professor_recently_enrolled: boolean
  professor_enrollment_eligible: boolean
}
```

### Frontend usage pattern
```tsx
const shared = usePage<SharedProps>().props

// Check trial status
if (shared.auth.user?.is_trial) { ... }

// Sign out
router.delete(shared.sign_out_path)

// Show verify CTA only for trial users
{shared.auth.user?.is_trial && <SignUpCta signInPath={shared.sign_in_path} />}
```

---

## Admin / Staff Access

Admin and staff routes are protected at the routing layer via route constraints:

```ruby
constraints Constraints::StaffConstraint.new do
  namespace :admin do
    # ... staff-accessible review queues
  end
end

constraints Constraints::AdminConstraint.new do
  mount MissionControl::Jobs::Engine, at: "/jobs"  # admins only
  namespace :admin do
    # ... admin-only resources (projects, users, etc.)
  end
end
```
(There is also a small admin block intentionally OUTSIDE the `StaffConstraint` for reviewer-specific routes — see `config/routes.rb`.)

`Constraints::StaffConstraint` and `Constraints::AdminConstraint` (`lib/constraints/`) look up `User.find_by(id: request.session[:user_id])` and check `user&.staff?` / `user&.admin?`. Trial users have `roles: []`, so both return `false` — they cannot reach any admin routes.

Admin controllers inherit from `Admin::ApplicationController`, which enforces `require_staff!` (and `require_admin!` where needed) as a before-action too (defense in depth).

---

## Soft Delete / Discard

The in-house `Discardable` concern (`app/models/concerns/discardable.rb`, NOT the `discard` gem) adds:
- relies on the `discarded_at` timestamp column
- `discard` / `undiscard` / `discarded?` instance methods
- `kept` scope (`WHERE discarded_at IS NULL`)
- `discarded` scope (`WHERE discarded_at IS NOT NULL`)

Trial users are soft-purged (not hard-deleted) on promotion so that:
1. `redirect_discarded_trial_user!` can detect stale sessions on other devices
2. Data is preserved for auditing/support
3. The operation is reversible if triggered accidentally

Hard deleting trial users would cause `set_current_user` to silently return `nil` for other devices, which would then hit `authenticate_user!` with a generic "not logged in" error instead of the informative "trial expired" message.

---

## Complete Sign-In Flow (Full User)

```
1. User clicks "Sign in with HCA"
   → GET /auth/hca/start (auth#new)
   → append random CSRF token to oauth_state encrypted cookie
   → redirect to https://auth.hackclub.com/oauth/authorize?...

2. User authenticates on HCA
   → HCA redirects to GET /auth/hca/callback?code=xxx&state=yyy

3. auth#create:
   → validate state ∈ oauth_state cookie (then delete cookie)
   → User.exchange_hca_token(code, redirect_uri)
     → POST /oauth/token → access_token
     → GET /api/v1/me → identity
     → find or create User by hca_id
     → apply_identity_cache! + refresh Slack profile
   → (if trial user: transfer data, delete cookie)
   → soft-purge same-email trial users
   → apply pending professor enrollment + claim pending collaboration invites
   → terminate_session; session[:user_id] = user.id
   → redirect to return_to or / (landing) → landing redirects logged-in users to /path
```

## Complete Sign-In Flow (Trial User)

```
1. User enters email on landing page
   → POST /trial_session (trial_sessions#create)
   → validate email format
   → if verified user exists with email: X-Inertia-Location header → HCA with login_hint
   → else: find/create TrialUser by email+device_token (rescue TOCTOU race)
   → set encrypted trial_device_token cookie (1 year)
   → session[:user_id] = trial_user.id
   → redirect to return_to or /path
```

## Trial Promotion Flow

```
1. Trial user (email A) clicks "Go Verify" → auth#new → HCA
2. HCA returns account with email B (mismatch):
   → redirect to /path, alert: "This email already has an account! ..."
   → trial session remains active
3. HCA returns account with email A (match):
   → transaction:
     - transfer projects: UPDATE projects SET user_id=verified_id WHERE user_id=trial_id
     - transfer onboarding responses (skip keys already answered by verified user)
     - transfer ahoy visits (preserves attribution like first_ref)
     - mark verified user onboarded if trial was onboarded
   → cookies.delete(:trial_device_token)
   → soft-purge ALL TrialUser.kept.where(email: A)
   → SlackMsgJob + SlackChannelInviteJob (welcome message + channel invites)
   → apply pending professor enrollment (if intent recorded + now has slack_id)
   → PendingCollaborationInvite.claim_all_for_email!
   → terminate_session; session[:user_id] = verified_user.id
   → redirect to return_to or /
4. Other devices with same email A trial session:
   → next request: redirect_discarded_trial_user! fires
   → session cleared, cookie deleted, redirect to /auth/hca/start?login_hint=email
```

---

## Key Invariants

1. **`User.verified` uses `where(type: nil)`** — NOT `where.not(type: "TrialUser")` (PostgreSQL NULL exclusion gotcha)
2. **trial users have `roles: []`** — `admin?` and `staff?` always false; no role-based privilege escalation
3. **`device_token` never in params** — only read from `cookies.encrypted[]`; strong params don't include it
4. **Promotion transfers only current device's data** — content from the verifying device transfers; other devices' trial content does not
5. **Email is downcased before storage** — `TrialSessionsController` does `.strip.downcase`; HCA emails should already be normalized
6. **Rate limiting on auth endpoints** — primarily at the Rack::Attack layer (`config/initializers/rack_attack.rb`, Redis-backed, consistent across Puma workers): `POST /trial_session` 10/3min per IP + 5/hour per email; `GET /auth/hca/start` 10/min per IP; `GET /auth/hca/callback` 20/min per IP; `DELETE /auth/signout` 10/min per IP; `POST /rsvp` 5/min per IP. `auth#create` additionally has a Rails-native `rate_limit to: 10, within: 3.minutes`.
7. **CSRF on HCA OAuth** — `state` stored in the `oauth_state` encrypted cookie (not the session) and round-trip verified; mismatch logged to ErrorReporter and rejected
