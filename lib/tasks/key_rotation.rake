# frozen_string_literal: true

require "csv"

# One-off tasks for the 2026-11 secret rotation. Everything goes through the app's own
# encryption and Active Storage code; nothing reimplements Rails' key derivation.
namespace :key_rotation do
  # HcbConnection is excluded: HCB code needs explicit approval and its tokens are cleared separately.
  ENCRYPTED_MODELS = {
    "User" => %i[hca_token lapse_token slack_token reviewer_slack_token device_token],
    "Ship" => %i[frozen_hca_data],
    "ShopOrder" => %i[phone legacy_address structured_address]
  }.freeze
  SIGNED_ID_PATTERN = %r{/user-attachments/blobs/(?:redirect/|proxy/)?([^)\s"'<>/]+)}

  # Reads every encrypted attribute. A stored ciphertext must decrypt with the configured keys:
  # the app allows legacy plaintext, and in that mode Rails returns an undecryptable value as its
  # raw ciphertext, which re-encryption would then silently wrap in a second layer.
  def key_rotation_read(record, attrs, stats)
    config = ActiveRecord::Encryption.config
    attrs.index_with do |attr|
      raw = record.read_attribute_before_type_cast(attr)
      unless raw.nil? || ActiveRecord::Encryption.encryptor.encrypted?(raw)
        stats[:plaintext_values] += 1
        next record.public_send(attr)
      end

      lenient, config.support_unencrypted_data = config.support_unencrypted_data, false
      begin
        record.public_send(attr)
      ensure
        config.support_unencrypted_data = lenient
      end
    end
  end

  def key_rotation_scan(dry_run:)
    failures = []
    ENCRYPTED_MODELS.each do |model_name, attrs|
      model = model_name.constantize
      stats = Hash.new(0)
      model.unscoped.where(attrs.map { |a| model.arel_table[a].not_eq(nil) }.reduce(:or)).find_each do |record|
        stats[:records] += 1
        before = key_rotation_read(record, attrs, stats)
        next if dry_run

        record.encrypt
        record.reload
        next stats[:reencrypted] += 1 if key_rotation_read(record, attrs, Hash.new(0)) == before

        stats[:failed] += 1
        failures << "#{model_name}##{record.id}: value changed after re-encryption"
      rescue ActiveRecord::Encryption::Errors::Base => e
        stats[:failed] += 1
        failures << "#{model_name}##{record.id}: #{e.class}"
      end
      puts "  #{model.table_name}: #{stats.sort.map { |k, v| "#{k}=#{v}" }.join(' ')}"
    end
    failures.each { |f| warn "  FAILED #{f}" }
    failures
  end

  desc <<~DESC
    Re-encrypt every encrypted column with the current keys. Always checks first that every
    stored ciphertext decrypts, and writes nothing if any fails. DRY_RUN=1 (default) only checks.
    To prove the old keys are no longer needed, dry-run again under new-only credentials and
    expect no failures and no plaintext values.
      bin/rails key_rotation:reencrypt
      bin/rails key_rotation:reencrypt DRY_RUN=0
  DESC
  task reencrypt: :environment do
    dry_run = ENV.fetch("DRY_RUN", "1") != "0"
    puts "Database: #{ActiveRecord::Base.connection.current_database}"
    puts "Check: every stored value is readable"
    failures = key_rotation_scan(dry_run: true)
    abort("#{failures.size} record(s) unreadable; nothing written, old keys must stay.") if failures.any?
    next puts("All values readable. Dry run, nothing written.") if dry_run

    puts "Re-encrypt"
    failures = key_rotation_scan(dry_run: false)
    abort("#{failures.size} record(s) failed; old keys must stay.") if failures.any?
    puts "All values re-encrypted and read back unchanged."
  end

  desc <<~DESC
    Pass 1 of 2, run with the OLD SECRET_KEY_BASE (read-only): map every Active Storage signed
    ID in journal entry markdown to its blob ID. Writes OUTPUT (default tmp/journal_signed_ids.csv).
      SECRET_KEY_BASE=<old> bin/rails key_rotation:export_signed_ids
  DESC
  task export_signed_ids: :environment do
    output = ENV.fetch("OUTPUT", Rails.root.join("tmp/journal_signed_ids.csv").to_s)
    stats = Hash.new(0)

    CSV.open(output, "w") do |csv|
      csv << %w[journal_entry_id signed_id blob_id]
      JournalEntry.unscoped.where("content LIKE ?", "%/user-attachments/blobs/%").find_each do |entry|
        entry.content.to_s.scan(SIGNED_ID_PATTERN).flatten.uniq.each do |signed_id|
          blob = ActiveStorage::Blob.find_signed(Rack::Utils.unescape_path(signed_id))
          stats[blob ? :mapped : :unverifiable] += 1
          csv << [ entry.id, signed_id, blob&.id ] if blob
        end
      end
    end

    puts "Wrote #{output}: #{stats.sort.map { |k, v| "#{k}=#{v}" }.join(' ')}"
  end

  desc <<~DESC
    Pass 2 of 2, run with the NEW SECRET_KEY_BASE: replace each exported signed ID with one
    minted under the current key. DRY_RUN=1 (default) only reports.
      bin/rails key_rotation:rewrite_signed_ids INPUT=tmp/journal_signed_ids.csv DRY_RUN=0
  DESC
  task rewrite_signed_ids: :environment do
    dry_run = ENV.fetch("DRY_RUN", "1") != "0"
    input = ENV.fetch("INPUT", Rails.root.join("tmp/journal_signed_ids.csv").to_s)
    table = CSV.read(input, headers: true)
    rows = table.group_by { |row| row["journal_entry_id"].to_i }
    blobs = ActiveStorage::Blob.where(id: table.map { |row| row["blob_id"] }).index_by(&:id)
    stats = Hash.new(0)
    puts "Mode: #{dry_run ? 'DRY-RUN' : 'EXECUTE'}"

    JournalEntry.unscoped.where(id: rows.keys).find_each do |entry|
      content = entry.content.to_s.dup
      rows[entry.id].each do |row|
        blob = blobs[row["blob_id"].to_i]
        next stats[:blob_missing] += 1 unless blob
        next stats[:already_rewritten] += 1 unless content.include?(row["signed_id"])
        next stats[:already_valid] += 1 if ActiveStorage::Blob.find_signed(Rack::Utils.unescape_path(row["signed_id"]))

        content.gsub!(row["signed_id"], blob.signed_id)
        stats[:rewritten_ids] += 1
      end
      next if content == entry.content.to_s

      stats[:entries] += 1
      # update_columns skips validations (a former collaborator's entry would fail them) and
      # image/search callbacks; bumping updated_at still invalidates the cached rendered markdown.
      # The exported CSV is the record of each old -> new signed ID.
      entry.update_columns(content: content, updated_at: Time.current) unless dry_run
    end

    puts stats.sort.map { |k, v| "#{k}=#{v}" }.join(" ")
  end
end
