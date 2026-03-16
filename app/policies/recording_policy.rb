# frozen_string_literal: true

class RecordingPolicy < ApplicationPolicy
  def create?
    user.present? # any authenticated user (including trial) — recordings are scoped to an already-authorized journal entry
  end
end
