# == Schema Information
#
# Table name: projects
#
#  id                    :bigint           not null, primary key
#  demo_link             :string
#  description           :text
#  discarded_at          :datetime
#  inactivity_dm_sent_at :datetime
#  is_unlisted           :boolean          default(FALSE), not null
#  name                  :string           not null
#  repo_link             :string
#  tags                  :string           default([]), not null, is an Array
#  created_at            :datetime         not null
#  updated_at            :datetime         not null
#  user_id               :bigint           not null
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
  include Broadcastable

  has_paper_trail

  # Live-update the owner's path page so the has_projects flag flips on create / discard.
  # Collaborator fan-out happens via the Collaborator model's own broadcast.
  broadcasts_updates_to { "path_user_#{user_id}" }
  # Dirty-only public stats refresh; payload intentionally omits project IDs.
  after_commit :broadcast_bulletin_explore_update

  pg_search_scope :search, against: [ :name, :description ], using: { tsearch: { prefix: true } }

  scoped_search on: :id
  scoped_search on: :name
  scoped_search on: :description
  scoped_search on: :repo_link
  scoped_search on: :is_unlisted, aliases: [ :unlisted ], default_operator: :exact_match
  scoped_search on: :created_at
  scoped_search relation: :user, on: :display_name, rename: :owner

  belongs_to :user
  has_many :ships, dependent: :destroy
  has_many :preflight_runs, dependent: :destroy
  has_many :journal_entries, dependent: :destroy
  has_many :kept_journal_entries, -> { kept }, class_name: "JournalEntry"
  has_many :collaborators, -> { kept }, as: :collaboratable, dependent: :destroy
  has_many :collaborator_users, through: :collaborators, source: :user
  has_many :collaboration_invites, -> { kept }, dependent: :destroy
  has_many :pending_collaboration_invites, -> { kept }, dependent: :destroy
  has_many :reviewer_notes, dependent: :destroy
  has_many :project_flags, dependent: :destroy

  def discard
    transaction do
      Collaborator.where(collaboratable: self).each(&:discard)
      CollaborationInvite.where(project: self).each(&:discard)
      journal_entries.each(&:discard)
      super
    end
  end

  def collaborator?(user)
    return false unless user
    collaborator_users.include?(user)
  end

  def owner_or_collaborator?(user)
    return false unless user
    user_id == user.id || collaborator?(user)
  end

  def flagged?
    project_flags.exists?
  end

  validates :name, presence: true
  validates :is_unlisted, inclusion: { in: [ true, false ] }
  validates :demo_link, format: { with: /\Ahttps?:\/\/\S+\z/i, message: "must be a valid URL starting with http:// or https://" }, allow_blank: true
  validates :repo_link, format: { with: /\Ahttps?:\/\/\S+\z/i, message: "must be a valid URL starting with http:// or https://" }, allow_blank: true

  scope :listed, -> { where(is_unlisted: false) }
  scope :public_for_explore, -> { kept.listed }

  def self.airtable_sync_table_id
    "tblrwWzDwN6V4avNP"
  end

  def self.airtable_sync_sync_id
    "I36OalE9"
  end

  def self.airtable_sync_preload(records)
    project_ids = records.map(&:id)

    hours_logged = batch_time_logged(project_ids).transform_values { |s| s.to_f / 3600.0 }

    hours_approved = Ship.where(project_id: project_ids)
      .group(:project_id).sum(:approved_seconds)
      .transform_values { |s| s.to_f / 3600.0 }

    {
      hours_logged: hours_logged,
      hours_approved: hours_approved
    }
  end

  def self.airtable_sync_field_mappings
    {
      "ID" => :id,
      "Name" => :name,
      "Description" => :description,
      "Repo Link" => :repo_link,
      "Created At" => ->(p) { p.created_at&.iso8601 },
      "Author" => ->(p) { p.user&.id },
      "Hours Logged" => ->(p, pre) { (pre[:hours_logged][p.id] || 0).round(2) },
      "Hours Approved" => ->(p, pre) { (pre[:hours_approved][p.id] || 0).round(2) }
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
      .sum(Arel.sql("duration_seconds * stretch_multiplier")).to_i

    lookout = LookoutTimelapse
      .joins(recording: :journal_entry)
      .where(journal_entries: { project_id: id, discarded_at: nil })
      .sum(:duration).to_i

    lapse + youtube + lookout
  end

  # Batch version: returns { project_id => seconds } for a set of project IDs in a single query
  def self.batch_time_logged(project_ids)
    return {} if project_ids.empty?
    sql = <<~SQL.squish
      SELECT je.project_id,
        COALESCE(SUM(CASE r.recordable_type
          WHEN 'LapseTimelapse' THEN lt.duration
          WHEN 'LookoutTimelapse' THEN lot.duration
          WHEN 'YouTubeVideo' THEN yt.duration_seconds * yt.stretch_multiplier
          ELSE 0 END), 0) AS total
      FROM journal_entries je
      JOIN recordings r ON r.journal_entry_id = je.id
      LEFT JOIN lapse_timelapses lt ON lt.id = r.recordable_id AND r.recordable_type = 'LapseTimelapse'
      LEFT JOIN lookout_timelapses lot ON lot.id = r.recordable_id AND r.recordable_type = 'LookoutTimelapse'
      LEFT JOIN you_tube_videos yt ON yt.id = r.recordable_id AND r.recordable_type = 'YouTubeVideo'
      WHERE je.project_id IN (:ids) AND je.discarded_at IS NULL
      GROUP BY je.project_id
    SQL
    result = ActiveRecord::Base.connection.select_rows(
      ActiveRecord::Base.sanitize_sql([ sql, ids: project_ids ])
    )
    result.to_h { |pid, total| [ pid.to_i, total.to_i ] }
  end

  private

  def broadcast_bulletin_explore_update
    return unless bulletin_explore_stats_changed?
    return unless bulletin_explore_public_now? || bulletin_explore_public_before_last_save?

    ActionCable.server.broadcast("live_updates:bulletin_explore", { stream: "bulletin_explore", action: "update" })
  end

  def bulletin_explore_stats_changed?
    previously_new_record? || destroyed? || saved_change_to_discarded_at? || saved_change_to_is_unlisted?
  end

  def bulletin_explore_public_now?
    discarded_at.nil? && !is_unlisted?
  end

  def bulletin_explore_public_before_last_save?
    kept_before = saved_change_to_discarded_at? ? discarded_at_before_last_save.nil? : discarded_at.nil?
    listed_before = saved_change_to_is_unlisted? ? !is_unlisted_before_last_save : !is_unlisted?

    kept_before && listed_before
  end
end
