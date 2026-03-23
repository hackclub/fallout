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
    gsap.registerPlugin(ScrollTrigger)

    const ctx = gsap.context(() => {
      const qualifyOuter = document.querySelector<HTMLElement>(".qualify-outer")
      const qWrappers = gsap.utils.toArray<HTMLElement>(".qualify-card-wrapper")
      const qCards = gsap.utils.toArray<HTMLElement>(".qualify-card")

      if (qualifyOuter && qWrappers.length > 1) {
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: qualifyOuter,
            start: "top top",
            end: "bottom bottom",
            scrub: 2,
            invalidateOnRefresh: true,
          },
        })

        for (let i = 1; i < qWrappers.length; i++) {
          const STACK_OFFSET = i * 80
          tl.to(qWrappers[i], {
            y: () => -(qWrappers[i].offsetTop - qWrappers[0].offsetTop - STACK_OFFSET),
            ease: "none",
          }).to(qCards[i - 1], {
            scale: 0.9 + 0.025 * (i - 1),
            ease: "none",
          }, "<")
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

      gsap.fromTo(belowFoldRef.current, { y: 40 }, {
        y: 0,
        ease: 'none',
        scrollTrigger: { trigger: belowFoldRef.current, start: 'top bottom', end: 'top 60%', scrub: true },
      })

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
          }
        )
      })
    })

    // Sticker behavior: proximity drift — sticker drifts in the direction the cursor is moving when nearby, springs back on leave
    const stickerCleanups: (() => void)[] = []
    document.querySelectorAll<HTMLElement>('.sticker').forEach((el) => {
      let ox = 0, oy = 0
      let prevX = 0, prevY = 0
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

    // Magnetic letters — each letter drifts toward cursor while hovered, springs back on leave
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
        const px = Math.max(-cap, Math.min(cap, (e.clientX - cx) * 0.3))
        const py = Math.max(-cap, Math.min(cap, (e.clientY - cy) * 0.3))
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
        // Arrow: tip at viewBox (5.5,3.21) → rendered (8,6) at 36x48
        gsap.set(customCursor, { x: e.clientX - 8, y: e.clientY - 6, opacity: cursorVisible && !isClickable ? 1 : 0 })
        if (pointerCursor) {
          // Hand: index finger tip at viewBox (10,9) → rendered (15,13) at 36x36
          gsap.set(pointerCursor, { x: e.clientX - 15, y: e.clientY - 13, opacity: cursorVisible && isClickable ? 1 : 0 })
        }
        cursorVisible = true
      }
      window.addEventListener('mousemove', onCursorMove)
      stickerCleanups.push(() => window.removeEventListener('mousemove', onCursorMove))

      // Hide cursor when mouse enters iframe (window loses focus); it reappears on next mousemove
      const onWindowBlur = () => {
        cursorVisible = false
        gsap.set(customCursor, { opacity: 0 })
        if (pointerCursor) gsap.set(pointerCursor, { opacity: 0 })
      }
      window.addEventListener('blur', onWindowBlur)
      stickerCleanups.push(() => window.removeEventListener('blur', onWindowBlur))
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
    const id = setInterval(() => setCardOrder(prev => [...prev.slice(1), prev[0]]), 3000)
    return () => clearInterval(id)
  }, [])

  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const scrollHintRef = useRef<HTMLDivElement>(null)
  const highlight1Ref = useRef<HTMLSpanElement>(null)
  const highlight2Ref = useRef<HTMLSpanElement>(null)
  const highlight3Ref = useRef<HTMLSpanElement>(null)

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
    <style>{`html, html * { cursor: none !important; }`}</style>
    <div ref={preloaderRef} className="fixed inset-0 bg-blue z-50 pointer-events-none" />
    <nav className="absolute top-3 px-3 w-full grid grid-cols-3 items-center z-30 text-white">
      <img src="/landing/flag.svg" className="w-20 sm:w-30" />
      <div ref={falloutLettersRef} className="clickme text-3xl md:text-[2.5rem] font-bells cursor-pointer select-none md:space-x-[3px] justify-self-center whitespace-nowrap" onClick={handleFalloutClick}>
        <span className="inline-block">F</span>
        <span className="inline-block">A</span>
        <span className="inline-block">L</span>
        <span className="inline-block">L</span>
        <span className="inline-block">O</span>
        <span className="inline-block">U</span>
        <span className="inline-block">T</span>
      </div>
      <a href={shared.sign_in_path} className="justify-self-end w-fit h-fit shrink-0 border-2 border-dark-brown bg-brown text-light-brown font-bold whitespace-nowrap text-sm sm:text-xl md:text-2xl px-3 py-2 rounded-sm">LOG IN</a>
    </nav>
    <a ref={navRef} href={shared.sign_in_path} className="fixed top-4 right-4 z-30 w-fit h-fit border-2 border-dark-brown bg-brown text-light-brown font-bold whitespace-nowrap text-sm sm:text-xl md:text-2xl px-3 py-2 rounded-sm">LOG IN</a>
    <div ref={containerRef} className="w-screen h-full flex flex-col justify-center bg-beige overflow-hidden cursor-none">

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
        
        <HalftoneBg
          src="/landing/hero.webp"
          className="absolute inset-0 w-full h-full  pointer-events-none"
          halftoneOpacity={0.1}
          bleed={0.08}
        />
        
        <div className="relative flex flex-col items-center w-full px-4 md:px-0 mt-20 md:mt-40 gap-3 sm:gap-4">
          {/* <div className="text-lg md:text-xl lg:text-2xl tracking-[5%] text-center">JULY 1-7, 2026</div> */}
          
          <h1 className="shake text-center tracking-[5%] text-shadow-md text-shadow-blue  text-3xl md:text-6xl font-bold max-w-5xl">
            Build hardware projects for 60h, 
            Visit Shenzhen, China!
          </h1>
          <p className="text-xl tracking-[5%] text-center ">A beginner-friendly program for teens 13-18.</p>
          <Frame className="w-full max-w-[calc(100%-1rem)] sm:max-w-160 ml-1">
            <form
              className="w-full h-full flex px-2 sm:px-4 py-1 text-xl items-center justify-between gap-2"
              onSubmit={handleSubmit}
            >
              <input
                className="flex-1 min-w-0 py-2 md:py-3 text-lg sm:text-xl md:text-3xl placeholder-brown outline-none bg-transparent"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@shenzhen.com"
                required
              />
              <button
                className="cursor-pointer disabled:opacity-50 w-fit h-fit shrink-0 border-2 border-dark-brown bg-brown text-light-brown font-bold whitespace-nowrap text-sm sm:text-xl md:text-2xl px-3 py-2 rounded-sm"
                aria-label="Submit"
                disabled={submitting}
              >
                {submitting ? '...' : 'START NOW'}
              </button>
            </form>
          </Frame>
          <FlashMessages />
        </div>
        <div ref={scrollHintRef} className="absolute bottom-10 text-center font-medium text-beige text-sm tracking-widest select-none text-shadow-sm">Scroll</div>
      </section>

      <div ref={belowFoldRef} className="relative">
       

      <div className="w-screen -mt-40">
        <img src="/landing/clouds/banner.png" className="object-cover object-bottom select-none" />
      </div>

      <div className="w-screen bg-beige px-3 sm:px-6 md:px-8 lg:px-18 xl:px-36 2xl:px-54 pt-10">
        <section className="bg-dark-brown border-2 border-dark-brown text-beige p-6 md:p-10 flex flex-col md:flex-row justify-center items-center gap-4 relative lg:items-stretch rounded-sm">
          <div className="flex flex-col font-normal">
            <span className="text-3xl sm:text-5xl font-medium">WHAT IS</span>
            <span className="text-4xl sm:text-6xl md:text-7xl xl:text-8xl font-extrabold">FALLOUT?</span>
            <p className="text-xl md:text-2xl xl:text-3xl mt-auto lg:mt-10">Hack Club Fallout is a three-month program leading to a 7-day, <span ref={highlight1Ref} style={{ backgroundImage: 'linear-gradient(var(--color-green), var(--color-green))', backgroundRepeat: 'no-repeat', backgroundPosition: 'left center', backgroundSize: '0% 100%' }}>free hardware hackathon in Shenzhen, China.</span></p>
            <p className="mt-8 text-xl md:text-2xl xl:text-3xl">Students qualify by designing and <span ref={highlight2Ref} style={{ backgroundImage: 'linear-gradient(var(--color-green), var(--color-green))', backgroundRepeat: 'no-repeat', backgroundPosition: 'left center', backgroundSize: '0% 100%' }}>building 60h</span>, with components funded by us!</p>
          </div>
          <div className="relative my-6 sm:absolute sm:-bottom-30 sm:left-20 lg:left-10  bg-white max-w-full md:w-120 shadow-md border-2 border-dark-brown z-10 text-dark-brown p-4 text-xl md:text-2xl">
            <p>Our events are <b>100% beginner friendly!</b> <br /> Follow along with our guides and ask the community for help!</p>
          </div>
          <div className="flex flex-col items-center w-220 space-y-6">
            <div className="clickme group grid lg:max-w-220 w-full h-70 lg:h-110 grid-cols-1 grid-rows-1 place-items-center cursor-none" onClick={() => setCardOrder(prev => [...prev.slice(1), prev[0]])}>
            {cardOrder.map(i => (
              <div key={i} className={`col-start-1 row-start-1 border-2 border-beige h-full aspect-5/6 bg-cover bg-center bg-brown/20 bg-blend-soft-light shadow-md ${['rotate-6', 'rotate-0', '-rotate-4'][i]}`} style={{backgroundImage: `url(/landing/past/${['juice.webp', 'overglade.webp', 'parthenon.webp'][i]})`}} /> 
            ))}
            </div>
            <p><a className="text-light-brown text-lg underline text-sm md:text-base" href={cardCaptions[cardOrder[cardOrder.length - 1]].href} target="_self">{cardCaptions[cardOrder[cardOrder.length - 1]].label}</a></p>
          </div>
      </section>

      <div className="md:pt-40 md:qualify-outer">
        <section className="md:qualify-section md:sticky md:top-[calc(50svh-15rem)] flex flex-col md:flex-row justify-between w-full text-beige gap-4 md:min-h-120">
          <div className="flex-3/4 lg:flex-3/4 w-full flex justify-center md:block">
          <div className="md:qualify-scroll-wrapper w-full flex flex-col md:block gap-2 md:gap-0">
            <div className="md:qualify-card-wrapper md:h-80 h-60" style={{ perspective: '500px' }}>
              <HalftoneBg src="/landing/comic1.webp" className="md:qualify-card w-full h-full" objectFit="contain" background="" halftoneOpacity={0.12} />
            </div>
            <div className="md:qualify-card-wrapper md:h-80 h-60" style={{ perspective: '500px' }}>
              <HalftoneBg src="/landing/comic2.webp" className="md:qualify-card w-full h-full" objectFit="contain" background="" halftoneOpacity={0.12} />
            </div>
            <div className="md:qualify-card-wrapper md:h-80 h-60" style={{ perspective: '500px' }}>
              <HalftoneBg src="/landing/comic3.webp" className="md:qualify-card w-full h-full" objectFit="contain" background="" halftoneOpacity={0.12} />
            </div>
          </div>
        </div>
        <div className="relative flex flex-col h-fit bg-blue border-2 border-dark-brown p-6 md:p-10 text-beige rounded-sm">
          <div className="text-white flex flex-col w-full md:w-fit space-y-4">
            <span className="text-4xl lg:text-6xl font-bold text-center">HOW TO QUALIFY</span>
            <ol className="ml-8 list-decimal leading-8 text-xl sm:text-2xl xl:text-3xl space-y-3">
              <li>Design your project</li>
              <li>Track all of your time by journaling & timelapsing on our platform</li>
              <li>Submit for feedback!</li>
              <li>We give you up to $350 USD to buy parts, and build your projects!</li>
              <li>Publish + Share online</li>
              <li>Repeat until you've spent 60 hours</li>
            </ol>
          </div>
          <div className="md:absolute -bottom-24 right-10 mx-auto sm:mx-0 w-full sm:ml-auto mt-10 bg-white md:w-80 shadow-md border-2 border-dark-brown z-10 text-dark-brown p-4 text-xl sm:text-2xl">
            <p>As long as you build for 60h, you can come to Shenzhen, China!</p>
          </div>
        </div>
        
        </section>

      </div>
      </div>

      <section className="-mt-40 px-6 lg:px-30 xl:px-50 flex flex-col md:flex-row justify-center items-center w-full">
        <h2 className="text-8xl lg:text-9xl lg:text-[10rem] font-bold">
          60H
        </h2>
        <HalftoneBg src="/landing/person.webp" objectFit="contain" background="" halftoneOpacity={0.25} className="w-full max-w-200 -mx-4 md:-mx-20 aspect-[637/576]" />
        <div className="flex flex-col text-center text-4xl">
          {/* <h4>shen zhen</h4> */}
          <h2 className="text-8xl lg:text-9xl lg:text-[10rem] font-bold whitespace-nowrap">深圳
          </h2>
          {/* <h4>China</h4> */}
        </div>
 
      </section>
      <section className="px-6 md:px-8 lg:px-18 xl:px-36 2xl:px-54 py-20 bg-beige text-dark-brown">
        <h2 className="text-6xl font-bold mb-10">FAQ</h2>
        <div className="divide-y-2 divide-dark-brown border-y-2 border-dark-brown font-outfit">
          {[
            { q: 'Can I join if I\'m a beginner?', a: <>Absolutely! We have <strong>beginner friendly guided projects</strong> and <strong>weekly calls</strong> where you can ask for help!</> },
            { q: 'Am I eligible?', a: <>You must be a <strong>teenager (ages 13–18)</strong>, and under 19 before <strong>August 2026</strong>.</> },
            { q: 'What if I can\'t come?', a: <>We will have an <strong>online shop</strong> where you can purchase prizes such as 3D printers, tools, and more!</> },
            { q: 'Is this free?', a: <>Yes! Each of your projects will be funded up to <strong>$350 (USD)</strong>, and the event itself is <strong>100% free</strong>. As for travel, each hour you work beyond the <strong>60 hour minimum</strong> will earn you <strong>$8 (USD)</strong> and we will have need-based flight stipends available.</> },
            { q: 'What is Hack Club?', a: <><a href="" target="_self">Hack Club</a> is a <strong>501(c)(3) nonprofit</strong> (EIN: 81-2908499) that helps high school students learn to code and build projects. We&apos;re the largest teen-led coding community, with over <strong>50,000 students</strong> building projects with their friends in Hack Club each year. Some of our past events include:
            <ul className="list-disc ml-5 mt-1">
              <li><a href="https://www.youtube.com/watch?v=fuTlToZ1SX8" target="_self" className="font-bold">Juice</a>: a 2 month game jam leading to a pop-up cafe in Shanghai, China!</li>
              <li><a href="https://blueprint.hackclub.com/prototype" target="_self" className="font-bold">Prototype</a>: a 48-hour hardware hackathon in San Francisco, California.</li>
              <li><a href="https://youtu.be/kaEFv7e49mo?si=9gATZE-c3CqwsJF2" target="_self" className="font-bold">Undercity</a>: a 4-day hardware hackathon at GitHub HQ!</li>
            </ul>
            </> },
            { q: 'Why Shenzhen, China?', a: <>Shenzhen is the <strong>hardware capital of the world</strong>! Components are cheap, manufacturing is rapid, and there are massive electronics markets (see <em>Huaqiangbei</em>).</> },
            { q: 'I have more questions!', a: <>Ask us in <a href="https://hackclub.enterprise.slack.com/archives/C0ACJ290090" target="_self" className="font-bold">#fallout-help</a> on the <a href="http://slack.hackclub.com/" target="_self">Hack Club Slack</a>, or email us at <a href="mailto:fallout@hackclub.com" className="underline">fallout@hackclub.com</a>!</> },
          ].map(({ q, a }, i) => (
            <div key={i}>
              <button
                className="w-full flex justify-between items-center py-5 text-left text-xl md:text-2xl font-medium gap-4"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              >
                <span>{q}</span>
                <span className="text-2xl shrink-0 transition-transform duration-300" style={{ transform: openFaq === i ? 'rotate(45deg)' : 'rotate(0deg)' }}>+</span>
              </button>
              <div
                className="overflow-hidden transition-all duration-300 ease-in-out"
                style={{ maxHeight: openFaq === i ? '300px' : '0px' }}
              >
                <div className="pb-5 text-lg md:text-xl text-brown">{a}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="px-6 md:px-8 lg:px-18 xl:px-36 2xl:px-54 bg-beige text-dark-brown pb-8 relative flex items-end gap-4">
        <div className="space-y-2 text-xl xl:text-2xl">
          <p className="font-medium mt-2 leading-6 ">Fallout is made with ♡ by teenagers, for teenagers</p>
          <div className="space-x-4">
            <a href="https://hackclub.com" target="_blank" rel="noreferrer" className="underline">
              Hack Club
            </a>
            <a href="https://hackclub.com/slack" target="_blank" rel="noreferrer" className="underline">
              Join Our Slack
            </a>
          </div>
        </div>
        {/* <div className="ml-auto flex items-end gap-4">
          <div className="bg-white outline-2 outline-dark-brown h-24 aspect-5/3">
            <p className="text-center">07-01-2026</p>
          </div>
          <div className="flex flex-col gap-2">
            <a href="mailto:fallout@hackclub.com" className="underline ml-auto text-xl">
              fallout@hackclub.com
            </a>
            <div className="outline-2 outline-dark-brown h-34 aspect-2/1 border-4 border-green bg-light-green flex items-center justify-center overflow-hidden">
              <img src="/koifish.webp" className="p-2 h-full w-full object-contain cursor-pointer" />
            </div>
          </div>
        </div> */}
      </footer>


      </div>
    </div>
    <div ref={customCursorRef} className="fixed top-0 left-0 z-[9999] pointer-events-none select-none" style={{ opacity: 0 }}>
      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 24 24"><path fill="#FCF1E5" stroke="#000" strokeWidth="2" d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.85a.5.5 0 0 0-.85.35Z"></path></svg>
    </div>
    <div ref={pointerCursorRef} className="fixed top-0 left-0 z-[9999] pointer-events-none select-none" style={{ opacity: 0 }}>
      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24"><path fill="#FCF1E5" stroke="#000" strokeWidth="2" strokeLinejoin="round" d="M10 11V8.99c0-.88.59-1.64 1.44-1.86h.05A1.99 1.99 0 0 1 14 9.05V12v-2c0-.88.6-1.65 1.46-1.87h.05A1.98 1.98 0 0 1 18 10.06V13v-1.94a2 2 0 0 1 1.51-1.94h0A2 2 0 0 1 22 11.06V14c0 .6-.08 1.27-.21 1.97a7.96 7.96 0 0 1-7.55 6.48 54.98 54.98 0 0 1-4.48 0 7.96 7.96 0 0 1-7.55-6.48C2.08 15.27 2 14.59 2 14v-1.49c0-1.11.9-2.01 2.01-2.01h0a2 2 0 0 1 2.01 2.03l-.01.97v-10c0-1.1.9-2 2-2h0a2 2 0 0 1 2 2V11Z"></path></svg>
    </div>

</>
  )
}

LandingIndex.layout = (page: ReactNode) => page
