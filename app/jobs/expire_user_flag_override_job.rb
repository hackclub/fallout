class ExpireUserFlagOverrideJob < ApplicationJob
  # Only temporary exemption flags may be turned off through this job.
  EXPIRABLE_FLAGS = %w[shop_orders_override project_grants_override].freeze

  queue_as :default

  # Ends a temporary per-user override. Enqueue with set(wait_until:) when granting one,
  # since Flipper actor flags never expire on their own.
  def perform(user_id, flag)
    raise ArgumentError, "#{flag} is not an expirable override" unless EXPIRABLE_FLAGS.include?(flag.to_s)

    user = User.find_by(id: user_id)
    return unless user

    Flipper.disable_actor(flag.to_sym, user)
  end
end
