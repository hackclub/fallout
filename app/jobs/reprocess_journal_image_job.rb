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

    source = Tempfile.new(["journal_image", ".bin"], binmode: true)
    source.write(raw)
    source.close # flush Ruby's IO buffer to disk before libvips opens the path

    # Pass both `strip` (libvips < 8.15) and `keep` (libvips 8.15+) saver options;
    # ImageProcessing filters via vips_foreign_find_save introspection, keeping
    # whichever the installed libvips actually supports.
    saver_options = { quality: 85, strip: true }
    saver_options[:keep] = ::Vips::ForeignKeep::NONE if defined?(::Vips::ForeignKeep)

    processed = ImageProcessing::Vips
      .source(source.path)
      .convert("jpg")
      .saver(**saver_options)
      .call

    # blob.upload calls unfurl which sets checksum, byte_size, content_type on the
    # in-memory blob; we set content_type beforehand so identify: false leaves it alone.
    blob.content_type = "image/jpeg"
    blob.upload(processed, identify: false)
    blob.update!(metadata: blob.metadata.merge("reprocessed" => true))
  ensure
    source&.close
    source&.unlink
    processed&.close if processed.respond_to?(:close)
    processed&.unlink if processed.respond_to?(:unlink)
  end
end
