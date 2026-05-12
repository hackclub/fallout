class Admin::KoiTransactionsController < Admin::ApplicationController
  before_action :require_admin! # Only admins can adjust koi/gold balances

  def index
    model = transaction_model
    scope = policy_scope(model).includes(:user, :actor)
    scope = scope.where(user_id: params[:user_id]) if params[:user_id].present?
    @pagy, @transactions = pagy(scope.order(created_at: :desc))

    render inertia: "admin/koi_transactions/index", props: {
      transactions: @transactions.map { |t| serialize_transaction(t) },
      pagy: pagy_props(@pagy),
      user_id_filter: params[:user_id].to_s,
      currency: current_currency
    }
  end

  def new
    model = transaction_model
    @transaction = model.new
    @transaction.user_id = params[:user_id] if params[:user_id].present?
    authorize @transaction

    render inertia: "admin/koi_transactions/new", props: {
      prefill_user_id: params[:user_id].to_s,
      currency: current_currency
    }
  end

  def create
    model = transaction_model
    @transaction = model.new(transaction_params)
    @transaction.actor = current_user
    @transaction.reason = "admin_adjustment"
    authorize @transaction

    if @transaction.save
      redirect_to admin_koi_transactions_path(user_id: @transaction.user_id, currency: current_currency),
        notice: "#{current_currency.capitalize} adjustment saved."
    else
      redirect_back fallback_location: new_admin_koi_transaction_path(currency: current_currency),
        inertia: { errors: @transaction.errors.messages }
    end
  end

  private

  def current_currency
    params[:currency] == "gold" ? "gold" : "koi"
  end

  def transaction_model
    current_currency == "gold" ? GoldTransaction : KoiTransaction
  end

  def transaction_params
    if current_currency == "gold"
      params.expect(gold_transaction: [ :user_id, :amount, :description ])
    else
      params.expect(koi_transaction: [ :user_id, :amount, :description ])
    end
  end

  def serialize_transaction(txn)
    {
      id: txn.id,
      user: { id: txn.user.id, display_name: txn.user.display_name },
      actor: txn.actor ? { id: txn.actor.id, display_name: txn.actor.display_name } : nil,
      amount: txn.amount,
      reason: txn.reason,
      description: txn.description,
      created_at: txn.created_at.strftime("%b %d, %Y %H:%M")
    }
  end
end
