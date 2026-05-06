# == Schema Information
#
# Table name: mail_messages
#
#  id           :bigint           not null, primary key
#  action_label :string
#  action_url   :string
#  auto_open    :boolean
#  content      :text
#  dismissable  :boolean          default(TRUE), not null
#  expires_at   :datetime
#  filters      :jsonb            not null
#  pinned       :boolean          default(FALSE), not null
#  source_type  :string
#  summary      :string           not null
#  created_at   :datetime         not null
#  updated_at   :datetime         not null
#  author_id    :bigint
#  source_id    :bigint
#  user_id      :bigint
#
# Indexes
#
#  index_mail_messages_on_expires_at                 (expires_at)
#  index_mail_messages_on_filters                    (filters) USING gin
#  index_mail_messages_on_source_type_and_source_id  (source_type,source_id)
#  index_mail_messages_on_user_id                    (user_id)
#
# Foreign Keys
#
#  fk_rails_...  (author_id => users.id)
#  fk_rails_...  (user_id => users.id)
#
require "test_helper"

class MailMessageTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
