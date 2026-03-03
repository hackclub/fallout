# == Schema Information
#
# Table name: onboarding_responses
#
#  id           :bigint           not null, primary key
#  answer_text  :text             default(""), not null
#  is_other     :boolean          default(FALSE), not null
#  question_key :string           not null
#  created_at   :datetime         not null
#  updated_at   :datetime         not null
#  user_id      :bigint           not null
#
# Indexes
#
#  index_onboarding_responses_on_user_id                   (user_id)
#  index_onboarding_responses_on_user_id_and_question_key  (user_id,question_key) UNIQUE
#
# Foreign Keys
#
#  fk_rails_...  (user_id => users.id)
#
class OnboardingResponse < ApplicationRecord
  belongs_to :user

  validates :question_key, presence: true, uniqueness: { scope: :user_id }
  validates :answer_text, length: { maximum: 1000 }
end
