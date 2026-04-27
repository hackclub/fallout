module BulletinEventSerializer
  extend ActiveSupport::Concern

  private

  def serialize_bulletin_event(event)
    {
      id: event.id,
      title: event.title,
      description: event.description,
      image_url: event.image_url,
      schedulable: event.schedulable,
      starts_at: event.starts_at&.iso8601,
      ends_at: event.ends_at&.iso8601,
      status: event.status
    }
  end
end
