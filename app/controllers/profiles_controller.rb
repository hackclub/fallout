class ProfilesController < ApplicationController
  allow_trial_access only: %i[show update custom_avatar] # Profile is accessible during trial; Slack photo requires full user (has slack_id)
  skip_after_action :verify_authorized # No index action — blanket skip required (Rails 8.1 callback validation)
  skip_after_action :verify_policy_scoped # No index action — blanket skip required (Rails 8.1 callback validation)

  def show
    skip_authorization
    render inertia: "profiles/show", props: {
      display_name: current_user.display_name,
      avatar: current_user.custom_avatar.attached? ? url_for(current_user.custom_avatar) : current_user.avatar,
      current_streak: StreakDay.current_streak(current_user),
      total_hours: (current_user.total_time_logged_seconds / 3600.0).round(1),
      approved_hours: (Ship.approved.where(project: current_user.projects.kept).sum(:approved_seconds).to_f / 3600.0).round(1),
      body_images: Dir.glob(Rails.root.join("public/pfp/body/*")).map { |f| "/pfp/body/#{File.basename(f)}" }.sort,
      bg_images: Dir.glob(Rails.root.join("public/pfp/bg/*")).map { |f| "/pfp/bg/#{File.basename(f)}" }.sort,
      eye_images: Dir.glob(Rails.root.join("public/pfp/eyes/*")).map { |f| "/pfp/eyes/#{File.basename(f)}" }.sort,
      hat_images: Dir.glob(Rails.root.join("public/pfp/hats/*")).map { |f| "/pfp/hats/#{File.basename(f)}" }.sort,
      mouth_images: Dir.glob(Rails.root.join("public/pfp/mouth/*")).map { |f| "/pfp/mouth/#{File.basename(f)}" }.sort,
      tie_images: Dir.glob(Rails.root.join("public/pfp/tie/*")).map { |f| "/pfp/tie/#{File.basename(f)}" }.sort,
      ear_images: Dir.glob(Rails.root.join("public/pfp/ears/*")).map { |f| "/pfp/ears/#{File.basename(f)}" }.sort,
      cheek_images: Dir.glob(Rails.root.join("public/pfp/cheeks/*")).map { |f| "/pfp/cheeks/#{File.basename(f)}" }.sort,
      direct_upload_url: rails_direct_uploads_url,
      bio: current_user.bio,
      email: current_user.email,
      pronouns: current_user.pronouns,
      has_slack_token: current_user.slack_token.present?,
      is_modal: request.headers["X-InertiaUI-Modal"].present?
    }
  end

  def update
    skip_authorization
    if params[:avatar_blob_signed_id].present?
      current_user.custom_avatar.attach(params[:avatar_blob_signed_id])
    end

    profile_attrs = params.permit(:email).to_h.compact_blank
    profile_attrs[:bio] = params[:bio] if params.key?(:bio)
    profile_attrs[:pronouns] = params[:pronouns].presence if params.key?(:pronouns)

    if profile_attrs.any? && !current_user.update(profile_attrs)
      return render json: { errors: current_user.errors.full_messages }, status: :unprocessable_entity
    end

    if request.headers["X-InertiaUI-Modal"].present?
      head :no_content
    else
      redirect_to profile_path
    end
  end

  def custom_avatar
    skip_authorization
    current_user.custom_avatar.purge
    render json: { avatar_url: current_user.avatar }
  end

  def set_slack_photo
    skip_authorization
    return head :bad_request if params[:image_data].blank?
    return head :unauthorized if current_user.slack_token.blank?

    image_data = Base64.strict_decode64(params[:image_data])

    Tempfile.create([ "slack_photo", ".png" ]) do |f|
      f.binmode
      f.write(image_data)
      f.flush
      f.rewind

      client = Slack::Web::Client.new(token: current_user.slack_token)
      client.users_setPhoto(image: Faraday::UploadIO.new(f, "image/png", "photo.png"))
    end

    saved_avatar_url = nil
    unless current_user.custom_avatar.attached?
      begin
        blob = ActiveStorage::Blob.create_and_upload!(
          io: StringIO.new(image_data),
          filename: "icon-pfp.png",
          content_type: "image/png"
        )
        current_user.custom_avatar.attach(blob)
        saved_avatar_url = url_for(current_user.custom_avatar)
      rescue StandardError => e
        ErrorReporter.capture_exception(e, contexts: { slack_photo: { user_id: current_user.id } })
      end
    end

    render json: { avatar_url: saved_avatar_url }
  rescue ArgumentError
    head :bad_request
  rescue Slack::Web::Api::Errors::InvalidAuth, Slack::Web::Api::Errors::TokenRevoked
    # Token is no longer valid — clear it so the frontend redirects to re-auth
    current_user.update!(slack_token: nil)
    head :unauthorized
  rescue Slack::Web::Api::Errors::SlackError => e
    ErrorReporter.capture_exception(e, contexts: { slack_photo: { user_id: current_user.id } })
    head :unprocessable_entity
  end
end
