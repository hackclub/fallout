# frozen_string_literal: true

class YouTubeVideoPolicy < ApplicationPolicy
  def lookup?
    user.present? # video lookup is a global search not tied to a specific resource; recording creation is authorized separately
  end
end
