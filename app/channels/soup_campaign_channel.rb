# Realtime collaboration channel for Soup campaign editing.
# Handles Yjs CRDT sync messages and presence (who's editing, cursor positions).
# Each connected client sends a unique tab_id so we can deduplicate same-user multi-tab sessions.
class SoupCampaignChannel < ApplicationCable::Channel
  PRESENCE_KEY_PREFIX = "soup_campaign_presence:"
  PRESENCE_TTL = 30 # seconds

  def subscribed
    campaign = SoupCampaign.find_by(id: params[:campaign_id])
    return reject unless campaign && current_user&.admin?

    @campaign = campaign
    @tab_id = params[:tab_id]

    stream_from stream_name
    broadcast_presence_update
  end

  def unsubscribed
    broadcast_presence_leave
    clear_my_presence
  end

  # Client sends a Yjs awareness update (cursor/selection) — relay to all peers, no persistence needed
  def awareness(data)
    ActionCable.server.broadcast(stream_name, {
      type: "awareness",
      update: data["update"],
      tab_id: @tab_id
    })
  end

  # Client sends an incremental Yjs update — relay to peers only (fast path)
  def sync(data)
    # Relay to all other subscribers immediately
    ActionCable.server.broadcast(stream_name, {
      type: "sync",
      update: data["update"],
      tab_id: @tab_id
    })
  end

  # Client sends a debounced autosave with FULL Yjs state and field values
  def autosave(data)
    update_bytes = Base64.strict_decode64(data["update"])

    @campaign.with_lock do
      # Overwrite the entire state vector since the client sent the full document
      @campaign.update_columns(yjs_state: update_bytes)
      flush_fields(data["fields"]) if data["fields"]
    end
  end

  # Client sends presence update (cursor field, selection, etc.)
  def presence(data)
    store_my_presence(data)
    ActionCable.server.broadcast(stream_name, {
      type: "presence",
      user: presence_user_payload,
      tab_id: @tab_id,
      data: data
    })
  end

  private

  def stream_name
    "soup_campaign:#{@campaign.id}"
  end

  def flush_fields(fields)
    permitted = %w[name body footer unsubscribe_label image_url]
    updates = fields.slice(*permitted)
    @campaign.update_columns(updates) if updates.any?
  end

  def presence_user_payload
    {
      id: current_user.id,
      display_name: current_user.display_name,
      avatar: current_user.avatar,
      tab_id: @tab_id,
      color: user_color
    }
  end

  def user_color
    # Deterministic hue from user id so the same person always gets the same color
    hue = (current_user.id * 47) % 360
    "hsl(#{hue}, 70%, 55%)"
  end

  def broadcast_presence_update
    store_my_presence({})
    ActionCable.server.broadcast(stream_name, {
      type: "presence_join",
      user: presence_user_payload
    })
  end

  def broadcast_presence_leave
    ActionCable.server.broadcast(stream_name, {
      type: "presence_leave",
      tab_id: @tab_id
    })
  end

  def presence_redis_key
    "#{PRESENCE_KEY_PREFIX}#{@campaign.id}:#{current_user.id}:#{@tab_id}"
  end

  def store_my_presence(data)
    # Use Rails cache (backed by Redis in production) with TTL for auto-cleanup
    Rails.cache.write(presence_redis_key, { user: presence_user_payload, data: data }, expires_in: PRESENCE_TTL)
  end

  def clear_my_presence
    Rails.cache.delete(presence_redis_key)
  end
end
