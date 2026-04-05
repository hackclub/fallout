class Admin::KoiTransactionsController < Admin::ApplicationController
  before_action :require_admin! # Only admins can adjust koi balances

  def index
    scope = policy_scope(KoiTransaction).includes(:user, :actor)
    scope = scope.where(user_id: params[:user_id]) if params[:user_id].present?
    @pagy, @transactions = pagy(scope.order(created_at: :desc))

    render inertia: "admin/koi_transactions/index", props: {
      transactions: @transactions.map { |t| serialize_transaction(t) },
      pagy: pagy_props(@pagy),
      user_id_filter: params[:user_id].to_s
    }
  end

  def new
    @transaction = KoiTransaction.new
    @transaction.user_id = params[:user_id] if params[:user_id].present?
    authorize @transaction

    render inertia: "admin/koi_transactions/new", props: {
      prefill_user_id: params[:user_id].to_s
    }
  end

  def create
    @transaction = KoiTransaction.new(transaction_params)
    @transaction.actor = current_user
    @transaction.reason = "admin_adjustment"
    authorize @transaction

    if @transaction.save
      redirect_to admin_koi_transactions_path(user_id: @transaction.user_id),
        notice: "Koi adjustment saved."
    else
      redirect_back fallback_location: new_admin_koi_transaction_path,
        inertia: { errors: @transaction.errors.messages }
    end
  end

  private

  def transaction_params
    params.expect(koi_transaction: [ :user_id, :amount, :description ])
  end

  def serialize_transaction(txn)
    {
      id: txn.id,
      user: { id: txn.user.id, display_name: txn.user.display_name },
      actor: { id: txn.actor.id, display_name: txn.actor.display_name },
      amount: txn.amount,
      reason: txn.reason,
      description: txn.description,
      created_at: txn.created_at.strftime("%b %d, %Y %H:%M")
    }
  end
end
