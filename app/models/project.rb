# == Schema Information
#
# Table name: projects
#
#  id           :bigint           not null, primary key
#  demo_link    :string
#  description  :text
#  discarded_at :datetime
#  is_unlisted  :boolean          default(FALSE), not null
#  name         :string           not null
#  repo_link    :string
#  tags         :string           default([]), not null, is an Array
#  created_at   :datetime         not null
#  updated_at   :datetime         not null
#  user_id      :bigint           not null
#
# Indexes
#
#  index_projects_on_discarded_at  (discarded_at)
#  index_projects_on_is_unlisted   (is_unlisted)
#  index_projects_on_tags          (tags) USING gin
#  index_projects_on_user_id       (user_id)
#
# Foreign Keys
#
#  fk_rails_...  (user_id => users.id)
#
class Project < ApplicationRecord
  include Discardable
  include PgSearch::Model

  has_paper_trail

  pg_search_scope :search, against: [ :name, :description ], using: { tsearch: { prefix: true } }

  belongs_to :user
  has_many :ships, dependent: :destroy
  has_many :journal_entries, dependent: :destroy
  has_many :kept_journal_entries, -> { kept }, class_name: "JournalEntry"

  validates :name, presence: true
  validates :is_unlisted, inclusion: { in: [ true, false ] }
  validates :demo_link, format: { with: /\Ahttps?:\/\/\S+\z/i, message: "must be a valid URL starting with http:// or https://" }, allow_blank: true
  validates :repo_link, format: { with: /\Ahttps?:\/\/\S+\z/i, message: "must be a valid URL starting with http:// or https://" }, allow_blank: true

  scope :listed, -> { where(is_unlisted: false) }

  def self.airtable_sync_table_id
    "tblrwWzDwN6V4avNP"
  end

  def self.airtable_sync_sync_id
    "I36OalE9"
  end

  def self.airtable_sync_field_mappings
    {
      "ID" => :id,
      "Name" => :name,
      "Description" => :description,
      "Repo Link" => :repo_link,
      "Created At" => ->(p) { p.created_at&.iso8601 },
      "Author" => ->(p) { p.user&.id }
    }
  end

  def time_logged
    lapse = LapseTimelapse
      .joins(recording: :journal_entry)
      .where(journal_entries: { project_id: id, discarded_at: nil })
      .sum(:duration).to_i

    youtube = YouTubeVideo
      .joins(recording: :journal_entry)
      .where(journal_entries: { project_id: id, discarded_at: nil })
      .sum(:duration_seconds).to_i

    lapse + youtube
  end
end
