class ProjectGrantsController < ApplicationController
  # No matching model named "Grant"; pin the wrap key so params.expect(:project_grant_order) works.
  wrap_parameters :project_grant_order

  def index
    # The shared policy scope returns scope.all for admins (for the admin namespace).
    # Pin to current_user here so admins browsing their own public page only see their
    # own orders. policy_scope still runs to satisfy verify_policy_scoped.
    @orders = policy_scope(ProjectGrantOrder).kept.where(user_id: current_user.id).order(created_at: :desc)

    render inertia: "project_grants/index", props: {
      orders: @orders.map { |o| serialize(o) },
      koi_balance: current_user.koi,
      rates: rate_props,
      hours_configured: HcbGrantSetting.current.hours_rate_configured?
    }
  end

  def new
    @order = ProjectGrantOrder.new(user: current_user)
    authorize @order

    render inertia: "project_grants/new", props: {
      koi_balance: current_user.koi,
      rates: rate_props,
      hours_configured: HcbGrantSetting.current.hours_rate_configured?
    }
  end

  def create
    @order = ProjectGrantOrder.new(create_params.merge(user: current_user))
    authorize @order

    # Serialize balance checks against concurrent shop orders / grant orders — both paths
    # must take the user row lock before reading koi, or parallel requests can double-spend.
    saved = current_user.with_lock { @order.save }

    if saved
      redirect_to project_grants_path,
        notice: "Grant request submitted ($#{format('%.2f', @order.frozen_usd_cents / 100.0)}, #{@order.frozen_koi_amount} koi). Awaiting admin approval."
    else
      redirect_back fallback_location: new_project_grant_path,
        inertia: { errors: @order.errors.messages }
    end
  end

  private

  # `usd_cents` is the only user-supplied field; `frozen_koi_amount` is derived in the model.
  def create_params
    params.expect(project_grant_order: [ :frozen_usd_cents ])
  end

  def rate_props
    setting = HcbGrantSetting.current
    {
      koi_to_cents_numerator: setting.koi_to_cents_numerator,
      koi_to_cents_denominator: setting.koi_to_cents_denominator,
      koi_to_hours_numerator: setting.koi_to_hours_numerator,
      koi_to_hours_denominator: setting.koi_to_hours_denominator
    }
  end

  def serialize(order)
    {
      id: order.id,
      frozen_usd_cents: order.frozen_usd_cents,
      frozen_koi_amount: order.frozen_koi_amount,
      state: order.state,
      admin_note: order.admin_note,
      created_at: order.created_at.strftime("%b %d, %Y %H:%M")
    }
  end
end
