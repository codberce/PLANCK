"use client"

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
  ReactNode,
} from "react"
import { usePathname } from "next/navigation"
import {
  isLearningPathItemRoute,
  MOBILE_BOTTOM_NAV_FAB_OFFSET_CLASS,
} from "@/lib/mobile-app-nav"
import { cn } from "@/lib/utils"

const InsightChatSidebar = lazy(() => import("@/components/insight-chat-sidebar"))

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InsightOpenOptions {
  problemId?: string
  problemStatement?: string
  problemContextPreamble?: string
  contextPreviewLabel?: string
  keepContextAfterSend?: boolean
  initialUserMessage?: string | null
  initialUserMessageDisplay?: string | null
  starterQuestionChips?: string[] | null
  persona?: string
}

interface InsightGlobalContextValue {
  /** Open the sidebar. Pass opts to set context, or omit for general chat. */
  openInsight: (opts?: InsightOpenOptions) => void
  /** Close the sidebar (slides out, stays mounted). */
  closeInsight: () => void
  /** Toggle open/closed. */
  toggleInsight: () => void
  isOpen: boolean
  /** Register page-specific context so the FAB opens with the right context. */
  setPageContext: (ctx: InsightOpenOptions) => void
  clearPageContext: () => void
}

const InsightGlobalContext = createContext<InsightGlobalContextValue | null>(null)

export function useInsightGlobal(): InsightGlobalContextValue | null {
  return useContext(InsightGlobalContext)
}

// ---------------------------------------------------------------------------
// FAB visibility: paths where the FAB should NOT appear
// ---------------------------------------------------------------------------

const EXCLUDED_PREFIXES = [
  "/admin",
  "/biologie/grile",
  "/classrooms",
  "/cursuri",
  "/grile",
  "/insight/chat",
  "/planckcode",
  "/login",
  "/register",
  "/reset-password",
  "/verify-email",
  "/sketch",
  "/ssr-auth-test",
]

const EXCLUDED_EXACT = new Set([
  "/",
  "/insight",
  "/insight/unauthorized",
  "/despre",
  "/contact",
  "/pricing",
  "/gratuit",
  "/aplicatie-mobila",
  "/concurs",
  "/cookie-policy",
  "/termeni",
  "/confidentialitate",
  "/ajutor",
  "/invite",
  "/auth",
])

function shouldShowFab(pathname: string | null): boolean {
  if (!pathname) return false
  if (isLearningPathItemRoute(pathname)) return false
  if (isProblemDetailRoute(pathname)) return false
  if (EXCLUDED_EXACT.has(pathname)) return false
  for (const prefix of EXCLUDED_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return false
  }
  return true
}

function isProblemDetailRoute(pathname: string): boolean {
  return (
    /^\/probleme\/(?!pagina(?:\/|$))[^/]+\/?$/.test(pathname) ||
    /^\/(matematica|informatica)\/probleme\/[^/]+\/?$/.test(pathname)
  )
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const GENERAL_PROBLEM_ID = "general"

export function InsightGlobalProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const [panelMounted, setPanelMounted] = useState(false)
  const pageContextRef = useRef<InsightOpenOptions | null>(null)
  const [activeOpts, setActiveOpts] = useState<InsightOpenOptions | null>(null)

  const routeAllowsGlobalInsight = shouldShowFab(pathname)
  const fabVisible = routeAllowsGlobalInsight && !isOpen

  useEffect(() => {
    if (!routeAllowsGlobalInsight) {
      setIsOpen(false)
    }
  }, [routeAllowsGlobalInsight])

  const openInsight = useCallback(
    (opts?: InsightOpenOptions) => {
      // Use provided opts, or fall back to registered page context, or general.
      const resolved = opts ?? pageContextRef.current ?? {}
      setActiveOpts(resolved)
      setPanelMounted(true)
      setIsOpen(false)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsOpen(true)
        })
      })
    },
    []
  )

  const closeInsight = useCallback(() => {
    setIsOpen(false)
  }, [])

  const toggleInsight = useCallback(() => {
    if (isOpen) {
      setIsOpen(false)
    } else {
      openInsight()
    }
  }, [isOpen, openInsight])

  const finalizePanelClose = useCallback(() => {
    setIsOpen(false)
  }, [])

  const setPageContextCb = useCallback((ctx: InsightOpenOptions) => {
    pageContextRef.current = ctx
  }, [])

  const clearPageContextCb = useCallback(() => {
    pageContextRef.current = null
  }, [])

  const value = useMemo<InsightGlobalContextValue>(
    () => ({
      openInsight,
      closeInsight,
      toggleInsight,
      isOpen,
      setPageContext: setPageContextCb,
      clearPageContext: clearPageContextCb,
    }),
    [openInsight, closeInsight, toggleInsight, isOpen, setPageContextCb, clearPageContextCb]
  )

  // Derive sidebar props from active options (or defaults).
  const sidebarProps = {
    isOpen,
    onClose: closeInsight,
    problemId: activeOpts?.problemId ?? GENERAL_PROBLEM_ID,
    problemStatement: activeOpts?.problemStatement ?? "",
    problemContextPreamble: activeOpts?.problemContextPreamble,
    contextPreviewLabel: activeOpts?.contextPreviewLabel,
    keepContextAfterSend: activeOpts?.keepContextAfterSend ?? false,
    persona: activeOpts?.persona ?? "problem_tutor",
    initialUserMessage: activeOpts?.initialUserMessage ?? null,
    initialUserMessageDisplay: activeOpts?.initialUserMessageDisplay ?? null,
    onInitialMessageSent: () => {
      setActiveOpts((prev) =>
        prev ? { ...prev, initialUserMessage: null, initialUserMessageDisplay: null } : prev
      )
    },
    starterQuestionChips: activeOpts?.starterQuestionChips ?? null,
    // Always slide-over (not embedded) so it persists across pages.
    embedOnDesktop: false,
    problemLightTheme: true,
    lightChromeWhenSlideOver: true,
    showCloseWhenDesktopEmbedded: false,
    onExitAnimationComplete: finalizePanelClose,
  }

  return (
    <InsightGlobalContext.Provider value={value}>
      {children}

      {/* Global FAB: bottom right, always available on app pages */}
      {fabVisible && (
        <button
          type="button"
          onClick={() => openInsight()}
          aria-label="Deschide Insight AI"
          className={cn(
            "fizica-ai-fab-enter fixed bottom-6 right-5 z-[90] flex h-20 w-20 items-center justify-center transition-transform duration-200 hover:scale-105 active:scale-95",
            "lg:bottom-8 lg:right-8",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b0c0f]/20 focus-visible:ring-offset-2",
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
      )}

      {/* Global Insight sidebar: persists across navigations */}
      {panelMounted ? (
        <Suspense fallback={null}>
          <InsightChatSidebar {...sidebarProps} />
        </Suspense>
      ) : null}
    </InsightGlobalContext.Provider>
  )
}
