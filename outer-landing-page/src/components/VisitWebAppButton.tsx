import type { MouseEventHandler } from 'react'
import { ArrowRightIcon } from './icons'
import { LOGIN_URL } from '../config'

type Size = 'sm' | 'lg'

const sizeClasses: Record<Size, string> = {
  sm: 'gap-1.5 px-5 py-2.5 text-sm shadow-md shadow-brand/20',
  lg: 'gap-2 px-8 py-3.5 text-base shadow-lg shadow-brand/25 hover:shadow-xl hover:shadow-brand/30',
}

interface VisitWebAppButtonProps {
  size?: Size
  /** Layout-only additions (width, margin). Don't pass display utilities; wrap the button instead. */
  className?: string
  onClick?: MouseEventHandler<HTMLAnchorElement>
}

/**
 * The page's single primary call-to-action. It's used in the navbar, mobile menu, hero and
 * footer so the label and destination stay the same everywhere. (The Play Store link lives
 * on its own in the floating GetAppButton.)
 */
export default function VisitWebAppButton({ size = 'sm', className = '', onClick }: VisitWebAppButtonProps) {
  return (
    <a
      href={LOGIN_URL}
      onClick={onClick}
      className={`group inline-flex items-center justify-center rounded-full bg-brand font-semibold whitespace-nowrap text-white transition hover:bg-brand-dark ${sizeClasses[size]} ${className}`}
    >
      Visit Web App
      <ArrowRightIcon
        className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
        strokeWidth={2.2}
      />
    </a>
  )
}
