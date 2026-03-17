# Persist session cookies for 6 months so users aren't logged out when their browser closes
Rails.application.config.session_store :cookie_store,
  key: "_fallout_session",
  expire_after: 3.months
