import { useRef } from 'react'
import { Modal, ModalLink } from '@inertiaui/modal-react'
import BookLayout from '@/components/shared/BookLayout'
import Button from '@/components/shared/Button'

type ShopItem = {
  id: number
  name: string
  description: string | null
}

export default function ShopShow({
  shop_item,
  can,
  is_modal,
}: {
  shop_item: ShopItem
  can: { update: boolean; destroy: boolean }
  is_modal?: boolean
}) {
  const modalRef = useRef<{ close: () => void }>(null)

  const content = (
    <div className="relative flex flex-col h-full overflow-y-auto bg-light-brown">
      <div className="flex-1 flex flex-col p-4 xl:p-6 overflow-y-auto">
        <h1 className="font-bold text-4xl text-dark-brown mb-2">{shop_item.name}</h1>

        {shop_item.description && <p className="text-dark-brown mb-4">{shop_item.description}</p>}

        <div className="flex gap-4 mt-auto pt-6 flex-wrap">
          {is_modal && (
            <button
              onClick={() => modalRef.current?.close()}
              className="xl:hidden py-2 px-6 text-sm border-2 font-bold uppercase cursor-pointer bg-transparent text-dark-brown border-dark-brown"
            >
              Back
            </button>
          )}
          {can.update && (
            <ModalLink
              href={`/shop/${shop_item.id}/edit`}
              replace
              className="bg-brown text-light-brown border-2 border-dark-brown px-6 py-2 font-bold uppercase hover:opacity-80 flex items-center justify-center text-sm"
            >
              Edit
            </ModalLink>
          )}
        </div>
      </div>
    </div>
  )

  if (is_modal) {
    return (
      <Modal
        ref={modalRef}
        panelClasses="h-full max-xl:w-full max-xl:max-w-none max-xl:bg-light-brown max-xl:max-h-full max-xl:overflow-hidden"
        paddingClasses="p-0 xl:max-w-5xl xl:mx-auto"
        closeButton={false}
        maxWidth="7xl"
      >
        <BookLayout className="max-h-none xl:max-h-[40em]" showJoint={false}>
          {content}
        </BookLayout>
      </Modal>
    )
  }

  return content
}
