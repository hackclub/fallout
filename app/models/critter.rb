# == Schema Information
#
# Table name: critters
#
#  id               :bigint           not null, primary key
#  spun             :boolean          default(FALSE), not null
#  variant          :string           not null
#  created_at       :datetime         not null
#  updated_at       :datetime         not null
#  journal_entry_id :bigint           not null
#  user_id          :bigint           not null
#
# Indexes
#
#  index_critters_on_journal_entry_id        (journal_entry_id)
#  index_critters_on_user_id                 (user_id)
#  index_critters_on_user_id_and_created_at  (user_id,created_at)
#
# Foreign Keys
#
#  fk_rails_...  (journal_entry_id => journal_entries.id)
#  fk_rails_...  (user_id => users.id)
#
class Critter < ApplicationRecord
  VARIANTS = %w[
    b2b-sales bloo bush chocolate elk floaty grass gren-frog jellycat
    matcha milk-tea orange party-cat riptide rosey skeelton smoothie
    snek sungod the-goat the-red trashcan worm yelo
  ].freeze

  SHINY_VARIANTS = %w[
    shiny-b2b-sales shiny-bandage shiny-bloo shiny-bush-doggy
    shiny-chocolate-bunny shiny-floaty shiny-gren-frog shiny-grass
    shiny-matcha shiny-milk-tea shiny-orange shiny-party-cat
    shiny-rosey-dog shiny-silly-lil-raccoon shiny-skeelton-fish
    shiny-smol-flying-cat shiny-smol-jellycat shiny-smoothie shiny-snek
    shiny-suns shiny-the-goat shiny-the-red shiny-wavey-cat shiny-worm
    shiny-yelo
  ].freeze

  ALL_VARIANTS = (VARIANTS + SHINY_VARIANTS).freeze
  SHINY_CHANCE = 0.05

  include Broadcastable

  # Live-update the critter owner's path page (critter_variants array) on any change.
  broadcasts_updates_to { "path_user_#{user_id}" }

  belongs_to :user
  belongs_to :journal_entry

  validates :variant, presence: true, inclusion: { in: ALL_VARIANTS }

  scope :spun, -> { where(spun: true) }
  scope :unspun, -> { where(spun: false) }

  def shiny?
    variant.start_with?("shiny-")
  end

  def image_path
    "/critters/#{variant}.webp"
  end

  def audio_path
    "/sfx/spin/#{variant}.mp3"
  end

  def mark_spun!
    update!(spun: true)
  end

  def self.roll_variant
    if rand < SHINY_CHANCE
      SHINY_VARIANTS.sample
    else
      VARIANTS.sample
    end
  end
end
