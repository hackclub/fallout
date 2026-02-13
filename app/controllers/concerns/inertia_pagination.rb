# frozen_string_literal: true

module InertiaPagination
  extend ActiveSupport::Concern

  private

  def pagy_props(pagy)
    {
      count: pagy.count,
      page: pagy.page,
      limit: pagy.limit,
      pages: pagy.pages,
      next: pagy.next,
      prev: pagy.previous
    }
  end
end
