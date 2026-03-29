# frozen_string_literal: true

# Helpers for storing OAuth state tokens in dedicated encrypted cookies rather
# than the session. Cookies survive reset_session and cross-site redirects that
# can drop session cookies under strict browser privacy settings.
module OauthState
  extend ActiveSupport::Concern

  private

  def oauth_cookie_options
    { expires: 10.minutes, httponly: true, secure: Rails.env.production?, same_site: :lax }
  end

  def set_oauth_cookie(name, value)
    cookies.encrypted[name] = oauth_cookie_options.merge(value: value)
  end

  def delete_oauth_cookie(name)
    cookies.delete(name, secure: Rails.env.production?, same_site: :lax)
  end
end
