# frozen_string_literal: true

# == Schema Information
#
# Table name: hcb_connections
#
#  id               :bigint           not null, primary key
#  access_token     :text
#  connected_at     :datetime
#  refresh_token    :text
#  token_expires_at :datetime
#  created_at       :datetime         not null
#  updated_at       :datetime         not null
#  connected_by_id  :bigint           not null
#
# Indexes
#
#  index_hcb_connections_on_connected_by_id  (connected_by_id)
#
# Foreign Keys
#
#  fk_rails_...  (connected_by_id => users.id)
#
class HcbConnection < ApplicationRecord
  encrypts :access_token
  encrypts :refresh_token

  has_paper_trail

  belongs_to :connected_by, class_name: "User"

  validate :single_record, on: :create

  scope :active, -> { where.not(access_token: nil) }

  def self.current
    first
  end

  def token_expired?
    token_expires_at.nil? || token_expires_at < Time.current
  end

  def token_expiring_soon?
    token_expires_at.present? && token_expires_at < 30.minutes.from_now
  end

  def disconnect!
    update!(access_token: nil, refresh_token: nil, token_expires_at: nil)
  end

  private

  def single_record
    errors.add(:base, "Only one HCB connection is allowed") if self.class.exists?
  end
end
