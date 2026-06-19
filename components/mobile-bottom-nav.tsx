"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { MOBILE_BOTTOM_NAV_ITEMS } from "@/lib/mobile-app-nav"
import { useSubscriptionPlan } from "@/hooks/use-subscription-plan"

export function MobileBottomNav() {
  const pathname = usePathname()
  const { isPaid } = useSubscriptionPlan()

  const navItems = isPaid
    ? MOBILE_BOTTOM_NAV_ITEMS.filter((item) => item.href !== "/abonament")
    : MOBILE_BOTTOM_NAV_ITEMS

  return (
    <nav
      aria-label="Navigare principală"
      className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-[300] bg-white pb-[env(safe-area-inset-bottom,0px)] burger:hidden"
    >
      <div className="flex h-[4.5rem] items-stretch">
        {navItems.map(({ href, label, icon: Icon, isActive }) => {
          const active = isActive(pathname)

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 transition-colors",
                active ? "text-blue-600" : "text-gray-500",
              )}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden />
              <span className="truncate text-[10px] font-medium leading-tight">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
