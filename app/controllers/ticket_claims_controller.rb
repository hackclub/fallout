class TicketClaimsController < ApplicationController
  # No index action — blanket skip required to avoid AbstractController::ActionNotFound
  skip_after_action :verify_authorized
  skip_after_action :verify_policy_scoped

  TICKET_HOURS_THRESHOLD = 60

  def new
    skip_authorization

    threshold = current_user.ticket_hours_override || TICKET_HOURS_THRESHOLD
    approved_hours = (current_user.approved_time_logged_seconds / 3600.0).round(1)
    identity_blocked = current_user.identity_gate_state != :verified_with_address

    render inertia: "shop/claim_ticket", props: {
      approved_hours: approved_hours,
      can_claim: approved_hours >= threshold && !identity_blocked,
      identity_blocked: identity_blocked,
      identity_state: current_user.identity_gate_state,
      already_claimed: current_user.ticket_claim.present?
    }
  end

  def create
    skip_authorization

    if current_user.ticket_claim.present?
      return redirect_to shop_items_path, notice: "You have already submitted a ticket claim"
    end

    if current_user.identity_gate_state != :verified_with_address
      return redirect_to claim_ticket_path, inertia: { errors: { base: [ "You must verify your identity and add an address before claiming a ticket" ] } }
    end

    threshold = current_user.ticket_hours_override || TICKET_HOURS_THRESHOLD
    approved_hours = (current_user.approved_time_logged_seconds / 3600.0).round(1)
    unless approved_hours >= threshold
      return redirect_to claim_ticket_path, inertia: { errors: { base: [ "You need at least #{TICKET_HOURS_THRESHOLD} approved hours to claim a ticket" ] } }
    end

    claim = TicketClaim.new(user: current_user)
    if claim.save
      flash[:just_claimed] = "true"
      redirect_to path_path
    else
      redirect_to claim_ticket_path, inertia: { errors: claim.errors.messages }
    end
  end
end
