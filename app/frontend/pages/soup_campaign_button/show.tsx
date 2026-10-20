interface Props {
  status: 'done' | 'failed' | 'invalid'
  button_label?: string
}

const SOUP_AVATAR = 'https://avatars.slack-edge.com/2026-03-03/10620134255189_994e10cd91f0fc88ad9c_512.jpg'

const COPY = {
  done: { title: 'Done!', body: 'You can close this tab and head back to Slack.' },
  failed: {
    title: 'Something went wrong',
    body: 'We couldn’t process that click. Please try again in a bit, or reach out in',
  },
  invalid: {
    title: 'Invalid link',
    body: 'This button link is invalid or no longer works. If you need help, reach out in',
  },
}

export default function SoupCampaignButtonShow({ status, button_label }: Props) {
  const { title, body } = COPY[status]

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-4">
      <div className="text-center max-w-sm space-y-4">
        <img src={SOUP_AVATAR} className="size-16 rounded-2xl mx-auto" alt="Soup" />
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">{title}</h1>
          {button_label && status === 'done' && (
            <p className="text-muted-foreground text-sm">
              <strong>{button_label}</strong> went through.
            </p>
          )}
          <p className="text-muted-foreground text-sm">
            {body}
            {status !== 'done' && (
              <>
                {' '}
                <a href="https://hackclub.enterprise.slack.com/archives/C037157AL30" className="underline">
                  #fallout
                </a>
                .
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
