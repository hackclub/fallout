require "icalendar"

class BulletinEventIcsGenerator
  CALENDAR_NAME = "Fallout Events".freeze
  CALENDAR_DESCRIPTION = "Upcoming events from the Fallout bulletin board.".freeze
  PRODID = "-//Hack Club//Fallout Bulletin Board//EN".freeze

  def self.call(events:, host:, feed: false)
    new(events: events, host: host, feed: feed).call
  end

  def initialize(events:, host:, feed:)
    @events = Array(events)
    @host = host
    @feed = feed
  end

  def call
    calendar = Icalendar::Calendar.new
    calendar.prodid = PRODID

    if @feed
      calendar.append_custom_property("X-WR-CALNAME", CALENDAR_NAME)
      calendar.append_custom_property("X-WR-CALDESC", CALENDAR_DESCRIPTION)
      calendar.append_custom_property("REFRESH-INTERVAL;VALUE=DURATION", "PT5M")
      calendar.append_custom_property("X-PUBLISHED-TTL", "PT5M")
    end

    @events.each do |event|
      next if event.starts_at.nil?

      calendar.add_event(build_vevent(event))
    end

    calendar.publish # Sets METHOD:PUBLISH on the calendar envelope.
    calendar.to_ical
  end

  private

  def build_vevent(event)
    vevent = Icalendar::Event.new
    vevent.uid = "bulletin-event-#{event.id}@#{@host}"
    vevent.summary = event.title.to_s
    vevent.description = event.description.to_s if event.description.present?
    vevent.url = "https://#{@host}/bulletin_board/events/#{event.id}"
    vevent.dtstamp = Icalendar::Values::DateTime.new(event.updated_at.utc, "tzid" => "UTC")
    vevent.dtstart = Icalendar::Values::DateTime.new(event.starts_at.utc, "tzid" => "UTC")
    vevent.dtend = Icalendar::Values::DateTime.new(event.ends_at.utc, "tzid" => "UTC") if event.ends_at.present?
    vevent
  end
end
