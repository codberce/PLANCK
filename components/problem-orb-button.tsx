"use client"

import { MOBILE_BOTTOM_NAV_FAB_OFFSET_CLASS } from "@/lib/mobile-app-nav"
import { cn } from "@/lib/utils"

interface ProblemOrbButtonProps {
  onOpenSidebar?: () => void
}

export default function ProblemOrbButton({ onOpenSidebar }: ProblemOrbButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onOpenSidebar?.()}
      aria-label="Deschide asistent AI"
      className={cn(
        "fixed bottom-6 right-5 z-[310] flex h-20 w-20 items-center justify-center transition-transform duration-200",
        "hover:scale-105 active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b0d10]/20 focus-visible:ring-offset-2",
        "lg:hidden",
        MOBILE_BOTTOM_NAV_FAB_OFFSET_CLASS,
      )}
    >
      <img
        src="/streak-icon.png"
        alt=""
        className="h-20 w-20 object-contain drop-shadow-[0_8px_24px_rgba(11,12,15,0.28)]"
        width={80}
        height={80}
      />
    </button>
  )
}
