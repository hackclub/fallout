class ClearingController < ApplicationController
  def index
    critters = policy_scope(Critter).order(created_at: :desc)

    critter_props = if Rails.env.development? && params[:simulate].present?
      Critter::ALL_VARIANTS.each_with_index.map { |v, i|
        { id: i + 1, variant: v, image_path: "/critters/#{v}.webp", created_at: Time.current.iso8601, count: 1 }
      }
    else
      critters.group_by(&:variant).map { |variant, variant_critters|
        representative = variant_critters.first
        {
          id: representative.id,
          variant: variant,
          image_path: representative.image_path,
          created_at: representative.created_at.iso8601,
          count: variant_critters.size
        }
      }
    end

    render inertia: "clearing/index", props: { critters: critter_props }
  end
end