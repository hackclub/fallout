import { type ReactNode, useState, useRef, useEffect } from 'react'
import { motion } from 'motion/react'
import { router, usePage } from '@inertiajs/react'
import type { SharedProps } from '@/types'
import { Modal } from '@inertiaui/modal-react'
import { DirectUpload } from '@rails/activestorage'
import Axios from 'axios'
import Frame from '@/components/shared/Frame'
import { notify } from '@/lib/notifications'
import { ArrowLeftIcon, TrashIcon } from '@heroicons/react/20/solid'
import ProgressBar from '@/components/shared/ProgressBar'

type Tab = 'body' | 'bg' | 'eyes' | 'hats' | 'mouth' | 'tie' | 'ears' | 'cheeks'

type PageProps = {
  display_name: string
  avatar: string
  bio: string | null
  email: string
  pronouns: string | null
  current_streak: number
  total_hours: number
  approved_hours: number
  body_images: string[]
  bg_images: string[]
  eye_images: string[]
  hat_images: string[]
  mouth_images: string[]
  tie_images: string[]
  ear_images: string[]
  cheek_images: string[]
  direct_upload_url: string
  has_slack_token: boolean
  is_modal: boolean
}

const HOURS_GOAL = 60
const BIO_MAX_LENGTH = 100

const TABS: { key: Tab; label: string }[] = [
  { key: 'bg', label: 'Scene' },
  { key: 'body', label: 'Base' },
  { key: 'eyes', label: 'Eyes' },
  { key: 'hats', label: 'Hats' },
  { key: 'mouth', label: 'Mouth' },
  { key: 'tie', label: 'Tie' },
  { key: 'ears', label: 'Ears' },
  { key: 'cheeks', label: 'Cheeks' },
]

function modalHeaders() {
  return {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'X-CSRF-Token': document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || '',
    'X-InertiaUI-Modal': crypto.randomUUID(),
    'X-InertiaUI-Modal-Use-Router': 0,
  }
}

