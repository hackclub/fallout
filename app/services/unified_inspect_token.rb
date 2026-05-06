# Signs and verifies presigned-URL tokens for /admin/unified_inspect/:ship_id.
#
# Tokens are non-expiring HMAC-SHA256 of `"#{PURPOSE}:#{ship_id}"` keyed by
# EXTERNAL_API_KEY. Auditors viewing a YSWS Unified DB row land on the inspector
# without holding a Fallout account; the token is what gates access against
# random ship_id enumeration.
#
# Rotating EXTERNAL_API_KEY invalidates all previously-issued URLs (and breaks
# the existing API). Bump PURPOSE if we ever need to invalidate without
# rotating the API key.
class UnifiedInspectToken
  PURPOSE = "unified_inspect:v1"

  def self.sign(ship_id)
    OpenSSL::HMAC.hexdigest("SHA256", secret, "#{PURPOSE}:#{ship_id}")
  end

  def self.valid?(ship_id, token)
    return false if token.blank?
    expected = sign(ship_id)
    return false if token.bytesize != expected.bytesize
    ActiveSupport::SecurityUtils.secure_compare(token, expected)
  end

  # Absolute URL embedded into the YSWS Unified DB justification text.
  def self.url_for(ship_id)
    host = ENV.fetch("APP_HOST", "localhost:3000")
    scheme = host.include?("localhost") ? "http" : "https"
    "#{scheme}://#{host}/admin/unified_inspect/#{ship_id}/#{sign(ship_id)}"
  end

  def self.secret
    ENV.fetch("EXTERNAL_API_KEY") { raise "EXTERNAL_API_KEY must be set to issue/verify unified_inspect tokens" }
  end
end
