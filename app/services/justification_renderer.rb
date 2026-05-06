# Renders config/justification_template.txt for a given Ship into the prose
# that lands in the YSWS Unified Submissions row's "Optional - Override Hours
# Spent Justification" field. Strips the comment header, substitutes
# {VAR} placeholders, and resolves {A|B|"literal"} fallback chains.
#
# All variables are scoped to the ship's current cycle — see the template's
# Glossary entry and agents-docs/arch-ship-and-koi.md §2 for the cycle
# definition.
class JustificationRenderer
  TEMPLATE_PATH = Rails.root.join("config", "justification_template.txt")

  def self.render(ship)
    new(ship).render
  end

  def initialize(ship)
    @ship = ship
  end

  def render
    self.class.body.gsub(/\{([^}]+)\}/) { resolve_expr(::Regexp.last_match(1)) }
  end

  # Body is the part after the second `---` line, with leading/trailing
  # whitespace stripped. Memoized at class level — the file rarely changes
  # within a process lifetime, but reload between deploys.
  def self.body
    @body ||= load_body
  end

  def self.load_body
    raw = File.read(TEMPLATE_PATH)
    parts = raw.split(/^---\s*$/, 3)
    raise "JustificationRenderer: template must contain a `---` comment block" if parts.size < 3
    parts.last.strip
  end

  # Resolves "VAR" or "A|B|\"literal\"" — first non-blank wins. If everything
  # is blank, the original `{expr}` is returned literal so typos / missing
  # data are visible in output rather than silently disappearing.
  def resolve_expr(expr)
    parts = split_pipe(expr)
    parts.each do |part|
      val = part.start_with?('"') && part.end_with?('"') ? part[1..-2] : variable_value(part)
      return val.to_s if val.present?
    end
    "{#{expr}}"
  end

  # Splits on `|` but not inside double-quoted segments.
  def split_pipe(expr)
    parts = []
    current = +""
    in_quote = false
    expr.each_char do |c|
      if c == '"'
        in_quote = !in_quote
        current << c
      elsif c == "|" && !in_quote
        parts << current.strip
        current = +""
      else
        current << c
      end
    end
    parts << current.strip
    parts
  end

  def variable_value(name)
    case name
    when "USER_NAME" then @ship.user.display_name
    when "PROJECT_NAME" then @ship.project.name
    when "PROJECT_DESCRIPTION" then @ship.project.description
    when "SHIP_ID" then @ship.id
    when "LOGGED_HOURS" then format_hours(logged_seconds)
    when "APPROVED_HOURS" then format_hours(@ship.approved_seconds.to_i)
    when "INTERNAL_HOURS" then format_hours(internal_seconds)
    when "TOTAL_DEFLATION" then total_deflation_formatted
    when "JOURNAL_COUNT" then cycle_journal_entries.count
    when "RECORDING_COUNT" then recording_count
    when "TIMETRACKING_METHODS" then timetracking_methods
    when "SHIP_TYPE" then @ship.ship_type
    when "TIME_AUDITOR" then reviewer_label(@ship.time_audit_review&.reviewer)
    when "REQUIREMENTS_CHECKER" then reviewer_label(@ship.requirements_check_review&.reviewer)
    when "2ND_PASS_REVIEWER" then reviewer_label(phase_two_review&.reviewer)
    when "SUBMITTED_AT" then @ship.created_at&.iso8601
    when "FIRST_SUBMITTED_AT" then first_submitted_at_iso8601
    when "APPROVED_AT" then approved_at_iso8601
    when "SHIP_TYPE_MSG" then ship_type_msg
    when "ATTEMPTS_MSG" then attempts_msg
    when "KOI_AWARDED" then koi_awarded
    when "INTERNAL_NOTES" then phase_two_review&.internal_reason.presence
    when "REPO_URL" then @ship.frozen_repo_link
    when "DEMO_URL" then @ship.frozen_demo_link
    when "INSPECT_URL" then UnifiedInspectToken.url_for(@ship.id)
    end
  end

  private

  def phase_two_review
    @ship.design_review || @ship.build_review
  end

  def reviewer_label(user)
    return nil unless user
    "#{user.display_name} (#{user.email})"
  end

  # Cycle journal entries via time window, NOT via journal_entries.ship_id.
  # Older ships (created before claim_journal_entries! existed or before the
  # ship_id column was populated) have NULL ship_id on their entries, so a
  # ship_id filter would return empty. The time window is the source of truth
  # for which entries belong to this cycle — it matches Ship#new_journal_entries
  # plus an upper bound at this ship's created_at (entries created after the
  # ship was submitted aren't part of its cycle).
  def cycle_journal_entries
    @cycle_journal_entries ||= begin
      cutoff = @ship.previous_approved_ship&.created_at || Time.at(0)
      @ship.project.journal_entries.kept
           .where("journal_entries.created_at > ? AND journal_entries.created_at <= ?", cutoff, @ship.created_at)
    end
  end

  def cycle_journal_entry_ids
    @cycle_journal_entry_ids ||= cycle_journal_entries.pluck(:id)
  end

  # Sum of recording durations across this cycle's journal entries. Single
  # SQL aggregate (mirrors Ship.batch_time_logged but bound by entry id list).
  def logged_seconds
    @logged_seconds ||= compute_logged_seconds
  end

  def compute_logged_seconds
    return 0 if cycle_journal_entry_ids.empty?
    sql = <<~SQL.squish
      SELECT COALESCE(SUM(CASE r.recordable_type
        WHEN 'LapseTimelapse' THEN lt.duration
        WHEN 'LookoutTimelapse' THEN lot.duration
        WHEN 'YouTubeVideo' THEN yt.duration_seconds * yt.stretch_multiplier
        ELSE 0 END), 0)
      FROM recordings r
      LEFT JOIN lapse_timelapses lt ON lt.id = r.recordable_id AND r.recordable_type = 'LapseTimelapse'
      LEFT JOIN lookout_timelapses lot ON lot.id = r.recordable_id AND r.recordable_type = 'LookoutTimelapse'
      LEFT JOIN you_tube_videos yt ON yt.id = r.recordable_id AND r.recordable_type = 'YouTubeVideo'
      WHERE r.journal_entry_id IN (:ids)
    SQL
    ActiveRecord::Base.connection.select_value(
      ActiveRecord::Base.sanitize_sql([ sql, ids: cycle_journal_entry_ids ])
    ).to_i
  end

  def internal_seconds
    dr = @ship.design_review&.hours_adjustment.to_i
    br = @ship.build_review&.hours_adjustment.to_i
    @ship.approved_seconds.to_i + dr + br
  end

  # Sum of hours REMOVED across TA and Phase 2, expressed as positive seconds.
  #   TA component: max(0, logged - approved)
  #     - TA approved more than logged (rare): contributes 0, never negative.
  #   Phase 2 component: max(0, -hours_adjustment) per applicable review
  #     - hours_adjustment is in seconds; negative means time removed from
  #       the internal total, positive means time added (no deflation).
  #     - Only the ship_type-matching review runs (other is nil → 0).
  def total_deflation_seconds
    ta = [ logged_seconds - @ship.approved_seconds.to_i, 0 ].max
    dr = [ -@ship.design_review&.hours_adjustment.to_i, 0 ].max
    br = [ -@ship.build_review&.hours_adjustment.to_i, 0 ].max
    ta + dr + br
  end

  # "no" when zero, otherwise "X.Xh". The body wording is "<value> deflation
  # was applied" — reads "no deflation was applied" or "3.4h deflation was
  # applied".
  def total_deflation_formatted
    seconds = total_deflation_seconds
    return "no" if seconds <= 0
    format("%.1fh", seconds / 3600.0)
  end

  def format_hours(seconds)
    format("%.1f", seconds / 3600.0)
  end

  def recording_count
    return 0 if cycle_journal_entry_ids.empty?
    Recording.where(journal_entry_id: cycle_journal_entry_ids).count
  end

  # Methods actually used in this cycle's recordings. Order is fixed
  # (Lapse → Lookout → YouTube upload); methods with zero recordings are
  # skipped from the joined phrase.
  def timetracking_methods
    return "" if cycle_journal_entry_ids.empty?
    types = Recording.where(journal_entry_id: cycle_journal_entry_ids)
                     .distinct
                     .pluck(:recordable_type)
    items = []
    items << "Lapse" if types.include?("LapseTimelapse")
    items << "Lookout" if types.include?("LookoutTimelapse")
    items << "YouTube upload" if types.include?("YouTubeVideo")
    join_phrase(items)
  end

  # Non-Oxford join: "A", "A and B", "A, B and C".
  def join_phrase(items)
    return "" if items.empty?
    return items.first if items.size == 1
    return "#{items[0]} and #{items[1]}" if items.size == 2
    "#{items[0..-2].join(", ")} and #{items.last}"
  end

  def ship_type_msg
    prior_types = @ship.project.ships.approved
                       .where("ships.created_at < ?", @ship.created_at)
                       .where.not(id: @ship.id)
                       .distinct.pluck(:ship_type)
    type = @ship.ship_type
    other_type = type == "design" ? "build" : "design"
    if prior_types.include?(type)
      type == "design" ? "update to a design" : "update to their build"
    elsif prior_types.include?(other_type)
      "first #{type} ship of their prior #{other_type}"
    else
      "first #{type} ship"
    end
  end

  def attempts_msg
    cutoff = @ship.previous_approved_ship&.created_at || Time.at(0)
    # Per the cycle glossary, only pending/returned/rejected/approved count as
    # attempts — awaiting_identity ships are drafts that never entered review.
    attempts = @ship.project.ships
                    .where.not(status: :awaiting_identity)
                    .where("created_at > ? AND created_at <= ?", cutoff, @ship.created_at)
                    .count
    rounds = attempts - 1
    case rounds
    when 0..0 then "without needing additional feedback"
    when 1 then "after 1 additional round of feedback"
    else "after #{rounds} additional rounds of feedback"
    end
  end

  def approved_at_iso8601
    approved_int = Ship.statuses["approved"]
    version = @ship.versions
                   .reorder(:created_at)
                   .find { |v| (v.object_changes&.dig("status") || [])[1] == approved_int }
    (version&.created_at || @ship.updated_at)&.iso8601
  end

  # Earliest ship in this cycle (excluding awaiting_identity drafts). For a
  # first-try approval there's only the inspected ship, so this equals
  # @ship.created_at.
  def first_submitted_at_iso8601
    cutoff = @ship.previous_approved_ship&.created_at || Time.at(0)
    earliest = @ship.project.ships
                    .where.not(status: :awaiting_identity)
                    .where("created_at > ? AND created_at <= ?", cutoff, @ship.created_at)
                    .minimum(:created_at)
    (earliest || @ship.created_at)&.iso8601
  end

  def koi_awarded
    KoiTransaction.where(ship_id: @ship.id, reason: "ship_review").sum(:amount)
  end
end
