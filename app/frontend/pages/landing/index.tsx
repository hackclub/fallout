import { usePage, router } from '@inertiajs/react'
import { useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { SharedProps } from '@/types'
import Frame from '@/components/shared/Frame'
import FlashMessages from '@/components/FlashMessages'
import { HalftoneBg } from '@/components/HalftoneBg'
import { notify } from '@/lib/notifications'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

const PROJECTS = [
  {
    image: '/landing/projects/cyberpad.webp',
    description: 'A sleek, cyberpunk inspired macropad',
    credit: 'By Kai, a 17-year-old from Canada',
  },
  {
    image: '/landing/projects/glowpad.webp',
    description: 'A glowing macropad',
    credit: 'By Raygen, a 17-year-old from the US',
  },
  {
    image: '/landing/projects/angel.webp',
    description: 'A biblically accurate angel, as a macropad',
    credit: 'By Alex, a 15-year-old from the US',
  },
  {
    image: '/landing/projects/meko.webp',
    description: 'A high definition music player',
    credit: 'By Marcell, a 17-year-old from Romania',
  },
  {
    image: '/landing/projects/bitlace.webp',
    description: 'A cool looking retro accessory with an 8x8 monochrome screen',
    credit: 'By Vladislav, a 17-year-old from Russia',
  },
  {
    image: '/landing/projects/3dpmotherboard.webp',
    description: 'A powerful, yet affordable 3D printer motherboard',
    credit: 'By Kai, a 17-year-old from Canada',
  },
  {
    image: '/landing/projects/twoswap.webp',
    description: 'An epic wearable TV head',
    credit: 'By Nick, an 18-year-old from the US',
  },
]

export default function LandingIndex() {
  const shared = usePage<SharedProps>().props
  const containerRef = useRef<HTMLDivElement>(null)
  const falloutLettersRef = useRef<HTMLDivElement>(null)
  const falloutFallenRef = useRef(false)
  const belowFoldRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLAnchorElement>(null)
  const customCursorRef = useRef<HTMLDivElement>(null)
  const pointerCursorRef = useRef<HTMLDivElement>(null)
  const preloaderRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if ('ontouchstart' in window) return
    const style = document.createElement('style')
    style.textContent =
      '*:not(iframe), *::before, *::after { cursor: none !important; } iframe { cursor: auto !important; }'
    document.head.appendChild(style)
    return () => {
      document.head.removeChild(style)
    }
  }, [])

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)

    const ctx = gsap.context(() => {
      const qualifyOuter = document.querySelector<HTMLElement>('.qualify-outer')
      const qWrappers = gsap.utils.toArray<HTMLElement>('.qualify-card-wrapper')
      const qCards = gsap.utils.toArray<HTMLElement>('.qualify-card')

      if (qualifyOuter && qWrappers.length > 1) {
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: qualifyOuter,
            start: 'top top',
            end: 'bottom bottom',
            scrub: 2,
            invalidateOnRefresh: true,
          },
        })

        for (let i = 1; i < qWrappers.length; i++) {
          const STACK_OFFSET = i * 80
          tl.to(qWrappers[i], {
            y: () => -(qWrappers[i].offsetTop - qWrappers[0].offsetTop - STACK_OFFSET),
            ease: 'none',
          }).to(
            qCards[i - 1],
            {
              scale: 0.9 + 0.025 * (i - 1),
              ease: 'none',
            },
            '<',
          )
        }
      }

      const hero = document.getElementById('hero')!

      ScrollTrigger.create({
        trigger: hero,
        pin: true,
        start: 'center top',
      })

      const el = falloutLettersRef.current
      const container = containerRef.current
      gsap.set(el, { y: -500 })

      const dropFallout = () => {
        gsap
          .timeline()
          .set(el, { y: -500, scaleX: 1, scaleY: 1 })
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
            shake.to(container, { x: 0, y: 0, duration: 0.08, ease: 'power2.out', clearProps: 'x,y' })
          })
          .to(el, { scaleX: 0.85, scaleY: 1.2, duration: 0.15, ease: 'power2.out' })
          .to(el, { scaleX: 1, scaleY: 1, duration: 0.2, ease: 'elastic.out(1, 0.5)' })
      }

      gsap.to(preloaderRef.current, {
        opacity: 0,
        duration: 0.4,
        delay: 0.5,
        ease: 'power2.out',
        onComplete: () => {
          if (preloaderRef.current) preloaderRef.current.style.display = 'none'
          dropFallout()
        },
      })

      if (scrollHintRef.current) {
        gsap.to(scrollHintRef.current, {
          y: -8,
          duration: 0.9,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
        })
      }

      gsap.fromTo(
        belowFoldRef.current,
        { y: 40 },
        {
          y: 0,
          ease: 'none',
          scrollTrigger: { trigger: belowFoldRef.current, start: 'top bottom', end: 'top 60%', scrub: true },
        },
      )
      ;[highlight1Ref.current, highlight2Ref.current, highlight3Ref.current].forEach((span) => {
        if (!span) return
        gsap.fromTo(
          span,
          { backgroundSize: '0% 100%' },
          {
            backgroundSize: '100% 100%',
            duration: 0.6,
            ease: 'power2.out',
            scrollTrigger: { trigger: span, start: 'top 85%' },
          },
        )
      })
    })

    const stickerCleanups: (() => void)[] = []
    document.querySelectorAll<HTMLElement>('.sticker').forEach((el) => {
      let ox = 0,
        oy = 0
      let prevX = 0,
        prevY = 0
      let active = false

      const onDocMove = (e: MouseEvent) => {
        const rect = el.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        const dist = Math.hypot(e.clientX - cx, e.clientY - cy)
        const proximity = 160

        if (dist < proximity) {
          if (!active) {
            active = true
            prevX = e.clientX
            prevY = e.clientY
          }
          const dx = e.clientX - prevX
          const dy = e.clientY - prevY
          const cap = 28
          ox = Math.max(-cap, Math.min(cap, ox + dx * 0.28))
          oy = Math.max(-cap, Math.min(cap, oy + dy * 0.28))
          gsap.to(el, { x: ox, y: oy, duration: 0.6, ease: 'power2.out', overwrite: 'auto' })
        } else if (active) {
          active = false
          ox = 0
          oy = 0
          gsap.to(el, { x: 0, y: 0, duration: 1.8, ease: 'elastic.out(0.4, 0.28)', overwrite: 'auto' })
        }
        prevX = e.clientX
        prevY = e.clientY
      }

      document.addEventListener('mousemove', onDocMove)
      stickerCleanups.push(() => document.removeEventListener('mousemove', onDocMove))
    })

    falloutLettersRef.current?.querySelectorAll<HTMLElement>('span').forEach((span) => {
      const springBack = () => {
        if (falloutFallenRef.current) return
        gsap.to(span, { x: 0, y: 0, duration: 1.5, ease: 'elastic.out(0.5, 0.35)', overwrite: 'auto' })
      }
      const onMove = (e: MouseEvent) => {
        if (falloutFallenRef.current) return
        const rect = span.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        const cap = 18
        const px = Math.max(-cap, Math.min(cap, (e.clientX - cx) * 0.6))
        const py = Math.max(-cap, Math.min(cap, (e.clientY - cy) * 0.6))
        gsap.to(span, { x: px, y: py, duration: 0.5, ease: 'power3.out', overwrite: 'auto' })
      }
      span.addEventListener('mousemove', onMove)
      span.addEventListener('mouseleave', springBack)
      stickerCleanups.push(() => {
        span.removeEventListener('mousemove', onMove)
        span.removeEventListener('mouseleave', springBack)
      })
    })

    const customCursor = customCursorRef.current
    const pointerCursor = pointerCursorRef.current
    if (customCursor && !('ontouchstart' in window)) {
      gsap.set(customCursor, { opacity: 0 })
      if (pointerCursor) gsap.set(pointerCursor, { opacity: 0 })
      let cursorVisible = false
      const onCursorMove = (e: MouseEvent) => {
        const isClickable = !!(e.target as Element)?.closest('.clickme, a, button, [role="button"]')
        gsap.set(customCursor, { x: e.clientX - 8, y: e.clientY - 5, opacity: cursorVisible && !isClickable ? 1 : 0 })
        if (pointerCursor) {
          gsap.set(pointerCursor, {
            x: e.clientX - 15,
            y: e.clientY - 14,
            opacity: cursorVisible && isClickable ? 1 : 0,
          })
        }
        cursorVisible = true
      }
      window.addEventListener('mousemove', onCursorMove)
      stickerCleanups.push(() => window.removeEventListener('mousemove', onCursorMove))

      const onDocumentLeave = () => {
        cursorVisible = false
        gsap.set(customCursor, { opacity: 0 })
        if (pointerCursor) gsap.set(pointerCursor, { opacity: 0 })
      }
      document.addEventListener('mouseleave', onDocumentLeave)
      stickerCleanups.push(() => document.removeEventListener('mouseleave', onDocumentLeave))

      // Hide custom cursors when mouse enters an iframe or window loses focus
      const hideCursors = () => {
        cursorVisible = false
        gsap.set(customCursor, { opacity: 0 })
        if (pointerCursor) gsap.set(pointerCursor, { opacity: 0 })
      }
      window.addEventListener('blur', hideCursors)
      stickerCleanups.push(() => window.removeEventListener('blur', hideCursors))
      document.querySelectorAll('iframe').forEach((iframe) => {
        iframe.addEventListener('mouseenter', hideCursors)
        stickerCleanups.push(() => iframe.removeEventListener('mouseenter', hideCursors))
      })
    }

    const hero = document.getElementById('hero')!
    gsap.set(navRef.current, { y: -80 })
    const navTrigger = ScrollTrigger.create({
      trigger: hero,
      start: 'bottom top',
      onEnter: () => {
        gsap.to(navRef.current, { y: 0, duration: 0.5, ease: 'power2.out' })
        if (falloutFallenRef.current) {
          falloutFallenRef.current = false
          falloutLettersRef.current?.querySelectorAll<HTMLElement>('span').forEach((span) => {
            gsap.to(span, { x: 0, y: 0, rotation: 0, duration: 0.6, ease: 'power3.out', overwrite: true })
          })
        }
      },
      onLeaveBack: () => gsap.to(navRef.current, { y: -80, duration: 0.4, ease: 'power2.in' }),
    })

    return () => {
      ctx.revert()
      navTrigger.kill()
      stickerCleanups.forEach((fn) => fn())
    }
  }, [])

  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [cardOrder, setCardOrder] = useState([0, 1, 2])
  const cardCaptions = [
    { label: '100+ teens in Shanghai, at Juice', href: 'https://www.youtube.com/watch?v=fuTlToZ1SX8' },
    { label: '50 teens in Singapore, at Overglade', href: 'https://overglade.hackclub.com/' },
    { label: '150 girls at in NYC, at Parthenon', href: 'https://www.youtube.com/watch?v=7K_E7tG-O68' },
  ]
  useEffect(() => {
    const id = setInterval(() => setCardOrder((prev) => [...prev.slice(1), prev[0]]), 3000)
    return () => clearInterval(id)
  }, [])

  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [videoOpen, setVideoOpen] = useState(true)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const scrollHintRef = useRef<HTMLDivElement>(null)
  const highlight1Ref = useRef<HTMLSpanElement>(null)
  const highlight2Ref = useRef<HTMLSpanElement>(null)
  const highlight3Ref = useRef<HTMLSpanElement>(null)
  const carouselSectionRef = useRef<HTMLElement>(null)
  const carouselTrackRef = useRef<HTMLUListElement>(null)
  const carouselOffsetRef = useRef(0)
  const carouselDirectionRef = useRef(-1)
  const carouselSpeedRef = useRef(0)
  const carouselTargetSpeedRef = useRef(2)

  useEffect(() => {
    const BASE_SPEED = 1.5
    carouselTargetSpeedRef.current = BASE_SPEED
    let rafId: number

    const animate = () => {
      const track = carouselTrackRef.current
      if (track) {
        carouselSpeedRef.current += (carouselTargetSpeedRef.current - carouselSpeedRef.current) * 0.08
        carouselOffsetRef.current += carouselDirectionRef.current * carouselSpeedRef.current
        const singleSetWidth = track.scrollWidth / 2
        if (carouselOffsetRef.current <= -singleSetWidth) carouselOffsetRef.current += singleSetWidth
        if (carouselOffsetRef.current >= 0) carouselOffsetRef.current -= singleSetWidth
        track.style.transform = `translateX(${carouselOffsetRef.current}px)`
      }
      rafId = requestAnimationFrame(animate)
    }

    rafId = requestAnimationFrame(animate)

    const onWheel = (e: WheelEvent) => {
      carouselDirectionRef.current = e.deltaY > 0 ? 1 : -1
    }
    const onEnter = () => {
      carouselTargetSpeedRef.current = 0
    }
    const onLeave = () => {
      carouselTargetSpeedRef.current = BASE_SPEED
    }
    const section = carouselSectionRef.current

    section?.addEventListener('wheel', onWheel, { passive: true })
    section?.addEventListener('mouseenter', onEnter)
    section?.addEventListener('mouseleave', onLeave)

    return () => {
      cancelAnimationFrame(rafId)
      section?.removeEventListener('wheel', onWheel)
      section?.removeEventListener('mouseenter', onEnter)
      section?.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  function handleFalloutClick() {
    if (falloutFallenRef.current) return
    falloutFallenRef.current = true
    const container = falloutLettersRef.current
    const hero = document.getElementById('hero')
    if (!container || !hero) return
    const heroBottom = hero.getBoundingClientRect().bottom
    container.querySelectorAll<HTMLElement>('span').forEach((span) => {
      const spanRect = span.getBoundingClientRect()
      const fallY = heroBottom - spanRect.bottom - 20
      gsap.to(span, {
        y: fallY,
        x: (Math.random() - 0.5) * 220,
        rotation: (Math.random() - 0.5) * 120,
        duration: 0.7 + Math.random() * 0.8,
        delay: Math.random() * 0.3,
        ease: 'bounce.out',
        overwrite: true,
      })
    })
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

  return (
    <>
      <div ref={preloaderRef} className="fixed inset-0 bg-blue z-50 pointer-events-none" />
      <a
        ref={navRef}
        href={shared.sign_in_path}
        className="group fixed top-4 right-4 z-30 w-fit h-fit border-2 border-dark-brown bg-brown text-light-brown active:bg-dark-brown active:text-light-brown font-bold whitespace-nowrap text-sm sm:text-xl md:text-2xl px-3 py-2 rounded-sm"
      >
        <span className="relative overflow-hidden block leading-none">
          <span className="block transition-transform duration-300 group-hover:translate-y-full">LOG IN</span>
          <span className="absolute inset-0 block transition-transform duration-300 -translate-y-full group-hover:translate-y-0">
            LOG IN
          </span>
        </span>
      </a>
      <div
        ref={containerRef}
        className="w-screen h-full flex flex-col justify-center bg-beige overflow-hidden cursor-none"
      >
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
          className="bg-blue relative min-h-svh text-white flex flex-col items-center pt-4 md:p-5 gap-4 overflow-hidden"
        >
          <nav className="absolute top-3 px-3 w-full grid grid-cols-3 items-center z-30 text-white">
            <img src="/landing/flag.svg" className="w-20 sm:w-30" />
            <div
              ref={falloutLettersRef}
              className="clickme text-3xl md:text-[2.5rem] font-bells cursor-pointer select-none md:space-x-[3px] justify-self-center whitespace-nowrap"
              onClick={handleFalloutClick}
            >
              <span className="inline-block">F</span>
              <span className="inline-block">A</span>
              <span className="inline-block">L</span>
              <span className="inline-block">L</span>
              <span className="inline-block">O</span>
              <span className="inline-block">U</span>
              <span className="inline-block">T</span>
            </div>
            <a
              href={shared.sign_in_path}
              className="group justify-self-end w-fit h-fit shrink-0 border-2 border-dark-brown bg-brown text-light-brown active:bg-dark-brown active:text-light-brown font-bold whitespace-nowrap text-sm sm:text-xl md:text-2xl px-3 py-2 rounded-sm transition-all"
            >
              <span className="relative overflow-hidden block leading-none">
                <span className="block transition-transform duration-300 group-hover:translate-y-full">LOG IN</span>
                <span className="absolute inset-0 block transition-transform duration-300 -translate-y-full group-hover:translate-y-0">
                  LOG IN
                </span>
              </span>
            </a>
          </nav>
          <HalftoneBg
            src="/landing/hero.webp"
            className="absolute inset-0 w-full h-[110vh]  pointer-events-none"
            halftoneOpacity={0.1}
            bleed={0.08}
          />

          <div className="relative flex flex-col items-center w-full px-4 md:px-0 gap-3 sm:gap-4 pt-20">
            <div className="text-sm md:text-xl lg:text-2xl tracking-[5%] text-center  md:mt-6">
              Start now to join us in Shenzhen, July 1-7
            </div>

            <h1 className="text-center tracking-[5%] text-shadow-md text-shadow-blue font-outfit text-2xl xs:text-4xl md:text-6xl font-semibold max-w-5xl">
              Build hardware projects for free, visit Shenzhen, China!
            </h1>
            <p className="text-base md:text-2xl tracking-[5%] text-center ">Solo or in teams, for teens 13-18.</p>
            <Frame showBorderOnMobile className="w-full max-w-[calc(100%-1rem)] sm:max-w-160 ml-1">
              <form
                className="w-full h-full flex px-2 sm:px-4 py-1 text-xl items-center justify-between gap-2"
                onSubmit={handleSubmit}
              >
                <input
                  className="flex-1 min-w-0 py-2 md:py-3 text-lg sm:text-xl md:text-3xl placeholder-brown outline-none bg-transparent text-brown"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@shenzhen.com"
                  required
                />
                <button
                  className="group cursor-pointer disabled:opacity-50 w-fit h-fit shrink-0 border-2 border-dark-brown bg-brown text-light-brown active:bg-dark-brown active:text-light-brown font-bold whitespace-nowrap text-sm sm:text-xl md:text-2xl px-3 py-2 rounded-sm transition-all"
                  aria-label="Submit"
                  disabled={submitting}
                >
                  <span className="relative overflow-hidden block leading-none">
                    <span className="block transition-transform duration-300 group-hover:translate-y-full">
                      {submitting ? '...' : 'START NOW'}
                    </span>
                    <span className="absolute inset-0 block transition-transform duration-300 -translate-y-full group-hover:translate-y-0">
                      {submitting ? '...' : 'START NOW'}
                    </span>
                  </span>
                </button>
              </form>
            </Frame>
            <FlashMessages />
          </div>
          <div
            ref={scrollHintRef}
            className="absolute bottom-10 text-center font-medium text-beige text-sm tracking-widest select-none text-shadow-sm"
          >
            Scroll
          </div>
        </section>

        <div ref={belowFoldRef} className="relative">
          <div className="w-full bg-transparent -mt-10">
            <img src="/landing/clouds/banner.png" className="object-cover object-bottom select-none" />
          </div>

          <div className="w-full bg-beige px-3 sm:px-6 md:px-8 lg:px-18 xl:px-36 2xl:px-54 ">
            <section className="bg-dark-brown border-2 border-dark-brown text-beige p-6 md:p-10 flex flex-col md:flex-row justify-center items-center gap-4 relative lg:items-stretch rounded-sm">
              <div className="flex flex-col font-normal">
                <span className="text-3xl sm:text-5xl font-semibold font-outfit">WHAT IS</span>
                <span className="text-4xl sm:text-6xl md:text-7xl xl:text-8xl font-bold font-outfit">FALLOUT?</span>
                <p className="text-xl md:text-2xl xl:text-3xl mt-auto lg:mt-10">
                  Hack Club Fallout is a three-month program leading to a 7-day,{' '}
                  <span
                    ref={highlight1Ref}
                    style={{
                      backgroundImage: 'linear-gradient(var(--color-green), var(--color-green))',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'left center',
                      backgroundSize: '0% 100%',
                    }}
                  >
                    free hardware hackathon in Shenzhen, China.
                  </span>
                </p>
                <p className="mt-8 text-xl md:text-2xl xl:text-3xl">
                  Qualify by designing and{' '}
                  <span
                    ref={highlight2Ref}
                    style={{
                      backgroundImage: 'linear-gradient(var(--color-green), var(--color-green))',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'left center',
                      backgroundSize: '0% 100%',
                    }}
                  >
                    building 60h
                  </span>
                  , with components funded by us!
                </p>
              </div>
              <div className="relative my-6 sm:absolute sm:-bottom-30 sm:left-20 lg:left-10  bg-white max-w-full md:w-120 shadow-md border-2 border-dark-brown z-10 text-dark-brown p-4 text-xl md:text-2xl">
                <p>
                  We are are <b>100% beginner friendly!</b> <br /> Follow along with our guides and ask the community
                  for help!
                </p>
              </div>
              <div className="flex flex-col items-center w-full max-w-220 space-y-6">
                <div
                  className="clickme group grid lg:max-w-220 w-full h-70 lg:h-110 grid-cols-1 grid-rows-1 place-items-center cursor-none"
                  onClick={() => setCardOrder((prev) => [...prev.slice(1), prev[0]])}
                >
                  {cardOrder.map((i) => (
                    <div
                      key={i}
                      className={`col-start-1 row-start-1 border-2 border-beige h-full aspect-5/6 bg-cover bg-center bg-brown/20 bg-blend-soft-light shadow-md ${['rotate-6', 'rotate-0', '-rotate-4'][i]}`}
                      style={{
                        backgroundImage: `url(/landing/past/${['juice.webp', 'overglade.webp', 'parthenon.webp'][i]})`,
                      }}
                    />
                  ))}
                </div>
                <p>
                  <a
                    className="text-light-brown text-lg underline text-sm md:text-base"
                    href={cardCaptions[cardOrder[cardOrder.length - 1]].href}
                  >
                    {cardCaptions[cardOrder[cardOrder.length - 1]].label}
                  </a>
                </p>
              </div>
            </section>
            <section className="w-full md:px-8 lg:px-18 xl:px-36 2xl:px-54 py-20 md:pt-60 md:pb-40 text-dark-brown flex flex-col items-center justify-center gap-6 font-bold text-center">
              <span className="text-2xl xs:text-3xl text-brown">My parents are worried!</span>
              <div className="gap-4 sm:gap-10 text-beige flex flex-col sm:flex-row items-center justify-center w-full">
                <a
                  href="https://hack.club/renran"
                  className="inline-block bg-brown w-full max-w-70 py-4 text-2xl rounded-sm hover:bg-dark-brown transition-all"
                >
                  Book a call with us
                </a>
                <a
                  href="https://docs.google.com/document/d/1dXDIBm7SWui5rbK3zh7188UmLC0cv_dsMj7ynr3POho/edit?tab=t.q4hvz46um9np"
                  className="inline-block bg-brown w-full max-w-70 py-4 text-2xl rounded-sm hover:bg-dark-brown transition-all"
                >
                  Parent Guide
                </a>
              </div>
            </section>
            <div className="md:pt-0 md:qualify-outer">
              <section className="md:qualify-section md:sticky md:top-[calc(50svh-15rem)] flex flex-col md:flex-row justify-between w-full text-beige gap-4 md:min-h-120">
                <div className="flex-3/4 lg:flex-3/4 w-full flex justify-center md:block">
                  <div className="md:qualify-scroll-wrapper w-full flex flex-col md:block gap-2 md:gap-0">
                    <div className="md:qualify-card-wrapper md:h-80 h-60" style={{ perspective: '500px' }}>
                      <HalftoneBg
                        src="/landing/comic1.webp"
                        className="md:qualify-card w-full h-full"
                        objectFit="contain"
                        background=""
                        halftoneOpacity={0.12}
                      />
                    </div>
                    <div className="md:qualify-card-wrapper md:h-80 h-60" style={{ perspective: '500px' }}>
                      <HalftoneBg
                        src="/landing/comic2.webp"
                        className="md:qualify-card w-full h-full"
                        objectFit="contain"
                        background=""
                        halftoneOpacity={0.12}
                      />
                    </div>
                    <div className="md:qualify-card-wrapper md:h-80 h-60" style={{ perspective: '500px' }}>
                      <HalftoneBg
                        src="/landing/comic3.webp"
                        className="md:qualify-card w-full h-full"
                        objectFit="contain"
                        background=""
                        halftoneOpacity={0.12}
                      />
                    </div>
                  </div>
                </div>
                <div className="relative flex flex-col h-fit bg-blue border-2 border-dark-brown p-6 md:p-10 text-beige rounded-sm">
                  <div className="text-white flex flex-col w-full md:w-fit space-y-4">
                    <span className="text-4xl lg:text-6xl font-semibold text-center font-outfit">HOW TO QUALIFY</span>
                    <ol className="ml-8 list-decimal leading-8 text-xl sm:text-2xl xl:text-3xl space-y-3">
                      <li>Design your project</li>
                      <li>Track all of your time by journaling & timelapsing on our platform</li>
                      <li>Submit for feedback!</li>
                      <li>We give you funding to buy parts, and build your projects!</li>
                      <li>Publish + Share online</li>
                      <li>Repeat until you've spent 60 hours</li>
                    </ol>
                  </div>
                  <div className="md:absolute -bottom-24 right-10 mx-auto sm:mx-0 w-full sm:ml-auto mt-10 bg-white md:w-80 shadow-md border-2 border-dark-brown z-10 text-dark-brown p-4 text-xl sm:text-2xl">
                    <p>As long as you spend 60h on your projects, you can come to Shenzhen, China!</p>
                  </div>
                </div>
              </section>
            </div>
          </div>
          <section ref={carouselSectionRef} className="w-full h-120 lg:pt-30 py-20 overflow-hidden">
            <ul
              ref={carouselTrackRef}
              className="w-max h-full flex gap-4 text-base leading-tight will-change-transform"
            >
              {[...PROJECTS, ...PROJECTS].map((project, i) => (
                <li
                  key={i}
                  className="border-2 border-dark-brown h-full aspect-3/4 bg-light-brown rounded-xs text-dark-brown font-bold p-2 flex flex-col transition-transform duration-300 hover:scale-110 hover:-rotate-3 hover:z-10"
                >
                  <div
                    className="w-full h-[70%] bg-beige rounded-xs bg-center bg-cover opacity-90 border-beige border-6"
                    style={{ backgroundImage: `url(${project.image})` }}
                  />
                  <p className="py-2">{project.description}</p>
                  <p className="mt-auto text-center text-xs font-light">{project.credit}</p>
                </li>
              ))}
            </ul>
          </section>
          <section className="px-6 lg:px-30 xl:px-50 flex flex-col md:flex-row justify-center items-center w-full">
            <h2 className="text-8xl lg:text-9xl lg:text-[10rem] font-semibold font-outfit">60H</h2>
            <HalftoneBg
              src="/landing/person.webp"
              objectFit="contain"
              background=""
              halftoneOpacity={0.25}
              className="w-full max-w-200 -mx-4 md:-mx-20 aspect-[637/576]"
            />
            <div className="flex flex-col text-center text-4xl">
              <h2 className="text-8xl lg:text-9xl lg:text-[10rem] font-semibold font-outfit whitespace-nowrap">深圳</h2>
            </div>
          </section>
          <section className="px-6 md:px-8 lg:px-18 xl:px-36 2xl:px-54 py-20 bg-beige text-dark-brown">
            <div className="w-full border-[1.5px] border-dark-brown relative px-6 py-16 flex flex-col items-center">
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-beige px-4">
                <img src="/landing/flag.svg" alt="Hack Club" className="h-12 object-contain" />
              </div>
              <h3 className="w-full font-bold text-brown mb-4 uppercase mt-2">
                {/* Mobile version (two lines, equal width) */}
                <div className="md:hidden w-[85%] mx-auto flex flex-col items-center">
                  <svg viewBox="0 0 100 24" className="w-full h-auto overflow-visible fill-current">
                    <text
                      x="50%"
                      y="22"
                      textAnchor="middle"
                      fontSize="26"
                      fontWeight="bold"
                      textLength="100"
                      lengthAdjust="spacing"
                    >
                      EARN A
                    </text>
                  </svg>
                  <svg viewBox="0 0 100 14" className="w-full h-auto overflow-visible fill-current mt-1">
                    <text
                      x="50%"
                      y="12"
                      textAnchor="middle"
                      fontSize="15"
                      fontWeight="bold"
                      textLength="100"
                      lengthAdjust="spacing"
                    >
                      CERTIFICATE
                    </text>
                  </svg>
                </div>
                {/* Desktop version (single line) */}
                <div className="hidden md:block text-center text-3xl md:text-5xl tracking-wide">EARN A CERTIFICATE</div>
              </h3>
              <p className="text-xl md:text-2xl text-center text-brown mb-8 max-w-2xl mt-4 md:mt-0">
                Upon the completion of 60 hours for Fallout,
                <br />
                get a certificate recognized by
              </p>

              <div className="flex flex-col items-center gap-6 md:gap-8 w-full max-w-4xl">
                <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 w-full">
                  <div className="relative flex-shrink-0 w-[67%] md:w-auto flex justify-center">
                    <img
                      src="/landing/logos/mit.webp"
                      className="w-full h-auto md:h-24 md:w-auto object-contain opacity-0"
                      alt="MIT School of Engineering"
                    />
                    <div
                      className="absolute inset-0 bg-brown"
                      style={{
                        WebkitMaskImage: 'url(/landing/logos/mit.webp)',
                        WebkitMaskSize: 'contain',
                        WebkitMaskPosition: 'center',
                        WebkitMaskRepeat: 'no-repeat',
                        maskImage: 'url(/landing/logos/mit.webp)',
                        maskSize: 'contain',
                        maskPosition: 'center',
                        maskRepeat: 'no-repeat',
                      }}
                    ></div>
                  </div>
                  <div className="relative flex-shrink-0 w-[67%] md:w-auto flex justify-center">
                    <img
                      src="/landing/logos/github.webp"
                      className="w-full h-auto md:h-20 md:w-auto object-contain opacity-0"
                      alt="GitHub"
                    />
                    <div
                      className="absolute inset-0 bg-brown"
                      style={{
                        WebkitMaskImage: 'url(/landing/logos/github.webp)',
                        WebkitMaskSize: 'contain',
                        WebkitMaskPosition: 'center',
                        WebkitMaskRepeat: 'no-repeat',
                        maskImage: 'url(/landing/logos/github.webp)',
                        maskSize: 'contain',
                        maskPosition: 'center',
                        maskRepeat: 'no-repeat',
                      }}
                    ></div>
                  </div>
                </div>
                <div className="flex flex-wrap justify-center items-center gap-6 md:gap-12 w-full">
                  <div className="relative flex-shrink-0 w-[67%] md:w-auto flex justify-center">
                    <img
                      src="/landing/logos/amd.webp"
                      className="w-full h-auto md:h-16 md:w-auto object-contain opacity-0"
                      alt="AMD"
                    />
                    <div
                      className="absolute inset-0 bg-brown"
                      style={{
                        WebkitMaskImage: 'url(/landing/logos/amd.webp)',
                        WebkitMaskSize: 'contain',
                        WebkitMaskPosition: 'center',
                        WebkitMaskRepeat: 'no-repeat',
                        maskImage: 'url(/landing/logos/amd.webp)',
                        maskSize: 'contain',
                        maskPosition: 'center',
                        maskRepeat: 'no-repeat',
                      }}
                    ></div>
                  </div>
                  <div className="relative flex-shrink-0 w-[67%] md:w-auto flex justify-center">
                    <img
                      src="/landing/logos/cac.webp"
                      className="w-full h-auto md:h-20 md:w-auto object-contain opacity-0"
                      alt="Congressional App Challenge"
                    />
                    <div
                      className="absolute inset-0 bg-brown"
                      style={{
                        WebkitMaskImage: 'url(/landing/logos/cac.webp)',
                        WebkitMaskSize: 'contain',
                        WebkitMaskPosition: 'center',
                        WebkitMaskRepeat: 'no-repeat',
                        maskImage: 'url(/landing/logos/cac.webp)',
                        maskSize: 'contain',
                        maskPosition: 'center',
                        maskRepeat: 'no-repeat',
                      }}
                    ></div>
                  </div>
                  <div className="relative flex-shrink-0 w-[67%] md:w-auto flex justify-center">
                    <img
                      src="/landing/logos/gwc.webp"
                      className="w-full h-auto md:h-20 md:w-auto object-contain opacity-0"
                      alt="Girls Who Code"
                    />
                    <div
                      className="absolute inset-0 bg-brown"
                      style={{
                        WebkitMaskImage: 'url(/landing/logos/gwc.webp)',
                        WebkitMaskSize: 'contain',
                        WebkitMaskPosition: 'center',
                        WebkitMaskRepeat: 'no-repeat',
                        maskImage: 'url(/landing/logos/gwc.webp)',
                        maskSize: 'contain',
                        maskPosition: 'center',
                        maskRepeat: 'no-repeat',
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </section>
          <section className="px-6 md:px-8 lg:px-18 xl:px-36 2xl:px-54 py-20 bg-beige text-dark-brown">
            <h2 className="text-6xl font-semibold mb-10 font-outfit">FAQ</h2>
            <div className="divide-y-2 divide-dark-brown border-y-2 border-dark-brown font-outfit">
              {[
                {
                  q: "Can I join if I'm a beginner?",
                  a: (
                    <>
                      Absolutely! We have <strong>beginner friendly guided projects</strong> and{' '}
                      <strong>weekly calls</strong> where you can ask for help!
                    </>
                  ),
                },
                {
                  q: 'Can I work in teams?',
                  a: <>Yes! After creating a new project, you can invite your teammates!</>,
                },
                {
                  q: 'Am I eligible?',
                  a: (
                    <>
                      You must be a <strong>teenager (ages 13–18)</strong>, and under 19 before{' '}
                      <strong>August 2026</strong>.
                    </>
                  ),
                },
                {
                  q: "What if I can't come?",
                  a: (
                    <>
                      We will have an <strong>online shop</strong> where you can purchase prizes such as 3D printers,
                      tools, and more!
                    </>
                  ),
                },
                {
                  q: 'Is this free?',
                  a: (
                    <>
                      Yes! Each of your projects will be funded up to <strong>$5 (USD) per hour you spend</strong>, and
                      the event itself is <strong>100% free</strong>. As for travel, each hour you work beyond the{' '}
                      <strong>60 hour minimum</strong> will earn you <strong>$8 (USD)</strong> and we have need-based
                      flight stipends available.
                    </>
                  ),
                },
                {
                  q: 'What is Hack Club?',
                  a: (
                    <>
                      <a href="https://hackclub.com">Hack Club</a> is a <strong>501(c)(3) nonprofit</strong> (EIN:
                      81-2908499) that helps high school students learn to code and build projects. We&apos;re the
                      largest teen-led coding community, with over <strong>50,000 students</strong> building projects
                      with their friends in Hack Club each year. Some of our past events include:
                      <ul className="list-disc ml-5 mt-1">
                        <li>
                          <a href="https://www.youtube.com/watch?v=fuTlToZ1SX8" className="font-bold">
                            Juice
                          </a>
                          : a 2 month game jam leading to a pop-up cafe in Shanghai, China!
                        </li>
                        <li>
                          <a href="https://blueprint.hackclub.com/prototype" className="font-bold">
                            Prototype
                          </a>
                          : a 48-hour hardware hackathon in San Francisco, California.
                        </li>
                        <li>
                          <a href="https://youtu.be/kaEFv7e49mo?si=9gATZE-c3CqwsJF2" className="font-bold">
                            Undercity
                          </a>
                          : a 4-day hardware hackathon at GitHub HQ!
                        </li>
                      </ul>
                    </>
                  ),
                },
                {
                  q: 'Why Shenzhen, China?',
                  a: (
                    <>
                      Shenzhen is the <strong>hardware capital of the world</strong>! Components are cheap,
                      manufacturing is rapid, and there are massive electronics markets (see <em>Huaqiangbei</em>).
                    </>
                  ),
                },
                {
                  q: 'I have more questions!',
                  a: (
                    <>
                      Ask us in{' '}
                      <a href="https://hackclub.enterprise.slack.com/archives/C0ACJ290090" className="font-bold">
                        #fallout-help
                      </a>{' '}
                      on the{' '}
                      <a href="http://slack.hackclub.com/" className="underline" target="_self">
                        Hack Club Slack
                      </a>
                      , or email us at{' '}
                      <a href="mailto:fallout@hackclub.com" className="underline">
                        fallout@hackclub.com
                      </a>
                      !
                    </>
                  ),
                },
              ].map(({ q, a }, i) => (
                <div key={i}>
                  <button
                    className="w-full flex justify-between items-center py-5 text-left text-xl md:text-2xl font-medium gap-4"
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  >
                    <span>{q}</span>
                    <span
                      className="text-2xl shrink-0 transition-transform duration-300"
                      style={{ transform: openFaq === i ? 'rotate(45deg)' : 'rotate(0deg)' }}
                    >
                      +
                    </span>
                  </button>
                  <div
                    className="overflow-hidden transition-all duration-300 ease-in-out"
                    style={{ maxHeight: openFaq === i ? '600px' : '0px' }}
                  >
                    <div className="pb-5 text-lg md:text-xl text-brown">{a}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <footer className="px-6 md:px-8 lg:px-18 xl:px-36 2xl:px-54 bg-beige text-dark-brown pb-8 relative">
            <div className="max-w-6xl mx-auto">
              <p className="mb-4 text-lg md:text-xl font-rc-full">
                A project by{' '}
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline transition-colors text-bp-warning"
                  href="https://hackclub.com?utm_source=fallout"
                >
                  Hack Club
                </a>{' '}
                built by the <span style={{ fontFamily: 'Hells Bells' }}>FALLOUT</span> Team
              </p>
              <p className="max-w-3xl text-dark-brown/75 text-sm md:text-base mb-8">
                Hack Club is a 501(c)(3) nonprofit and network of 60k+ technical high schoolers. We believe you learn
                best by building so we're creating community and providing grants so you can make awesome projects. In
                the past few years, we've{' '}
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-bp-warning transition-colors"
                  href="https://summer.hackclub.com/"
                >
                  partnered with GitHub to run Summer of Making
                </a>
                ,{' '}
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-bp-warning transition-colors"
                  href="https://github.com/hackclub/the-hacker-zephyr"
                >
                  hosted the world's longest hackathon on land
                </a>
                , and{' '}
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-bp-warning transition-colors"
                  href="https://www.youtube.com/watch?v=QvCoISXfcE8"
                >
                  ran Canada's largest high school hackathon
                </a>
                .<br />
                <br />
                At Hack Club, students aren't just learning, they're shipping.
              </p>
              <div className="flex flex-wrap gap-x-16 gap-y-8">
                <div className="flex flex-col">
                  <p className="mb-3 text-base md:text-lg font-rc-full font-bold">Hack Club</p>
                  <div className="text-sm md:text-base space-y-1">
                    <a
                      className="block hover:text-bp-warning transition-colors"
                      href="https://hackclub.com/philosophy/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Philosophy
                    </a>
                    <a
                      className="block hover:text-bp-warning transition-colors"
                      href="https://hackclub.com/team/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Our Team &amp; Board
                    </a>
                    <a
                      className="block hover:text-bp-warning transition-colors"
                      href="https://hackclub.com/brand/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Branding
                    </a>
                    <a
                      className="block hover:text-bp-warning transition-colors"
                      href="https://hackclub.com/philanthropy/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Donate
                    </a>
                  </div>
                </div>
                <div className="flex flex-col">
                  <p className="mb-3 text-base md:text-lg font-rc-full font-bold">Fallout</p>
                  <div className="text-sm md:text-base space-y-1">
                    <a href="/docs/where-to-start" className="block hover:text-bp-warning transition-colors">
                      Where do I start?
                    </a>
                    <a href="/docs" className="block hover:text-bp-warning transition-colors">
                      Docs
                    </a>
                    <a href="https://lookout.hackclub.com" className="block hover:text-bp-warning transition-colors">
                      Lookout
                    </a>
                  </div>
                </div>
                <div className="flex flex-col">
                  <p className="mb-3 text-base md:text-lg font-rc-full font-bold">Resources</p>
                  <div className="text-sm md:text-base space-y-1">
                    <a
                      className="block hover:text-bp-warning transition-colors"
                      href="https://events.hackclub.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Community Events
                    </a>
                    <a
                      className="block hover:text-bp-warning transition-colors"
                      href="https://jams.hackclub.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Jams
                    </a>
                    <a
                      className="block hover:text-bp-warning transition-colors"
                      href="https://workshops.hackclub.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Workshops
                    </a>
                    <a
                      className="block hover:text-bp-warning transition-colors"
                      href="https://hackclub.com/conduct/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Code of Conduct
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </footer>
        </div>
      </div>
      <div className="hidden sm:block fixed bottom-4 right-1/2 translate-x-1/2 xs:translate-x-0  xs:bottom-4 xs:right-4 w-[80%] xs:w-100 h-auto rounded-sm overflow-hidden bg-white z-50 flex flex-col border-2 border-dark-brown [transform:translateZ(0)]">
        <div
          className="w-full flex justify-between items-center px-4 py-2 cursor-pointer"
          onClick={() => {
            setVideoOpen((v) => {
              const next = !v
              const msg = next ? 'playVideo' : 'pauseVideo'
              iframeRef.current?.contentWindow?.postMessage(`{"event":"command","func":"${msg}","args":""}`, '*')
              return next
            })
          }}
        >
          <span className="font-medium text-dark-brown text-2xl">{videoOpen ? 'Close Video' : 'Open Video'}</span>
          <img
            src="/arrow.svg"
            className={`h-5 w-auto transition-transform duration-300 ${videoOpen ? 'rotate-180' : 'rotate-0'}`}
          />
        </div>
        <div className={`aspect-16/9 w-full h-auto p-3 pt-0 ${videoOpen ? '' : ' hidden'}`}>
          <iframe
            width="100%"
            height="100%"
            className="rounded-md border-beige border-2"
            ref={iframeRef}
            src="https://www.youtube.com/embed/SrP2ZeNHm6s?si=orljJtYrC7EGSNzi&controls=1&modestbranding=1&rel=0&enablejsapi=1"
            title="YouTube video player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      </div>
      <div
        ref={customCursorRef}
        className="fixed top-0 left-0 z-[9999] pointer-events-none select-none"
        style={{ opacity: 0 }}
      >
        <img src="/cursors/arrowhead.svg" width="36" height="36" />
      </div>
      <div
        ref={pointerCursorRef}
        className="fixed top-0 left-0 z-[9999] pointer-events-none select-none"
        style={{ opacity: 0 }}
      >
        <img src="/cursors/pointer.svg" width="36" height="36" />
      </div>
    </>
  )
}

LandingIndex.layout = (page: ReactNode) => page
