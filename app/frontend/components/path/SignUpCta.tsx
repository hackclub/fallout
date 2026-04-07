import Frame from '@/components/shared/Frame'

type Props = {
  signInPath: string
}

export default function SignUpCta({ signInPath }: Props) {
  return (
    <Frame showBorderOnMobile>
      <div className="flex flex-col items-center text-center space-y-4 py-4 mx-4">
        <div className="space-y-1">
          <h3 className="font-bold text-xl">
            Verify your account
            <br />
            to save progress!
          </h3>
          <p className="text-sm">& get stickers shipped to you!</p>
        </div>
        <a
          href={signInPath}
          className="py-1.5 px-4 bg-brown text-light-brown border-2 border-dark-brown font-bold w-full uppercase text-center"
        >
          Go verify
        </a>
      </div>
    </Frame>
  )
}
