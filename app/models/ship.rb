# == Schema Information
#
# Table name: ships
#
#  id                      :bigint           not null, primary key
#  approved_public_seconds :integer
#  feedback                :text
#  frozen_demo_link        :string
#  frozen_hca_data         :text
#  frozen_repo_link        :string
#  frozen_screenshot       :string
#  justification           :string
#  preflight_results       :jsonb
#  ship_type               :integer          default("design"), not null
#  status                  :integer          default("pending"), not null
#  created_at              :datetime         not null
#  updated_at              :datetime         not null
#  preflight_run_id        :bigint
#  project_id              :bigint           not null
#  reviewer_id             :bigint
#
# Indexes
#
#  index_ships_on_preflight_run_id  (preflight_run_id)
#  index_ships_on_project_id        (project_id)
#  index_ships_on_reviewer_id       (reviewer_id)
#  index_ships_on_ship_type         (ship_type)
#  index_ships_on_status            (status)
#
# Foreign Keys
#
#  fk_rails_...  (preflight_run_id => preflight_runs.id)
#  fk_rails_...  (project_id => projects.id)
#  fk_rails_...  (reviewer_id => users.id)
#
class Ship < ApplicationRecord
  has_paper_trail

  belongs_to :project
  belongs_to :reviewer, class_name: "User", optional: true
  belongs_to :preflight_run, optional: true # Older ships predate PreflightRun tracking

  has_one :time_audit_review, dependent: :destroy
  has_one :requirements_check_review, dependent: :destroy
  has_one :design_review, dependent: :destroy
  has_one :build_review, dependent: :destroy
  has_many :journal_entries, dependent: :nullify
  has_many :reviewer_notes, dependent: :nullify
  has_many :project_flags, dependent: :nullify

  # superseded: a still-pending ship the user pulled out of the queue via re-ship.
  # Terminal, currency-neutral, and notification-silent — see #supersede!.
  enum :status, { pending: 0, approved: 1, returned: 2, rejected: 3, awaiting_identity: 4, superseded: 5 }
  enum :ship_type, { design: 0, build: 1 }, prefix: true

  serialize :frozen_hca_data, coder: JSON
  encrypts :frozen_hca_data

  validates :status, presence: true
  validate :status_transition_allowed, if: :status_changed?

  delegate :user, to: :project

  scope :for_user, ->(user) { joins(:project).where(projects: { user_id: user.id }) }
  scope :with_reviews, -> {
    includes(:time_audit_review, :requirements_check_review, :design_review, :build_review)
  }

  after_create :claim_journal_entries! # Assign this cycle's entries to this ship (runs in same transaction)
  # Only seed reviews when the ship enters the review queue. Ships created as :awaiting_identity
  # defer this until they're promoted to :pending (see promote_awaiting_identity_for).
  after_create :create_initial_reviews!, if: :pending?
  after_update_commit :create_initial_reviews!, if: :became_pending_from_awaiting?
  after_update_commit :notify_status_change, if: :saved_change_to_status?
  after_update_commit :award_ship_review_currency!, if: :saved_change_to_status?
  after_update_commit :enqueue_unified_airtable_upload, if: :saved_change_to_status?

  # YSWS Unified Submissions table — receives a one-shot snapshot when a ship
  # reaches :approved (financial-pipeline-adjacent; we only push data, never
  # touch HCB API code). Identifier is suffixed "Ship#<id>/unified" so it
  # doesn't collide with the analytics ship sync's "Ship#<id>" identifier.
  UNIFIED_AIRTABLE_TABLE_ID = "tbl1CXrjDLqtYp84y"

  # Called when a user becomes fully_identity_gated? — moves their held submissions into the review queue.
  def self.promote_awaiting_identity_for(user)
    for_user(user).awaiting_identity.find_each do |ship|
      ship.update!(status: :pending)
    end
  end

  def self.airtable_sync_table_id
    "tbl1LJG0FKSV61wcW"
  end

  def self.airtable_sync_sync_id
    "5BFGD4ac"
  end

  def self.airtable_should_batch
    true
  end

  def self.airtable_batch_size
    2000
  end

  def self.airtable_sync_preload(records)
    ship_ids = records.map(&:id)

    # Wrap qualified columns in Arel.sql — Rails 8.1 routes bare strings in
    # pluck through attribute-name resolution, which mangles "projects.user_id"
    # into a bare "user_id" reference against ships.
    project_user = Ship.where(id: ship_ids).joins(:project)
                       .pluck(:id, Arel.sql("projects.id"), Arel.sql("projects.user_id"))
                       .to_h { |sid, pid, uid| [ sid, [ pid, uid ] ] }

    logged_seconds = batch_time_logged(ship_ids)

    koi_by_ship = KoiTransaction.where(ship_id: ship_ids, reason: "ship_review")
                                .group(:ship_id).sum(:amount)

    # Only the columns the field mappings actually read — skips heavy JSONB
    # (TA/DR/BR.annotations, RC.repo_tree) and large text columns we don't sync.
    reviews = {
      time_audit: TimeAuditReview.where(ship_id: ship_ids).select(:id, :ship_id, :status).index_by(&:ship_id),
      requirements_check: RequirementsCheckReview.where(ship_id: ship_ids).select(:id, :ship_id, :status).index_by(&:ship_id),
      design: DesignReview.where(ship_id: ship_ids).select(:id, :ship_id, :status, :hours_adjustment, :koi_adjustment).index_by(&:ship_id),
      build: BuildReview.where(ship_id: ship_ids).select(:id, :ship_id, :status, :hours_adjustment, :gold_adjustment).index_by(&:ship_id)
    }

    { project_user: project_user, logged_seconds: logged_seconds, koi: koi_by_ship, reviews: reviews }
  end

  def self.airtable_sync_field_mappings
    {
      "Ship ID" => :id,
      "Project ID" => ->(s, pre) { pre[:project_user][s.id]&.first },
      "User ID" => ->(s, pre) { pre[:project_user][s.id]&.last },
      "Status" => ->(s) { s.status },
      "Ship Type" => ->(s) { s.ship_type },
      "Created At" => ->(s) { s.created_at&.iso8601 },
      "Updated At" => ->(s) { s.updated_at&.iso8601 },

      # Three flavors of hours (see arch-ship-and-koi.md §7):
      "Logged Hours" => ->(s, pre) { ((pre[:logged_seconds][s.id] || 0).to_f / 3600.0).round(2) },
      "Approved Hours" => ->(s) { (s.approved_public_seconds.to_f / 3600.0).round(2) },
      "Internal Hours" => ->(s, pre) {
        dr_adj = pre[:reviews][:design][s.id]&.hours_adjustment.to_i
        br_adj = pre[:reviews][:build][s.id]&.hours_adjustment.to_i
        ((s.approved_public_seconds.to_i + dr_adj + br_adj).to_f / 3600.0).round(2)
      },

      "Koi Awarded" => ->(s, pre) { pre[:koi][s.id] || 0 },

      "Justification" => :justification,
      "Feedback" => :feedback,
      "Demo Link" => :frozen_demo_link,
      "Repo Link" => :frozen_repo_link,

      # Prefixed review IDs (TA12, RC12, DR12, BR12) match the unified Reviews
      # table's "Review ID" column so Airtable can link Ship → Review records;
      # status / feedback / etc. are looked up from the Reviews table.
      "TA ID" => ->(s, pre) { (r = pre[:reviews][:time_audit][s.id]) && "#{TimeAuditReview.review_id_prefix}#{r.id}" },
      "RC ID" => ->(s, pre) { (r = pre[:reviews][:requirements_check][s.id]) && "#{RequirementsCheckReview.review_id_prefix}#{r.id}" },
      "DR ID" => ->(s, pre) { (r = pre[:reviews][:design][s.id]) && "#{DesignReview.review_id_prefix}#{r.id}" },
      "BR ID" => ->(s, pre) { (r = pre[:reviews][:build][s.id]) && "#{BuildReview.review_id_prefix}#{r.id}" }
    }
  end

  # Batch version of total_hours for Airtable preload — single SQL query for many ships.
  # Mirrors Project.batch_time_logged but keyed by ship_id (entries claimed by the ship).
  def self.batch_time_logged(ship_ids)
    return {} if ship_ids.empty?
    sql = <<~SQL.squish
      SELECT je.ship_id,
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
      WHERE je.ship_id IN (:ids) AND je.discarded_at IS NULL
      GROUP BY je.ship_id
    SQL
    result = ActiveRecord::Base.connection.select_rows(
      ActiveRecord::Base.sanitize_sql([ sql, ids: ship_ids ])
    )
    result.to_h { |sid, total| [ sid.to_i, total.to_i ] }
  end

  def review_status
    {
      time_audit: time_audit_review&.status,
      requirements_check: requirements_check_review&.status,
      design_review: design_review&.status,
      build_review: build_review&.status
    }
  end

  def previous_approved_ship
    project.ships.approved.where("created_at < ?", created_at).order(created_at: :desc).first
  end

  # Populated by Ship.preload_cycle_started_at to bypass the per-ship query pair in cycle_started_at
  attr_writer :cycle_started_at_cached

  # First ship-submission timestamp in the current cycle (the cycle this ship belongs to).
  # Used by reviewer "Waiting Xd (Yd)" labels — Y is total cycle wait, distinct from per-ship wait.
  def cycle_started_at
    return @cycle_started_at_cached if defined?(@cycle_started_at_cached)
    cutoff = previous_approved_ship&.created_at || Time.at(0)
    project.ships.where("created_at > ? AND created_at <= ?", cutoff, created_at)
           .order(:created_at).pick(:created_at) || created_at
  end

  # Batch-compute cycle_started_at for a set of ships, with Rails.cache keyed on a per-project
  # version stamp (max updated_at across the project's ships) so the cache invalidates whenever
  # any sibling ship changes (new submission, status transition). 6h TTL is a safety net since
  # the UI only displays days-of-waiting granularity.
  CYCLE_STARTED_AT_CACHE_TTL = 6.hours

  def self.preload_cycle_started_at(ships)
    return if ships.blank?

    # Callers often pass ships from multiple queries (pending + all_reviews) which yields
    # DIFFERENT Ship instances with the same id. Group by id and propagate the cached value
    # to every instance, otherwise the second result set falls back to the per-ship N+1.
    instances_by_id = ships.group_by(&:id)
    representatives = instances_by_id.values.map(&:first)

    project_ids = representatives.map(&:project_id).uniq
    project_versions = Ship.where(project_id: project_ids).group(:project_id).maximum(:updated_at)

    cache_keys = representatives.to_h { |s| [ s.id, cycle_started_at_cache_key(s, project_versions[s.project_id]) ] }
    hits = Rails.cache.read_multi(*cache_keys.values)

    uncached = []
    representatives.each do |ship|
      cached = hits[cache_keys[ship.id]]
      if cached
        propagate_cycle_started_at(instances_by_id[ship.id], cached)
      else
        uncached << ship
      end
    end
    return if uncached.empty?

    sibling_project_ids = uncached.map(&:project_id).uniq
    by_project = Ship.where(project_id: sibling_project_ids).order(:created_at).group_by(&:project_id)

    uncached.each do |ship|
      siblings = by_project[ship.project_id] || []
      prev_approved = siblings.reverse.find { |s| s.approved? && s.created_at < ship.created_at }
      cutoff = prev_approved&.created_at || Time.at(0)
      cycle_first = siblings.find { |s| s.created_at > cutoff && s.created_at <= ship.created_at }
      value = cycle_first&.created_at || ship.created_at
      propagate_cycle_started_at(instances_by_id[ship.id], value)
      Rails.cache.write(cache_keys[ship.id], value, expires_in: CYCLE_STARTED_AT_CACHE_TTL)
    end
  end

  def self.propagate_cycle_started_at(instances, value)
    instances.each { |s| s.cycle_started_at_cached = value }
  end

  def self.cycle_started_at_cache_key(ship, project_version)
    "ships/cycle_started_at/#{ship.id}/v#{project_version&.to_i || 0}"
  end

  def new_journal_entries
    cutoff = previous_approved_ship&.created_at || Time.at(0)
    scope = project.journal_entries.kept.where("journal_entries.created_at > ?", cutoff)
    # Exclude entries locked to a *different approved* ship — that cycle is finalized, so a
    # later ship whose created_at window overlaps the review lag must not re-count its
    # hours/koi. Entries owned by returned/rejected ships stay visible so a re-ship reclaims
    # them. Mirrors the claim_journal_entries! filter, which the compute path previously lacked.
    locked_ids = project.ships.approved.where.not(id: id).pluck(:id)
    locked_ids.any? ? scope.where("journal_entries.ship_id IS NULL OR journal_entries.ship_id NOT IN (?)", locked_ids) : scope
  end

  def previous_journal_entries
    cutoff = previous_approved_ship&.created_at || Time.at(0)
    project.journal_entries.kept.where("journal_entries.created_at <= ?", cutoff)
  end

  def total_hours
    (journal_entries.kept.joins(:recordings)
      .sum(Arel.sql(<<~SQL.squish)) / 3600.0).round(1)
        CASE recordings.recordable_type
          WHEN 'LapseTimelapse' THEN (SELECT duration FROM lapse_timelapses WHERE id = recordings.recordable_id)
          WHEN 'LookoutTimelapse' THEN (SELECT duration FROM lookout_timelapses WHERE id = recordings.recordable_id)
          WHEN 'YouTubeVideo' THEN (SELECT duration_seconds * stretch_multiplier FROM you_tube_videos WHERE id = recordings.recordable_id)
          ELSE 0
        END
      SQL
  end

  # Query DB directly (not association cache) for correctness under concurrency
  def phase_one_complete?
    TimeAuditReview.where(ship_id: id, status: :approved).exists? &&
      RequirementsCheckReview.where(ship_id: id, status: :approved).exists?
  end

  def ensure_phase_two_review!
    return unless phase_one_complete?
    return unless owns_recordings? # Superseded ship — keep it out of the phase-two queue (see #derive_status)

    review_class = ship_type_design? ? DesignReview : BuildReview
    review_class.find_or_create_by!(ship: self)
  end

  # A ship owns recordings until a newer cycle's ship re-claims its journal entries
  # (claim_journal_entries! reassigns ship_id). A superseded ship is left owning none.
  # Queried directly so the check is correct under concurrency.
  def owns_recordings?
    journal_entries.kept.joins(:recordings).exists?
  end

  # Admin-only swap between DesignReview and BuildReview for a pending ship. Carries
  # in-progress reviewer work (feedback/internal_reason/hours_adjustment/currency
  # adjustment/annotations) onto the new review and preserves the original review's
  # created_at so the queue wait time / position is unchanged. DR's koi_adjustment
  # and BR's gold_adjustment are the same semantic knob (signed integer credit/debit
  # on hours-derived currency) — they carry across the swap. Returns the new review.
  def swap_phase_two_type!
    raise ActiveRecord::RecordInvalid.new(self), "ship is not pending" unless pending?

    with_lock do
      current = phase_two_review
      raise ActiveRecord::RecordInvalid.new(self), "no phase two review to swap" if current.nil?
      raise ActiveRecord::RecordInvalid.new(self), "phase two review is not pending" unless current.pending?

      currency_adj = current.is_a?(DesignReview) ? current.koi_adjustment : current.gold_adjustment

      new_type = ship_type_design? ? :build : :design
      new_class = new_type == :design ? DesignReview : BuildReview

      carry = {
        feedback: current.feedback,
        internal_reason: current.internal_reason,
        hours_adjustment: current.hours_adjustment,
        annotations: current.annotations,
        created_at: current.created_at
      }
      carry[new_class == DesignReview ? :koi_adjustment : :gold_adjustment] = currency_adj

      current.destroy!
      update!(ship_type: new_type)

      new_review = new_class.new(ship: self, **carry)
      new_review.skip_ship_recompute = true # No-op: status stays pending → pending, avoid redundant recompute
      new_review.save!
      new_review
    end
  end

  # Pull a still-pending ship out of the review queue so the user can re-ship it.
  # Cancels its pending reviews (removing them from reviewer queues) and marks the ship
  # :superseded — a terminal state that never awards currency or notifies the user.
  # The fresh ship is created separately by the controller (no preflight, bottom of queue).
  # Returns true if it superseded the ship, false if a reviewer concurrently finalized it
  # (so it's no longer pending and there's nothing to pull back) — callers skip creating the
  # replacement in that case.
  def supersede!
    superseded = false
    with_lock do
      # Re-check under the row lock: a reviewer may have returned/approved/rejected between
      # selection and now. with_lock reloads self and resets the association cache, so both the
      # ship status and per-review states read fresh. Bail without raising if no longer pending.
      next unless pending?

      cancel_pending_reviews! # leaves the queue; each review skips ship recompute
      update!(status: :superseded)
      superseded = true
    end
    superseded
  end

  def recompute_status!
    return if superseded? # Terminal — derive_status can't represent it; never recompute back to pending
    new_status = derive_status
    if status != new_status
      attrs = { status: new_status }
      # Aggregate reviewer feedback onto the ship so MailDeliveryService includes it in notifications
      attrs[:feedback] = aggregate_return_feedback if new_status == "returned"
      # ship.approved_public_seconds is the *fully-approved* number — only populated when
      # the ship reaches :approved, cleared on any other transition. The TA-level value
      # (time_audit_review.approved_public_seconds) stays set independently when the TA
      # approves; this column mirrors it only after RC + DR/BR also pass. This keeps
      # `ships.approved_public_seconds > 0` a self-describing invariant for "ship is
      # fully approved" — raw SQL aggregations don't need a status filter.
      if new_status == "approved"
        ta = time_audit_review
        if ta&.approved? && ta.approved_public_seconds.present?
          sync_youtube_stretch_multipliers!(ta)
          attrs[:approved_public_seconds] = ta.approved_public_seconds
        end
      elsif approved_public_seconds.present?
        attrs[:approved_public_seconds] = nil
      end
      update!(attrs)
      # Lock every entry this ship's TA reviewed onto the ship so a later cycle can't re-claim
      # and re-count them through its (unbounded) created_at window — see new_journal_entries.
      lock_reviewed_journal_entries! if new_status == "approved"
    end
    cancel_pending_reviews! if returned? || rejected?
  end

  # approved_public_seconds + DR/BR hours_adjustment. Phase 2 reviewers can credit
  # or debit hours that the TA can't see (physical work off-camera, low-quality
  # passes); the public number is what the user sees, internal is the operator's view.
  def approved_internal_seconds
    approved_public_seconds.to_i +
      design_review&.hours_adjustment.to_i +
      build_review&.hours_adjustment.to_i
  end

  # One-shot upload to the YSWS Unified Submissions Airtable table at the moment
  # the ship reaches :approved. Idempotent via AirtableSync record keyed
  # "Ship#<id>/unified" — re-runs PATCH the same row instead of creating
  # duplicates. Called from ShipUnifiedAirtableUploadJob (async to keep the
  # approval transaction off the Airtable HTTP path).
  def upload_to_unified_airtable!
    return unless approved?
    return if user.trial?

    identity = fetch_unified_identity
    addresses = identity["addresses"].is_a?(Array) ? identity["addresses"] : []
    primary_address = addresses.find { |a| a["primary"] } || addresses.first || {}

    fields = {
      "Code URL" => frozen_repo_link,
      # demo_link is curated by the BR reviewer during review (set right before approval),
      # so read it live here rather than from frozen_demo_link, which was snapshotted at ship
      # creation before the reviewer set it. Falls back to the creation snapshot, then repo.
      "Playable URL" => project.demo_link.presence || frozen_demo_link.presence || frozen_repo_link,
      "First Name" => identity["first_name"],
      "Last Name" => identity["last_name"],
      "Email" => user.email,
      "Description" => project.description,
      "Address (Line 1)" => primary_address["line_1"],
      "Address (Line 2)" => primary_address["line_2"],
      "City" => primary_address["city"],
      "State / Province" => primary_address["state"],
      "Country" => primary_address["country"],
      "ZIP / Postal Code" => primary_address["postal_code"],
      "Birthday" => identity["birthday"],
      # Linked-record field — Airtable typecast (enabled in upload_or_create!)
      # matches the array of primary-field values against the linked Ships
      # table's primary field, so we send [id.to_s] not the integer.
      "Ship" => [ id.to_s ],
      # Hours that downstream YSWS automation should use as the official
      # number for this submission. INTERNAL_HOURS = approved + Phase 2
      # hours_adjustment, i.e. the operator's view (see arch-ship-and-koi.md §7).
      "Optional - Override Hours Spent" => internal_hours_for_unified,
      "Optional - Override Hours Spent Justification" => JustificationRenderer.render(self)
    }

    # Screenshot is set separately by AttachShipUnifiedScreenshotJob via the
    # content.airtable.com uploadAttachment endpoint — sending it here too
    # would conflict with that PATCH/append flow.

    AirtableSync.upload_or_create!(
      UNIFIED_AIRTABLE_TABLE_ID,
      self,
      fields,
      identifier: unified_airtable_identifier
    )
  end

  def unified_airtable_identifier
    "Ship##{id}/unified"
  end

  def returning_reviewer
    [ time_audit_review, requirements_check_review, design_review, build_review ]
      .compact.find(&:returned?)&.reviewer
  end

  private

  # Persist stretch_multiplier from TA annotations onto YouTubeVideo records so aggregation queries use correct values
  def sync_youtube_stretch_multipliers!(ta)
    rec_annotations = ta.annotations&.dig("recordings") || {}
    new_journal_entries.includes(recordings: :recordable).each do |entry|
      entry.recordings.each do |rec|
        next unless rec.recordable.is_a?(YouTubeVideo)
        stretch = rec_annotations.dig(rec.id.to_s, "stretch_multiplier")&.to_i || 1
        rec.recordable.update_column(:stretch_multiplier, stretch) if rec.recordable.stretch_multiplier != stretch
      end
    end
  end

  # Claim this cycle's journal entries — entries not locked to an approved ship get assigned to this ship.
  # Entries already assigned to an approved ship are immutable (that cycle is finalized).
  def claim_journal_entries!
    approved_ship_ids = project.ships.approved.pluck(:id)
    scope = new_journal_entries
    scope = if approved_ship_ids.any?
      scope.where("ship_id IS NULL OR ship_id NOT IN (?)", approved_ship_ids)
    else
      scope # No approved ships — all entries are claimable
    end
    scope.update_all(ship_id: id)
  end

  # Claim every still-unclaimed entry this ship's TA reviewed (the review-lag entries logged
  # after submission). Called on the :approved transition to finalize this cycle's set so the
  # next ship excludes them — see new_journal_entries.
  def lock_reviewed_journal_entries!
    new_journal_entries.where(ship_id: nil).update_all(ship_id: id)
  end

  TERMINAL_STATUSES = %w[approved returned rejected superseded].freeze

  # Prevent admin from bypassing the review pipeline by directly changing a terminal ship status
  def status_transition_allowed
    return if new_record?
    return unless TERMINAL_STATUSES.include?(status_was)
    errors.add(:status, "cannot transition from #{status_was}")
  end

  def became_pending_from_awaiting?
    change = saved_change_to_status
    change && change[0] == "awaiting_identity" && change[1] == "pending"
  end

  def derive_status
    reviews = [ time_audit_review, requirements_check_review, phase_two_review ].compact
    return "pending" if reviews.empty?
    return "rejected" if reviews.any?(&:rejected?)
    return "returned" if reviews.any?(&:returned?)
    # Approval is gated solely on the phase-two review (DR for design ships, BR for
    # build ships). TA/RC approval merely unlocks phase two via ensure_phase_two_review! —
    # a missing or pending phase-two review must never let a ship reach :approved.
    return "pending" unless phase_two_review&.approved?
    # A superseded ship — one whose journal entries were all re-claimed by a newer cycle,
    # so it owns no kept recordings — must never reach :approved, or a stale/duplicate ship
    # can be approved for currency already paid on the live ship (2026-06-10 incident: ship
    # #260 was a duplicate of #323). Legitimate ships always own recordings.
    return "pending" unless owns_recordings?
    "approved"
  end

  def phase_two_review
    ship_type_design? ? design_review : build_review
  end

  def cancel_pending_reviews!
    [ time_audit_review, requirements_check_review, design_review, build_review ].compact.each do |review|
      next unless review.pending?
      review.skip_ship_recompute = true # Ship status is already set by the caller — skip redundant recomputations
      review.update!(status: :cancelled)
    end
  end

  def create_initial_reviews!
    ta = TimeAuditReview.create!(ship: self)
    RequirementsCheckReview.create!(ship: self)
    carry_forward_ta_annotations!(ta)
  end

  def carry_forward_ta_annotations!(ta)
    prev_ship = project.ships.where.not(id: id).order(created_at: :desc).first
    prev_ta = prev_ship&.time_audit_review
    return unless (prev_ta&.approved? || prev_ta&.returned? || prev_ta&.cancelled?) && prev_ta.annotations&.dig("recordings")&.any?

    reviewed_ids = prev_ta.annotations["recordings"].keys.to_set
    current_ids = new_journal_entries
      .joins(:recordings)
      .pluck("recordings.id").map(&:to_s).to_set

    carried = prev_ta.annotations.deep_dup
    carried["recordings"].select! { |id, _| current_ids.include?(id) }

    new_recordings = current_ids - reviewed_ids

    if new_recordings.empty? && prev_ta.approved?
      # All current recordings already reviewed — auto-approve with recomputed time.
      # Carry the prior TA's reviewer so downstream attribution (e.g. unified Airtable
      # justification's TIME_AUDITOR) credits the human who actually did the work.
      ta.update!(
        status: :approved,
        annotations: carried,
        approved_public_seconds: compute_approved_public_seconds(carried),
        reviewer_id: prev_ta.reviewer_id
      )
    elsif carried["recordings"].any?
      # New recordings need review; carry forward existing annotations so reviewer only sees the delta
      ta.update_columns(annotations: carried, updated_at: Time.current)
    end
  end

  def compute_approved_public_seconds(annotations)
    total = 0
    new_journal_entries.includes(recordings: :recordable).each do |entry|
      entry.recordings.each do |rec|
        rec_annotations = annotations.dig("recordings", rec.id.to_s) || {}
        # A processed YouTube video is a real 60× timelapse — bill it exactly like Lapse/Lookout
        # (segments ×60, duration already real seconds). Only an UNprocessed YouTube video uses the
        # reviewer-set stretch_multiplier against its real-time iframe footage.
        raw_youtube = rec.recordable.is_a?(YouTubeVideo) && !rec.recordable.timelapse_ready?
        multiplier = raw_youtube ? (rec_annotations["stretch_multiplier"]&.to_f || 1.0) : 60.0
        raw_duration =
          case rec.recordable
          when LookoutTimelapse, LapseTimelapse then rec.recordable.duration.to_i
          when YouTubeVideo                     then rec.recordable.duration_seconds.to_i
          else 0
          end
        # Unprocessed YouTube base = raw video seconds × stretch_multiplier. Timelapse footage
        # (Lapse, Lookout, processed YouTube) already stores duration in real seconds.
        base_duration = raw_youtube ? raw_duration * multiplier : raw_duration
        total += base_duration
        segments = rec_annotations["segments"] || []
        segments.each do |seg|
          video_range = seg["end_seconds"].to_f - seg["start_seconds"].to_f
          real_range = video_range * multiplier
          case seg["type"]
          when "removed"   then total -= real_range
          when "deflated"  then total -= real_range * (seg["deflated_percent"].to_f / 100)
          end
        end
      end
    end
    [ total.round, 0 ].max
  end

  def aggregate_return_feedback
    [ time_audit_review, requirements_check_review, design_review, build_review ]
      .compact.select(&:returned?).filter_map(&:feedback).join("\n\n---\n\n")
  end

  def notify_status_change
    MailDeliveryService.ship_status_changed(self)
  rescue => e
    Rails.logger.error("Ship##{id} status notification failed: #{e.message}")
  end

  # Awards the appropriate currency when a ship reaches :approved — koi for design
  # ships, gold for build ships. Build ships ALSO trigger BuiltIrlConversionService on
  # the first approval per project to sweep accumulated project-koi into gold.
  # Idempotency is enforced per member by partial unique indexes; failures are logged
  # but do NOT roll back the approval — operators reconcile via the rake task.
  def award_ship_review_currency!
    return unless approved? # Awarders no-op for other statuses; skip the preload query entirely (e.g. on supersede)
    ship = Ship.includes(project: { user: {}, collaborators: :user }).find(id) # preload to avoid N+1

    if ship_type_design?
      ShipKoiAwarder.call(ship).each do |result|
        Rails.logger.info("Ship##{id} koi award: #{result.status} (amount=#{result.amount})")
      end
    elsif ship_type_build?
      ShipGoldAwarder.call(ship).each do |result|
        Rails.logger.info("Ship##{id} gold award: #{result.status} (amount=#{result.amount})")
      end
      BuiltIrlConversionService.call(ship).each do |result|
        Rails.logger.info("Ship##{id} built_irl conversion: #{result.status} user=#{result.user_id} amount=#{result.amount}")
      end
    end
  rescue => e
    Rails.logger.error("Ship##{id} currency award failed: #{e.message}")
    ErrorReporter.capture_exception(e, contexts: { ship_review_currency: { ship_id: id } })
  end

  def enqueue_unified_airtable_upload
    return unless approved?
    return if user.trial?
    return unless ENV["AIRTABLE_API_KEY"].present?
    # Two parallel jobs:
    #   1. ShipUnifiedAirtableUploadJob — fast, creates the Airtable record now
    #      so the YSWS row exists immediately on approval.
    #   2. AttachShipUnifiedScreenshotJob — slow (LLM + image processing),
    #      runs independently and POSTs the JPEG to the existing record's
    #      Screenshot field via uploadAttachment. Retries with backoff if the
    #      upload job hasn't finished creating the record yet.
    ShipUnifiedAirtableUploadJob.perform_later(id)
    AttachShipUnifiedScreenshotJob.perform_later(id)
  end

  def fetch_unified_identity
    user.hca_identity || {}
  rescue StandardError => e
    Rails.logger.error("Ship##{id} unified upload — HCA identity fetch failed for user #{user.id}: #{e.message}")
    ErrorReporter.capture_exception(e, contexts: { ship_unified_airtable: { ship_id: id, user_id: user.id, op: :hca_fetch } })
    {}
  end

  # approved_internal_seconds in hours (1 decimal). Mirrors JustificationRenderer's
  # INTERNAL_HOURS so the override-hours field and the justification prose agree.
  def internal_hours_for_unified
    (approved_internal_seconds / 3600.0).round(1)
  end
end
