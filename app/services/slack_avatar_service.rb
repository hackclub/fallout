require "open-uri"

class SlackAvatarService
  def self.card_icon_url(avatar_url:, base_url:)
    return nil if avatar_url.blank?

    source = Tempfile.new([ "review_avatar_source", ".img" ])
    source.binmode
    URI.open(avatar_url, read_timeout: 10) { |io| source.write(io.read) } # rubocop:disable Security/Open
    source.flush

    output = Tempfile.new([ "review_avatar", ".jpg" ])
    Vips::Image.thumbnail(source.path, 30, height: 30, crop: :centre).jpegsave(output.path, Q: 85)

    blob = ActiveStorage::Blob.create_and_upload!(
      io: File.open(output.path),
      filename: "review_avatar_#{SecureRandom.hex(6)}.jpg",
      content_type: "image/jpeg"
    )

    Rails.application.routes.url_helpers.rails_blob_url(blob, host: base_url)
  rescue StandardError => e
    Rails.logger.warn("SlackAvatarService.card_icon_url failed: #{e.class}: #{e.message}")
    nil
  ensure
    source&.close!
    output&.close!
  end
end
