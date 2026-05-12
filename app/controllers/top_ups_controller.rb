class TopUpsController < ApplicationController
  # No matching model named "TopUp"; pin the wrap key so params.expect(:hcb_donation_request) works.
  wrap_parameters :hcb_donation_request

  def index
    @requests = policy_scope(HcbDonationRequest).kept.where(user_id: current_user.id).order(created_at: :desc)

    render inertia: "top_ups/index", props: {
      requests: @requests.map { |r| serialize(r) },
      has_active_card: current_user.active_hcb_grant_card&.issued? || false
    }
  end

  def new
    @request = HcbDonationRequest.new(user: current_user)
    authorize @request

    card = current_user.active_hcb_grant_card
    if card.nil? || !card.issued?
      # No active issued card — render an error page instead of the form. This is a
      # soft gate (not a 403): the user is authorized to use the feature, they just
      # don't have a destination card yet. The page directs them to /project_grants
      # which is the path to getting an issued card.
      render inertia: "top_ups/no_card"
    else
      render inertia: "top_ups/new", props: {
        user_email: current_user.email,
        card_last4: card.last4,
        card_purpose: card.purpose
      }
    end
  end

  def create
    @request = HcbDonationRequest.new(create_params.merge(
      user: current_user,
      token: HcbDonationRequest.generate_unique_token!
    ))
    authorize @request

    # Re-verify the card at submit time — an admin could have canceled it between
    # the form render and the POST. Fail closed.
    card = current_user.active_hcb_grant_card
    if card.nil? || !card.issued?
      redirect_to new_top_up_path, alert: "You don't have an active HCB grant card."
      return
    end

    if @request.save
      # Interstitial Inertia page is more reliable than allow_other_host through
      # an Inertia XHR — the frontend window.location.replace's to HCB on mount.
      render inertia: "top_ups/redirect", props: { hcb_url: hcb_donation_url(@request) }
    else
      redirect_back fallback_location: new_top_up_path,
        inertia: { errors: @request.errors.messages }
    end
  end

  private

  def create_params
    params.expect(hcb_donation_request: [ :amount_cents ])
  end

  def hcb_donation_url(req)
    query = {
      message: "Top-up of HCB grant #{req.token}",
      goods: "true",
      amount: req.amount_cents,
      email: current_user.email
    }
    "#{HcbService.host}/donations/start/fallout?#{query.to_query}"
  end

  def serialize(req)
    {
      id: req.id,
      token: req.token,
      amount_cents: req.amount_cents,
      matched_at: req.matched_at&.iso8601,
      refunded_at: req.refunded_at&.iso8601,
      donated_at: req.donated_at&.iso8601,
      # ISO 8601 — the frontend parses into a Date and formats in the browser's TZ.
      # Strftime'd display strings break TZ-aware age math (the index page uses age
      # to decide between "Awaiting" and "Not received" status).
      created_at: req.created_at.iso8601
    }
  end
end