function ProfileShow({
  display_name,
  avatar,
  bio: initial_bio,
  email: initial_email,
  pronouns,
  current_streak,
  total_hours,
  approved_hours,
  body_images,
  bg_images,
  eye_images,
  hat_images,
  mouth_images,
  tie_images,
  ear_images,
  cheek_images,
  direct_upload_url,
  has_slack_token,
  is_modal,
}: PageProps) {
  const shared = usePage<SharedProps>().props

  function signOut(e: React.MouseEvent) {
    e.preventDefault()
    router.delete(shared.sign_out_path)
  }

  const [currentAvatar, setCurrentAvatar] = useState(avatar)
  const [selectedBody, setSelectedBody] = useState<string | null>(body_images[0] ?? null)
  const [selectedBg, setSelectedBg] = useState<string | null>(bg_images[0] ?? null)
  const [selectedEye, setSelectedEye] = useState<string | null>(eye_images[0] ?? null)
  const [selectedHat, setSelectedHat] = useState<string | null>(hat_images[0] ?? null)
  const [selectedMouth, setSelectedMouth] = useState<string | null>(mouth_images[0] ?? null)
  const [selectedTie, setSelectedTie] = useState<string | null>(tie_images[0] ?? null)
  const [selectedEar, setSelectedEar] = useState<string | null>(ear_images[0] ?? null)
  const [selectedCheek, setSelectedCheek] = useState<string | null>(cheek_images[0] ?? null)
  const [activeTab, setActiveTab] = useState<Tab>('body')
  const [bio, setBio] = useState(initial_bio ?? '')

  const [email, setEmail] = useState(initial_email)
  const [emailFocused, setEmailFocused] = useState(false)
  const [emailFitWidth, setEmailFitWidth] = useState<number | null>(null)
  const emailMirrorRef = useRef<HTMLSpanElement>(null)
  const [selectedPronouns, setSelectedPronouns] = useState(pronouns)
  const [showPronounsMenu, setShowPronounsMenu] = useState(false)
  const pronounsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showPronounsMenu) return
    function handleClick(e: MouseEvent) {
      if (pronounsRef.current && !pronounsRef.current.contains(e.target as Node)) {
        setShowPronounsMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showPronounsMenu])
  const [showEmailWarning, setShowEmailWarning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [settingSlack, setSettingSlack] = useState(false)
  const [randomizing, setRandomizing] = useState(false)
  const [showCustomizer, setShowCustomizer] = useState(false)
  const [hasVisitedPfpEditor, setHasVisitedPfpEditor] = useState(() => {
    try {
      return !!localStorage.getItem('pfp-editor-visited')
    } catch {
      return false
    }
  })

  function markPfpEditorVisited() {
    if (hasVisitedPfpEditor) return
    try {
      localStorage.setItem('pfp-editor-visited', '1')
    } catch {
      // storage unavailable; event + state still update for the current session
    }
    window.dispatchEvent(new CustomEvent('pfp-editor-visited'))
    setHasVisitedPfpEditor(true)
  }

  const approvedProgress = Math.min((approved_hours / HOURS_GOAL) * 100, 100)
  const qualified = total_hours >= HOURS_GOAL

  const imagesByTab: Record<Tab, string[]> = {
    body: body_images,
    bg: bg_images,
    eyes: eye_images,
    hats: hat_images,
    mouth: mouth_images,
    tie: tie_images,
    ears: ear_images,
    cheeks: cheek_images,
  }

  const selectedByTab: Record<Tab, string | null> = {
    body: selectedBody,
    bg: selectedBg,
    eyes: selectedEye,
    hats: selectedHat,
    mouth: selectedMouth,
    tie: selectedTie,
    ears: selectedEar,
    cheeks: selectedCheek,
  }

  const settersByTab: Record<Tab, (v: string | null) => void> = {
    body: setSelectedBody,
    bg: setSelectedBg,
    eyes: setSelectedEye,
    hats: setSelectedHat,
    mouth: setSelectedMouth,
    tie: setSelectedTie,
    ears: setSelectedEar,
    cheeks: setSelectedCheek,
  }

  const imageClassByTab: Record<Tab, string> = {
    body: 'w-full h-full object-cover',
    bg: 'w-full h-full object-cover',
    eyes: 'w-full h-full object-cover scale-170 -translate-y-3',
    hats: 'w-full h-full object-cover scale-140 translate-y-6',
    mouth: 'w-full h-full object-cover scale-240 -translate-y-6',
    tie: 'w-full h-full object-cover scale-220 -translate-y-13 -translate-x-0.5',
    ears: 'w-full h-full object-cover scale-114 translate-y-3',
    cheeks: 'w-full h-full object-cover scale-160 -translate-y-4',
  }

  async function composeIconToBlob(): Promise<Blob | null> {
    const SIZE = 512
    const canvas = document.createElement('canvas')
    canvas.width = SIZE
    canvas.height = SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    async function drawLayer(src: string | null, offsetY = 0) {
      if (!src) return
      await new Promise<void>((resolve) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          ctx.drawImage(img, 0, offsetY, SIZE, SIZE)
          resolve()
        }
        img.onerror = () => resolve()
        img.src = src
      })
    }

    if (selectedBg) {
      await drawLayer(selectedBg)
    } else {
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, SIZE, SIZE)
    }
    await drawLayer(selectedBody)
    await drawLayer(selectedEar)
    await drawLayer(selectedTie, Math.round((-12 / 320) * SIZE))
    await drawLayer(selectedCheek)
    await drawLayer(selectedMouth)
    await drawLayer(selectedEye)
    await drawLayer(selectedHat)

    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  }

  async function handleSaveFalloutPfp() {
    setSaving(true)
    const blob = await composeIconToBlob()
    if (!blob) {
      setSaving(false)
      notify('alert', 'Failed to compose image.')
      return
    }
    const file = new File([blob], 'icon-pfp.png', { type: 'image/png' })
    const upload = new DirectUpload(file, direct_upload_url)
    upload.create((error, blobData) => {
      if (error) {
        setSaving(false)
        notify('alert', 'Failed to upload image.')
        return
      }
      const newAvatarUrl = `/user-attachments/blobs/redirect/${blobData.signed_id}/${blobData.filename}`
      if (is_modal) {
        Axios.patch('/profile', { avatar_blob_signed_id: blobData.signed_id }, { headers: modalHeaders() })
          .then(() => {
            setCurrentAvatar(newAvatarUrl)
            setSaving(false)
            router.reload({ only: ['user'] })
          })
          .catch(() => {
            setSaving(false)
            notify('alert', 'Failed to save.')
          })
      } else {
        router.patch(
          '/profile',
          { avatar_blob_signed_id: blobData.signed_id },
          {
            preserveScroll: true,
            onSuccess: () => {
              setCurrentAvatar(newAvatarUrl)
              setSaving(false)
            },
            onError: () => {
              setSaving(false)
              notify('alert', 'Failed to save.')
            },
          },
        )
      }
    })
  }

  async function handleSetAsSlack() {
    if (!has_slack_token) {
      window.location.href = '/auth/slack/start'
      return
    }
    setSettingSlack(true)
    const blob = await composeIconToBlob()
    if (!blob) {
      setSettingSlack(false)
      notify('alert', 'Failed to compose image.')
      return
    }
    const csrf = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || ''
    try {
      const buffer = await blob.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
      const base64 = btoa(binary)
      const response = await Axios.post(
        '/profile/set_slack_photo',
        { image_data: base64 },
        { headers: { 'X-CSRF-Token': csrf } },
      )
      const newAvatarUrl: string | null = response.data?.avatar_url ?? null
      if (newAvatarUrl) {
        setCurrentAvatar(newAvatarUrl)
        router.reload({ only: ['user'] })
      }
      notify('notice', 'Slack photo updated!')
    } catch (e: unknown) {
      if (Axios.isAxiosError(e) && e.response?.status === 401) {
        window.location.href = '/auth/slack/start'
      } else {
        notify('alert', 'Failed to set Slack photo.')
      }
    } finally {
      setSettingSlack(false)
    }
  }

  async function handleResetToSlackPfp() {
    const csrf = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || ''
    try {
      const response = await Axios.delete('/profile/custom_avatar', {
        headers: { 'X-CSRF-Token': csrf, ...modalHeaders() },
      })
      setCurrentAvatar(response.data.avatar_url)
      notify('notice', 'Photo reset to Slack profile picture.')
      router.reload({ only: ['user'] })
    } catch {
      notify('alert', 'Failed to reset photo.')
    }
  }

  async function handleRandomize() {
    if (randomizing) return
    setRandomizing(true)

    function pick<T>(arr: T[], required = false): T | null {
      if (arr.length === 0) return null
      const pool = required ? arr : ([...arr, null] as (T | null)[])
      return pool[Math.floor(Math.random() * pool.length)]
    }

    const finalBody = pick(body_images, true)
    const finalBg = pick(bg_images)
    const finalEye = pick(eye_images)
    const finalHat = pick(hat_images)
    const finalMouth = pick(mouth_images)
    const finalTie = pick(tie_images)
    const finalEar = pick(ear_images)
    const finalCheek = pick(cheek_images)

    const TOTAL = 2200
    const start = Date.now()

    await new Promise<void>((resolve) => {
      function step() {
        const elapsed = Date.now() - start
        const progress = Math.min(elapsed / TOTAL, 1)

        if (progress >= 1) {
          setSelectedBody(finalBody)
          setSelectedBg(finalBg)
          setSelectedEye(finalEye)
          setSelectedHat(finalHat)
          setSelectedMouth(finalMouth)
          setSelectedTie(finalTie)
          setSelectedEar(finalEar)
          setSelectedCheek(finalCheek)
          resolve()
          return
        }

        setSelectedBody(pick(body_images, true))
        setSelectedBg(pick(bg_images))
        setSelectedEye(pick(eye_images))
        setSelectedHat(pick(hat_images))
        setSelectedMouth(pick(mouth_images))
        setSelectedTie(pick(tie_images))
        setSelectedEar(pick(ear_images))
        setSelectedCheek(pick(cheek_images))

        const interval = Math.round(50 + progress * progress * progress * 650)
        setTimeout(step, interval)
      }
      step()
    })

    setRandomizing(false)
  }

  function handleSaveProfile(data: { bio?: string; email?: string; pronouns?: string | null }) {
    if (is_modal) {
      Axios.patch('/profile', data, { headers: modalHeaders() }).catch(() => notify('alert', 'Failed to save.'))
    } else {
      router.patch('/profile', data, { preserveScroll: true, onError: () => notify('alert', 'Failed to save.') })
    }
  }

  const profileView = (
    <div className="flex flex-col items-center justify-center h-full p-4 md:p-6 relative">
      <div className="flex flex-row whitespace-nowrap pb-4 sm:flex-col gap-2 sm:absolute top-4 md:top-6 left-4 md:left-6 ">
        {shared.auth.user?.is_staff && (
          <a
            href="/admin"
            className="bg-dark-brown text-center rounded-lg px-2 py-0.5 text-light-brown w-full text-base hover:scale-94 transition-all cursor-pointer block"
          >
            Admin
          </a>
        )}
        <button
          type="button"
          onClick={signOut}
          className="text-center rounded-lg px-3 py-0.5 text-dark-brown w-full text-base hover:scale-94 transition-all cursor-pointer block"
        >
          Log out
        </button>
      </div>
      <button
        type="button"
        onClick={() => {
          setShowCustomizer(true)
          markPfpEditorVisited()
        }}
        className="relative shrink-0 cursor-pointer group"
        aria-label="Customize profile picture"
      >
        <img
          src={currentAvatar}
          alt={display_name}
          className="rounded-lg sm:size-50 outline-dark-brown outline-2 object-cover"
        />
        {!hasVisitedPfpEditor && (
          <>
            <span className="absolute -top-1 -right-1 rounded-full size-4 bg-coral z-10" />
            <span className="absolute -top-1 -right-1 rounded-full size-4 bg-coral animate-ping z-10" />
          </>
        )}
        <div className="absolute inset-0 rounded-lg bg-dark-brown opacity-0 group-hover:opacity-30 transition-opacity" />
        <div className="absolute -bottom-3 -right-3 rounded-full w-8 h-8 border-dark-brown border-2 bg-beige flex items-center justify-center transition-opacity">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M2 16H3.425L13.2 6.225L11.775 4.8L2 14.575V16ZM0 18V13.75L13.2 0.575C13.4 0.391667 13.6208 0.25 13.8625 0.15C14.1042 0.05 14.3583 0 14.625 0C14.8917 0 15.15 0.05 15.4 0.15C15.65 0.25 15.8667 0.4 16.05 0.6L17.425 2C17.625 2.18333 17.7708 2.4 17.8625 2.65C17.9542 2.9 18 3.15 18 3.4C18 3.66667 17.9542 3.92083 17.8625 4.1625C17.7708 4.40417 17.625 4.625 17.425 4.825L4.25 18H0ZM12.475 5.525L11.775 4.8L13.2 6.225L12.475 5.525Z"
              fill="#61453a"
            />
          </svg>
        </div>
      </button>

      <h1 className="font-bold text-3xl text-dark-brown mt-4">{display_name}</h1>

      <div className="flex gap-2 text-brown text-xs items-center">
        <div className="relative" ref={pronounsRef}>
          <button
            type="button"
            onClick={() => setShowPronounsMenu((v) => !v)}
            className="text-brown text-xs border-b border-transparent hover:border-brown cursor-pointer pt-1"
          >
            {selectedPronouns ?? 'add pronouns'}
          </button>
          {showPronounsMenu && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-dark-brown rounded-md px-2 py-1.5 z-10 flex gap-1 shadow-md">
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-dark-brown rotate-45 " />
              {['she/her', 'he/him', 'they/them'].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    const next = selectedPronouns === p ? null : p
                    setSelectedPronouns(next)
                    setShowPronounsMenu(false)
                    handleSaveProfile({ pronouns: next })
                  }}
                  className={`text-xs px-2 py-0.5 rounded-sm cursor-pointer whitespace-nowrap ${selectedPronouns === p ? 'bg-beige text-brown font-bold' : 'text-beige hover:bg-beige/20'}`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="mt-1 w-1 h-1 bg-brown rounded-full inline-block" />
        <div className="relative">
          <span
            ref={emailMirrorRef}
            aria-hidden
            className="absolute invisible whitespace-pre text-xs p-1 pointer-events-none"
          >
            {email || ' '}
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (e.target.value !== initial_email) setShowEmailWarning(true)
            }}
            onFocus={() => {
              setEmailFocused(true)
              setEmailFitWidth(null)
            }}
            onBlur={() => {
              setEmailFocused(false)
              setShowEmailWarning(false)
              if (emailMirrorRef.current) setEmailFitWidth(emailMirrorRef.current.scrollWidth)
              handleSaveProfile({ email })
            }}
            className="bg-transparent border-b px-1 pt-1 border-transparent hover:border-brown focus:border-brown outline-none text-brown text-xs min-w-0"
            style={
              emailFocused || emailFitWidth === null
                ? { width: `calc(${Math.max(email.length, 10)}ch * 0.9)` }
                : { width: emailFitWidth }
            }
          />
          {showEmailWarning && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 bg-dark-brown text-beige text-xs rounded-md px-3 py-2 z-10 text-center shadow-md">
              This is the email your HCB cards will be sent to
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-dark-brown rotate-45" />
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-col items-center w-full max-w-80">
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX_LENGTH))}
          onBlur={() => handleSaveProfile({ bio })}
          placeholder="Add a bio..."
          rows={2}
          className="w-full text-brown text-sm resize-none bg-transparent border-b p-2 border-transparent hover:border-brown focus:border-brown outline-none text-center placeholder:text-brown/40 overflow-hidden"
        />
      </div>

      <div className="mt-4 w-full max-w-80">
        <ProgressBar progress={approvedProgress} trackClassName="bg-beige" />
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mt-1">
          <span className="text-brown text-sm font-medium mt-1 block text-center">
            Approved:{' '}
            {qualified ? 'Congrats on qualifying! YIPPPPEEEEE -Soup' : `${approved_hours ?? 0}h / ${HOURS_GOAL}h`}
          </span>
          <span className="text-brown text-sm font-medium mt-1 block text-center">
            Total: {total_hours ?? 0}h / {HOURS_GOAL}h
          </span>
        </div>
      </div>
    </div>
  )

  const customizerView = (
    <div className="flex flex-col p-4 md:p-6 overflow-x-hidden my-auto">
      <div className="flex flex-col gap-3 rounded-md w-full py-2 px-2">
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setShowCustomizer(false)}
            className="cursor-pointer text-dark-brown hover:opacity-80 shrink-0"
            aria-label="Back"
          >
            <ArrowLeftIcon className="w-6 h-6" />
          </button>
          <ul className="mx-auto w-fit flex flex-wrap justify-center gap-1 border-2 border-dark-brown p-1 list-none rounded-md">
            {TABS.map(({ key, label }) => (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className="relative py-1 px-2 text-xs sm:text-sm rounded-sm cursor-pointer"
                >
                  {activeTab === key && (
                    <motion.div
                      layoutId="active-tab-pill"
                      className="absolute inset-0 bg-dark-brown rounded-sm"
                      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                    />
                  )}
                  <span
                    className={`relative z-10 ${activeTab === key ? 'font-semibold text-light-brown' : 'font-semibold text-dark-brown'}`}
                  >
                    {label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="w-6 shrink-0" />
        </div>
        <div className="flex flex-col sm:flex-row h-full w-full gap-2 rounded-md mt-">
          <div className="flex flex-col gap-2">
            <div
              className="relative rounded-lg grow aspect-square border-2 border-dark-brown shrink-0 w-full  sm:h-80"
              style={
                selectedBg
                  ? { backgroundImage: `url(${selectedBg})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                  : { backgroundColor: 'white' }
              }
            >
              
              {selectedEar && <img src={selectedEar} alt="" className="absolute inset-0 w-full h-full object-cover" />}
              {selectedBody && (
                <img src={selectedBody} alt="" className="absolute inset-0 w-full h-full object-cover" />
              )}
              {selectedTie && (
                <img src={selectedTie} alt="" className="absolute -top-3 inset-0 w-full h-full object-cover" />
              )}
              {selectedCheek && (
                <img src={selectedCheek} alt="" className="absolute inset-0 w-full h-full object-cover" />
              )}
              
              {selectedMouth && (
                <img src={selectedMouth} alt="" className="absolute inset-0 w-full h-full object-cover" />
              )}
              {selectedEye && <img src={selectedEye} alt="" className="absolute inset-0 w-full h-full object-cover" />}
              {selectedHat && <img src={selectedHat} alt="" className="absolute inset-0 w-full h-full object-cover" />}
            </div>
            <div className="flex gap-1 w-full items-stretch">
              <button
                type="button"
                onClick={handleSetAsSlack}
                disabled={settingSlack}
                className="text-sm font-medium bg-dark-brown text-beige px-3 py-1 rounded-md w-fit disabled:opacity-60 cursor-pointer hover:opacity-80"
              >
                {settingSlack ? 'Setting…' : 'Set as Slack'}
              </button>
              <div className="relative group z-10 w-fit h-full">
                <button
                  type="button"
                  onClick={handleSaveFalloutPfp}
                  disabled={saving}
                  className="bg-dark-brown text-beige px-1 py-1 rounded-sm w-fit h-full flex items-center justify-center disabled:opacity-60 cursor-pointer hover:opacity-80"
                  aria-label="Save as Fallout profile picture"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M17 21V13H7V21M7 3V8H15M19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H16L21 8V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21Z"
                      stroke="#fcf1e5"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <span className="pointer-events-none absolute top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-dark-brown px-2 py-1 text-xs text-light-brown opacity-0 transition-opacity group-hover:opacity-100 z-50">
                  Set this as my Fallout pfp!
                </span>
              </div>
              <button
                type="button"
                onClick={handleRandomize}
                disabled={randomizing}
                className="ml-auto bg-dark-brown text-beige text-sm space-x-2 px-1 py-1 rounded-sm w-fit h-full flex items-center justify-center disabled:opacity-60 cursor-pointer hover:opacity-80"
                aria-label="Randomize character"
              >
                <span className="pl-1">Random</span>

                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className={randomizing ? 'animate-spin [animation-direction:reverse]' : ''}
                >
                  Random
                  <path
                    d="M1 4.00044V10.0004M1 10.0004H7M1 10.0004L5.64 5.64044C7.02091 4.26186 8.81245 3.36941 10.7447 3.09755C12.6769 2.8257 14.6451 3.18917 16.3528 4.1332C18.0605 5.07723 19.4152 6.55068 20.2126 8.33154C21.0101 10.1124 21.2072 12.1042 20.7742 14.0068C20.3413 15.9094 19.3017 17.6198 17.8121 18.8802C16.3226 20.1406 14.4637 20.8828 12.5157 20.9949C10.5677 21.107 8.63598 20.583 7.01166 19.5018C5.38734 18.4206 4.15839 16.8408 3.51 15.0004"
                    stroke="#fcf1e5"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <div className="relative group z-10 w-fit h-full">
                <button
                  type="button"
                  onClick={handleResetToSlackPfp}
                  className="bg-dark-brown text-beige px-1 py-1 rounded-sm w-fit h-full flex items-center justify-center cursor-pointer hover:opacity-80"
                  aria-label="Return to Slack pfp"
                >
                  <TrashIcon className="w-5 h-4" />
                </button>
                <span className="pointer-events-none absolute top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-dark-brown px-2 py-1 text-xs text-light-brown opacity-0 transition-opacity group-hover:opacity-100 z-50">
                  Return to Slack pfp on Fallout
                </span>
              </div>
            </div>
          </div>
          <div className="h-48 sm:h-full overflow-y-auto w-full">
            <div className="grow grid grid-cols-4 sm:grid-cols-3 gap-1 sm:max-h-80">
              {imagesByTab[activeTab].map((src) => {
                const selected = selectedByTab[activeTab] === src
                return (
                  <div key={src} className="relative aspect-square">
                    {selected && (
                      <motion.div
                        layoutId={randomizing ? undefined : `selected-item-border-${activeTab}`}
                        className="absolute inset-0 rounded-sm border-2 border-dark-brown pointer-events-none z-10"
                        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => settersByTab[activeTab](src)}
                      className="flex w-full h-full rounded-sm overflow-hidden cursor-pointer bg-white transition-transform hover:scale-95"
                    >
                      <img src={src} alt="" className={`block ${imageClassByTab[activeTab]}`} />
                    </button>
                  </div>
                )
              })}
              {activeTab !== 'bg' && (
                <div className="relative aspect-square">
                  {selectedByTab[activeTab] === null && (
                    <motion.div
                      layoutId={randomizing ? undefined : `selected-item-border-${activeTab}`}
                      className="absolute inset-0 rounded border-2 border-dark-brown pointer-events-none z-10"
                      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => settersByTab[activeTab](null)}
                    className="flex w-full h-full rounded overflow-hidden cursor-pointer bg-white"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  const content = (
    <div className="w-full md:w-[600px] max-h-[85vh] md:h-[520px] overflow-y-auto md:overflow-visible flex flex-col">
      {showCustomizer ? customizerView : profileView}
    </div>
  )

  if (is_modal) {
    return (
      <Modal
        panelClasses="w-full md:w-fit"
        paddingClasses="w-full xs:px-2 md:px-0 md:w-fit mx-auto top-1/2 -translate-y-1/2"
        closeButton={false}
      >
        <Frame innerClassName="p-2 xs:p-4 md:p-3">{content}</Frame>
      </Modal>
    )
  }

  return content
}

ProfileShow.layout = (page: ReactNode) => page

export default ProfileShow
