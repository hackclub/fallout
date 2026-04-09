# == Schema Information
#
# Table name: pending_collaboration_invites
#
#  id                      :bigint           not null, primary key
#  discarded_at            :datetime
#  invitee_email           :string           not null
#  status                  :integer          default("pending"), not null
#  token                   :string           not null
#  created_at              :datetime         not null
#  updated_at              :datetime         not null
#  collaboration_invite_id :bigint
#  inviter_id              :bigint           not null
#  project_id              :bigint           not null
#
# Indexes
#
#  idx_pending_collab_invites_on_project_email_status              (project_id,invitee_email,status)
#  index_pending_collaboration_invites_on_collaboration_invite_id  (collaboration_invite_id)
#  index_pending_collaboration_invites_on_discarded_at             (discarded_at)
#  index_pending_collaboration_invites_on_inviter_id               (inviter_id)
#  index_pending_collaboration_invites_on_project_id               (project_id)
#  index_pending_collaboration_invites_on_token                    (token) UNIQUE
#
# Foreign Keys
#
#  fk_rails_...  (collaboration_invite_id => collaboration_invites.id)
#  fk_rails_...  (inviter_id => users.id)
#  fk_rails_...  (project_id => projects.id)
#
class PendingCollaborationInvite < ApplicationRecord
  include Discardable

  has_paper_trail

  belongs_to :inviter, class_name: "User"
  belongs_to :project
  belongs_to :collaboration_invite, optional: true

  enum :status, { pending: 0, claimed: 1, revoked: 2 }

  validates :token, presence: true, uniqueness: true
  validates :invitee_email, presence: true, format: { with: URI::MailTo::EMAIL_REGEXP }
  validate :no_duplicate_pending_invite, on: :create
  validate :invitee_email_must_not_be_project_owner

  before_validation :generate_token, on: :create

  # Claims this pending invite for a verified user, creating the real CollaborationInvite and MailMessage.
  # Returns the CollaborationInvite. Idempotent — returns existing invite if already claimed.
  def claim!(user)
    return collaboration_invite if claimed?

    ActiveRecord::Base.transaction do
      invite = project.collaboration_invites.create!(inviter: inviter, invitee: user)
      MailDeliveryService.collaboration_invite_sent(invite)
      update!(collaboration_invite: invite, status: :claimed)
      invite
    end
  end

  # Claims all pending invites matching an email for a newly verified user.
  def self.claim_all_for_email!(email, user)
    where(invitee_email: email.downcase, status: :pending).find_each do |pending_invite|
      pending_invite.claim!(user)
    rescue ActiveRecord::RecordInvalid => e
      # Skip invites that fail validation (e.g. user is already a collaborator, duplicate)
      Rails.logger.warn("Failed to claim pending invite #{pending_invite.id}: #{e.message}")
    end
  end

  private

  def generate_token
    self.token ||= SecureRandom.urlsafe_base64(32)
  end

  def no_duplicate_pending_invite
    return unless project && invitee_email.present?
    if PendingCollaborationInvite.pending.where(project: project, invitee_email: invitee_email.downcase).exists?
      errors.add(:invitee_email, "already has a pending invite for this project")
    end
  end

  def invitee_email_must_not_be_project_owner
    return unless project && invitee_email.present?
    if invitee_email.downcase == project.user&.email&.downcase
      errors.add(:invitee_email, "is the project owner")
    end
  end
end
