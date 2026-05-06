require "openssl"
require "json"

module Slack
  class EventsController < ApplicationController
    allow_unauthenticated_access only: :create # Slack Events API requests are signed webhooks, not session-authenticated user requests.
    skip_after_action :verify_authorized # Webhook endpoint has no Pundit resource.
    skip_after_action :verify_policy_scoped # Webhook endpoint has no index/policy scope.
    skip_before_action :verify_authenticity_token, only: :create # Slack cannot provide Rails CSRF token; signature check below is the auth control.

    def create
      return head :unauthorized unless valid_slack_signature?

      payload = parsed_payload
      return render json: { challenge: payload["challenge"] } if payload["type"] == "url_verification"

      event = payload["event"] || {}
      return head :ok unless payload["type"] == "event_callback" && event["type"] == "link_shared"

      unfurls = build_unfurls(event["links"], payload["team_id"])
      return head :ok if unfurls.empty?

      client.chat_unfurl(
        channel: event["channel"],
        ts: event["message_ts"],
        unfurls: unfurls
      )

      head :ok
    rescue JSON::ParserError
      head :bad_request
    rescue Slack::Web::Api::Errors::SlackError, Faraday::Error => e
      Rails.logger.warn("Slack::EventsController#create failed: #{e.class}: #{e.message}")
      head :ok
    end

    private

    def parsed_payload
      JSON.parse(request.raw_post)
    end

    def valid_slack_signature?
      signing_secret = ENV.fetch("SLACK_SIGNING_SECRET", nil)
      return false if signing_secret.blank?

      timestamp = request.headers["X-Slack-Request-Timestamp"].to_s
      signature = request.headers["X-Slack-Signature"].to_s
      return false if timestamp.blank? || signature.blank?

      return false if (Time.now.to_i - timestamp.to_i).abs > 300

      base = "v0:#{timestamp}:#{request.raw_post}"
      digest = OpenSSL::HMAC.hexdigest("SHA256", signing_secret, base)
      expected = "v0=#{digest}"
      ActiveSupport::SecurityUtils.secure_compare(expected, signature)
    rescue StandardError
      false
    end

    def build_unfurls(links, team_id)
      return {} if links.blank?

      links.each_with_object({}) do |link, out|
        url = link["url"].to_s
        project = project_for_unfurl_url(url)
        next unless project

        cover_url = latest_cover_image_url(project)
        icon_url = SlackAvatarService.card_icon_url(avatar_url: project.user.avatar, base_url: request.base_url)
        out[url] = [
          SlackProjectCardService.build_card_block(
            project: project,
            project_url: project_url(project),
            repo_url: project.repo_link,
            cover_image_url: cover_url,
            icon_url: icon_url
          )
        ]
      end
    end

    def project_for_unfurl_url(url)
      uri = URI.parse(url)
      return nil unless [ request.host, "fallout.hackclub.com" ].include?(uri.host)

      project_id = if uri.path.match?(%r{\A/projects/\d+\z})
        uri.path.split("/").last
      elsif uri.path == "/bulletin_board"
        Rack::Utils.parse_query(uri.query.to_s)["project"]
      end
      return nil if project_id.blank?

      Project.public_for_explore.includes(:user).find_by(id: project_id)
    rescue URI::InvalidURIError
      nil
    end

    def latest_cover_image_url(project)
      entry = JournalEntry.public_for_explore
        .where(project_id: project.id)
        .joins(:images_attachments)
        .order(created_at: :desc)
        .first
      entry&.images&.first&.then { |img| url_for(img) }
    end
  end
end
