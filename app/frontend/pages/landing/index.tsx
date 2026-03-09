import { usePage, router } from '@inertiajs/react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { SharedProps } from '@/types'
import Frame from '@/components/shared/Frame'
import FlashMessages from '@/components/FlashMessages'
import { notify } from '@/lib/notifications'

export default function LandingIndex() {
  const shared = usePage<SharedProps>().props
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [currentSection, setCurrentSection] = useState('overview')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    router.post(
      shared.trial_session_path,
      { email },
      {
        onStart: () => setSubmitting(true),
        onFinish: () => setSubmitting(false),
        onSuccess: (page) => {
          const flash = (page.props as unknown as SharedProps).flash
          if (flash.notice) {
            notify('notice', flash.notice)
            setEmail('')
          }
          if (flash.alert) notify('alert', flash.alert)
        },
        onError: () => notify('alert', 'Something went wrong. Please try again.'),
      },
    )
  }

  const sections = [
    { id: 'overview', label: 'Overview' },
    { id: 'qualifying', label: 'Qualifying' },
    { id: 'requirements', label: 'What counts' },
    { id: 'shipping', label: 'Submitting' },
    { id: 'travel', label: 'Travel & Event' },
    { id: 'parents', label: 'For Parents' },
  ]

  return (
    <div className="w-screen h-full flex flex-col justify-center bg-blue overflow-hidden">
      <title>Fallout: Hardware Hackathon</title>
      <meta
        name="description"
        content="A seven-day hardware hackathon in ShenZhen, China in 2026. Design hardware projects, build them, & qualify!"
      />
      <meta property="og:type" content="website" />
      <meta property="og:title" content="Fallout: Hardware Hackathon" />
      <meta
        property="og:description"
        content="A seven-day hardware hackathon in ShenZhen, China in 2026. Design hardware projects, build them, & qualify!"
      />
      <meta property="og:site_name" content="Fallout" />

      <section className="relative w-full min-h-svh md:h-[120vh] flex flex-col items-center pt-4 md:p-5 gap-4">
        <div className="w-full flex justify-center items-center lg:items-start h-full top-0 absolute gap-[10%]">
          <img src="/landing/cloud_1.webp" alt="" className="h-auto lg:h-[80%] w-auto pointer-events-none" />
          <img src="/landing/cloud_2.webp" alt="" className=" h-auto lg:h-[80%] w-auto pointer-events-none" />
        </div>
        <img
          className="absolute inset-0 w-full h-full object-cover scale-110 z-0 -top-10"
          src="/landing/bg.webp"
          alt=""
          aria-hidden="true"
        />
        <div className="flex h-8 gap-4 z-1">
          <img className="w-auto h-full" src="/fallout.svg" alt="fallout" />
          <img className="w-auto h-full" src="/hackclub.svg" alt="hackclub" />
        </div>

        <div className="z-1 flex flex-col items-center w-full px-4 md:px-0 mt-6 sm:mt-14 xl:mt-24 gap-3 sm:gap-4">
          <div className="text-white text-lg md:text-xl lg:text-2xl tracking-[5%] text-center">
            July 1-7, 2026 - Starting Soon
          </div>
          <h1 className="text-white text-center tracking-[5%] text-shadow-md text-shadow-blue font-bold text-3xl! sm:text-4xl! xl:text-6xl!">
            Build 60h of hardware projects,
            <br />
            Go to ShenZhen!
          </h1>

          <Frame className="w-full max-w-[calc(100%-1rem)] sm:max-w-150 ml-1">
            <form
              className="w-full h-full flex px-2 sm:px-4 py-2 text-xl items-center justify-between gap-2"
              onSubmit={handleSubmit}
            >
              <input
                className="flex-1 min-w-0 py-2 md:py-3 text-lg sm:text-xl md:text-3xl placeholder-brown outline-none bg-transparent"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@email.com"
                required
              />
              <button
                className="cursor-pointer disabled:opacity-50 w-fit h-fit shrink-0 border-2 border-dark-brown bg-brown text-light-brown font-bold whitespace-nowrap text-sm sm:text-xl md:text-2xl px-3 py-2"
                aria-label="Submit"
                disabled={submitting}
              >
                {submitting ? '...' : 'Join Beta'}
              </button>
            </form>
          </Frame>
          <FlashMessages />
          <a href={shared.sign_in_path} className="text-white underline text-sm">
            Sign in with HCA
          </a>
        </div>
      </section>

      <div className="-mt-20 mb-20 py-4 w-full">
        <div className="w-[110%] overflow-hidden -translate-x-2 -rotate-2 bg-dark-brown text-white text-3xl py-3 sm:py-8 z-10 relative">
          <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .marquee-track {
          display: flex;
          width: max-content;
          animation: marquee 18s linear infinite;
        }
        .marquee-track:hover {
          animation-play-state: paused;
        }
      `}</style>
          <ul className="marquee-track list-none m-0 p-0 text-2xl" aria-label="Event highlights">
            {[
              'Teens 13-18',
              "Everything's free",
              '100+ students',
              'For teens worldwide',
              'Teens 13-18',
              "Everything's free",
              '100+ students',
              'For teens worldwide',
            ].map((item, i) => (
              <li key={i} className="flex items-center">
                <span className="mx-6 sm:mx-10 text-2xl sm:text-4xl">{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative w-full overflow-hidden -mt-10">
          <video className="w-full h-full object-cover" src="/landing/video.mp4" autoPlay loop muted playsInline />
          <div className="absolute inset-0 bg-black/40"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-white text-3xl sm:text-5xl md:text-6xl font-bold text-center">
              It's one of a kind.
            </span>
          </div>
        </div>
      </div>

      <section className="pb-10 bg-blue">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 w-full gap-6 p-6 md:px-20">
          <div className="min-w-60 bg-green rounded-xl p-8 pb-12 space-y-4 text-center flex flex-col items-center text-white tracking-[5%]">
            <h2 className="text-4xl xl:text-5xl font-bold">DESIGN</h2>
            <div
              className="w-full opacity-90 rounded-xl aspect-2/1 bg-cover bg-center"
              style={{ backgroundImage: 'url(/landing/step_1.webp)' }}
            ></div>
            <h3 className="text-3xl leading-8 font-medium">Design. Learn. Repeat.</h3>
            <ol className="list-decimal list-inside text-left text-2xl">
              <li>Design your project</li>
              <li>Submit &gt; Get approved</li>
              <li>Receive a grant to buy parts!</li>
            </ol>
          </div>
          <div className="min-w-60 bg-[#F5C634] rounded-xl p-8 pb-12 space-y-4 text-center flex flex-col items-center text-white tracking-[5%]">
            <h2 className="text-4xl xl:text-5xl font-bold">BUILD</h2>
            <div
              className="w-full opacity-90 rounded-xl aspect-2/1 bg-cover bg-center"
              style={{ backgroundImage: 'url(/landing/step_2.webp)' }}
            ></div>
            <h3 className="text-3xl leading-8 font-medium">Build. Iterate. Repeat.</h3>
            <span className="text-2xl font-light text-left">Buy the parts with your grant & Build your project!</span>
          </div>
          <div className="min-w-60 bg-[#F761BD] rounded-xl p-8 pb-12 space-y-4 text-center flex flex-col items-center text-white tracking-[5%]">
            <h2 className="text-4xl xl:text-5xl font-bold">BUILD IRL</h2>
            <div
              className="w-full opacity-90 rounded-xl aspect-2/1 bg-cover bg-center"
              style={{ backgroundImage: 'url(/landing/step_3.webp)' }}
            ></div>
            <h3 className="text-3xl leading-8 font-medium">Join us in ShenZhen</h3>
            <span className="text-2xl font-light text-left">
              Share your project to the world, get an invite to build in-person!
            </span>
          </div>
        </div>
      </section>

      <section className="text-white text-center flex flex-col justify-between">
        <div className="h-20 sm:h-40"></div>
        <div className="relative min-h-[30vh] flex flex-col items-center justify-center text-center gap-4 px-4">
          <span className="tracking-[5%] text-4xl sm:text-6xl md:text-8xl font-bold">SHENZHEN</span>
          <span className="text-lg sm:text-2xl tracking-[5%] font-light px-2">
            <i>Can't make it? get prizes like a 3D printer in our shop!</i>
          </span>
          <img
            src="/landing/fish_1.webp"
            alt=""
            className="hidden lg:block w-80 sm:w-120 h-auto absolute bottom-0 -left-10 lg:left-10"
          />
          <img
            src="/landing/stingray.webp"
            alt=""
            className="hidden lg:block w-60 sm:w-100 h-auto absolute -top-40 md:-top-80 right-0 lg:right-30"
          />
          <img
            src="/landing/fish_2.webp"
            alt=""
            className="hidden lg:block w-40 sm:w-60 h-auto absolute -bottom-20 lg:-bottom-20 -right-10 lg:right-0"
          />
        </div>

        <div className="relative w-full h-24 sm:h-40 overflow-x-hidden">
          <img
            src="/clouds/4.png"
            alt=""
            className="absolute bottom-0 left-0 h-20 sm:h-30 md:h-40 -translate-x-1/4 z-0"
          />
          <img src="/clouds/1.png" alt="" className="absolute bottom-0 left-1/4 sm:left-40 h-20 sm:h-30 z-0" />
          <img src="/clouds/2.png" alt="" className="absolute bottom-0 right-1/4 h-20 sm:h-30 z-0" />
          <img
            src="/clouds/3.png"
            alt=""
            className="absolute bottom-0 right-0 h-20 sm:h-30 md:h-40 w-auto translate-x-1/4 z-0"
          />
        </div>
      </section>

      <div className="w-full flex flex-col md:flex-row items-stretch min-h-75 md:min-h-125 py-10 md:py-20 px-6 md:px-8">
        <div
          role="tablist"
          aria-label="Event information"
          className="flex-1/4 flex flex-row md:flex-col flex-wrap justify-center items-center md:justify-start whitespace-nowrap gap-2 md:gap-3 mb-4 md:mb-0 md:pr-4"
        >
          {sections.map((section) => (
            <button
              key={section.id}
              role="tab"
              aria-selected={currentSection === section.id}
              aria-controls={`panel-${section.id}`}
              id={`tab-${section.id}`}
              onClick={() => setCurrentSection(section.id)}
              className={`py-1 md:py-2 rounded-md text-base md:text-2xl flex items-center gap-2
            ${currentSection === section.id ? 'text-yellow font-bold' : 'text-white'}`}
            >
              {currentSection === section.id && (
                <img src="/landing/star.webp" alt="" aria-hidden="true" className="w-5 h-5 md:w-6 md:h-6" />
              )}
              {section.label}
            </button>
          ))}
        </div>

        <div className="w-full text-left text-white md:border-l-2 py-4">
          {sections.map((section) => (
            <div
              key={section.id}
              role="tabpanel"
              id={`panel-${section.id}`}
              aria-labelledby={`tab-${section.id}`}
              hidden={currentSection !== section.id}
              className="px-2 md:px-20 text-lg md:text-xl space-y-3"
            >
              {section.id === 'overview' && (
                <>
                  <h2 className="text-2xl font-semibold mb-4">OVERVIEW</h2>
                  <p>Welcome to Fallout! We're still working on releasing this, but it'll be soon!</p>
                  <p>
                    <strong>RSVP above and we'll let you know when we kick off!</strong>
                  </p>
                  <p>Imagine kicking off summer in Shenzhen, the hardware capital of the world.</p>
                  <p>Never tried hardware before? This is your chance to start.</p>
                  <p>
                    <strong>Build any hardware project you want. We'll fund the parts.</strong> Level up your hardware
                    skills. Join us for a 7-day hardware hackathon in Shenzhen.
                  </p>
                  <p>
                    (← click on the tabs <span className="hidden md:inline">on the left</span>
                    <span className="inline md:hidden">up top</span> to learn more!)
                  </p>
                </>
              )}
              {section.id === 'qualifying' && (
                <>
                  <h2 className="text-2xl font-semibold mb-4">QUALIFYING</h2>
                  <p>Spend 60h designing and building hardware projects to get invited to Fallout!</p>
                  <p>The premise is simple:</p>
                  <ol className="list-decimal list-outside ml-7 space-y-1">
                    <li>Design your hardware project digitally</li>
                    <li>Track your time through timelapses/screen recordings & journals</li>
                    <li>Ship it! We'll fund up to $5 per hour you work to buy parts</li>
                    <li>Build your project IRL</li>
                    <li>Repeat!</li>
                  </ol>
                </>
              )}
              {section.id === 'requirements' && (
                <>
                  <h2 className="text-2xl font-semibold mb-4">WHAT COUNTS?</h2>
                  <p>
                    Build a hardware project you've always wanted to make. We value effort more than technical ability.
                    It can be really simple, but the end result should feel closer to a product than a demo, a
                    breadboarded project doesn't count.
                  </p>
                  <p>
                    We're not here to fund you to build a PC. Your goal is to design something really cool from the
                    ground up, and not to assemble expensive parts others have made.
                  </p>
                  <p>
                    Don't know what to build, or what counts? You'll be part of a greater community where you can ask
                    for help!
                  </p>
                </>
              )}
              {section.id === 'shipping' && (
                <>
                  <h2 className="text-2xl font-semibold mb-4">SHIPPING & SUBMITTING</h2>
                  <p>
                    Shipping is making your project <em>real</em>. Putting it out into the world and making it
                    re-creatable for someone else. For Fallout, you need to:
                  </p>
                  <ol className="list-decimal pl-7">
                    <li>Document what your project is and its story</li>
                    <li>Make a one page poster for the Fallout magazine</li>
                    <li>Publish all files so it's easily accessible & organized</li>
                  </ol>
                  <p>
                    When you make your repository nothing but a dump of files and 2 sentences for a README — it's hard
                    for people to recognize your work or learn from it. It only lives in your head.
                  </p>
                </>
              )}
              {section.id === 'travel' && (
                <>
                  <h2 className="text-2xl font-semibold mb-4">TRAVEL & EVENT</h2>
                  <p>
                    We're running Fallout at the center of the world's tech manufacturing, ShenZhen China. For the week
                    of July 1-7, you'll be able to browse the world's largest hardware and electronics market,
                    Huaqiangbei, to build whatever creation you dream up, with friends you meet along the way.
                  </p>
                  <p>
                    We'll be releasing more information about the logistics and schedule of the event closer to July.
                  </p>
                </>
              )}
              {section.id === 'parents' && (
                <>
                  <h2 className="text-2xl font-semibold mb-4">FOR PARENTS</h2>
                  <p>
                    We understand that letting your teen travel to a foreign country can be intimidating. You probably
                    have a lot of questions, and are wondering if this is a good idea. We'll be releasing a parent's
                    guide closer to the event.
                  </p>
                  <p>
                    We completely understand your worries, and we want to do everything we can to help you feel more
                    comfortable. We have experience running programs very similar to this, and would be happy to answer
                    any questions over a Zoom call!
                  </p>
                  <p>
                    Hack Club operates on the principle of radical transparency and we promise to communicate with you
                    frequently and transparently.
                  </p>
                  <p>
                    If you have any questions or concerns, please do not hesitate to reach out to us at{' '}
                    <a href="mailto:fallout@hackclub.com" className="underline">
                      fallout@hackclub.com
                    </a>
                    .
                  </p>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <footer className="bg-dark-brown text-white text-center py-8">
        <p className="text-xl font-medium">Fallout is made with ♡ by teenagers, for teenagers</p>
        <div className="space-x-4 mt-2">
          <a href="https://hackclub.com" target="_blank" rel="noreferrer" className="underline text-xl">
            Hack Club
          </a>
          <a href="https://hackclub.com/slack" target="_blank" rel="noreferrer" className="underline text-xl">
            Join Our Slack
          </a>
        </div>
      </footer>
    </div>
  )
}

LandingIndex.layout = (page: ReactNode) => page
