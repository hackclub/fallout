import { Link } from '@inertiajs/react'

type Transaction = {
  id: number
  user: { id: number; display_name: string }
  actor: { id: number; display_name: string }
  amount: number
  reason: string
  description: string
  created_at: string
}

export default function AdminKoiTransactionsIndex({
  transactions,
  user_id_filter,
}: {
  transactions: Transaction[]
  user_id_filter: string
  pagy: unknown
}) {
  return (
    <div className="max-w-5xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-bold text-4xl text-dark-brown">
          Koi Transactions
          {user_id_filter && <span className="text-2xl font-normal"> — User #{user_id_filter}</span>}
        </h1>
        <Link
          href={
            user_id_filter ? `/admin/koi_transactions/new?user_id=${user_id_filter}` : '/admin/koi_transactions/new'
          }
          className="bg-brown border-2 border-dark-brown text-light-brown font-bold px-4 py-2 rounded-xs hover:opacity-80"
        >
          + Adjust Koi
        </Link>
      </div>

      <table className="w-full text-dark-brown text-sm">
        <thead>
          <tr className="border-b-2 border-dark-brown text-left">
            <th className="pb-2 pr-4">User</th>
            <th className="pb-2 pr-4">Amount</th>
            <th className="pb-2 pr-4">Reason</th>
            <th className="pb-2 pr-4">Description</th>
            <th className="pb-2 pr-4">By</th>
            <th className="pb-2">Date</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((txn) => (
            <tr key={txn.id} className="border-b border-brown">
              <td className="py-2 pr-4 font-bold">{txn.user.display_name}</td>
              <td className={`py-2 pr-4 font-bold ${txn.amount > 0 ? 'text-green-700' : 'text-red-700'}`}>
                {txn.amount > 0 ? `+${txn.amount}` : txn.amount} koi
              </td>
              <td className="py-2 pr-4">{txn.reason}</td>
              <td className="py-2 pr-4">{txn.description}</td>
              <td className="py-2 pr-4">{txn.actor.display_name}</td>
              <td className="py-2">{txn.created_at}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {transactions.length === 0 && <p className="text-dark-brown mt-8 text-center">No transactions found.</p>}
    </div>
  )
}
