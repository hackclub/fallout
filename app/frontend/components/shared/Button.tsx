import { twMerge } from 'tailwind-merge'

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'link'
  visuallyDisabled?: boolean
}

export default function Button({
  variant = 'primary',
  disabled,
  visuallyDisabled,
  className,
  children,
  ...props
}: ButtonProps) {
  const looks = disabled || visuallyDisabled

  const base =
    variant === 'link'
      ? 'text-lg underline cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline'
      : 'py-1.5 px-4 border-2 font-bold uppercase'

  const state = looks ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'

  const colors = 'bg-brown text-light-brown border-dark-brown'

  return (
    <button
      className={twMerge(base, variant !== 'link' && colors, state, className)}
      disabled={disabled}
      aria-disabled={visuallyDisabled || undefined}
      {...props}
    >
      {children}
    </button>
  )
}
