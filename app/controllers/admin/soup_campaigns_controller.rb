class Admin::SoupCampaignsController < Admin::ApplicationController
  before_action :require_admin! # Soup campaigns are admin-only

  skip_after_action :verify_authorized, only: %i[index] # index uses policy_scope; create uses skip_authorization since it redirects immediately
  skip_after_action :verify_policy_scoped, only: %i[show new create update destroy send_campaign test_send cancel toggle_unsubscribe] # non-index actions use authorize

  def index
    campaigns = policy_scope(SoupCampaign).recent.includes(:created_by)

    render inertia: "admin/soup_campaigns/index", props: {
      campaigns: campaigns.map { |c| serialize_campaign(c) }
    }
  end

  def show
    campaign = SoupCampaign.find(params[:id])
    authorize campaign

    if campaign.draft?
      # Show projected audience (who would receive the campaign) before sending
      projected_scope = User.verified.kept.where.not(slack_id: nil).order(:display_name)
      pagy, projected_users = pagy(projected_scope, limit: 50, page: params[:rp], page_param: :rp)
      recipients = projected_users.map do |u|
        { id: u.id, slack_id: u.slack_id, display_name: u.display_name, status: "projected",
          sent_at: nil, error_message: nil }
      end
      recipients_pagy = pagy_props(pagy)
    else
      pagy, recipient_records = pagy(
        campaign.soup_campaign_recipients.order(created_at: :asc),
        limit: 50, page: params[:rp], page_param: :rp
      )
      recipients = recipient_records.map { |r| serialize_recipient(r) }
      recipients_pagy = pagy_props(pagy)
    end

    render inertia: "admin/soup_campaigns/show", props: {
      campaign: serialize_campaign(campaign),
      recipients:,
      recipients_pagy:,
      stats: campaign.recipient_stats,
      progress: campaign.progress_percent
    }
  end

  def new
    # Auto-create a blank draft and open the collaborative editor directly
    campaign = SoupCampaign.new(
      name: "Untitled campaign",
      body: "",
      footer: "",
      unsubscribe_label: SoupCampaign::DEFAULT_UNSUBSCRIBE_LABEL,
      created_by: current_user
    )
    authorize campaign

    campaign.save!
    redirect_to edit_admin_soup_campaign_path(campaign)
  end

  def create
    # Unused — new action auto-creates and redirects to edit
    skip_authorization
    head :not_found
  end

  def update
    campaign = SoupCampaign.find(params[:id])
    authorize campaign

    if campaign.update(campaign_params)
      redirect_to admin_soup_campaign_path(campaign), notice: "Campaign updated."
    else
      render inertia: "admin/soup_campaigns/edit", props: {
        campaign: serialize_campaign(campaign),
        yjs_state: campaign.yjs_state.present? ? Base64.strict_encode64(campaign.yjs_state) : nil,
        errors: campaign.errors.as_json
      }
    end
  end

  def edit
    campaign = SoupCampaign.find(params[:id])
    authorize campaign, :update?

    render inertia: "admin/soup_campaigns/edit", props: {
      campaign: serialize_campaign(campaign),
      yjs_state: campaign.yjs_state.present? ? Base64.strict_encode64(campaign.yjs_state) : nil,
      current_user_presence: {
        id: current_user.id,
        display_name: current_user.display_name,
        avatar: current_user.avatar
      }
    }
  end

  def destroy
    campaign = SoupCampaign.find(params[:id])
    authorize campaign

    campaign.destroy!
    redirect_to admin_soup_campaigns_path, notice: "Campaign deleted."
  end

  def send_campaign
    campaign = SoupCampaign.find(params[:id])
    authorize campaign

    unless campaign.draft?
      redirect_to admin_soup_campaign_path(campaign), alert: "Campaign has already been sent or is currently sending."
      return
    end

    SendSoupCampaignJob.perform_later(campaign.id)
    redirect_to admin_soup_campaign_path(campaign), notice: "Campaign is now sending!"
  end

  def test_send
    campaign = SoupCampaign.find(params[:id])
    authorize campaign

    slack_id = params[:slack_id].to_s.strip
    return render json: { error: "slack_id is required" }, status: :unprocessable_entity if slack_id.blank?

    # Use a real recipient token if this person is already a recipient, otherwise a no-op test token
    recipient = campaign.soup_campaign_recipients.find_by(slack_id: slack_id)
    display_name = recipient&.display_name ||
                   User.verified.kept.find_by(slack_id: slack_id)&.display_name
    unsubscribe_token = recipient&.unsubscribe_token || "test-token"
    unsubscribe_url = soup_campaign_unsubscribe_url(
      token: unsubscribe_token,
      host: ENV.fetch("APP_HOST", "fallout.hackclub.com")
    )

    client = Slack::Web::Client.new(token: ENV.fetch("SLACK_BOT_TOKEN", nil))
    client.chat_postMessage(
      channel: slack_id,
      text: "[TEST] #{campaign.body.gsub("{name}", (display_name&.split&.first || "there"))}",
      blocks: build_test_blocks(campaign, unsubscribe_url, display_name).to_json
    )

    render json: { ok: true }
  rescue Slack::Web::Api::Errors::SlackError => e
    render json: { error: e.message }, status: :unprocessable_entity
  end

  def cancel
    campaign = SoupCampaign.find(params[:id])
    authorize campaign

    campaign.update!(status: :cancelled)
    redirect_to admin_soup_campaign_path(campaign), notice: "Campaign cancelled."
  end

  def toggle_unsubscribe
    campaign = SoupCampaign.find(params[:id])
    authorize campaign, :update? # Admin-only; reuse update? permission

    recipient = campaign.soup_campaign_recipients.find(params[:recipient_id])

    if recipient.unsubscribed?
      # Re-subscribe: move back to sent if the campaign was already sent, otherwise pending
      new_status = campaign.sent? ? :sent : :pending
      recipient.update!(status: new_status)
    else
      recipient.update!(status: :unsubscribed)
    end

    render json: { ok: true, status: recipient.status }
  rescue ActiveRecord::RecordNotFound
    render json: { error: "Recipient not found" }, status: :not_found
  end

  private

  def campaign_params
    params.expect(soup_campaign: [ :name, :body, :footer, :unsubscribe_label, :image_url ])
  end

  def build_test_blocks(campaign, unsubscribe_url, display_name = nil)
    first_name = display_name&.split&.first || "there"

    blocks = []

    blocks << { type: "section", text: { type: "mrkdwn", text: "[TEST] #{campaign.body.gsub("{name}", first_name)}" } }

    if campaign.footer.present?
      blocks << { type: "section", text: { type: "mrkdwn", text: campaign.footer.gsub("{name}", first_name) } }
    end

    if campaign.image_url.present?
      blocks << { type: "image", image_url: campaign.image_url, alt_text: campaign.name }
    end

    blocks << { type: "divider" }

    blocks << {
      type: "context",
      elements: [
        { type: "mrkdwn", text: "#{campaign.unsubscribe_label} · <#{unsubscribe_url}|Unsubscribe>" }
      ]
    }

    blocks
  end

  def serialize_campaign(campaign)
    {
      id: campaign.id,
      name: campaign.name,
      body: campaign.body,
      footer: campaign.footer,
      unsubscribe_label: campaign.unsubscribe_label,
      image_url: campaign.image_url,
      status: campaign.status,
      sent_at: campaign.sent_at&.iso8601,
      scheduled_at: campaign.scheduled_at&.iso8601,
      created_at: campaign.created_at.iso8601,
      created_by: {
        id: campaign.created_by_id,
        display_name: campaign.created_by&.display_name,
        avatar: campaign.created_by&.avatar
      },
      stats: campaign.recipient_stats,
      progress: campaign.progress_percent
    }
  end

  def serialize_recipient(recipient)
    {
      id: recipient.id,
      slack_id: recipient.slack_id,
      display_name: recipient.display_name,
      status: recipient.status,
      sent_at: recipient.sent_at&.iso8601,
      error_message: recipient.error_message
    }
  end
end
