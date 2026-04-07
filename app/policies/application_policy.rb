# frozen_string_literal: true

class ApplicationPolicy
  attr_reader :user, :record

  def initialize(user, record)
    @user = user
    @record = record
  end

  def index?
    false
  end

  def show?
    false
  end

  def create?
    false
  end

  def new?
    create?
  end

  def update?
    false
  end

  def edit?
    update?
  end

  def destroy?
    false
  end

  private

  def admin?
    user&.admin?
  end

  def staff?
    user&.staff?
  end

  def owner?
    record.respond_to?(:user) && record.user == user
  end

  def collaborators_enabled?
    user.present? && Flipper.enabled?(:collaborators, user) # Feature flag gating for collaborator access
  end

  class Scope
    def initialize(user, scope)
      @user = user
      @scope = scope
    end

    def resolve
      raise NoMethodError, "You must define #resolve in #{self.class}"
    end

    private

    attr_reader :user, :scope

    def collaborators_enabled?
      user.present? && Flipper.enabled?(:collaborators, user) # Feature flag gating for collaborator access
    end
  end
end
