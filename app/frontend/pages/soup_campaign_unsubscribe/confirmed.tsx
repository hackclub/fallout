interface Props {
  campaign_name: string
}

const SOUP_AVATAR = 'https://avatars.slack-edge.com/2026-03-03/10620134255189_994e10cd91f0fc88ad9c_512.jpg'

export default function SoupCampaignUnsubscribeConfirmed({ campaign_name }: Props) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-4">
      <div className="text-center max-w-sm space-y-4">
        <img src={SOUP_AVATAR} className="size-16 rounded-2xl mx-auto" alt="Soup" />
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">You've been unsubscribed</h1>
          <p className="text-muted-foreground text-sm">
            You won't receive any further messages from <strong>{campaign_name}</strong>. If this was a mistake, reach
            out in{' '}
            <a href="https://hackclub.enterprise.slack.com/archives/C037157AL30" className="underline">
              #fallout
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  )
}
