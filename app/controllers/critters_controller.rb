class CrittersController < ApplicationController
  skip_after_action :verify_authorized # No index action — blanket skip required (Rails 8.1 callback validation)
  skip_after_action :verify_policy_scoped # No index action — blanket skip required (Rails 8.1 callback validation)

  def show
    @critter = Critter.find(params[:id])
    authorize @critter

    render inertia: "critters/show", props: {
      critter: {
        id: @critter.id,
        variant: @critter.variant,
        image_path: @critter.image_path,
        spun: @critter.spun
      },
      clearing_path: clearing_path
    }
  end

  def update
    @critter = Critter.find(params[:id])
    authorize @critter

    @critter.mark_spun!
    redirect_to critter_path(@critter)
  end

  # Retroactive critter roll for journal entries created before critters existed
  def roll
    journal_entry = current_user.journal_entries.kept.find(params[:journal_entry_id])
    authorize journal_entry, :show? # User must own the journal entry
    critter = journal_entry.critter || current_user.critters.create!(variant: Critter::VARIANTS.sample, journal_entry: journal_entry)
    redirect_to critter_path(critter)
  end
end
