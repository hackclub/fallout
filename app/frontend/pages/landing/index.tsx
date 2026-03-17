import { usePage, router } from '@inertiajs/react'
import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { SharedProps } from '@/types'
import Frame from '@/components/shared/Frame'
import FlashMessages from '@/components/FlashMessages'
import { notify } from '@/lib/notifications'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import SpeechBubble from '@/components/onboarding/SpeechBubble'

export default function LandingIndex() {
  const shared = usePage<SharedProps>().props
  const falloutRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const bgRef = useRef<HTMLImageElement>(null)
  const cloudsRef = useRef<HTMLDivElement>(null)
  const card1Ref = useRef<HTMLDivElement>(null)
  const card2Ref = useRef<HTMLDivElement>(null)
  const card3Ref = useRef<HTMLDivElement>(null)
  const hoveredCardRef = useRef<number | null>(null)
  const howSectionRef = useRef<HTMLElement>(null)
  const navRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)

    const ctx = gsap.context(() => {
      const hero = document.getElementById('hero')!

      gsap.to(cloudsRef.current, {
        y: '35%',
        ease: 'none',
        scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true },
      })


      const el = falloutRef.current
      const container = containerRef.current
      gsap
        .timeline()
        .set(el, { y: -300, scaleX: 1, scaleY: 1 })
        .to(el, { y: 0, duration: 0.3, ease: 'power2.in' })
        .to(el, { scaleX: 1.1, scaleY: 0.6, duration: 0.1, ease: 'power1.out' })
        .call(() => {
          const shake = gsap.timeline()
          for (let i = 0; i < 8; i++) {
            shake.to(container, {
              x: (Math.random() - 0.5) * 14,
              y: (Math.random() - 0.5) * 10,
              duration: 0.04,
              ease: 'none',
            })
          }
          shake.to(container, { x: 0, y: 0, duration: 0.08, ease: 'power2.out' })
        })
        .to(el, { scaleX: 0.85, scaleY: 1.2, duration: 0.15, ease: 'power2.out' })
        .to(el, { scaleX: 1, scaleY: 1, duration: 0.2, ease: 'elastic.out(1, 0.5)' })
    })

    // Sticker behavior: magnetic follow — element drifts toward cursor while hovered, springs back on leave
    const stickerCleanups: (() => void)[] = []
    document.querySelectorAll<HTMLElement>('.sticker').forEach((el) => {
      const springBack = () => {
        gsap.to(el, { x: 0, y: 0, duration: 1.8, ease: 'elastic.out(0.4, 0.28)', overwrite: 'auto' })
      }
      const onMove = (e: MouseEvent) => {
        const rect = el.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        const cap = 22
        const px = Math.max(-cap, Math.min(cap, (e.clientX - cx) * 0.18))
        const py = Math.max(-cap, Math.min(cap, (e.clientY - cy) * 0.18))
        gsap.to(el, { x: px, y: py, duration: 0.4, ease: 'power2.out', overwrite: 'auto' })
      }
      el.addEventListener('mousemove', onMove)
      el.addEventListener('mouseleave', springBack)
      stickerCleanups.push(() => {
        el.removeEventListener('mousemove', onMove)
        el.removeEventListener('mouseleave', springBack)
      })
    })

    const hero = document.getElementById('hero')!
    gsap.set(navRef.current, { y: -80 })
    const navTrigger = ScrollTrigger.create({
      trigger: hero,
      start: 'bottom top',
      onEnter: () => gsap.to(navRef.current, { y: 0, duration: 0.5, ease: 'power2.out' }),
      onLeaveBack: () => gsap.to(navRef.current, { y: -80, duration: 0.4, ease: 'power2.in' }),
    })

    return () => {
      ctx.revert()
      navTrigger.kill()
      stickerCleanups.forEach((fn) => fn())
    }
  }, [])

  const [videoOpen, setVideoOpen] = useState(true)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [currentSection, setCurrentSection] = useState('overview')
  const faqPanelContainerRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const container = faqPanelContainerRef.current
    if (!container) return
    const lock = () => {
      container.style.minHeight = ''
      container.style.minHeight = `${container.offsetHeight}px`
    }
    lock()
    window.addEventListener('resize', lock)
    return () => window.removeEventListener('resize', lock)
  }, [])

  function animateHowCards(hoveredIndex: number, entering: boolean) {
    const cards = [card1Ref.current, card2Ref.current, card3Ref.current]
    const angles = [-8, 5, -6]

    if (entering) {
      hoveredCardRef.current = hoveredIndex
      cards.forEach((card, i) => {
        if (i === hoveredIndex) {
          gsap.to(card, { y: -70, rotation: angles[i], scale: 1.04, zIndex: 20, duration: 0.35, ease: 'back.out(1.2)' })
        } else {
          const dir = Math.sign(i - hoveredIndex)
          gsap.to(card, { x: dir * 55, y: 20, rotation: dir * 6, scale: 0.95, duration: 0.3, ease: 'back.out(1.2)' })
        }
      })
    } else {
      // Defer reset so a card-to-card transition doesn't briefly snap back
      setTimeout(() => {
        if (hoveredCardRef.current !== hoveredIndex) return
        hoveredCardRef.current = null
        cards.forEach((card) => {
          gsap.to(card, { x: 0, y: 0, rotation: 0, scale: 1, zIndex: 1, duration: 0.4, ease: 'back.out(1.4)' })
        })
      }, 20)
    }
  }

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
    <>
    <div ref={containerRef} className="w-screen h-full flex flex-col justify-center overflow-hidden">
      
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

      <section
        id="hero"
        className="bg-blue relative w-full min-h-svh md:h-[120vh] flex flex-col items-center pt-4 md:p-5 gap-4 overflow-hidden"
      >
        <img src="/landing/flag.svg" className="w-20 absolute top-4 -translate-x-1/2 left-1/2 z-20" />
        <div
          ref={cloudsRef}
          className="w-full flex justify-center items-center lg:items-start h-full top-0 absolute gap-[10%]"
        >
          <img src="/landing/cloud_1.webp" alt="" className="h-auto lg:h-[80%] w-auto pointer-events-none" />
          <img src="/landing/cloud_2.webp" alt="" className=" h-auto lg:h-[80%] w-auto pointer-events-none" />
        </div>
        <img
          ref={bgRef}
          className="absolute inset-0 w-full h-full object-cover scale-110 z-0 -top-10"
          src="/landing/bg.webp"
          alt=""
          aria-hidden="true"
        />
        <div className="flex h-8 gap-4 z-1"></div>

        <div className="z-1 flex flex-col items-center w-full px-4 md:px-0 mt-6 sm:mt-14 xl:mt-18 gap-3 sm:gap-4">
          <div className="text-white text-lg md:text-xl lg:text-2xl tracking-[5%] text-center">JULY 1-7, 2026</div>
          <img ref={falloutRef} className="sticker w-auto h-full" src="/fallout.svg" alt="fallout" />
          <h1 className="shake text-white text-center tracking-[5%] text-shadow-md text-shadow-blue text-4xl">
            {/* Build 60h of hardware projects, Go to ShenZhen! */}
            Build 60h of hardware... Go to Shenzhen!
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
                {submitting ? '...' : 'START'}
              </button>
            </form>
          </Frame>
          <FlashMessages />
          <p className="text-white text-base -mt-4">For teenagers 13-18</p>
          <a href={shared.sign_in_path} className="text-white text-sm underline -mt-2">Sign in with HCA</a>
        </div>
      </section>

      {/* <section className="bg-blue w-full h-auto text-5xl text-center text-white flex items-center justify-center py-30">
        <h2 className="max-w-[50%]">
         Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc sit amet  tempus ex, vitae pretium lectus. Aliquam mau
        </h2>

      </section> */}

      <section id="how" className="bg-blue py-20 pt-40 px-4 md:px-10 lg:px-20 xl:px-40 2xl:px-60 flex flex-col sm:flex-row gap-10 px-8 text-white text-2xl 2xl:text-3xl leading-tight relative ">
        {/* <img src="/arrow.png" className="absolute left-[33%] translate-x-1/2 -top-20 z-20" />
        <img src="/arrow2.png" className="absolute left-[56%] translate-x-1/2 -bottom-20 z-20" /> */}

        <div ref={card1Ref} onMouseEnter={() => animateHowCards(0, true)} onMouseLeave={() => animateHowCards(0, false)} className="relative w-full sm:w-[33%] bg-dark-brown min-h-60 aspect-5/6 rounded-lg p-4 bg-cover hover:border-8 border-green bg-center outline-2 outline-beige hover:shadow-sm group" style={{ backgroundImage: "url('/1.png')" }}>
          <div className="-ml-4 pl-4 pb-2">
            <span className="py-2 text-shadow-lg text-shadow-dark-brown">Design your project!</span>
          </div>
          <div className="absolute top-0 right-0 w-16 h-16 bg-beige rounded-tr-lg group-hover:rounded-tr-none rounded-bl-2xl flex justify-center items-center">
            <span className="text-4xl font-bold text-dark-brown">1</span>
          </div>
        </div>

        <div ref={card2Ref} onMouseEnter={() => animateHowCards(1, true)} onMouseLeave={() => animateHowCards(1, false)} className="relative w-full sm:w-[33%] bg-dark-brown min-h-60 rounded-lg p-4 hover:border-8 border-green flex flex-col aspect-5/6 bg-cover bg-center outline-2 outline-beige hover:shadow-sm group" style={{ backgroundImage: "url('/2.png')" }}>
          <span className="text-shadow-lg text-shadow-dark-brown pr-16">Buy the parts with your grant & Build your project!</span>

          <div className="absolute top-0 right-0 w-16 h-16 bg-beige rounded-tr-lg group-hover:rounded-tr-none rounded-bl-2xl flex justify-center items-center">
            <span className="text-4xl font-bold text-dark-brown">2</span>
          </div>
        </div>

        <div ref={card3Ref} onMouseEnter={() => animateHowCards(2, true)} onMouseLeave={() => animateHowCards(2, false)} className="hover:shadow-sm group relative w-full sm:w-[33%] min-h-60 rounded-lg flex flex-col hover:border-8 border-green aspect-5/6 bg-cover bg-center text-dark-brown outline-2 outline-beige" style={{ backgroundImage: "url('/3.png')" }}>
          {/* <h1 className="text-5xl font-bold text-coral bg-dark-brown w-fit py-2 px-4 rounded-lg m-4">Share</h1> */}
          <div className="absolute top-0 right-0 w-16 h-16 bg-beige rounded-tr-lg rounded-bl-2xl group-hover:rounded-tr-none flex justify-center items-center">
            <span className="text-4xl font-bold text-dark-brown">3</span>
          </div>
          <span className="mt-auto bg-[#fdf6e8] p-4 w-full rounded-lg">Post your project online and earn your <span className="text-coral font-bold">ticket to Fallout</span>!</span>

        </div>
      </section>

      
      <div className="bg-[#41D2FF] px-2 md:px-8 lg:px-18 xl:px-36 2xl:px-54 py-16 w-full h-auto">
        <Frame className="w-full h-[80vh] h-full">
          <div className="w-full h-full flex flex-col sm:flex-row justify-between text-brown px-4 lg:px-8 py-4 lg:py-8">
            <div className="flex flex-col">
              <div
                role="tablist"
                className="w-full flex flex-row sm:flex-col flex-wrap items-start justify-start whitespace-nowrap gap-2 md:gap-6 min-w-[230px] mt-1"
              >
                {sections.map((section) => (
                  <button
                    key={section.id}
                    role="tab"
                    aria-selected={currentSection === section.id}
                    aria-controls={`panel-${section.id}`}
                    id={`tab-${section.id}`}
                    onClick={() => setCurrentSection(section.id)}
                    className={`text-base md:text-2xl cursor-pointer 
            ${currentSection === section.id ? 'font-bold text-light-brown bg-brown py-2 px-4 rounded-lg' : 'hover:ml-4 transition-all ease-in-out'}`}
                  >
                    {section.label}
                  </button>
                ))}
                <p className="my-2 sm:mt-20 mt-auto bg-brown border-2 border-dark-brown shadow-md text-beige rounded-lg px-4 py-2 ">
                  Read more on{' '}
                  <a className="underline font-medium" href="https://fallout.hackclub.com/docs" target="_self">
                    our Docs
                  </a>
                </p>
              </div>
            </div>

            <div ref={faqPanelContainerRef} className="w-full text-left" style={{ display: 'grid' }}>
              {sections.map((section) => (
                <div
                  key={section.id}
                  role="tabpanel"
                  id={`panel-${section.id}`}
                  aria-labelledby={`tab-${section.id}`}
                  aria-hidden={currentSection !== section.id}
                  className={`px-2 md:px-6 py-6 text-lg md:text-2xl space-y-3 rounded-lg bg-beige${currentSection !== section.id ? ' invisible pointer-events-none' : ''}`}
                  style={{ gridArea: '1 / 1' }}
                >
                  {section.id === 'overview' && (
                    <>
                      <p>Welcome to Fallout!</p>
                      <p>Imagine kicking off summer in Shenzhen, the hardware capital of the world.</p>
                      <p>Never tried hardware before? This is your chance to start.</p>
                      <p>
                        <strong>Build any hardware project you want. We'll fund the parts.</strong> Level up your
                        hardware skills. Join us for a 7-day hardware hackathon in Shenzhen.
                      </p>
                      <p>
                        (← click on the tabs <span className="hidden md:inline">on the left</span>
                        <span className="inline md:hidden">up top</span> to learn more!)
                      </p>
                    </>
                  )}
                  {section.id === 'qualifying' && (
                    <>
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
                      <p>
                        Build a hardware project you've always wanted to make. We value effort more than technical
                        ability. It can be really simple, but the end result should feel closer to a product than a
                        demo, a breadboarded project doesn't count.
                      </p>
                      <p>
                        We're not here to fund you to build a PC. Your goal is to design something really cool from the
                        ground up, and not to assemble expensive parts others have made.
                      </p>
                      <p>
                        Don't know what to build, or what counts? You'll be part of a greater community where you can
                        ask for help!
                      </p>
                    </>
                  )}
                  {section.id === 'shipping' && (
                    <>
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
                        When you make your repository nothing but a dump of files and 2 sentences for a README — it's
                        hard for people to recognize your work or learn from it. It only lives in your head.
                      </p>
                    </>
                  )}
                  {section.id === 'travel' && (
                    <>
                      <p>
                        We're running Fallout at the center of the world's tech manufacturing, ShenZhen China. For the
                        week of July 1-7, you'll be able to browse the world's largest hardware and electronics market,
                        Huaqiangbei, to build whatever creation you dream up, with friends you meet along the way.
                      </p>
                      <p>
                        We'll be releasing more information about the logistics and schedule of the event closer to
                        July.
                      </p>
                    </>
                  )}
                  {section.id === 'parents' && (
                    <>
                      <p>
                        We understand that letting your teen travel to a foreign country can be intimidating. You
                        probably have a lot of questions, and are wondering if this is a good idea. We'll be releasing a
                        parent's guide closer to the event.
                      </p>
                      <p>
                        We completely understand your worries, and we want to do everything we can to help you feel more
                        comfortable. We have experience running programs very similar to this, and would be happy to
                        answer any questions over a Zoom call!
                      </p>
                      <p>
                        Hack Club operates on the principle of radical transparency and we promise to communicate with
                        you frequently and transparently.
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
        </Frame>
      </div>
      <div className="bg-[#41D2FF] relative z-10 px-2 md:px-8 lg:px-18 xl:px-36 2xl:px-54  bg-red flex items-end p-4">
        <div className="text-blue text-4xl bg-light-blue/40 py-2 px-4 w-fit rounded-xl font-semibold mt-auto group cursor-default transition-all flex ">
          <span className="">春</span>
          <span className="">天</span>
        </div>
        <p></p>
        <div className="w-60 lg:w-80 -mb-10 ml-auto flex flex-col items-center justify-center text-center">
          <div className={`relative bg-beige h-auto w-auto p-3 sm:px-6 sm:py-4 rounded-2xl `}>
            <span className="relative z-1 text-base lg:text-lg text-brown text-center font-medium">
              Don’t see your question? Ask in{' '}
              <a
                href="https://hackclub.enterprise.slack.com/archives/C0ACJ290090"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                #fallout-help
              </a>
            </span>

            <svg className="absolute -bottom-4 left-1/2 -translate-x-1/2" width="24" height="16" viewBox="0 0 24 16">
              <polygon points="0,0 24,0 12,16" className="fill-white" strokeWidth="2" />
              <polygon points="1,0 23,0 12,14" className="fill-white" />
            </svg>
          </div>
          <img src="/chineseHeidi.gif" className="w-40 h-auto  z-20" />
        </div>
      </div>
      <footer className="px-2 md:px-8 lg:px-18 xl:px-36 2xl:px-54 bg-dark-brown text-beige py-4 relative flex justify-between items-end">
        <div className="">
          <p className="text-xl font-medium mt-2">Fallout is made with ♡ by teenagers, for teenagers</p>
          <div className="space-x-4">
            <a href="https://hackclub.com" target="_blank" rel="noreferrer" className="underline text-xl">
              Hack Club
            </a>
            <a href="https://hackclub.com/slack" target="_blank" rel="noreferrer" className="underline text-xl">
              Join Our Slack
            </a>
          </div>
        </div>
        <a href="#hero" className="underline">
          back to top
        </a>
      </footer>
    </div>
    <div className="fixed bottom-10 right-10 w-100 h-auto rounded-lg overflow-hidden bg-[#37B576] z-50 flex flex-col border-2 border-beige">
      <div className="w-full flex justify-between items-center px-4 py-2 cursor-pointer" onClick={() => {
        setVideoOpen((v) => {
          const next = !v
          const msg = next ? 'playVideo' : 'pauseVideo'
          iframeRef.current?.contentWindow?.postMessage(`{"event":"command","func":"${msg}","args":""}`, '*')
          return next
        })
      }}>
        <span className="font-medium text-beige text-2xl">{videoOpen ? 'Close Video' : 'Open Video'}</span>
        <img src="/arrow.svg" className={`h-5 w-auto transition-transform duration-300 ${videoOpen ? 'rotate-180' : 'rotate-0'}`} />
      </div>
      <div className={`aspect-16/9 w-full h-auto p-3  pt-0${videoOpen ? '' : ' hidden'}`}>
          <iframe
            width="100%"
            height="100%"
            className="rounded-lg border-beige border-2"
            ref={iframeRef}
            src="https://www.youtube.com/embed/SrP2ZeNHm6s?si=orljJtYrC7EGSNzi&controls=0&modestbranding=1&rel=0&autoplay=1&&enablejsapi=1"
            title="YouTube video player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen>
          </iframe>
        </div>
    </div>
    {/* <div ref={navRef} className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-4 px-6 py-3 pointer-events-none">
      <div className="grid grid-cols-3 items-center w-full  px-4 py-2 pointer-events-auto">
        <div />
        <img src="/fallout.svg" alt="fallout" className="h-8 w-auto place-self-center mix-blend-multiply" />
        <div className="flex justify-end">
          <form onSubmit={handleSubmit}>
            <button
              className="cursor-pointer disabled:opacity-50 border-2 border-dark-brown bg-brown text-light-brown text-xl font-bold whitespace-nowrap px-3 py-2 rounded-lg"
              aria-label="Submit"
              disabled={submitting}
            >
              {submitting ? '...' : 'START'}
            </button>
          </form>
        </div>
      </div>

    </div> */}
    </>
  )
}

LandingIndex.layout = (page: ReactNode) => page
