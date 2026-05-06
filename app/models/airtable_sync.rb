# == Schema Information
#
# Table name: airtable_syncs
#
#  id                     :bigint           not null, primary key
#  last_synced_at         :datetime
#  record_identifier      :string           not null
#  synced_attributes_hash :string
#  created_at             :datetime         not null
#  updated_at             :datetime         not null
#  airtable_id            :string
#
# Indexes
#
#  index_airtable_syncs_on_record_identifier  (record_identifier) UNIQUE
#
require "csv"

class AirtableSync < ApplicationRecord
  MAX_AIRTABLE_BATCH_SIZE = 10_000
  SYNC_THREAD_COUNT = 10

  def self.needs_sync?(record)
    identifier = build_identifier(record)
    sync_record = find_by(record_identifier: identifier)
    return true unless sync_record

    record.updated_at > sync_record.last_synced_at
  end

  def self.mark_synced(record, airtable_id)
    identifier = build_identifier(record)
    sync_record = find_or_initialize_by(record_identifier: identifier)
    sync_record.update!(
      airtable_id: airtable_id,
      last_synced_at: Time.current
    )
  end

  def self.sync_records!(klass, records, no_upload: false)
    sync_with_records!(klass, records, no_upload:, log_prefix: "Airtable urgent sync")
  end

  def self.sync!(classname, limit: nil, sync_all: true, no_upload: false)
    ctx = sync_context_for(classname)
    klass = ctx[:klass]

    Rails.logger.info("Airtable sync: Loading #{klass.name} records...")
    records = ctx[:sync_id].present? || sync_all ? all_records(klass, limit) : outdated_records(klass, limit)

    sync_with_records!(klass, records, no_upload:, log_prefix: "Airtable sync")
  end

  def self.batch_sync!(table_id, records, sync_id, mappings, no_upload: false, batch_index: nil, base_id: nil, preloaded: nil)
    total = records.size
    Rails.logger.info("Airtable batch sync: Building CSV for #{total} records...")

    Rails.logger.info("Airtable batch sync: Building fields for #{total} records in parallel...")
    rows = parallel_map(records) { |record| build_airtable_fields(record, mappings, preloaded) }

    csv_string = CSV.generate do |csv|
      csv << mappings.keys

      rows.each_with_index do |fields, index|
        if (index + 1) % 500 == 0 || index + 1 == total
          Rails.logger.info("Airtable batch sync: Processing row (#{index + 1}/#{total})")
        end
        csv << fields.values.map { |v| v.is_a?(Array) ? v.join(",") : v }
      end
    end

    if no_upload
      batch_suffix = batch_index ? "_batch#{batch_index}" : ""
      filename = "airtable_sync_#{table_id}_#{Time.current.strftime('%Y%m%d_%H%M%S')}#{batch_suffix}.csv"
      filepath = Rails.root.join("tmp", filename)
      File.write(filepath, csv_string)
      Rails.logger.info("Airtable batch sync saved locally: #{filepath}")
      return filepath
    end

    response = Faraday.post("https://api.airtable.com/v0/#{base_id || ENV['AIRTABLE_BASE_ID']}/#{table_id}/sync/#{sync_id}") do |req|
      req.headers = {
        "Authorization" => "Bearer #{ENV['AIRTABLE_API_KEY']}",
        "Content-Type" => "text/csv"
      }
      req.body = csv_string
    end

    Rails.logger.info("Airtable batch sync response: #{response.status} - #{response.body}")
    raise "Airtable batch sync failed with status #{response.status}: #{response.body}" if response.status < 200 || response.status >= 300
  end

  def self.individual_sync!(table_id, record, mappings, _old_airtable_id, base_id: nil, preloaded: nil)
    fields = build_airtable_fields(record, mappings, preloaded)
    upload_or_create!(table_id, record, fields, base_id: base_id)
  end

  # POST a new row or PATCH an existing one. Idempotent: persists the returned
  # airtable_id back to AirtableSync so subsequent calls PATCH instead of
  # creating duplicates.
  #
  # `identifier:` lets the caller use a custom AirtableSync row when the same
  # AR record syncs to multiple Airtable tables (e.g. a Ship that flows to both
  # the analytics ships table via the cron and the YSWS unified table on
  # approval — distinct identifiers prevent the unique index collision).
  def self.upload_or_create!(table_id, object, fields, identifier: nil, base_id: nil)
    identifier ||= build_identifier(object)
    base_id ||= ENV["AIRTABLE_BASE_ID"]
    old_airtable_id = find_by(record_identifier: identifier)&.airtable_id

    if old_airtable_id.present?
      method = :patch
      url = "https://api.airtable.com/v0/#{base_id}/#{table_id}/#{old_airtable_id}"
    else
      method = :post
      url = "https://api.airtable.com/v0/#{base_id}/#{table_id}"
    end

    response = Faraday.send(method, url) do |req|
      req.headers = {
        "Authorization" => "Bearer #{ENV['AIRTABLE_API_KEY']}",
        "Content-Type" => "application/json"
      }
      req.body = { fields: fields, typecast: true }.to_json
    end

    Rails.logger.info("Airtable individual sync response: #{response.status} - #{response.body}")
    raise "Airtable individual sync failed with status #{response.status}: #{response.body}" if response.status < 200 || response.status >= 300

    airtable_id = JSON.parse(response.body)["id"]

    # Persist airtable_id so the next call PATCHes the same row. Without this,
    # retries after a successful POST would create duplicate Airtable rows.
    sync_record = find_or_initialize_by(record_identifier: identifier)
    sync_record.update!(airtable_id: airtable_id, last_synced_at: Time.current)

    airtable_id
  end

  # POST raw bytes to a record's attachment field via the content.airtable.com
  # uploadAttachment endpoint — used when we have processed bytes (e.g. a JPEG
  # rendered from a repo file) and don't want to host them on a public URL just
  # so Airtable can re-download them.
  #
  # Note: uploadAttachment APPENDS to the field's attachment array. The caller
  # is responsible for skipping repeat calls (use a separate AirtableSync row
  # as an idempotency marker — see AttachShipZineScreenshotJob).
  #
  # Limit: 5MB per attachment after base64 decode (Airtable docs).
  def self.upload_attachment!(record_id:, field_name:, filename:, content_type:, bytes:, base_id: nil)
    base_id ||= ENV["AIRTABLE_BASE_ID"]
    url = "https://content.airtable.com/v0/#{base_id}/#{record_id}/#{field_name}/uploadAttachment"

    response = Faraday.post(url) do |req|
      req.headers = {
        "Authorization" => "Bearer #{ENV['AIRTABLE_API_KEY']}",
        "Content-Type" => "application/json"
      }
      req.body = {
        contentType: content_type,
        filename: filename,
        file: Base64.strict_encode64(bytes)
      }.to_json
    end

    Rails.logger.info("Airtable upload_attachment response: #{response.status}")
    raise "Airtable upload_attachment failed: #{response.status} - #{response.body.to_s[0..200]}" if response.status < 200 || response.status >= 300

    JSON.parse(response.body)
  end

  class << self
    private

    def base_id_for(klass)
      if klass.respond_to?(:airtable_sync_base_id)
        klass.airtable_sync_base_id
      else
        ENV["AIRTABLE_BASE_ID"]
      end
    end

    def resolve_class(classname)
      classname.is_a?(String) ? classname.constantize : classname
    end

    def validate_sync_methods!(klass)
      raise "#{klass.name} must implement airtable_sync_table_id class method" unless klass.respond_to?(:airtable_sync_table_id)
      raise "#{klass.name} must implement airtable_sync_field_mappings class method" unless klass.respond_to?(:airtable_sync_field_mappings)
    end

    def sync_context_for(classname)
      klass = resolve_class(classname)
      validate_sync_methods!(klass)

      {
        klass:,
        base_id: base_id_for(klass),
        table_id: klass.airtable_sync_table_id,
        mappings: klass.airtable_sync_field_mappings,
        sync_id: (klass.airtable_sync_sync_id if klass.respond_to?(:airtable_sync_sync_id)),
        should_multi_batch: klass.respond_to?(:airtable_should_batch) && klass.airtable_should_batch
      }
    end

    def sync_with_records!(klass, records, no_upload:, log_prefix:)
      ctx = sync_context_for(klass)
      klass = ctx[:klass]

      Rails.logger.info("#{log_prefix}: Found #{records.size} #{klass.name} records to sync")

      ctx[:preloaded] = if klass.respond_to?(:airtable_sync_preload)
        klass.airtable_sync_preload(records)
      end

      airtable_ids = if ctx[:sync_id].present?
        perform_batch_sync!(ctx, records, no_upload:, log_prefix:)
        []
      else
        perform_individual_sync!(ctx, records, log_prefix:)
      end

      return records if no_upload

      upsert_sync_state!(records, airtable_ids, batch: ctx[:sync_id].present?)

      records
    end

    def perform_batch_sync!(ctx, records, no_upload:, log_prefix:)
      klass = ctx[:klass]
      total = records.size
      batch_size = effective_batch_size(klass, total)

      if total > MAX_AIRTABLE_BATCH_SIZE && !ctx[:should_multi_batch]
        ErrorReporter.capture_message(
          "Airtable sync exceeds #{MAX_AIRTABLE_BATCH_SIZE} records without multi-batch enabled",
          level: :warning,
          contexts: { airtable: { class_name: klass.name, record_count: total } }
        )
      end

      if ctx[:should_multi_batch] && total > batch_size
        batches = build_equal_batches(records, batch_size)
        batches.each_with_index do |batch_records, index|
          Rails.logger.info("#{log_prefix}: #{klass.name} batch #{index + 1}/#{batches.size} (#{batch_records.size} records)")
          batch_sync!(ctx[:table_id], batch_records, ctx[:sync_id], ctx[:mappings], no_upload:, batch_index: index + 1, base_id: ctx[:base_id], preloaded: ctx[:preloaded])
        end
      else
        batch_sync!(ctx[:table_id], records, ctx[:sync_id], ctx[:mappings], no_upload:, base_id: ctx[:base_id], preloaded: ctx[:preloaded])
      end
    end

    def perform_individual_sync!(ctx, records, log_prefix:)
      total = records.size
      Rails.logger.info("#{log_prefix}: Processing #{total} #{ctx[:klass].name} records in parallel...")

      airtable_ids = parallel_map(records) do |record|
        individual_sync!(ctx[:table_id], record, ctx[:mappings], nil, base_id: ctx[:base_id], preloaded: ctx[:preloaded])
      end

      Rails.logger.info("#{log_prefix}: Finished #{ctx[:klass].name} (#{total} records)")
      airtable_ids
    end

    def upsert_sync_state!(records, airtable_ids, batch:)
      now = Time.current
      ids = airtable_ids.dup
      sync_data = records.map do |record|
        data = {
          record_identifier: build_identifier(record),
          last_synced_at: now,
          created_at: now,
          updated_at: now
        }
        data[:airtable_id] = ids.shift unless batch
        data
      end

      upsert_all(sync_data, unique_by: :record_identifier) if sync_data.any?
    end

    def all_records(klass, limit)
      query = apply_sync_scope(klass, klass.all)
      query = query.limit(limit) if limit.present?
      query.to_a
    end

    def outdated_records(klass, limit)
      table_name = klass.table_name

      join_sql = sanitize_sql_array([
        "LEFT JOIN airtable_syncs ON airtable_syncs.record_identifier = CONCAT(?, '#', #{table_name}.id::text)",
        klass.name
      ])

      where_sql = "airtable_syncs.id IS NULL OR #{table_name}.updated_at > airtable_syncs.last_synced_at"

      records_query = apply_sync_scope(klass, klass.joins(join_sql).where(where_sql))
      records_query = records_query.limit(limit) if limit.present?
      records_query.to_a
    end

    def apply_sync_scope(klass, query)
      klass.respond_to?(:airtable_sync_scope) ? klass.airtable_sync_scope(query) : query
    end

    def parallel_map(items, threads: SYNC_THREAD_COUNT, &)
      return items.map(&) if threads <= 1 || items.size <= 1

      slice_size = [ (items.size.to_f / threads).ceil, 1 ].max
      items.each_slice(slice_size)
           .map { |slice| Thread.new { ActiveRecord::Base.connection_pool.with_connection { slice.map(&) } } }
           .flat_map(&:value)
    end

    def build_airtable_fields(record, field_mappings, preloaded = nil)
      field_mappings.transform_values do |mapping|
        if mapping.is_a?(Proc)
          mapping.arity == 1 ? mapping.call(record) : mapping.call(record, preloaded)
        else
          record.send(mapping)
        end
      end
    end

    def build_identifier(record)
      "#{record.class.name}##{record.id}"
    end

    def build_equal_batches(records, max_batch_size)
      total = records.size
      return [ records ] if total <= max_batch_size

      shuffled = records.shuffle
      num_batches = (total.to_f / max_batch_size).ceil
      batch_size = [ (total.to_f / num_batches).ceil, max_batch_size ].min

      shuffled.each_slice(batch_size).to_a
    end

    def effective_batch_size(klass, total_records)
      configured = klass.respond_to?(:airtable_batch_size) ? klass.airtable_batch_size : nil
      configured = configured.to_i if configured.respond_to?(:to_i)
      configured = nil if configured.nil? || configured <= 0

      base = if configured
        configured
      elsif total_records > MAX_AIRTABLE_BATCH_SIZE
        MAX_AIRTABLE_BATCH_SIZE
      else
        total_records
      end

      [ base, MAX_AIRTABLE_BATCH_SIZE ].min
    end
  end
end
