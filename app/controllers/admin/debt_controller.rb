class Admin::DebtController < Admin::ApplicationController
  before_action :require_admin! # Debt console + check-in logging is admin-only

  # No model-backed index here (the roster is computed from Users); the whole controller is
  # gated by require_admin! above, so blanket-skip Pundit's verification callbacks.
  skip_after_action :verify_authorized
  skip_after_action :verify_policy_scoped

  def index
    render inertia: "admin/debt/index", props: deferred_roster_props
  end

  def create_check_in
    user = User.find(params[:user_id])
    check_in = user.debt_check_ins.build(author: current_user, note: params[:note].to_s.strip)

    if check_in.save
      redirect_to admin_debt_path
    else
      redirect_to admin_debt_path, inertia: { errors: { base: check_in.errors.full_messages } }
    end
  end

  def destroy_check_in
    check_in = DebtCheckIn.kept.find(params[:id])
    check_in.discard # soft-delete: outreach history stays auditable/recoverable
    redirect_to admin_debt_path
  end

  # Hiding is a persistent, reversible flag — a hidden user stays out of the console and its export
  # until an admin unhides them. We record who/when for auditability.
  def hide
    user = User.find(params[:user_id])
    user.update!(debt_hidden_at: Time.current, debt_hidden_by: current_user)
    redirect_to admin_debt_path
  end

  def unhide
    user = User.find(params[:user_id])
    user.update!(debt_hidden_at: nil, debt_hidden_by: nil)
    redirect_to admin_debt_path
  end

  private

  # The roster computation walks every approved-ticket holder and sums their attributed hours,
  # which is several queries per user. It's bounded (only event-ticket holders) but not free, so
  # defer it: the page shell paints instantly and the roster + overview stream in together.
  def deferred_roster_props
    memo = nil
    load = lambda do
      memo ||= build_roster
    end
    {
      threshold_default: User::TICKET_HOURS_THRESHOLD,
      debtors: InertiaRails.defer(group: "roster") { load.call[:debtors] },
      overview: InertiaRails.defer(group: "roster") { load.call[:overview] }
    }
  end

  # Returns { debtors: [...], overview: {...} }.
  #
  # A user is "in debt" when they hold an approved ticket but their TA-approved hours are still
  # under their personal threshold (override, else 60). We also surface users who have since
  # cleared the bar but carry check-in history, so admins can see how an outreach resolved.
  def build_roster
    candidates = User.joins(:ticket_claim).merge(TicketClaim.approved).includes(:ticket_claim, :debt_hidden_by).to_a
    check_ins_by_user = DebtCheckIn.kept
      .where(user_id: candidates.map(&:id))
      .includes(:author)
      .newest_first
      .group_by(&:user_id)

    rows = candidates.filter_map do |user|
      check_ins = check_ins_by_user[user.id] || []
      # Per-project approved seconds; summed for the approved total and reused for the project list.
      approved_by_project = Project.batch_user_approved_seconds(user.projects_attributable_to_self_ids, user)
      approved_hours = (approved_by_project.values.sum / 3600.0).round(1)
      # Debt always targets the flat 60h bar — the per-user ticket_hours_override only lowered the
      # bar for *claiming* a ticket (grace/comped), but everyone clears debt by reaching 60 approved.
      threshold = User::TICKET_HOURS_THRESHOLD
      in_debt = approved_hours < threshold

      # Skip people who are fine and were never checked in on — the console is for active debt.
      # Hidden users are always kept so they remain visible under the Hidden filter and can be unhidden.
      next unless in_debt || check_ins.any? || user.debt_hidden?

      serialize_debtor(user, approved_hours:, threshold:, in_debt:, approved_by_project:, check_ins:)
    end

    rows.sort_by! { |r| [ r[:in_debt] ? 0 : 1, r[:progress_pct] ] } # active debt first, closest-to-clearing last
    { debtors: rows, overview: build_overview(rows) }
  end

  def serialize_debtor(user, approved_hours:, threshold:, in_debt:, approved_by_project:, check_ins:)
    shipped_hours = (user.shipped_time_logged_seconds / 3600.0).round(1)
    logged_hours = (user.total_time_logged_seconds / 3600.0).round(1)

    projects = user.projects.kept.order(created_at: :desc).map do |project|
      {
        id: project.id,
        name: project.name,
        approved_hours: ((approved_by_project[project.id] || 0) / 3600.0).round(1)
      }
    end

    {
      id: user.id,
      display_name: user.display_name,
      email: user.email, # admin-only controller — PII is allowed here
      avatar: user.avatar,
      threshold: threshold,
      approved_hours: approved_hours,
      shipped_hours: shipped_hours,
      logged_hours: logged_hours,
      remaining_hours: [ (threshold - approved_hours).round(1), 0 ].max,
      progress_pct: threshold.positive? ? [ (approved_hours / threshold * 100).round, 100 ].min : 100,
      in_debt: in_debt,
      hidden: user.debt_hidden?,
      hidden_by: user.debt_hidden_by&.display_name,
      ticket_approved_at: user.ticket_claim&.updated_at&.strftime("%b %d, %Y"),
      projects: projects,
      check_ins: check_ins.map { |c| serialize_check_in(c) }
    }
  end

  def serialize_check_in(check_in)
    {
      id: check_in.id,
      note: check_in.note,
      author_name: check_in.author&.display_name,
      author_avatar: check_in.author&.avatar,
      created_at: check_in.created_at.strftime("%b %d, %Y at %l:%M %p").squeeze(" ")
    }
  end

  def build_overview(rows)
    visible = rows.reject { |r| r[:hidden] } # hidden users don't count toward the console's overview
    active = visible.select { |r| r[:in_debt] }
    {
      in_debt_count: active.size,
      cleared_count: visible.size - active.size,
      hours_owed: active.sum { |r| r[:remaining_hours] }.round(1),
      needs_checkin_count: active.count { |r| r[:check_ins].empty? },
      close_count: active.count { |r| r[:progress_pct] >= 75 },
      just_started_count: active.count { |r| r[:progress_pct] < 25 }
    }
  end
end
