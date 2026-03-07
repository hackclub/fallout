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

ActiveRecord::Schema[8.1].define(version: 2026_03_07_204529) do
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
    t.index ["user_id"], name: "index_ahoy_visits_on_user_id"
    t.index ["visit_token"], name: "index_ahoy_visits_on_visit_token", unique: true
    t.index ["visitor_token", "started_at"], name: "index_ahoy_visits_on_visitor_token_and_started_at"
  end

  create_table "journal_entries", force: :cascade do |t|
    t.text "content"
    t.datetime "created_at", null: false
    t.datetime "discarded_at"
    t.bigint "project_id", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["discarded_at"], name: "index_journal_entries_on_discarded_at"
    t.index ["project_id"], name: "index_journal_entries_on_project_id"
    t.index ["user_id"], name: "index_journal_entries_on_user_id"
  end

  create_table "lapse_timelapses", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "description"
    t.float "duration"
    t.boolean "is_published"
    t.bigint "journal_entry_id"
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
    t.index ["journal_entry_id"], name: "index_lapse_timelapses_on_journal_entry_id"
    t.index ["lapse_timelapse_id"], name: "index_lapse_timelapses_on_lapse_timelapse_id", unique: true
    t.index ["user_id"], name: "index_lapse_timelapses_on_user_id"
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

  create_table "projects", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "demo_link"
    t.text "description"
    t.datetime "discarded_at"
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

  create_table "ships", force: :cascade do |t|
    t.integer "approved_seconds"
    t.datetime "created_at", null: false
    t.text "feedback"
    t.string "frozen_demo_link"
    t.text "frozen_hca_data"
    t.string "frozen_repo_link"
    t.string "frozen_screenshot"
    t.string "justification"
    t.bigint "project_id", null: false
    t.bigint "reviewer_id"
    t.integer "status", default: 0, null: false
    t.datetime "updated_at", null: false
    t.index ["project_id"], name: "index_ships_on_project_id"
    t.index ["reviewer_id"], name: "index_ships_on_reviewer_id"
    t.index ["status"], name: "index_ships_on_status"
  end

  create_table "users", force: :cascade do |t|
    t.string "avatar", null: false
    t.datetime "created_at", null: false
    t.string "device_token"
    t.datetime "discarded_at"
    t.string "display_name", null: false
    t.string "email", null: false
    t.string "hca_id"
    t.text "hca_token"
    t.boolean "is_adult", default: false, null: false
    t.boolean "is_banned", default: false, null: false
    t.text "lapse_token"
    t.boolean "onboarded", default: false, null: false
    t.string "roles", default: [], null: false, array: true
    t.string "slack_id"
    t.string "timezone", null: false
    t.string "type"
    t.datetime "updated_at", null: false
    t.string "verification_status"
    t.index ["device_token"], name: "index_users_on_device_token"
    t.index ["discarded_at"], name: "index_users_on_discarded_at"
    t.index ["email"], name: "index_users_unique_verified_email", unique: true, where: "((type IS NULL) AND (discarded_at IS NULL))"
  end

  create_table "versions", force: :cascade do |t|
    t.datetime "created_at"
    t.string "event", null: false
    t.bigint "item_id", null: false
    t.string "item_type", null: false
    t.text "object"
    t.string "whodunnit"
    t.index ["item_type", "item_id"], name: "index_versions_on_item_type_and_item_id"
  end

  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
  add_foreign_key "journal_entries", "projects"
  add_foreign_key "journal_entries", "users"
  add_foreign_key "lapse_timelapses", "journal_entries"
  add_foreign_key "lapse_timelapses", "users"
  add_foreign_key "onboarding_responses", "users"
  add_foreign_key "projects", "users"
  add_foreign_key "ships", "projects"
  add_foreign_key "ships", "users", column: "reviewer_id"
end
