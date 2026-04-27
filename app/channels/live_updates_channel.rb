class LiveUpdatesChannel < ApplicationCable::Channel
  # Fail-closed whitelist of streams plus their per-stream authorization. Adding a new
  # broadcastable resource requires an explicit entry here — otherwise subscription is rejected.
  # String keys match exactly; Regexp keys match the full stream and pass their MatchData to the guard.
  STREAMS = {
    "bulletin_events" => ->(user, _match) { user.present? }, # Any authenticated user (incl. trial)
    "bulletin_explore" => ->(user, _match) { user.present? }, # Public Explore stats live refresh.
    /\Apath_user_(\d+)\z/ => ->(user, match) { user.present? && user.id == match[1].to_i } # Per-user path progression
  }.freeze

  def subscribed
    stream = params[:stream].to_s
    guard, match = resolve_stream(stream)

    if guard && guard.call(current_user, match)
      stream_from "live_updates:#{stream}"
    else
      reject
    end
  end

  private

  def resolve_stream(stream)
    STREAMS.each do |key, guard|
      case key
      when String
        return [ guard, nil ] if key == stream
      when Regexp
        match = key.match(stream)
        return [ guard, match ] if match
      end
    end
    [ nil, nil ]
  end
end
