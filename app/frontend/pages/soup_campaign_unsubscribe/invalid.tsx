const SOUP_AVATAR = 'https://avatars.slack-edge.com/2026-03-03/10620134255189_994e10cd91f0fc88ad9c_512.jpg'

export default function SoupCampaignUnsubscribeInvalid() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-4">
      <div className="text-center max-w-sm space-y-4">
        <img src={SOUP_AVATAR} className="size-16 rounded-2xl mx-auto opacity-50" alt="Soup" />
        <h1 className="text-xl font-semibold">Invalid unsubscribe link</h1>
        <p className="text-muted-foreground text-sm">
          This link is invalid or has already expired. If you need help, reach out in{' '}
          <a href="https://hackclub.enterprise.slack.com/archives/C037157AL30" className="underline">
            #fallout
          </a>
          .
        </p>
      </div>
    </div>
  )
}
