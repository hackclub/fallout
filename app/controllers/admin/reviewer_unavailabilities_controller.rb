class Admin::ReviewerUnavailabilitiesController < Admin::ApplicationController
  skip_after_action :verify_authorized   # No index action; authorize called explicitly below
  skip_after_action :verify_policy_scoped # No index action

  before_action :set_reviewer

  def create
    unavailability = @reviewer.reviewer_unavailabilities.build(
      starts_on: params[:starts_on],
      ends_on:   params[:ends_on],
      reason:    params[:reason].presence
    )
    authorize unavailability
    unavailability.save!
    redirect_to admin_reviewer_path(@reviewer)
  end

  def destroy
    unavailability = @reviewer.reviewer_unavailabilities.find(params[:id])
    authorize unavailability
    unavailability.destroy!
    redirect_to admin_reviewer_path(@reviewer)
  end

  private

  def set_reviewer
    @reviewer = User.find(params[:reviewer_id])
  end
end
