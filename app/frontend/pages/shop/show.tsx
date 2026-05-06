import { useRef } from 'react'
import { Modal } from '@inertiaui/modal-react'
import BookLayout from '@/components/shared/BookLayout'

type ShopItem = {
  id: number
  name: string
  description: string | null
}

export default function ShopShow({
  shop_item,
  is_modal,
}: {
  shop_item: ShopItem
  is_modal?: boolean
}) {
  const modalRef = useRef<{ close: () => void }>(null)

  const content = (
    <div className="relative flex flex-col h-full overflow-y-auto bg-light-brown">
      <div className="flex-1 flex flex-col p-4 xl:p-6 overflow-y-auto">
        <h1 className="font-bold text-4xl text-dark-brown mb-2">{shop_item.name}</h1>

        {shop_item.description && <p className="text-dark-brown mb-4">{shop_item.description}</p>}

        {is_modal && (
          <div className="flex gap-4 mt-auto pt-6 flex-wrap">
            <button
              onClick={() => modalRef.current?.close()}
              className="xl:hidden py-2 px-6 text-sm border-2 font-bold uppercase cursor-pointer bg-transparent text-dark-brown border-dark-brown"
            >
              Back
            </button>
          </div>
        )}
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
