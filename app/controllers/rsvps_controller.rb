class RsvpsController < ApplicationController
  allow_unauthenticated_access only: %i[create] # Public RSVP endpoint for landing page
  skip_after_action :verify_authorized # No authorizable resource
  skip_after_action :verify_policy_scoped # No scoped collection

  def create
    email = params[:email].to_s.strip.downcase

    if email.blank? || email.length > 254 || !email.match?(URI::MailTo::EMAIL_REGEXP)
      redirect_to root_path, alert: "Please enter a valid email address."
      return
    end

    api_key = ENV["AIRTABLE_API_KEY"]
    base_id = ENV["AIRTABLE_BASE_ID"]
    table_id = ENV["AIRTABLE_TABLE_ID"]

    unless api_key && base_id && table_id
      redirect_to root_path, alert: "RSVP is temporarily unavailable."
      return
    end

    response = Net::HTTP.post(
      URI("https://api.airtable.com/v0/#{base_id}/#{CGI.escape(table_id)}"),
      { fields: { "Email" => email, "IP Address" => request.remote_ip } }.to_json,
      "Authorization" => "Bearer #{api_key}",
      "Content-Type" => "application/json"
    )

    if response.is_a?(Net::HTTPSuccess)
      redirect_to root_path, notice: "You'll hear from us when we kick off!"
    else
      Rails.logger.error("Airtable RSVP error: #{response.code} #{response.body}")
      redirect_to root_path, alert: "Something went wrong. Please try again."
    end
  end
end
