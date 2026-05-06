import { router } from '@inertiajs/react'
import { Button } from '@/components/admin/ui/button'

interface Props {
  campaign_name: string
  already_unsubscribed: boolean
  token: string
}

const SOUP_AVATAR = 'https://avatars.slack-edge.com/2026-03-03/10620134255189_994e10cd91f0fc88ad9c_512.jpg'

export default function SoupCampaignUnsubscribeShow({ campaign_name, already_unsubscribed, token }: Props) {
  if (already_unsubscribed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-4">
        <div className="text-center max-w-sm space-y-4">
          <img src={SOUP_AVATAR} className="size-16 rounded-2xl mx-auto" alt="Soup" />
          <h1 className="text-xl font-semibold">You're already unsubscribed</h1>
          <p className="text-muted-foreground text-sm">
            You've already been removed from <strong>{campaign_name}</strong> and won't receive any further messages
            from this campaign.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-4">
      <div className="text-center max-w-sm space-y-5">
        <img src={SOUP_AVATAR} className="size-16 rounded-2xl mx-auto" alt="Soup" />
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Unsubscribe from Soup</h1>
          <p className="text-muted-foreground text-sm">
            You're about to unsubscribe from <strong>{campaign_name}</strong>. You won't receive this campaign message
            if it hasn't been sent to you yet.
          </p>
        </div>
        <Button className="w-full" onClick={() => router.post(`/unsubscribe/soup/${token}`)}>
          Confirm unsubscribe
        </Button>
        <p className="text-xs text-muted-foreground">
          This only affects this campaign. It won't unsubscribe you from streak notifications or other Fallout messages.
        </p>
      </div>
    </div>
  )
}
