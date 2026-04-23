require "marcel"

class ReprocessJournalImageJob < ApplicationJob
  queue_as :heavy

  # Re-encodes a journal entry image to strip EXIF/GPS metadata and defeat polyglot
  # uploads (file bytes that are both a valid JPEG AND, say, a valid HTML file).
  # Replaces the original blob in place so downloads serve the sanitized version.
  def perform(attachment_id)
    attachment = ActiveStorage::Attachment.find_by(id: attachment_id)
    return unless attachment

    blob = attachment.blob
    return unless blob

    raw = blob.download

    detected = Marcel::MimeType.for(raw)
    unless detected.in?(%w[image/png image/jpeg image/gif image/webp])
      attachment.purge_later
      return
    end

    # If we've already reprocessed (checksum prefix marker), bail.
    return if blob.metadata["reprocessed"] == true

    processed = ImageProcessing::Vips
      .source(StringIO.new(raw))
      .strip
      .convert("jpg")
      .saver(quality: 85)
      .call

    blob.upload(processed, identify: false)
    blob.update!(
      content_type: "image/jpeg",
      byte_size: processed.size,
      checksum: blob.class.compute_checksum_in_chunks(processed.tap(&:rewind)),
      metadata: blob.metadata.merge("reprocessed" => true)
    )
  ensure
    processed&.close if processed.respond_to?(:close)
    processed&.unlink if processed.respond_to?(:unlink)
  end
end
