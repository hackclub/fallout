import type { ReactNode } from 'react'
import { router } from '@inertiajs/react'
import { Modal } from '@inertiaui/modal-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Frame from '@/components/shared/Frame'
import Button from '@/components/shared/Button'
import type { MailDetail } from '@/types'

type PageProps = {
  mail: MailDetail
  is_modal: boolean
}

function MailShow({ mail, is_modal }: PageProps) {
  function handleDismiss() {
    router.post(`/mails/${mail.id}/dismiss`, {}, { preserveScroll: true })
  }

  const content = (
    <div className="w-full h-full flex flex-col p-0 md:p-2 min-h-0">
      <div className="shrink-0 px-4 pt-4 md:px-4 md:pt-4">
        <h1 className="font-bold text-2xl text-dark-brown mb-1">{mail.summary}</h1>
        <p className="text-sm text-brown mb-6">{mail.created_at}</p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-4">
        {mail.content && (
          <div className="prose prose-sm max-w-none text-dark-brown mb-6">
            <Markdown remarkPlugins={[remarkGfm]}>{mail.content}</Markdown>
          </div>
        )}
        {!mail.content && <p className="text-brown italic">No content</p>}
      </div>

      <div className="shrink-0 flex items-center gap-3 p-4 md:px-4">
        {mail.action_url && (
          <a
            href={mail.action_url}
            className="py-1.5 px-4 border-2 font-bold uppercase bg-dark-brown text-light-brown border-dark-brown cursor-pointer hover:opacity-80"
          >
            View
          </a>
        )}
        {mail.dismissable && (
          <Button onClick={handleDismiss} className="bg-light-brown text-dark-brown">
            Dismiss
          </Button>
        )}
      </div>
    </div>
  )

  if (is_modal) {
    return (
      <Modal panelClasses="h-full" paddingClasses="max-w-2xl mx-auto" closeButton={false} maxWidth="3xl">
        <Frame className="h-full" showBorderOnMobile>
          {content}
        </Frame>
      </Modal>
    )
  }

  return content
}

MailShow.layout = (page: ReactNode) => page

export default MailShow
