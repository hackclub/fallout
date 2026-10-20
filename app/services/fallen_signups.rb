# Reads who has a Fallen account from Fallen's Airtable Users table (synced from hackclub/fallen's
# AirtableUsers). Trial (soft) signups count as signed up. AIRTABLE_API_KEY needs data.records:read
# on Fallen's base. Raises on failure so audience filters fail closed instead of matching nobody.
module FallenSignups
  class Error < StandardError; end

  BASE = "apphKY9sIjm0xIUVm"
  USERS_TABLE = "tblMFaihA2IgLO2pw"
  EMAIL_FIELD = "fldavIzhYEog0PCZi"
  SLACK_ID_FIELD = "fldjmEV0vCPirJUUN"
  DELETED_AT_FIELD = "fldegDhFYedaFqXRN"

  module_function

  # { slack_ids: Set, emails: Set } of every non-deleted Fallen account.
  def identifiers
    Rails.cache.fetch("fallen_signups/identifiers", expires_in: 10.minutes) do
      slack_ids = Set.new
      emails = Set.new
      records.each do |fields|
        next if fields[DELETED_AT_FIELD].present?

        slack_ids << fields[SLACK_ID_FIELD].strip.upcase if fields[SLACK_ID_FIELD].present?
        emails << fields[EMAIL_FIELD].strip.downcase if fields[EMAIL_FIELD].present?
      end
      { slack_ids:, emails: }
    end
  end

  def records
    raise Error, "AIRTABLE_API_KEY is not set" if ENV["AIRTABLE_API_KEY"].blank?

    rows = []
    offset = nil
    loop do
      response = Faraday.get("https://api.airtable.com/v0/#{BASE}/#{USERS_TABLE}") do |req|
        req.headers["Authorization"] = "Bearer #{ENV['AIRTABLE_API_KEY']}"
        req.params.merge!({ pageSize: 100, returnFieldsByFieldId: true, "fields[]": [ EMAIL_FIELD, SLACK_ID_FIELD, DELETED_AT_FIELD ], offset: }.compact)
        req.options.params_encoder = Faraday::FlatParamsEncoder
      end
      raise Error, "Fallen Airtable read failed: #{response.status}" unless response.success?

      data = JSON.parse(response.body)
      rows.concat(data["records"].map { |r| r["fields"] })
      offset = data["offset"]
      break if offset.blank?

      sleep 0.2 # Airtable allows 5 requests/sec per base
    end
    rows
  rescue Faraday::Error, JSON::ParserError => e
    raise Error, "Fallen Airtable read failed: #{e.message}"
  end
end
