import { useForm, usePage } from '@inertiajs/react'
import { Modal, ModalLink } from '@inertiaui/modal-react'
import Frame from '@/components/shared/Frame'
import Button from '@/components/shared/Button'
import Input from '@/components/shared/Input'
import TextArea from '@/components/shared/TextArea'
import type { SharedProps } from '@/types'

type ShopItemForm = {
  id: number | null
  name: string
  description: string
  status: string
}

export default function ShopForm({
  shop_item,
  title,
  submit_url,
  method,
  is_modal,
}: {
  shop_item: ShopItemForm
  title: string
  submit_url: string
  method: string
  is_modal: boolean
}) {
  const { errors } = usePage<SharedProps>().props

  const form = useForm({
    name: shop_item.name,
    description: shop_item.description,
    status: shop_item.status,
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (method === 'patch') {
      form.patch(submit_url)
    } else {
      form.post(submit_url)
    }
  }

  const content = (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="font-bold text-4xl text-dark-brown mb-6">{title}</h1>

      <form onSubmit={submit} className="space-y-4">
        {Object.keys(errors).length > 0 && (
          <div className="bg-coral/30 border-2 border-dark-brown text-dark-brown p-4 mb-4 rounded">
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
          <label htmlFor="name" className="block text-sm font-bold text-dark-brown mb-1">
            Name
          </label>
          <Input
            type="text"
            id="name"
            value={form.data.name}
            onChange={(e) => form.setData('name', e.target.value)}
            required
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-bold text-dark-brown mb-1">
            Description
          </label>
          <TextArea
            id="description"
            value={form.data.description}
            onChange={(e) => form.setData('description', e.target.value)}
            rows={4}
          />
        </div>

        <div>
          <label htmlFor="status" className="block text-sm font-bold text-dark-brown mb-1">
            Status
          </label>
          <select
            id="status"
            value={form.data.status}
            onChange={(e) => form.setData('status', e.target.value)}
            className="w-full border-2 border-dark-brown bg-light-brown text-dark-brown p-2 rounded-xs"
          >
            <option value="unavailable">Unavailable</option>
            <option value="available">Available</option>
          </select>
        </div>

        <div className="flex gap-4 pt-2">
          <Button type="submit" disabled={form.processing}>
            {form.processing ? 'Saving...' : 'Save'}
          </Button>
          {shop_item.id && is_modal ? (
            <ModalLink
              href={`/shop/${shop_item.id}`}
              replace
              className="bg-brown text-light-brown border-2 border-dark-brown px-4 py-2 font-bold uppercase hover:opacity-80"
            >
              Cancel
            </ModalLink>
          ) : (
            <Button variant="link" onClick={() => window.history.back()}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </div>
  )

  if (is_modal) {
    return (
      <Modal panelClasses="h-full" paddingClasses="max-w-5xl mx-auto" closeButton={false}>
        <Frame className="h-full">{content}</Frame>
      </Modal>
    )
  }

  return content
}
