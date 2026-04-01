import { router, Link } from '@inertiajs/react'
import { Modal } from '@inertiaui/modal-react'
import Frame from '@/components/shared/Frame'
import Button from '@/components/shared/Button'
import { notify } from '@/lib/notifications'
import type { InviteDetail } from '@/types'

export default function CollaborationInviteShow({ invite, is_modal }: { invite: InviteDetail; is_modal?: boolean }) {
  function handleAccept() {
    router.post(
      `/collaboration_invites/${invite.id}/accept`,
      {},
      {
        onError: () => notify('alert', 'Failed to accept invite.'),
      },
    )
  }

  function handleDecline() {
    if (confirm('Are you sure you want to decline this invite?')) {
      router.post(
        `/collaboration_invites/${invite.id}/decline`,
        {},
        {
          onError: () => notify('alert', 'Failed to decline invite.'),
        },
      )
    }
  }

  const content = (
    <div className="w-full h-full overflow-y-auto">
      <div className="w-full max-w-lg mx-auto p-4 md:p-8">
        <h1 className="font-bold text-3xl mb-6">Collaboration Invite</h1>

        <div className="flex items-center gap-3 mb-6">
          <img src={invite.inviter_avatar} alt="" className="w-10 h-10 rounded-full" />
          <div>
            <p className="font-bold">{invite.inviter_display_name}</p>
            <p className="text-sm text-dark-brown">invited you on {invite.created_at}</p>
          </div>
        </div>

        <p className="text-lg mb-6">
          to collaborate on <span className="font-bold">{invite.project_name}</span>
        </p>

        {invite.status === 'pending' && (
          <div className="flex gap-3">
            <Button onClick={handleAccept}>Accept</Button>
            <Button onClick={handleDecline} className="bg-dark-brown">
              Decline
            </Button>
          </div>
        )}

        {invite.status === 'accepted' && (
          <div>
            <p className="text-dark-brown mb-4">You accepted this invite.</p>
            <Link href={`/projects/${invite.project_id}`} className="text-blue-600 hover:underline">
              Go to project
            </Link>
          </div>
        )}

        {invite.status === 'declined' && <p className="text-dark-brown">You declined this invite.</p>}

        {invite.status === 'revoked' && <p className="text-dark-brown">This invite was withdrawn.</p>}
      </div>
    </div>
  )

  if (is_modal) {
    return (
      <Modal paddingClasses="max-w-lg mx-auto" closeButton={false}>
        <Frame showBorderOnMobile>{content}</Frame>
      </Modal>
    )
  }

  return content
}
