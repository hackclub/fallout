import type { ReactNode } from 'react'
import { router } from '@inertiajs/react'
import { useModalStack, Modal, useModal } from '@inertiaui/modal-react'
import Frame from '@/components/shared/Frame'
import Button from '@/components/shared/Button'
import type { MailItem } from '@/types'

type PageProps = {
  mails: MailItem[]
  is_modal: boolean
}

function MailsIndex({ mails, is_modal }: PageProps) {
  const { visitModal } = useModalStack()
  const modal = useModal()

  function handleReadAll() {
    router.post('/mails/read_all', {}, { preserveScroll: true })
  }

  const hasUnread = mails.some((m) => !m.is_read)

  const content = (
    <div className="w-full h-full flex flex-col p-0 md:p-2 min-h-0">
      <div className="flex items-center justify-between mb-4 shrink-0 px-4 pt-4 md:px-4 md:pt-4">
        <h1 className="font-bold text-2xl text-dark-brown">Your Mail</h1>
        {hasUnread && (
          <Button variant="link" onClick={handleReadAll} className="text-sm">
            Mark all read
          </Button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 md:px-4 md:pb-4">
        {mails.length === 0 ? (
          <p className="text-brown text-center py-12">You don't have any mail yet! Check back later!</p>
        ) : (
          <div className="flex flex-col gap-2">
            {mails.map((mail) => {
              const isInvite = mail.source_type === 'CollaborationInvite' && mail.invite_id
              const showUnread = isInvite || !mail.is_read

              return (
                <div
                  key={mail.id}
                  className={`text-left p-4 border-2 bg-beige border-dark-brown ${isInvite ? '' : 'cursor-pointer hover:brightness-95 transition-all'}`}
                  onClick={isInvite ? undefined : () => visitModal(`/mails/${mail.id}`)}
                >
                  <div className="flex items-start gap-3">
                    {showUnread ? (
                      <span className="mt-1.5 shrink-0 size-2.5 rounded-full bg-coral" />
                    ) : (
                      <span className="mt-1.5 shrink-0 size-2.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {mail.pinned && <span className="text-xs text-coral font-bold uppercase">Pinned</span>}
                        <span className={`truncate ${showUnread ? 'text-dark-brown font-bold' : 'text-brown'}`}>
                          {mail.summary}
                        </span>
                      </div>
                      <span className="text-xs text-brown mt-1 block">{mail.created_at}</span>

                      {isInvite && (
                        <div className="flex gap-2 mt-3">
                          <Button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              router.post(
                                `/collaboration_invites/${mail.invite_id}/accept`,
                                {},
                                {
                                  preserveScroll: true,
                                  onSuccess: () => modal?.reload(),
                                },
                              )
                            }}
                            className="text-sm py-1 px-3"
                          >
                            Accept
                          </Button>
                          <Button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              router.post(
                                `/collaboration_invites/${mail.invite_id}/decline`,
                                {},
                                {
                                  preserveScroll: true,
                                  onSuccess: () => modal?.reload(),
                                },
                              )
                            }}
                            className="text-sm py-1 px-3 bg-light-brown text-dark-brown"
                          >
                            Ignore
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
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

MailsIndex.layout = (page: ReactNode) => page

export default MailsIndex
