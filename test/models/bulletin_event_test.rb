# == Schema Information
#
# Table name: bulletin_events
#
#  id          :bigint           not null, primary key
#  description :text             not null
#  ends_at     :datetime
#  image_url   :string
#  schedulable :boolean          default(TRUE), not null
#  starts_at   :datetime
#  title       :string           not null
#  created_at  :datetime         not null
#  updated_at  :datetime         not null
#
# Indexes
#
#  index_bulletin_events_on_ends_at    (ends_at)
#  index_bulletin_events_on_starts_at  (starts_at)
#
require "test_helper"

class BulletinEventTest < ActiveSupport::TestCase
  include ActiveSupport::Testing::TimeHelpers

  test "manual status is driven by lifecycle columns" do
    now = Time.zone.local(2026, 4, 25, 12, 0, 0)

    travel_to now do
      assert_equal :draft, build_event(starts_at: nil, ends_at: nil).status
      assert_equal :happening, build_event(starts_at: 1.day.from_now, ends_at: nil).status
      assert_equal :expired, build_event(starts_at: now, ends_at: 1.day.from_now).status
    end
  end

  test "scopes treat ended manual events as expired regardless of end time" do
    now = Time.zone.local(2026, 4, 25, 12, 0, 0)

    travel_to now do
      manual_ended = create_event(schedulable: false, starts_at: 1.hour.ago, ends_at: 1.hour.from_now)
      scheduled_active = create_event(schedulable: true, starts_at: 1.hour.ago, ends_at: 1.hour.from_now)

      assert_includes BulletinEvent.expired, manual_ended
      assert_not_includes BulletinEvent.upcoming_or_happening, manual_ended
      assert_includes BulletinEvent.upcoming_or_happening, scheduled_active
      assert_not_includes BulletinEvent.expired, scheduled_active
    end
  end

  private

  def build_event(**attrs)
    BulletinEvent.new({
      title: "Bulletin event",
      description: "Details",
      schedulable: false
    }.merge(attrs))
  end

  def create_event(**attrs)
    build_event(**attrs).tap(&:save!)
  end
end
