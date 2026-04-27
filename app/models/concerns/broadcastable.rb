module Broadcastable
  extend ActiveSupport::Concern

  class_methods do
    # Accepts either a static stream name or a block evaluated in the record's instance context
    # that returns one or more stream names (nil / empty entries are dropped). The block form lets
    # models fan out to per-owner streams (e.g. "path_user_#{user_id}") or skip broadcasting for
    # records that aren't relevant to any subscribed stream.
    def broadcasts_updates_to(stream = nil, &block)
      define_method(:live_update_streams) do
        raw = block ? instance_exec(&block) : stream
        Array(raw).map { |s| s&.to_s }.compact.reject(&:empty?).uniq
      end
      after_commit :broadcast_live_update
    end
  end

  private

  # Pushes only a "dirty" signal — the frontend responds via Inertia partial reload,
  # which re-runs the controller + policy + serializer. No PII or raw attributes cross the cable.
  def broadcast_live_update
    streams = live_update_streams
    return if streams.empty?

    action = if destroyed?
      "destroy"
    elsif previously_new_record?
      "create"
    else
      "update"
    end

    streams.each do |stream|
      ActionCable.server.broadcast(
        "live_updates:#{stream}",
        { stream: stream, id: id, action: action }
      )
    end
  end
end
