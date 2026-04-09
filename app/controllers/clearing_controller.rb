class ClearingController < ApplicationController
  def index
    critters = policy_scope(Critter).order(created_at: :desc)

    critter_props = if Rails.env.development? && params[:simulate].present?
      Critter::ALL_VARIANTS.each_with_index.map { |v, i|
        { id: i + 1, image_path: "/critters/#{v}.webp", created_at: Time.current.iso8601 }
      }
    else
      critters.map { |c|
        { id: c.id, image_path: c.image_path, created_at: c.created_at.iso8601 }
      }
    end

    render inertia: "clearing/index", props: { critters: critter_props }
  end
end
