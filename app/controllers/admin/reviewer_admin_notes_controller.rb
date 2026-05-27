class Admin::ReviewerAdminNotesController < Admin::ApplicationController
  skip_after_action :verify_authorized   # No index action; authorize called explicitly below
  skip_after_action :verify_policy_scoped # No index action

  before_action :set_reviewer

  def create
    note = ReviewerAdminNote.new(reviewer: @reviewer, author: current_user, body: params[:body])
    authorize note
    note.save!
    redirect_to admin_reviewer_path(@reviewer)
  end

  def update
    note = @reviewer.reviewer_admin_notes.find(params[:id])
    authorize note
    note.update!(body: params[:body])
    redirect_to admin_reviewer_path(@reviewer)
  end

  def destroy
    note = @reviewer.reviewer_admin_notes.find(params[:id])
    authorize note
    note.destroy!
    redirect_to admin_reviewer_path(@reviewer)
  end

  private

  def set_reviewer
    @reviewer = User.find(params[:reviewer_id])
  end
end
