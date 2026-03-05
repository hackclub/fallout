import { useForm, usePage } from '@inertiajs/react'
import type { ShipForm, SharedProps } from '@/types'

export default function AdminShipsEdit({ ship, statuses }: { ship: ShipForm; statuses: string[] }) {
  const { errors } = usePage<SharedProps>().props

  const form = useForm({
    status: ship.status,
    feedback: ship.feedback,
    justification: ship.justification,
    approved_seconds: ship.approved_seconds,
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    form.patch(`/admin/reviews/${ship.id}`)
  }

  return (
    <div className="max-w-2xl mx-auto py-8">
      <h1 className="font-bold text-4xl mb-2">Review Ship #{ship.id}</h1>
      <p className="text-gray-500 mb-6">
        for {ship.project_name} by {ship.user_display_name}
      </p>

      <form onSubmit={submit} className="space-y-4">
        {Object.keys(errors).length > 0 && (
          <div className="bg-coral/30 border-2 border-dark-brown text-dark-brown p-4 mb-4">
            <ul>
              {Object.entries(errors).map(([field, messages]) =>
                messages.map((msg) => (
                  <li key={`${field}-${msg}`}>
                    {field} {msg}
                  </li>
                )),
              )}
            </ul>
          </div>
        )}

        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700">
            Status
          </label>
          <select
            id="status"
            value={form.data.status}
            onChange={(e) => form.setData('status', e.target.value)}
            className="mt-1 block w-full border border-gray-300 rounded px-3 py-2"
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="feedback" className="block text-sm font-medium text-gray-700">
            Feedback
          </label>
          <textarea
            id="feedback"
            value={form.data.feedback}
            onChange={(e) => form.setData('feedback', e.target.value)}
            rows={4}
            className="mt-1 block w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>

        <div>
          <label htmlFor="justification" className="block text-sm font-medium text-gray-700">
            Justification
          </label>
          <input
            type="text"
            id="justification"
            value={form.data.justification}
            onChange={(e) => form.setData('justification', e.target.value)}
            className="mt-1 block w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>

        <div>
          <label htmlFor="approved_seconds" className="block text-sm font-medium text-gray-700">
            Approved seconds
          </label>
          <input
            type="number"
            id="approved_seconds"
            value={form.data.approved_seconds ?? ''}
            onChange={(e) => form.setData('approved_seconds', e.target.value ? Number(e.target.value) : null)}
            className="mt-1 block w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>

        <div>
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 cursor-pointer"
            disabled={form.processing}
          >
            {form.processing ? 'Updating...' : 'Update Ship'}
          </button>
        </div>
      </form>
    </div>
  )
}
