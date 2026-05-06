class Admin::ProjectGrants::SettingsController < Admin::ApplicationController
  # Without this, wrap_parameters infers ":setting" from the controller name and our
  # params.expect(:hcb_grant_setting) misses.
  wrap_parameters :hcb_grant_setting

  before_action :require_admin! # Global HCB grant config — admin-only

  # Singleton resource (no :index). Both verifier skips are required because
  # Rails 8.1 raises ActionNotFound if `except: :index` references a missing action.
  # Each action below still calls `authorize` explicitly.
  skip_after_action :verify_authorized
  skip_after_action :verify_policy_scoped

  def show
    @setting = HcbGrantSetting.current
    authorize @setting

    render inertia: "admin/project_grants/setting", props: {
      setting: serialize(@setting),
      is_hcb: current_user.hcb? # Non-hcb admins see settings read-only
    }
  end

  def update
    @setting = HcbGrantSetting.current
    authorize @setting

    if @setting.update(setting_params)
      redirect_to admin_project_grants_setting_path, notice: "Settings saved."
    else
      redirect_back fallback_location: admin_project_grants_setting_path,
        inertia: { errors: @setting.errors.messages }
    end
  end

  private

  def setting_params
    permitted = params.expect(hcb_grant_setting: [
      :purpose,
      :default_expiry_days,
      :keyword_lock,
      :one_time_use,
      :pre_authorization_required,
      :instructions,
      :invite_message,
      :koi_to_cents_numerator,
      :koi_to_cents_denominator,
      :koi_to_hours_numerator,
      :koi_to_hours_denominator,
      { merchant_lock: [], category_lock: [] }
    ])
    permitted[:merchant_lock] = Array(permitted[:merchant_lock]).compact_blank if permitted.key?(:merchant_lock)
    permitted[:category_lock] = Array(permitted[:category_lock]).compact_blank if permitted.key?(:category_lock)
    permitted
  end

  def serialize(setting)
    {
      purpose: setting.purpose,
      default_expiry_days: setting.default_expiry_days,
      merchant_lock: setting.merchant_lock,
      category_lock: setting.category_lock,
      keyword_lock: setting.keyword_lock,
      one_time_use: setting.one_time_use,
      pre_authorization_required: setting.pre_authorization_required,
      instructions: setting.instructions,
      invite_message: setting.invite_message,
      koi_to_cents_numerator: setting.koi_to_cents_numerator,
      koi_to_cents_denominator: setting.koi_to_cents_denominator,
      koi_to_hours_numerator: setting.koi_to_hours_numerator,
      koi_to_hours_denominator: setting.koi_to_hours_denominator
    }
  end
end
