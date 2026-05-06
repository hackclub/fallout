class Admin::BulletinEventsController < Admin::ApplicationController
  include BulletinEventSerializer

  before_action :require_admin!, except: [ :index ] # Staff read-only; admin writes

  TABS = %w[upcoming all expired].freeze

  def index
    tab = TABS.include?(params[:tab]) ? params[:tab] : "upcoming"

    scope = policy_scope(BulletinEvent)
    events = scope.order(Arel.sql("COALESCE(starts_at, '9999-01-01') ASC")).to_a

    render inertia: "admin/bulletin_events/index", props: {
      events: events.map { |e| serialize_bulletin_event(e) },
      current_tab: tab
    }
  end

  def create
    @event = BulletinEvent.new(event_params)
    authorize @event

    if @event.save
      redirect_to admin_bulletin_events_path(tab: params[:tab].presence), notice: "Event created."
    else
      redirect_back fallback_location: admin_bulletin_events_path,
        inertia: { errors: @event.errors.messages }
    end
  end

  def update
    @event = BulletinEvent.find(params[:id])
    authorize @event

    if @event.update(normalized_event_params)
      redirect_to admin_bulletin_events_path(tab: params[:tab].presence), notice: "Event saved."
    else
      redirect_back fallback_location: admin_bulletin_events_path,
        inertia: { errors: @event.errors.messages }
    end
  end

  def destroy
    @event = BulletinEvent.find(params[:id])
    authorize @event

    if @event.destroy
      redirect_to admin_bulletin_events_path(tab: params[:tab].presence), notice: "Event deleted."
    else
      redirect_back fallback_location: admin_bulletin_events_path,
        inertia: { errors: { base: @event.errors.full_messages } }
    end
  end

  def bulk_destroy
    authorize BulletinEvent

    events = policy_scope(BulletinEvent).where(id: bulk_destroy_ids).expired.to_a
    deleted_count = destroy_events(events)

    redirect_to admin_bulletin_events_path(tab: params[:tab].presence), notice: bulk_destroy_notice(deleted_count)
  end

  def destroy_expired
    authorize BulletinEvent

    events = policy_scope(BulletinEvent).expired.to_a
    deleted_count = destroy_events(events)

    redirect_to admin_bulletin_events_path(tab: params[:tab].presence), notice: bulk_destroy_notice(deleted_count)
  end

  def start_now
    @event = BulletinEvent.find(params[:id])
    authorize @event
    @event.start_now!
    redirect_to admin_bulletin_events_path(tab: params[:tab].presence), notice: "Event started."
  end

  def force_start_now
    @event = BulletinEvent.find(params[:id])
    authorize @event
    @event.force_start_now!
    redirect_to admin_bulletin_events_path(tab: params[:tab].presence), notice: "Event force-started."
  end

  def end_now
    @event = BulletinEvent.find(params[:id])
    authorize @event
    @event.end_now!
    redirect_to admin_bulletin_events_path(tab: params[:tab].presence), notice: "Event ended."
  end

  private

  def event_params
    params.expect(bulletin_event: [ :title, :description, :image_url, :schedulable, :starts_at, :ends_at ])
  end

  def bulk_destroy_ids
    Array(params[:ids]).filter_map { |id| Integer(id, exception: false) }
  end

  def destroy_events(events)
    events.sum { |event| event.destroy ? 1 : 0 }
  end

  def bulk_destroy_notice(count)
    return "No expired events deleted." if count.zero?

    "#{count} expired #{'event'.pluralize(count)} deleted."
  end

  def normalized_event_params
    attrs = event_params.to_h.symbolize_keys
    return attrs unless attrs.key?(:schedulable)

    next_schedulable = ActiveModel::Type::Boolean.new.cast(attrs[:schedulable])

    if @event.schedulable? && !next_schedulable
      normalize_scheduled_to_manual_attrs(attrs)
    elsif !@event.schedulable? && !next_schedulable
      attrs.delete(:starts_at) if attrs[:starts_at].blank?
      attrs.delete(:ends_at) if attrs[:ends_at].blank?
    end

    attrs
  end

  def normalize_scheduled_to_manual_attrs(attrs)
    case @event.status
    when :draft, :upcoming
      attrs[:starts_at] = nil
      attrs[:ends_at] = nil
    when :happening
      attrs[:starts_at] = @event.starts_at || Time.current
      attrs[:ends_at] = nil
    when :expired
      attrs[:starts_at] = @event.starts_at
      attrs[:ends_at] = @event.ends_at
    end
  end
end
