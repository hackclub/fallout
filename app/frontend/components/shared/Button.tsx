import { twMerge } from 'tailwind-merge'

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'link'
  // Wears the disabled look but stays clickable, for actions that must explain why they're unavailable
  // rather than silently doing nothing. Deliberately does NOT set the HTML disabled attribute, which
  // would swallow the click along with it.
  unavailable?: boolean
}

export default function Button({
  variant = 'primary',
  disabled,
  unavailable,
  className,
  children,
  ...props
}: ButtonProps) {
  const base =
    variant === 'link'
      ? 'text-lg underline cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline'
      : 'py-1.5 px-4 border-2 font-bold uppercase'

  const state = disabled
    ? 'opacity-50 cursor-not-allowed'
    : unavailable
      ? 'opacity-50 cursor-pointer'
      : 'cursor-pointer'

  const colors = 'bg-brown text-light-brown border-dark-brown'

  return (
    <button className={twMerge(base, variant !== 'link' && colors, state, className)} disabled={disabled} {...props}>
      {children}
    </button>
  )
}
