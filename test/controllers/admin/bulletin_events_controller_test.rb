require "test_helper"

class Admin::BulletinEventsControllerTest < ActionController::TestCase
  include ActiveSupport::Testing::TimeHelpers

  tests Admin::BulletinEventsController

  setup do
    @admin = users(:one)
    @admin.update!(onboarded: true)
    @request.session[:user_id] = @admin.id
  end

  test "index returns all events for each tab" do
    now = Time.zone.local(2026, 4, 25, 12, 0, 0)

    travel_to now do
      expired = create_event(schedulable: true, starts_at: 2.hours.ago, ends_at: 1.hour.ago)
      happening = create_event(schedulable: true, starts_at: 1.hour.ago, ends_at: 1.hour.from_now)
      upcoming = create_event(schedulable: true, starts_at: 1.hour.from_now, ends_at: 2.hours.from_now)
      draft = create_event(schedulable: false, starts_at: nil, ends_at: nil)
      expected_ids = [ expired, happening, upcoming, draft ].map(&:id)

      %w[upcoming expired all].each do |tab|
        inertia_get_index(tab: tab)

        props = inertia_props
        assert_response :success
        assert_equal tab, props.fetch("current_tab")
        assert_equal expected_ids, props.fetch("events").map { |event| event.fetch("id") }
        refute props.key?("counts")
      end
    end
  end

  test "manual running update preserves lifecycle when blank timestamps are submitted" do
    starts_at = Time.zone.local(2026, 4, 25, 10, 0, 0)
    event = create_event(schedulable: false, starts_at: starts_at, ends_at: nil)

    patch :update, params: {
      id: event.id,
      bulletin_event: old_manual_payload(event, image_url: "https://example.com/photo.png")
    }

    event.reload
    assert_redirected_to admin_bulletin_events_path
    assert_equal "https://example.com/photo.png", event.image_url
    assert_equal starts_at.to_i, event.starts_at.to_i
    assert_nil event.ends_at
    assert_equal :happening, event.status
  end

  test "bulk destroy deletes only requested expired events" do
    now = Time.zone.local(2026, 4, 25, 12, 0, 0)

    travel_to now do
      expired = create_event(schedulable: true, starts_at: 2.hours.ago, ends_at: 1.hour.ago)
      active = create_event(schedulable: true, starts_at: 1.hour.ago, ends_at: 1.hour.from_now)

      assert_difference "BulletinEvent.count", -1 do
        delete :bulk_destroy, params: { ids: [ expired.id, active.id ], tab: "expired" }
      end

      assert_redirected_to admin_bulletin_events_path(tab: "expired")
      assert_nil BulletinEvent.find_by(id: expired.id)
      assert_not_nil BulletinEvent.find_by(id: active.id)
    end
  end

  test "destroy expired deletes all expired events only" do
    now = Time.zone.local(2026, 4, 25, 12, 0, 0)

    travel_to now do
      expired = create_event(schedulable: true, starts_at: 2.hours.ago, ends_at: 1.hour.ago)
      manual_expired = create_event(schedulable: false, starts_at: 2.hours.ago, ends_at: 1.hour.from_now)
      active = create_event(schedulable: true, starts_at: 1.hour.ago, ends_at: 1.hour.from_now)

      assert_difference "BulletinEvent.count", -2 do
        delete :destroy_expired, params: { tab: "expired" }
      end

      assert_redirected_to admin_bulletin_events_path(tab: "expired")
      assert_nil BulletinEvent.find_by(id: expired.id)
      assert_nil BulletinEvent.find_by(id: manual_expired.id)
      assert_not_nil BulletinEvent.find_by(id: active.id)
    end
  end

  test "manual expired update preserves lifecycle when blank timestamps are submitted" do
    starts_at = Time.zone.local(2026, 4, 25, 10, 0, 0)
    ends_at = Time.zone.local(2026, 4, 25, 11, 0, 0)
    event = create_event(schedulable: false, starts_at: starts_at, ends_at: ends_at)

    patch :update, params: {
      id: event.id,
      bulletin_event: old_manual_payload(event, image_url: "https://example.com/photo.png")
    }

    event.reload
    assert_redirected_to admin_bulletin_events_path
    assert_equal starts_at.to_i, event.starts_at.to_i
    assert_equal ends_at.to_i, event.ends_at.to_i
    assert_equal :expired, event.status
  end

  test "scheduled upcoming event becomes manual draft" do
    now = Time.zone.local(2026, 4, 25, 12, 0, 0)

    travel_to now do
      event = create_event(schedulable: true, starts_at: 1.day.from_now, ends_at: nil)

      patch :update, params: {
        id: event.id,
        bulletin_event: manual_mode_payload(event)
      }

      event.reload
      assert_redirected_to admin_bulletin_events_path
      assert_not event.schedulable?
      assert_nil event.starts_at
      assert_nil event.ends_at
      assert_equal :draft, event.status
    end
  end

  test "scheduled happening event becomes manual happening" do
    now = Time.zone.local(2026, 4, 25, 12, 0, 0)

    travel_to now do
      starts_at = 1.hour.ago
      event = create_event(schedulable: true, starts_at: starts_at, ends_at: 1.hour.from_now)

      patch :update, params: {
        id: event.id,
        bulletin_event: manual_mode_payload(event)
      }

      event.reload
      assert_redirected_to admin_bulletin_events_path
      assert_not event.schedulable?
      assert_equal starts_at.to_i, event.starts_at.to_i
      assert_nil event.ends_at
      assert_equal :happening, event.status
    end
  end

  test "scheduled expired event becomes manual expired" do
    now = Time.zone.local(2026, 4, 25, 12, 0, 0)

    travel_to now do
      starts_at = 2.hours.ago
      ends_at = 1.hour.ago
      event = create_event(schedulable: true, starts_at: starts_at, ends_at: ends_at)

      patch :update, params: {
        id: event.id,
        bulletin_event: manual_mode_payload(event)
      }

      event.reload
      assert_redirected_to admin_bulletin_events_path
      assert_not event.schedulable?
      assert_equal starts_at.to_i, event.starts_at.to_i
      assert_equal ends_at.to_i, event.ends_at.to_i
      assert_equal :expired, event.status
    end
  end

  test "manual draft cannot become scheduled without a start time" do
    event = create_event(schedulable: false, starts_at: nil, ends_at: nil)

    patch :update, params: {
      id: event.id,
      bulletin_event: {
        title: event.title,
        description: event.description,
        image_url: event.image_url,
        schedulable: true,
        starts_at: nil,
        ends_at: nil
      }
    }

    event.reload
    assert_redirected_to admin_bulletin_events_path
    assert_not event.schedulable?
    assert_nil event.starts_at
    assert_nil event.ends_at
  end

  private

  def create_event(**attrs)
    BulletinEvent.create!({
      title: "Bulletin event",
      description: "Details",
      image_url: nil
    }.merge(attrs))
  end

  def old_manual_payload(event, image_url:)
    {
      title: event.title,
      description: event.description,
      image_url: image_url,
      schedulable: false,
      starts_at: nil,
      ends_at: nil
    }
  end

  def manual_mode_payload(event)
    old_manual_payload(event, image_url: event.image_url)
  end

  def inertia_get_index(tab:)
    @request.headers["X-Inertia"] = "true"
    get :index, params: { tab: tab }
  end

  def inertia_props
    JSON.parse(response.body).fetch("props")
  end
end
