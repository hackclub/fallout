---
applyTo: '**'
---

# General

This is the platform for a grant/hackathon program for students called Fallout, where they can log and submit hours they spend on projects & their engineering process for prizes and and invite to our summit event.

Keep changes low impact, responses concise. No summaries, no testing. Reference the existing codebase for style consistency. Read all context carefully before making changes — code may be manually modified between messages; do not suggest code that has been deleted or is no longer relevant. If asked to change feature requirements, update all previous implementations to match. Always ask questions when needed.

# Stack

Ruby 3.4.4, Rails 8.1.2, React 19, Tailwind 4.1.18 via inertia-rails. Only suggest changes applicable to these versions. Prefer CLI-generated boilerplate over manual file creation — you can always modify generated output.

In-house services: HCA is our unified authentication system. Hackatime is the time tracking system, where Lapse is the timelapse tool for Hackatime. HCB is our "bank" (real US dollars).

Inertia bridges Rails and React. All attributes passed to the frontend — even unused ones — are visible in developer tools; for security & access reasons, be careful what you expose. Inertia docs: https://inertia-rails.dev/llms-full.txt

# Security & Access Control

HCB controls money for the program. **DO NOT EDIT ANY CODE RELATED TO HCB WITHOUT EXPLICIT WRITTEN APPROVAL.** Alert in chat before making any HCB changes. Do not run any tests or console code related to HCB without **EXPLICIT WRITTEN APPROVAL**.

## Pundit

Pundit policies enforce authorization at a low level and should always be used. This pertains to security — if unsure how to modify a policy, ask for clarification. Follow the principle of least privilege: only grant access necessary for the feature to function. Docs: https://www.rubydoc.info/gems/pundit

## User Types

Two user types exist: **full users** (authenticated through HCA, cross-device access, can access non-public data) and **trial users** (email-based login, device-cookie-scoped, limited access). For privacy and security, multiple trial accounts with the same email cannot access each other's data. Trial users become full users upon completing HCA authentication. Consider both user types when making changes and enforce access controls via Pundit when making changes.

## Fail-Closed Defaults

By default, every action requires full HCA authentication, completed onboarding, and Pundit authorization. Only relax defaults when explicitly necessary, for specific actions only. When in doubt, deny access. Assume developers will forget to configure access on new actions — the system must fail closed.

## `only:` vs `except:` Rule

If a developer forgets to list a new action, the result must always be _less_ access, never _more_:

- **Relaxing directives** (`skip_after_action :verify_authorized`, `skip_after_action :verify_policy_scoped`, `allow_unauthenticated_access`, `allow_trial_access`, `skip_onboarding_redirect`, `skip_before_action`): use `only:` — a forgotten action keeps the default restriction active. Note: Pundit's `skip_authorization`/`skip_policy_scope` are instance methods — they cannot be called at the class level with `only:`. Use `skip_after_action` on the verification callbacks instead.
- **Controllers without an `index` action**: `ApplicationController` registers `after_action :verify_authorized, except: :index` and `after_action :verify_policy_scoped, only: :index`. Rails 8.1 raises `AbstractController::ActionNotFound` if the action listed in `except:`/`only:` doesn't exist on the controller. Controllers without `index` must use blanket `skip_after_action :verify_authorized` and `skip_after_action :verify_policy_scoped` (no `only:`) to avoid this. Still call `authorize`/`skip_authorization` in each action explicitly.
- **Restricting directives** (`before_action` enforcing checks like `require_admin!`): use `except:` or apply blanket — a forgotten action still gets the check.

Never use `except:` on a relaxing directive, and never use `only:` on a restricting `before_action` — both silently open access when a new action is added. Every access directive must have an inline comment explaining why it is needed. Prefer `allow_trial_access` over `allow_unauthenticated_access` unless the endpoint truly needs to be public.

# Data Handling

Data must be preservable and reversible. When deleting data, always ask whether it should be soft-deleted or permanently destroyed — never assume either. PII may need true deletion; other data may need soft-deletion for auditability. The developer decides each time.

For values that change over time — especially currencies like koi — store each change as an individual ledger entry (e.g. "+5 koi from ship review", "-10 koi from shop purchase") rather than mutating a running total. Derive the current balance by replaying history. Think of it like git: store the diffs, not the final state.

# Code Quality

Use Rails, Inertia, React, and Pundit best practices. Keep code DRY with partials, helpers, and concerns. Follow this ordering for model internals: constants, enums, includes/concerns, associations, validations, callbacks, scopes, class methods, instance methods (public then private). Minimize database queries (use `includes`, avoid N+1). Use background jobs for long-running tasks. Use caching where appropriate. When adding the `private` keyword in Rails, verify nothing below is affected — private methods should always be at the bottom of the class.

Maintain existing functionality; do not introduce bugs. Before finishing, run `git diff` to review changes, then run `bin/rubocop -f github` and `bin/brakeman --no-pager`. Flag unrelated issues but you don't have to fix them.

## Comments

Do not add comments unless absolutely necessary for clarity — code should be self-describing. No large comment blocks. **Exception**: code with non-obvious effects beyond its immediate scope — especially security, access control, or authorization — **MUST** have an inline comment explaining why it exists. Examples: access directives, policy scoping, before_action filters, session/cookie manipulation, and any logic whose removal would silently change access. If someone reading the code in isolation couldn't tell why a line is there, comment it.
