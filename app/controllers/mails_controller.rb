class MailsController < ApplicationController
  def index
    mails = policy_scope(MailMessage).order(pinned: :desc, created_at: :desc)

    read_mail_ids = current_user.mail_interactions.read.pluck(:mail_message_id).to_set
    dismissed_mail_ids = current_user.mail_interactions.dismissed.pluck(:mail_message_id).to_set

    render inertia: "mails/index", props: {
      mails: mails.map { |m| serialize_mail_item(m, read_mail_ids) },
      is_modal: request.headers["X-InertiaUI-Modal"].present?
    }
  end

  def show
    mail = MailMessage.find(params[:id])
    authorize mail

    interaction = current_user.mail_interactions.find_or_initialize_by(mail_message: mail)
    interaction.update!(read_at: Time.current) if interaction.read_at.nil?

    render inertia: "mails/show", props: {
      mail: serialize_mail_detail(mail),
      is_modal: request.headers["X-InertiaUI-Modal"].present?
    }
  end

  def dismiss
    mail = MailMessage.find(params[:id])
    authorize mail

    interaction = current_user.mail_interactions.find_or_initialize_by(mail_message: mail)
    interaction.update!(dismissed_at: Time.current)

    redirect_back fallback_location: mails_path
  end

  # Bulk mark-all-read operates on current user's own interactions only
  def read_all
    skip_authorization

    unread_ids = policy_scope(MailMessage).pluck(:id) - current_user.mail_interactions.read.pluck(:mail_message_id)
    now = Time.current

    unread_ids.each do |mail_id|
      current_user.mail_interactions.find_or_create_by!(mail_message_id: mail_id) do |mi|
        mi.read_at = now
      end
    end

    redirect_back fallback_location: mails_path
  end

  private

  def serialize_mail_item(mail, read_ids)
    item = {
      id: mail.id,
      summary: mail.summary,
      pinned: mail.pinned,
      dismissable: mail.dismissable,
      action_url: mail.action_url,
      action_label: mail.action_label,
      is_read: read_ids.include?(mail.id),
      source_type: mail.source_type,
      created_at: mail.created_at.strftime("%b %d, %Y")
    }

    item[:invite_id] = mail.source_id if mail.source_type == "CollaborationInvite"

    item
  end

  def serialize_mail_detail(mail)
    {
      id: mail.id,
      summary: mail.summary,
      content: mail.content,
      pinned: mail.pinned,
      dismissable: mail.dismissable,
      action_url: mail.action_url,
      action_label: mail.action_label,
      source_type: mail.source_type,
      created_at: mail.created_at.strftime("%B %d, %Y")
    }
  end
end
