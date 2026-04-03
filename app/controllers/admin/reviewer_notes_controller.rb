class Admin::ReviewerNotesController < Admin::ApplicationController
  # No index action — blanket skip to avoid ActionNotFound
  skip_after_action :verify_authorized
  skip_after_action :verify_policy_scoped

  before_action :set_project
  before_action :set_note, only: %i[update destroy]

  def create
    @note = @project.reviewer_notes.build(note_params)
    @note.user = current_user
    authorize @note
    if @note.save
      render json: serialize_note(@note), status: :created
    else
      render json: { errors: @note.errors.messages }, status: :unprocessable_entity
    end
  end

  def update
    authorize @note
    if @note.update(body_params)
      render json: serialize_note(@note)
    else
      render json: { errors: @note.errors.messages }, status: :unprocessable_entity
    end
  end

  def destroy
    authorize @note
    @note.destroy
    head :no_content
  end

  private

  def set_project
    @project = Project.find(params[:project_id])
  end

  def set_note
    @note = @project.reviewer_notes.find(params[:id])
  end

  def note_params
    params.require(:reviewer_note).permit(:body, :ship_id, :review_stage)
  end

  # Update only allows changing body — context (ship/stage) is immutable
  def body_params
    params.require(:reviewer_note).permit(:body)
  end

  def serialize_note(note)
    {
      id: note.id,
      body: note.body,
      ship_id: note.ship_id,
      review_stage: note.review_stage,
      author_display_name: note.user.display_name,
      author_avatar: note.user.avatar,
      author_id: note.user_id,
      created_at: note.created_at.iso8601,
      updated_at: note.updated_at.iso8601
    }
  end
end
