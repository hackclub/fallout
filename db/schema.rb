# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_04_12_115215) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "active_storage_attachments", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.bigint "record_id", null: false
    t.string "record_type", null: false
    t.index ["blob_id"], name: "index_active_storage_attachments_on_blob_id"
    t.index ["record_type", "record_id", "name", "blob_id"], name: "index_active_storage_attachments_uniqueness", unique: true
  end

  create_table "active_storage_blobs", force: :cascade do |t|
    t.bigint "byte_size", null: false
    t.string "checksum"
    t.string "content_type"
    t.datetime "created_at", null: false
    t.string "filename", null: false
    t.string "key", null: false
    t.text "metadata"
    t.string "service_name", null: false
    t.index ["key"], name: "index_active_storage_blobs_on_key", unique: true
  end

  create_table "active_storage_variant_records", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.string "variation_digest", null: false
    t.index ["blob_id", "variation_digest"], name: "index_active_storage_variant_records_uniqueness", unique: true
  end

  create_table "ahoy_events", force: :cascade do |t|
    t.string "name"
    t.jsonb "properties"
    t.datetime "time"
    t.bigint "user_id"
    t.bigint "visit_id"
    t.index ["name", "time"], name: "index_ahoy_events_on_name_and_time"
    t.index ["properties"], name: "index_ahoy_events_on_properties", opclass: :jsonb_path_ops, using: :gin
    t.index ["user_id"], name: "index_ahoy_events_on_user_id"
    t.index ["visit_id"], name: "index_ahoy_events_on_visit_id"
  end

  create_table "ahoy_visits", force: :cascade do |t|
    t.string "app_version"
    t.string "browser"
    t.string "city"
    t.string "country"
    t.string "device_type"
    t.string "ip"
    t.text "landing_page"
    t.float "latitude"
    t.float "longitude"
    t.string "os"
    t.string "os_version"
    t.string "platform"
    t.text "referrer"
    t.string "referring_domain"
    t.string "region"
    t.datetime "started_at"
    t.text "user_agent"
    t.bigint "user_id"
    t.string "utm_campaign"
    t.string "utm_content"
    t.string "utm_medium"
    t.string "utm_source"
    t.string "utm_term"
    t.string "visit_token"
    t.string "visitor_token"
    t.index ["user_id", "started_at"], name: "index_ahoy_visits_on_user_locatable", order: { started_at: :desc }, where: "((country IS NOT NULL) AND ((country)::text <> ''::text))"
    t.index ["user_id"], name: "index_ahoy_visits_on_user_id"
    t.index ["visit_token"], name: "index_ahoy_visits_on_visit_token", unique: true
    t.index ["visitor_token", "started_at"], name: "index_ahoy_visits_on_visitor_token_and_started_at"
  end

  create_table "airtable_syncs", force: :cascade do |t|
    t.string "airtable_id"
    t.datetime "created_at", null: false
    t.datetime "last_synced_at"
    t.string "record_identifier", null: false
    t.string "synced_attributes_hash"
    t.datetime "updated_at", null: false
    t.index ["record_identifier"], name: "index_airtable_syncs_on_record_identifier", unique: true
  end

  create_table "build_reviews", force: :cascade do |t|
    t.jsonb "annotations"
    t.datetime "claim_expires_at"
    t.datetime "created_at", null: false
    t.text "feedback"
    t.integer "hours_adjustment"
    t.text "internal_reason"
    t.integer "koi_adjustment"
    t.integer "lock_version", default: 0, null: false
    t.bigint "reviewer_id"
    t.bigint "ship_id", null: false
    t.integer "status", default: 0, null: false
    t.datetime "updated_at", null: false
    t.index ["reviewer_id"], name: "index_build_reviews_on_reviewer_id"
    t.index ["ship_id"], name: "index_build_reviews_on_ship_id", unique: true
    t.index ["status", "claim_expires_at"], name: "index_build_reviews_on_status_and_claim_expires_at"
    t.index ["status"], name: "index_build_reviews_on_status"
  end

  create_table "collaboration_invites", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.datetime "discarded_at"
    t.bigint "invitee_id", null: false
    t.bigint "inviter_id", null: false
    t.bigint "project_id", null: false
    t.integer "status", default: 0, null: false
    t.datetime "updated_at", null: false
    t.index ["discarded_at"], name: "index_collaboration_invites_on_discarded_at"
    t.index ["invitee_id"], name: "index_collaboration_invites_on_invitee_id"
    t.index ["inviter_id"], name: "index_collaboration_invites_on_inviter_id"
    t.index ["project_id", "invitee_id", "status"], name: "index_collaboration_invites_on_project_invitee_status"
    t.index ["project_id"], name: "index_collaboration_invites_on_project_id"
  end

  create_table "collaborators", force: :cascade do |t|
    t.bigint "collaboratable_id", null: false
    t.string "collaboratable_type", null: false
    t.datetime "created_at", null: false
    t.datetime "discarded_at"
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["collaboratable_type", "collaboratable_id"], name: "index_collaborators_on_collaboratable"
    t.index ["discarded_at"], name: "index_collaborators_on_discarded_at"
    t.index ["user_id", "collaboratable_type", "collaboratable_id"], name: "index_collaborators_uniqueness", unique: true
    t.index ["user_id"], name: "index_collaborators_on_user_id"
  end

  create_table "collapse_timelapses", force: :cascade do |t|
    t.string "collapse_session_id", null: false
    t.datetime "created_at", null: false
    t.datetime "last_refreshed_at"
    t.string "name"
    t.integer "screenshot_count"
    t.text "session_token", null: false
    t.string "status"
    t.string "thumbnail_url"
    t.integer "tracked_seconds"
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.string "video_url"
    t.index ["collapse_session_id"], name: "index_collapse_timelapses_on_collapse_session_id", unique: true
    t.index ["user_id"], name: "index_collapse_timelapses_on_user_id"
  end

  create_table "critters", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "journal_entry_id", null: false
    t.boolean "spun", default: false, null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.string "variant", null: false
    t.index ["journal_entry_id"], name: "index_critters_on_journal_entry_id"
    t.index ["user_id", "created_at"], name: "index_critters_on_user_id_and_created_at"
    t.index ["user_id"], name: "index_critters_on_user_id"
  end

  create_table "design_reviews", force: :cascade do |t|
    t.jsonb "annotations"
    t.datetime "claim_expires_at"
    t.datetime "created_at", null: false
    t.text "feedback"
    t.integer "hours_adjustment"
    t.text "internal_reason"
    t.integer "koi_adjustment"
    t.integer "lock_version", default: 0, null: false
    t.bigint "reviewer_id"
    t.bigint "ship_id", null: false
    t.integer "status", default: 0, null: false
    t.datetime "updated_at", null: false
    t.index ["reviewer_id"], name: "index_design_reviews_on_reviewer_id"
    t.index ["ship_id"], name: "index_design_reviews_on_ship_id", unique: true
    t.index ["status", "claim_expires_at"], name: "index_design_reviews_on_status_and_claim_expires_at"
    t.index ["status"], name: "index_design_reviews_on_status"
  end

  create_table "dialog_campaigns", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "key", null: false
    t.datetime "seen_at"
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["user_id", "key"], name: "index_dialog_campaigns_on_user_id_and_key", unique: true
    t.index ["user_id"], name: "index_dialog_campaigns_on_user_id"
  end

  create_table "flipper_features", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "key", null: false
    t.datetime "updated_at", null: false
    t.index ["key"], name: "index_flipper_features_on_key", unique: true
  end

  create_table "flipper_gates", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "feature_key", null: false
    t.string "key", null: false
    t.datetime "updated_at", null: false
    t.text "value"
    t.index ["feature_key", "key", "value"], name: "index_flipper_gates_on_feature_key_and_key_and_value", unique: true
  end

  create_table "hcb_connections", force: :cascade do |t|
    t.text "access_token"
    t.datetime "connected_at"
    t.bigint "connected_by_id", null: false
    t.datetime "created_at", null: false
    t.text "refresh_token"
    t.datetime "token_expires_at"
    t.datetime "updated_at", null: false
    t.index ["connected_by_id"], name: "index_hcb_connections_on_connected_by_id"
  end

  create_table "hcb_grant_cards", force: :cascade do |t|
    t.integer "amount_cents", null: false
    t.integer "balance_cents"
    t.datetime "canceled_at"
    t.string "card_id"
    t.string "category_lock", default: [], null: false, array: true
    t.datetime "created_at", null: false
    t.string "email"
    t.date "expires_on"
    t.string "hcb_id"
    t.string "keyword_lock"
    t.string "last4"
    t.datetime "last_synced_at"
    t.string "merchant_lock", default: [], null: false, array: true
    t.boolean "one_time_use", default: false, null: false
    t.string "purpose"
    t.string "status", default: "active", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["hcb_id"], name: "index_hcb_grant_cards_on_hcb_id", unique: true
    t.index ["user_id", "status"], name: "index_hcb_grant_cards_on_user_id_and_status"
    t.index ["user_id"], name: "index_hcb_grant_cards_on_user_id"
    t.index ["user_id"], name: "index_hcb_grant_cards_on_user_id_active_unique", unique: true, where: "((status)::text = 'active'::text)"
  end

  create_table "hcb_transactions", force: :cascade do |t|
    t.integer "amount_cents", null: false
    t.datetime "created_at", null: false
    t.boolean "declined", default: false, null: false
    t.bigint "hcb_grant_card_id", null: false
    t.string "hcb_id", null: false
    t.datetime "last_synced_at"
    t.string "memo"
    t.string "merchant_name"
    t.boolean "pending", default: false, null: false
    t.boolean "reversed", default: false, null: false
    t.datetime "transaction_date", null: false
    t.datetime "updated_at", null: false
    t.index ["hcb_grant_card_id", "transaction_date"], name: "index_hcb_transactions_on_card_and_date"
    t.index ["hcb_grant_card_id"], name: "index_hcb_transactions_on_hcb_grant_card_id"
    t.index ["hcb_id"], name: "index_hcb_transactions_on_hcb_id", unique: true
  end

  create_table "journal_entries", force: :cascade do |t|
    t.text "content"
    t.datetime "created_at", null: false
    t.datetime "discarded_at"
    t.bigint "project_id", null: false
    t.bigint "ship_id"
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["discarded_at"], name: "index_journal_entries_on_discarded_at"
    t.index ["project_id"], name: "index_journal_entries_on_project_id"
    t.index ["ship_id"], name: "index_journal_entries_on_ship_id"
    t.index ["user_id"], name: "index_journal_entries_on_user_id"
  end

  create_table "koi_transactions", force: :cascade do |t|
    t.bigint "actor_id"
    t.integer "amount", null: false
    t.datetime "created_at", null: false
    t.text "description", null: false
    t.string "reason", null: false
    t.bigint "user_id", null: false
    t.index ["actor_id"], name: "index_koi_transactions_on_actor_id"
    t.index ["user_id", "created_at"], name: "index_koi_transactions_on_user_id_and_created_at"
    t.index ["user_id"], name: "index_koi_transactions_on_user_id"
  end

  create_table "lapse_timelapses", force: :cascade do |t|
    t.datetime "activity_checked_at"
    t.datetime "created_at", null: false
    t.text "description"
    t.float "duration"
    t.integer "inactive_frame_count"
    t.float "inactive_percentage"
    t.jsonb "inactive_segments", default: []
    t.boolean "is_published"
    t.datetime "lapse_created_at"
    t.string "lapse_timelapse_id", null: false
    t.datetime "last_refreshed_at"
    t.string "name"
    t.string "owner_handle"
    t.string "owner_lapse_id"
    t.string "playback_url"
    t.string "thumbnail_url"
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.string "video_container_kind"
    t.string "visibility"
    t.index ["lapse_timelapse_id"], name: "index_lapse_timelapses_on_lapse_timelapse_id", unique: true
    t.index ["user_id"], name: "index_lapse_timelapses_on_user_id"
  end

  create_table "lookout_timelapses", force: :cascade do |t|
    t.datetime "activity_checked_at"
    t.datetime "created_at", null: false
    t.float "duration"
    t.integer "inactive_frame_count"
    t.float "inactive_percentage"
    t.jsonb "inactive_segments", default: []
    t.datetime "last_refreshed_at"
    t.string "name"
    t.string "playback_url"
    t.text "session_token", null: false
    t.string "thumbnail_url"
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["session_token"], name: "index_lookout_timelapses_on_session_token", unique: true
    t.index ["user_id"], name: "index_lookout_timelapses_on_user_id"
  end

  create_table "mail_interactions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.datetime "dismissed_at"
    t.bigint "mail_message_id", null: false
    t.datetime "read_at"
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["mail_message_id"], name: "index_mail_interactions_on_mail_message_id"
    t.index ["user_id", "mail_message_id"], name: "index_mail_interactions_on_user_id_and_mail_message_id", unique: true
    t.index ["user_id"], name: "index_mail_interactions_on_user_id"
  end

  create_table "mail_messages", force: :cascade do |t|
    t.string "action_url"
    t.bigint "author_id"
    t.text "content"
    t.datetime "created_at", null: false
    t.boolean "dismissable", default: true, null: false
    t.datetime "expires_at"
    t.jsonb "filters", default: {}, null: false
    t.boolean "pinned", default: false, null: false
    t.bigint "source_id"
    t.string "source_type"
    t.string "summary", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id"
    t.index ["expires_at"], name: "index_mail_messages_on_expires_at"
    t.index ["filters"], name: "index_mail_messages_on_filters", opclass: :jsonb_path_ops, using: :gin
    t.index ["source_type", "source_id"], name: "index_mail_messages_on_source_type_and_source_id"
    t.index ["user_id"], name: "index_mail_messages_on_user_id"
  end

  create_table "onboarding_responses", force: :cascade do |t|
    t.text "answer_text", default: "", null: false
    t.datetime "created_at", null: false
    t.boolean "is_other", default: false, null: false
    t.string "question_key", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["user_id", "question_key"], name: "index_onboarding_responses_on_user_id_and_question_key", unique: true
    t.index ["user_id"], name: "index_onboarding_responses_on_user_id"
  end

  create_table "pending_collaboration_invites", force: :cascade do |t|
    t.bigint "collaboration_invite_id"
    t.datetime "created_at", null: false
    t.datetime "discarded_at"
    t.string "invitee_email", null: false
    t.bigint "inviter_id", null: false
    t.bigint "project_id", null: false
    t.integer "status", default: 0, null: false
    t.string "token", null: false
    t.datetime "updated_at", null: false
    t.index ["collaboration_invite_id"], name: "index_pending_collaboration_invites_on_collaboration_invite_id"
    t.index ["discarded_at"], name: "index_pending_collaboration_invites_on_discarded_at"
    t.index ["inviter_id"], name: "index_pending_collaboration_invites_on_inviter_id"
    t.index ["project_id", "invitee_email", "status"], name: "idx_pending_collab_invites_on_project_email_status"
    t.index ["project_id"], name: "index_pending_collaboration_invites_on_project_id"
    t.index ["token"], name: "index_pending_collaboration_invites_on_token", unique: true
  end

  create_table "preflight_runs", force: :cascade do |t|
    t.jsonb "all_results", default: []
    t.jsonb "checks", default: []
    t.datetime "created_at", null: false
    t.bigint "project_id", null: false
    t.integer "status", default: 0, null: false
    t.datetime "updated_at", null: false
    t.index ["project_id"], name: "index_preflight_runs_on_project_id"
  end

  create_table "project_flags", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "project_id", null: false
    t.text "reason", null: false
    t.string "review_stage"
    t.bigint "ship_id"
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["project_id"], name: "index_project_flags_on_project_id"
    t.index ["ship_id"], name: "index_project_flags_on_ship_id"
    t.index ["user_id"], name: "index_project_flags_on_user_id"
  end

  create_table "projects", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "demo_link"
    t.text "description"
    t.datetime "discarded_at"
    t.datetime "inactivity_dm_sent_at"
    t.boolean "is_unlisted", default: false, null: false
    t.string "name", null: false
    t.string "repo_link"
    t.string "tags", default: [], null: false, array: true
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["discarded_at"], name: "index_projects_on_discarded_at"
    t.index ["is_unlisted"], name: "index_projects_on_is_unlisted"
    t.index ["tags"], name: "index_projects_on_tags", using: :gin
    t.index ["user_id"], name: "index_projects_on_user_id"
  end

  create_table "recordings", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "journal_entry_id", null: false
    t.bigint "recordable_id", null: false
    t.string "recordable_type", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["journal_entry_id"], name: "index_recordings_on_journal_entry_id"
    t.index ["recordable_type", "recordable_id"], name: "index_recordings_on_recordable_type_and_recordable_id", unique: true
    t.index ["user_id"], name: "index_recordings_on_user_id"
  end

  create_table "requirements_check_reviews", force: :cascade do |t|
    t.datetime "claim_expires_at"
    t.datetime "created_at", null: false
    t.text "feedback"
    t.text "internal_reason"
    t.integer "lock_version", default: 0, null: false
    t.jsonb "repo_tree"
    t.bigint "reviewer_id"
    t.bigint "ship_id", null: false
    t.integer "status", default: 0, null: false
    t.datetime "updated_at", null: false
    t.index ["reviewer_id"], name: "index_requirements_check_reviews_on_reviewer_id"
    t.index ["ship_id"], name: "index_requirements_check_reviews_on_ship_id", unique: true
    t.index ["status", "claim_expires_at"], name: "idx_on_status_claim_expires_at_8572608249"
    t.index ["status"], name: "index_requirements_check_reviews_on_status"
  end

  create_table "reviewer_notes", force: :cascade do |t|
    t.text "body", null: false
    t.datetime "created_at", null: false
    t.bigint "project_id", null: false
    t.string "review_stage"
    t.bigint "ship_id"
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["project_id"], name: "index_reviewer_notes_on_project_id"
    t.index ["ship_id"], name: "index_reviewer_notes_on_ship_id"
    t.index ["user_id"], name: "index_reviewer_notes_on_user_id"
  end

  create_table "ships", force: :cascade do |t|
    t.integer "approved_seconds"
    t.datetime "created_at", null: false
    t.text "feedback"
    t.string "frozen_demo_link"
    t.text "frozen_hca_data"
    t.string "frozen_repo_link"
    t.string "frozen_screenshot"
    t.string "justification"
    t.jsonb "preflight_results"
    t.bigint "preflight_run_id"
    t.bigint "project_id", null: false
    t.bigint "reviewer_id"
    t.integer "ship_type", default: 0, null: false
    t.integer "status", default: 0, null: false
    t.datetime "updated_at", null: false
    t.index ["preflight_run_id"], name: "index_ships_on_preflight_run_id"
    t.index ["project_id"], name: "index_ships_on_project_id"
    t.index ["reviewer_id"], name: "index_ships_on_reviewer_id"
    t.index ["ship_type"], name: "index_ships_on_ship_type"
    t.index ["status"], name: "index_ships_on_status"
  end

  create_table "shop_items", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "description"
    t.boolean "featured", default: false, null: false
    t.string "image_url"
    t.string "name"
    t.integer "price"
    t.string "status", default: "available", null: false
    t.boolean "ticket", default: false, null: false
    t.datetime "updated_at", null: false
    t.index ["status"], name: "index_shop_items_on_status"
  end

  create_table "shop_orders", force: :cascade do |t|
    t.text "address"
    t.text "admin_note"
    t.datetime "created_at", null: false
    t.integer "frozen_price", null: false
    t.string "phone"
    t.integer "quantity", default: 1, null: false
    t.bigint "shop_item_id", null: false
    t.string "state", default: "pending", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["shop_item_id"], name: "index_shop_orders_on_shop_item_id"
    t.index ["state"], name: "index_shop_orders_on_state"
    t.index ["user_id"], name: "index_shop_orders_on_user_id"
  end

  create_table "solid_queue_blocked_executions", force: :cascade do |t|
    t.string "concurrency_key", null: false
    t.datetime "created_at", null: false
    t.datetime "expires_at", null: false
    t.bigint "job_id", null: false
    t.integer "priority", default: 0, null: false
    t.string "queue_name", null: false
    t.index ["concurrency_key", "priority", "job_id"], name: "index_solid_queue_blocked_executions_for_release"
    t.index ["expires_at", "concurrency_key"], name: "index_solid_queue_blocked_executions_for_maintenance"
    t.index ["job_id"], name: "index_solid_queue_blocked_executions_on_job_id", unique: true
  end

  create_table "solid_queue_claimed_executions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "job_id", null: false
    t.bigint "process_id"
    t.index ["job_id"], name: "index_solid_queue_claimed_executions_on_job_id", unique: true
    t.index ["process_id", "job_id"], name: "index_solid_queue_claimed_executions_on_process_id_and_job_id"
  end

  create_table "solid_queue_failed_executions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "error"
    t.bigint "job_id", null: false
    t.index ["job_id"], name: "index_solid_queue_failed_executions_on_job_id", unique: true
  end

  create_table "solid_queue_jobs", force: :cascade do |t|
    t.string "active_job_id"
    t.text "arguments"
    t.string "class_name", null: false
    t.string "concurrency_key"
    t.datetime "created_at", null: false
    t.datetime "finished_at"
    t.integer "priority", default: 0, null: false
    t.string "queue_name", null: false
    t.datetime "scheduled_at"
    t.datetime "updated_at", null: false
    t.index ["active_job_id"], name: "index_solid_queue_jobs_on_active_job_id"
    t.index ["class_name"], name: "index_solid_queue_jobs_on_class_name"
    t.index ["finished_at"], name: "index_solid_queue_jobs_on_finished_at"
    t.index ["queue_name", "finished_at"], name: "index_solid_queue_jobs_for_filtering"
    t.index ["scheduled_at", "finished_at"], name: "index_solid_queue_jobs_for_alerting"
  end

  create_table "solid_queue_pauses", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "queue_name", null: false
    t.index ["queue_name"], name: "index_solid_queue_pauses_on_queue_name", unique: true
  end

  create_table "solid_queue_processes", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "hostname"
    t.string "kind", null: false
    t.datetime "last_heartbeat_at", null: false
    t.text "metadata"
    t.string "name", null: false
    t.integer "pid", null: false
    t.bigint "supervisor_id"
    t.index ["last_heartbeat_at"], name: "index_solid_queue_processes_on_last_heartbeat_at"
    t.index ["name", "supervisor_id"], name: "index_solid_queue_processes_on_name_and_supervisor_id", unique: true
    t.index ["supervisor_id"], name: "index_solid_queue_processes_on_supervisor_id"
  end

  create_table "solid_queue_ready_executions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "job_id", null: false
    t.integer "priority", default: 0, null: false
    t.string "queue_name", null: false
    t.index ["job_id"], name: "index_solid_queue_ready_executions_on_job_id", unique: true
    t.index ["priority", "job_id"], name: "index_solid_queue_poll_all"
    t.index ["queue_name", "priority", "job_id"], name: "index_solid_queue_poll_by_queue"
  end

  create_table "solid_queue_recurring_executions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "job_id", null: false
    t.datetime "run_at", null: false
    t.string "task_key", null: false
    t.index ["job_id"], name: "index_solid_queue_recurring_executions_on_job_id", unique: true
    t.index ["task_key", "run_at"], name: "index_solid_queue_recurring_executions_on_task_key_and_run_at", unique: true
  end

  create_table "solid_queue_recurring_tasks", force: :cascade do |t|
    t.text "arguments"
    t.string "class_name"
    t.string "command", limit: 2048
    t.datetime "created_at", null: false
    t.text "description"
    t.string "key", null: false
    t.integer "priority", default: 0
    t.string "queue_name"
    t.string "schedule", null: false
    t.boolean "static", default: true, null: false
    t.datetime "updated_at", null: false
    t.index ["key"], name: "index_solid_queue_recurring_tasks_on_key", unique: true
    t.index ["static"], name: "index_solid_queue_recurring_tasks_on_static"
  end

  create_table "solid_queue_scheduled_executions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "job_id", null: false
    t.integer "priority", default: 0, null: false
    t.string "queue_name", null: false
    t.datetime "scheduled_at", null: false
    t.index ["job_id"], name: "index_solid_queue_scheduled_executions_on_job_id", unique: true
    t.index ["scheduled_at", "priority", "job_id"], name: "index_solid_queue_dispatch_all"
  end

  create_table "solid_queue_semaphores", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.datetime "expires_at", null: false
    t.string "key", null: false
    t.datetime "updated_at", null: false
    t.integer "value", default: 1, null: false
    t.index ["expires_at"], name: "index_solid_queue_semaphores_on_expires_at"
    t.index ["key", "value"], name: "index_solid_queue_semaphores_on_key_and_value"
    t.index ["key"], name: "index_solid_queue_semaphores_on_key", unique: true
  end

  create_table "streak_days", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.date "date", null: false
    t.integer "status", default: 0, null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["user_id", "date"], name: "index_streak_days_on_user_id_and_date", unique: true
    t.index ["user_id"], name: "index_streak_days_on_user_id"
  end

  create_table "streak_events", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.boolean "dialog_seen", default: false, null: false
    t.string "event_type", null: false
    t.jsonb "metadata", default: {}, null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["user_id", "event_type"], name: "index_streak_events_on_user_id_and_event_type"
    t.index ["user_id"], name: "index_streak_events_on_user_id"
  end

  create_table "streak_goals", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.boolean "notify_streak_events", default: true, null: false
    t.date "started_on", null: false
    t.integer "target_days", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["user_id"], name: "index_streak_goals_on_user_id", unique: true
  end

  create_table "time_audit_reviews", force: :cascade do |t|
    t.jsonb "annotations"
    t.integer "approved_seconds"
    t.datetime "claim_expires_at"
    t.datetime "created_at", null: false
    t.text "feedback"
    t.integer "lock_version", default: 0, null: false
    t.bigint "reviewer_id"
    t.bigint "ship_id", null: false
    t.integer "status", default: 0, null: false
    t.datetime "updated_at", null: false
    t.index ["reviewer_id"], name: "index_time_audit_reviews_on_reviewer_id"
    t.index ["ship_id"], name: "index_time_audit_reviews_on_ship_id", unique: true
    t.index ["status", "claim_expires_at"], name: "index_time_audit_reviews_on_status_and_claim_expires_at"
    t.index ["status"], name: "index_time_audit_reviews_on_status"
  end

  create_table "users", force: :cascade do |t|
    t.string "avatar", null: false
    t.datetime "created_at", null: false
    t.text "device_token"
    t.datetime "discarded_at"
    t.string "display_name", null: false
    t.string "email", null: false
    t.string "hca_id"
    t.text "hca_token"
    t.boolean "is_adult", default: false, null: false
    t.boolean "is_banned", default: false, null: false
    t.text "lapse_token"
    t.boolean "onboarded", default: false, null: false
    t.string "pending_lookout_tokens", default: [], null: false, array: true
    t.string "roles", default: [], null: false, array: true
    t.string "slack_id"
    t.integer "streak_freezes", default: 1, null: false
    t.boolean "streak_in_app_notifications", default: true, null: false
    t.boolean "streak_slack_notifications", default: true, null: false
    t.string "timezone", null: false
    t.string "type"
    t.datetime "updated_at", null: false
    t.string "verification_status"
    t.index ["device_token"], name: "index_users_on_device_token"
    t.index ["discarded_at"], name: "index_users_on_discarded_at"
    t.index ["email"], name: "index_users_unique_verified_email", unique: true, where: "((type IS NULL) AND (discarded_at IS NULL))"
    t.index ["hca_id"], name: "index_users_on_hca_id", unique: true, where: "(hca_id IS NOT NULL)"
    t.check_constraint "streak_freezes >= 0", name: "streak_freezes_non_negative"
  end

  create_table "versions", force: :cascade do |t|
    t.datetime "created_at"
    t.string "event", null: false
    t.bigint "item_id", null: false
    t.string "item_type", null: false
    t.text "object"
    t.jsonb "object_changes"
    t.string "whodunnit"
    t.index ["item_type", "item_id"], name: "index_versions_on_item_type_and_item_id"
    t.index ["object_changes"], name: "index_versions_on_object_changes", using: :gin
  end

  create_table "you_tube_videos", force: :cascade do |t|
    t.datetime "activity_checked_at"
    t.boolean "caption"
    t.string "category_id"
    t.string "channel_id"
    t.string "channel_title"
    t.datetime "created_at", null: false
    t.string "definition"
    t.text "description"
    t.integer "duration_seconds"
    t.integer "inactive_frame_count"
    t.float "inactive_percentage"
    t.jsonb "inactive_segments", default: []
    t.datetime "last_refreshed_at"
    t.string "live_broadcast_content"
    t.datetime "published_at"
    t.text "tags"
    t.string "thumbnail_url"
    t.string "title"
    t.datetime "updated_at", null: false
    t.string "video_id", null: false
    t.boolean "was_live", default: false
    t.index ["video_id"], name: "index_you_tube_videos_on_video_id", unique: true
  end

  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
  add_foreign_key "build_reviews", "ships"
  add_foreign_key "build_reviews", "users", column: "reviewer_id"
  add_foreign_key "collaboration_invites", "projects"
  add_foreign_key "collaboration_invites", "users", column: "invitee_id"
  add_foreign_key "collaboration_invites", "users", column: "inviter_id"
  add_foreign_key "collaborators", "users"
  add_foreign_key "collapse_timelapses", "users"
  add_foreign_key "critters", "journal_entries"
  add_foreign_key "critters", "users"
  add_foreign_key "design_reviews", "ships"
  add_foreign_key "design_reviews", "users", column: "reviewer_id"
  add_foreign_key "dialog_campaigns", "users", name: "dialog_campaigns_user_id_fkey"
  add_foreign_key "hcb_connections", "users", column: "connected_by_id"
  add_foreign_key "hcb_grant_cards", "users"
  add_foreign_key "hcb_transactions", "hcb_grant_cards"
  add_foreign_key "journal_entries", "projects"
  add_foreign_key "journal_entries", "ships"
  add_foreign_key "journal_entries", "users"
  add_foreign_key "koi_transactions", "users"
  add_foreign_key "koi_transactions", "users", column: "actor_id"
  add_foreign_key "lapse_timelapses", "users"
  add_foreign_key "lookout_timelapses", "users"
  add_foreign_key "mail_interactions", "mail_messages"
  add_foreign_key "mail_interactions", "users"
  add_foreign_key "mail_messages", "users"
  add_foreign_key "mail_messages", "users", column: "author_id"
  add_foreign_key "onboarding_responses", "users"
  add_foreign_key "pending_collaboration_invites", "collaboration_invites"
  add_foreign_key "pending_collaboration_invites", "projects"
  add_foreign_key "pending_collaboration_invites", "users", column: "inviter_id"
  add_foreign_key "preflight_runs", "projects"
  add_foreign_key "project_flags", "projects"
  add_foreign_key "project_flags", "ships"
  add_foreign_key "project_flags", "users"
  add_foreign_key "projects", "users"
  add_foreign_key "recordings", "journal_entries"
  add_foreign_key "recordings", "users"
  add_foreign_key "requirements_check_reviews", "ships"
  add_foreign_key "requirements_check_reviews", "users", column: "reviewer_id"
  add_foreign_key "reviewer_notes", "projects"
  add_foreign_key "reviewer_notes", "ships"
  add_foreign_key "reviewer_notes", "users"
  add_foreign_key "ships", "preflight_runs"
  add_foreign_key "ships", "projects"
  add_foreign_key "ships", "users", column: "reviewer_id"
  add_foreign_key "shop_orders", "shop_items"
  add_foreign_key "shop_orders", "users"
  add_foreign_key "solid_queue_blocked_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_claimed_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_failed_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_ready_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_recurring_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "solid_queue_scheduled_executions", "solid_queue_jobs", column: "job_id", on_delete: :cascade
  add_foreign_key "streak_days", "users"
  add_foreign_key "streak_events", "users"
  add_foreign_key "streak_goals", "users"
  add_foreign_key "time_audit_reviews", "ships"
  add_foreign_key "time_audit_reviews", "users", column: "reviewer_id"
end
