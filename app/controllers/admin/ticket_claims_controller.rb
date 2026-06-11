class Admin::TicketClaimsController < Admin::ApplicationController
  before_action :require_admin! # Ticket claim management is admin-only

  # No index action in ApplicationController base — blanket skip required
  skip_after_action :verify_authorized
  skip_after_action :verify_policy_scoped

  def index
    @claims = TicketClaim.includes(:user).order(created_at: :asc)
    @claims = @claims.where(state: params[:state]) if params[:state].present?

    render inertia: "admin/ticket_claims/index", props: {
      claims: @claims.map { |claim| serialize_claim(claim) },
      state_filter: params[:state].to_s
    }
  end

  def approve
    @claim = TicketClaim.find(params[:id])

    if @claim.approved?
      return redirect_to admin_ticket_claims_path, inertia: { errors: { base: [ "Claim is already approved" ] } }
    end

    user = @claim.user

    begin
      AttendService.add_participant(
        first_name: user.first_name.presence || user.display_name.split.first,
        last_name: user.last_name.presence || (user.display_name.split.length > 1 ? user.display_name.split.last : "-"),
        email: user.email
      )
    rescue AttendService::Error => e
      ErrorReporter.capture_exception(e, contexts: { ticket_claim: { claim_id: @claim.id, user_id: user.id } })
      return redirect_to admin_ticket_claims_path,
        inertia: { errors: { base: [ "Attend API error: #{e.message}" ] } }
    end

    @claim.update!(state: :approved)
    redirect_to admin_ticket_claims_path
  end

  def reject
    @claim = TicketClaim.find(params[:id])

    if @claim.rejected?
      return redirect_to admin_ticket_claims_path, inertia: { errors: { base: [ "Claim is already rejected" ] } }
    end

    @claim.update!(state: :rejected)
    redirect_to admin_ticket_claims_path
  end

  private

  def serialize_claim(claim)
    user = claim.user
    approved_hours = (user.approved_time_logged_seconds / 3600.0).round(1)
    total_hours = (user.total_time_logged_seconds / 3600.0).round(1)

    projects = user.projects.kept.order(created_at: :desc).limit(10).map do |p|
      { id: p.id, name: p.name }
    end

    {
      id: claim.id,
      state: claim.state,
      created_at: claim.created_at.strftime("%b %d, %Y"),
      user: {
        id: user.id,
        display_name: user.display_name,
        email: user.email,
        avatar: user.avatar,
        approved_hours: approved_hours,
        total_hours: total_hours,
        projects: projects
      }
    }
  end
end
