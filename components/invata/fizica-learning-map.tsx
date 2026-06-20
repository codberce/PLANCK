"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type RefObject } from "react"
import { useInsightGlobal } from "@/components/insight-global-provider"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { BookOpen, Check, ChevronDown, Clock, Dumbbell, FastForward, Loader2, Map, PenLine, Play, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import { MOBILE_BOTTOM_NAV_OFFSET_CLASS, MOBILE_BOTTOM_NAV_PADDING_CLASS } from "@/lib/mobile-app-nav"
import { FIZICA_MAP_COMPLETED_LESSON_PARAM } from "@/lib/fizica-map-item-navigation"
import {
  FIZICA_CALENDAR_ENABLED,
  FIZICA_HUB_CARDS_ENABLED,
  FIZICA_INSIGHT_STARTER_CHIPS,
  FIZICA_LESSON_TYPE_LABEL,
  type FizicaLessonType,
} from "@/lib/invata-fizica-config"
import { computeFizicaMapMinHeight } from "@/lib/fizica-map-layout"
import { FizicaLessonIrisTransition } from "@/components/invata/fizica-lesson-iris-transition"
import { FizicaBacCountdown } from "@/components/invata/fizica-bac-countdown"
import { FizicaCalendarCard } from "@/components/invata/fizica-calendar-card"
import { FizicaSimulationCards } from "@/components/invata/fizica-simulation-cards"
import { InvataSubjectSelector } from "@/components/invata/invata-subject-selector"
import { LearningPathUpNextSection } from "@/components/invata/learning-path-up-next-section"
import { INVATA_SUBJECTS, type InvataSubjectId } from "@/lib/invata-config"
import type { FizicaHubCardsData } from "@/lib/supabase-fizica-simulations"
import type { FizicaCalendarEvent } from "@/lib/supabase-fizica-calendar"
import {
  getFizicaMapHref,
  type FizicaMapLesson,
  type FizicaMapPageData,
} from "@/lib/supabase-fizica-learning-map"

type MapLesson = FizicaMapLesson

const FIZICA_MAP_POP_STAGGER_MS = 90
const FIZICA_MAP_POP_DURATION_MS = 450

function getMapRevealAnimationMs(lessonCount: number): number {
  return Math.max(0, lessonCount - 1) * FIZICA_MAP_POP_STAGGER_MS + FIZICA_MAP_POP_DURATION_MS
}

function useMapPathLayout(
  containerRef: RefObject<HTMLDivElement | null>,
  updatePaths: () => void,
  lessonCount: number,
  revealKey: number,
) {
  useEffect(() => {
    const revealMs = getMapRevealAnimationMs(lessonCount)
    const timeouts: number[] = []

    const schedule = (delay: number) => {
      timeouts.push(window.setTimeout(updatePaths, delay))
    }

    updatePaths()
    schedule(0)

    const raf = window.requestAnimationFrame(() => {
      updatePaths()
      window.requestAnimationFrame(updatePaths)
    })

    schedule(100)
    schedule(revealMs)
    schedule(revealMs + 50)
    schedule(revealMs + 200)

    const container = containerRef.current
    if (!container) {
      return () => {
        window.cancelAnimationFrame(raf)
        timeouts.forEach(clearTimeout)
      }
    }

    const resizeObserver = new ResizeObserver(updatePaths)
    resizeObserver.observe(container)

    const observeMapElements = () => {
      container.querySelectorAll("[data-map-node], [data-map-card]").forEach((element) => {
        resizeObserver.observe(element)
      })
    }

    observeMapElements()

    const mutationObserver = new MutationObserver(() => {
      observeMapElements()
      updatePaths()
    })
    mutationObserver.observe(container, { childList: true, subtree: true })

    window.addEventListener("resize", updatePaths)
    window.addEventListener("scroll", updatePaths, { passive: true })

    return () => {
      window.cancelAnimationFrame(raf)
      timeouts.forEach(clearTimeout)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      window.removeEventListener("resize", updatePaths)
      window.removeEventListener("scroll", updatePaths)
    }
  }, [containerRef, lessonCount, revealKey, updatePaths])
}

function buildFizicaMapInsightContext(mapData: FizicaMapPageData): string {
  const { selectedRoute, selectedChapter, lessons } = mapData
  const parts = [
    "Context: utilizatorul este pe harta lecțiilor de fizică (Planck Academy — /invata/fizica).",
    "Rolul tău: tutor de fizică pentru liceu; răspunde clar, pas cu pas, în română.",
  ]

  if (selectedRoute) {
    parts.push(`Traseu selectat: ${selectedRoute.title}.`)
  }

  if (selectedChapter) {
    parts.push(`Capitol curent: ${selectedChapter.title}.`)
  }

  if (lessons.length > 0) {
    parts.push("", "Lecții în capitolul curent:")
    for (const lesson of lessons) {
      parts.push(
        `- ${lesson.title} (${FIZICA_LESSON_TYPE_LABEL[lesson.type]}, ${lesson.durationMinutes} min, status: ${lesson.status})`,
      )
    }
  }

  return parts.join("\n")
}

function LessonTypeIcon({ type, className }: { type: FizicaLessonType; className?: string }) {
  if (type === "exerseaza") {
    return <Dumbbell className={className} aria-hidden />
  }
  if (type === "scrie") {
    return <PenLine className={className} aria-hidden />
  }
  return <BookOpen className={className} aria-hidden />
}

function SidebarNav({
  mapData,
  onNavigate,
}: {
  mapData: FizicaMapPageData
  onNavigate: (href: string) => void
}) {
  const { routes, chapters, selectedRoute, selectedChapter } = mapData

  return (
    <nav className="space-y-4" aria-label="Navigare fizică">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2c2f33]/55">
        Fizică
      </p>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2c2f33]/45">
          Trasee
        </p>
        <div className="space-y-1">
          {routes.map((route) => {
            const isActive = selectedRoute?.id === route.id
            const href = `/invata/fizica?traseu=${encodeURIComponent(route.slug)}`

            return (
              <Link
                key={route.id}
                href={href}
                onClick={(event) => {
                  event.preventDefault()
                  onNavigate(href)
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[#2c2f33]/80 transition-colors hover:bg-[#faf9f7] hover:text-[#0b0c0f]",
                  isActive && "bg-[#f5f4f2] text-[#0b0c0f]",
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <span
                  className={cn(
                    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    isActive ? "bg-white shadow-sm" : "bg-[#f5f4f2]",
                  )}
                >
                  <Map className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{route.title}</span>
                  <span className="block truncate text-xs text-[#2c2f33]/60">Traseu</span>
                </span>
              </Link>
            )
          })}
        </div>
      </div>

      {selectedRoute ? (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2c2f33]/45">
            Capitole
          </p>
          {chapters.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[#0b0c0f]/10 px-3 py-4 text-sm text-[#2c2f33]/60">
              Nu există capitole pentru acest traseu încă.
            </p>
          ) : (
            <div className="space-y-1">
              {chapters.map((chapter) => {
                const isActive = selectedChapter?.id === chapter.id
                return (
                  <Link
                    key={chapter.id}
                    href={getFizicaMapHref(selectedRoute.slug, chapter.slug)}
                    onClick={(event) => {
                      event.preventDefault()
                      onNavigate(getFizicaMapHref(selectedRoute.slug, chapter.slug))
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[#2c2f33]/80 transition-colors hover:bg-[#faf9f7] hover:text-[#0b0c0f]",
                      isActive && "bg-[#f5f4f2] text-[#0b0c0f]",
                    )}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{chapter.title}</span>
                    </span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      ) : null}
    </nav>
  )
}

function MobileRouteChapterPicker({
  mapData,
  onNavigate,
}: {
  mapData: FizicaMapPageData
  onNavigate: (href: string) => void
}) {
  const { routes, chapters, selectedRoute, selectedChapter } = mapData

  if (!selectedRoute) return null

  return (
    <div className="mb-6 space-y-3 lg:hidden">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-[#2c2f33]/55">
          Traseu
        </span>
        <div className="relative">
          <select
            className="w-full appearance-none rounded-xl border border-[#0b0c0f]/10 bg-white px-3 py-2.5 pr-10 text-sm font-medium text-[#0b0c0f]"
            value={selectedRoute.slug}
            onChange={(event) => {
              const nextRoute = routes.find((route) => route.slug === event.target.value)
              if (!nextRoute) return
              onNavigate(`/invata/fizica?traseu=${encodeURIComponent(nextRoute.slug)}`)
            }}
          >
            {routes.map((route) => (
              <option key={route.id} value={route.slug}>
                {route.title}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#2c2f33]/50" />
        </div>
      </label>

      {chapters.length > 0 ? (
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-[#2c2f33]/55">
            Capitol
          </span>
          <div className="relative">
            <select
              className="w-full appearance-none rounded-xl border border-[#0b0c0f]/10 bg-white px-3 py-2.5 pr-10 text-sm font-medium text-[#0b0c0f]"
              value={selectedChapter?.slug ?? ""}
              onChange={(event) => {
                onNavigate(getFizicaMapHref(selectedRoute.slug, event.target.value))
              }}
            >
              {chapters.map((chapter) => (
                <option key={chapter.id} value={chapter.slug}>
                  {chapter.title}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#2c2f33]/50" />
          </div>
        </label>
      ) : null}
    </div>
  )
}

const NODE_SIZE = 72
const NODE_DEPTH = 6

function getLessonNodePalette(isActive: boolean, isCompleted: boolean) {
  if (isCompleted && !isActive) {
    return {
      face: "bg-emerald-500 text-white",
      depth: "bg-emerald-700",
      faceHighlight: "shadow-[inset_0_2px_0_rgba(255,255,255,0.22)]",
    }
  }

  if (isActive) {
    return {
      face: "bg-[#ffc800] text-[#3d2800]",
      depth: "bg-[#9a6800]",
      faceHighlight: "shadow-[inset_0_2px_0_rgba(255,255,255,0.28)]",
    }
  }

  return {
    face: "bg-[#2b5797] text-white",
    depth: "bg-[#1a3d6b]",
    faceHighlight: "shadow-[inset_0_2px_0_rgba(255,255,255,0.16)]",
  }
}

function LessonNode({
  lesson,
  isActive,
  interactive = false,
}: {
  lesson: MapLesson
  isActive: boolean
  interactive?: boolean
}) {
  const isLocked = lesson.status === "locked"
  const isCompleted = lesson.status === "completed"
  const palette = getLessonNodePalette(isActive, isCompleted)

  return (
    <div
      data-map-node={lesson.id}
      className={cn(
        "relative z-[3] shrink-0 rounded-full",
        isActive && "fizica-map-node-glow",
        isLocked && "opacity-55",
      )}
      style={{ width: NODE_SIZE, height: NODE_SIZE }}
    >
      <div
        className={cn(
          "relative h-full w-full overflow-hidden rounded-full",
          interactive &&
            "transition-transform duration-150 ease-out [@media(hover:hover)_and_(pointer:fine)]:group-hover:translate-y-1 group-active:translate-y-1",
        )}
      >
        <div className={cn("absolute inset-0 rounded-full", palette.depth)} aria-hidden />
        <div
          className={cn(
            "absolute inset-x-0 top-0 flex items-center justify-center rounded-full",
            palette.face,
            palette.faceHighlight,
          )}
          style={{ height: NODE_SIZE - NODE_DEPTH }}
        >
          {isCompleted && !isActive ? (
            <Check className="relative z-[1] h-7 w-7" strokeWidth={3} aria-hidden />
          ) : (
            <LessonTypeIcon type={lesson.type} className="relative z-[1] h-7 w-7" />
          )}
        </div>
      </div>
    </div>
  )
}

function findVisibleLessonMarker(lessonId: string): HTMLElement | null {
  const markers = document.querySelectorAll<HTMLElement>(`[data-map-lesson-marker="${lessonId}"]`)
  return Array.from(markers).find((marker) => marker.offsetParent !== null) ?? null
}

function scrollLessonMarkerIntoView(lessonId: string) {
  requestAnimationFrame(() => {
    const marker = findVisibleLessonMarker(lessonId)
    marker?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" })
  })
}

function getMapScrollContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".catalog-problems-scroll")
}

function scrollMapToTop() {
  const container = getMapScrollContainer()
  container?.scrollTo({ top: 0, behavior: "auto" })
}

const FIZICA_MAP_DESCEND_DELAY_MAX_MS = 1200

function reconcileFizicaMapLessonStatuses(
  lessons: MapLesson[],
  extraCompletedIds: Set<string> = new Set(),
): MapLesson[] {
  let activeAssigned = false

  return lessons.map((lesson) => {
    const isCompleted = lesson.status === "completed" || extraCompletedIds.has(lesson.id)

    if (isCompleted) {
      return { ...lesson, status: "completed" as const }
    }
    if (lesson.status === "locked") {
      return lesson
    }
    if (!activeAssigned) {
      activeAssigned = true
      return { ...lesson, status: "active" as const }
    }
    return { ...lesson, status: "available" as const }
  })
}

function getDefaultSelectedLessonId(lessons: MapLesson[]): string | null {
  return (
    lessons.find((lesson) => lesson.status === "active")?.id ??
    lessons.find((lesson) => lesson.status === "available")?.id ??
    lessons[0]?.id ??
    null
  )
}

function getLessonIdAfterCompletion(lessons: MapLesson[], completedLessonId: string): string | null {
  const index = lessons.findIndex((lesson) => lesson.id === completedLessonId)
  if (index < 0) return getDefaultSelectedLessonId(lessons)

  const nextLesson = lessons
    .slice(index + 1)
    .find((lesson) => lesson.status !== "locked" && lesson.status !== "completed")

  return nextLesson?.id ?? getDefaultSelectedLessonId(lessons)
}

function isFizicaLessonSelectable(lesson: MapLesson): boolean {
  return lesson.status === "active" || lesson.status === "completed"
}

function LessonCard({
  lesson,
  compact = false,
  onEnterLesson,
  isEnteringLesson = false,
}: {
  lesson: MapLesson
  compact?: boolean
  onEnterLesson?: (href: string) => void
  isEnteringLesson?: boolean
}) {
  const router = useRouter()
  const [showRestartDialog, setShowRestartDialog] = useState(false)
  const isLocked = lesson.status === "locked"
  const isCompleted = lesson.status === "completed"
  const isActive = lesson.status === "active"
  const isUpcoming = lesson.status === "available"
  const isCurrent = isActive
  const canStart = !!lesson.href && isActive && !isEnteringLesson
  const canRetry = !!lesson.href && isCompleted && !isEnteringLesson

  const handlePrefetch = () => {
    if (lesson.href) {
      router.prefetch(lesson.href)
    }
  }

  const handleEnterLesson = () => {
    if (!lesson.href || !onEnterLesson || isEnteringLesson) return
    onEnterLesson(lesson.href)
  }

  const handleConfirmRestart = () => {
    setShowRestartDialog(false)
    handleEnterLesson()
  }

  const continueButtonClassName =
    "inline-flex h-10 min-w-0 flex-1 items-center justify-center rounded-xl border-[3px] border-b-[5px] border-[#c68a00] border-b-[#9a6800] bg-[#e5a800] px-4 text-sm font-bold text-white"
  const skipButtonClassName =
    "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-[3px] border-b-[5px] border-[#c68a00] border-b-[#9a6800] bg-[#e5a800] text-white"
  const completedRetryButtonClassName =
    "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-[3px] border-b-[5px] border-[#059669] border-b-[#047857] bg-emerald-500 text-white hover:bg-emerald-600"
  const completedPracticeButtonClassName =
    "inline-flex h-10 min-w-0 flex-1 items-center justify-center rounded-xl border-[3px] border-b-[5px] border-[#059669] border-b-[#047857] bg-emerald-500 px-4 text-sm font-bold text-white"
  const startButtonClassName = cn(
    "inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border-[3px] border-b-[5px] px-4 text-sm font-bold",
    isLocked
      ? "cursor-not-allowed border-[#143660] border-b-[#0d2540] bg-[#1a3d6b] text-[#8eb5e0]"
      : "border-[#143660] border-b-[#0d2540] bg-[#1a3d6b] text-[#e8f2ff] hover:bg-[#1f4578]",
  )

  return (
    <>
    <article
      data-map-card={lesson.id}
      className={cn(
        "relative z-[3] flex flex-col rounded-2xl border-[3px] border-b-[6px] px-4",
        isUpcoming ? "py-2.5" : "py-3.5",
        compact
          ? isUpcoming
            ? "h-[88px] max-w-none"
            : "h-[148px] max-w-none"
          : isUpcoming
            ? "h-[100px] w-[min(100%,320px)]"
            : "h-[168px] w-[min(100%,320px)]",
        isCurrent
          ? "border-[#ffc800] border-b-[#c68a00] bg-[#ffc800] text-[#2a1f00]"
          : isCompleted
            ? "border-[#34d399] border-b-[#059669] bg-[#ecfdf5] text-[#065f46]"
            : "border-[#2b5797] border-b-[#143660] bg-[#234a7a] text-[#d8e8ff]",
        isLocked && "opacity-55",
      )}
    >
      <h3
        className={cn(
          isUpcoming ? "line-clamp-1 text-xs" : "line-clamp-2 text-sm",
          "font-bold leading-snug",
          isCurrent ? "text-[#2a1f00]" : isCompleted ? "text-[#065f46]" : "text-[#e8f2ff]",
        )}
      >
        {lesson.title}
      </h3>

      <div className={cn("flex flex-wrap items-center gap-2", isUpcoming ? "mt-1.5" : "mt-2.5")}>
        {isCompleted ? (
          <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
            <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
            Rezolvată
          </span>
        ) : (
          <span
            className={cn(
              "inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-bold uppercase tracking-wide",
              isCurrent ? "bg-[#c68a00] text-white" : "bg-[#1a3d6b] text-[#b8d4f5]",
            )}
          >
            {FIZICA_LESSON_TYPE_LABEL[lesson.type]}
          </span>
        )}
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs font-semibold",
            isCurrent ? "text-[#4a3500]" : isCompleted ? "text-[#047857]" : "text-[#a8c8ef]",
          )}
        >
          <Clock className="h-3.5 w-3.5" aria-hidden />
          {lesson.durationMinutes}m
        </span>
      </div>

      {!isUpcoming ? (
      <div className="mt-auto flex h-10 shrink-0 items-center gap-2 pt-3">
        {isCompleted ? (
          <>
            <button
              type="button"
              disabled={!canRetry}
              aria-label="Reîncepe lecția"
              onClick={() => setShowRestartDialog(true)}
              onMouseEnter={handlePrefetch}
              onFocus={handlePrefetch}
              className={completedRetryButtonClassName}
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Exersează"
              className={completedPracticeButtonClassName}
            >
              Exersează
            </button>
          </>
        ) : isActive ? (
          <>
            <button
              type="button"
              disabled
              aria-label="Salt rapid"
              className={skipButtonClassName}
            >
              <FastForward className="h-4 w-4" aria-hidden />
            </button>
            {canStart && lesson.href ? (
              <button
                type="button"
                onClick={handleEnterLesson}
                onMouseEnter={handlePrefetch}
                onFocus={handlePrefetch}
                className={continueButtonClassName}
              >
                Continuă
              </button>
            ) : (
              <button type="button" disabled className={continueButtonClassName}>
                Continuă
              </button>
            )}
          </>
        ) : (
          <button type="button" disabled={isLocked} className={startButtonClassName}>
            <Play className="h-4 w-4" aria-hidden />
            Începe
          </button>
        )}
      </div>
      ) : null}
    </article>

    <Dialog open={showRestartDialog} onOpenChange={setShowRestartDialog}>
      <DialogContent
        hideClose
        className="!z-[401] max-w-sm border-[#e5e5e5] bg-white p-6 shadow-xl"
        style={{ borderRadius: "24px" }}
        overlayClassName="!z-[400] !bg-black/45 backdrop-blur-none"
      >
        <div className="flex w-full flex-col items-center">
          <DialogHeader className="text-center">
            <DialogTitle className="text-center text-xl font-bold text-[#111111]">
              Reîncepi lecția?
            </DialogTitle>
          </DialogHeader>
          <p className="mt-4 flex-1 text-center text-sm font-bold text-[#4d4d4d]">
            Vei parcurge lecția de la început.
          </p>
          <div className="mt-6 flex w-full flex-col items-stretch gap-3">
            <button
              type="button"
              onClick={handleConfirmRestart}
              disabled={!canRetry}
              className="inline-flex w-full items-center justify-center rounded-full bg-[#2a2a2a] px-6 py-4 text-base font-semibold text-[#f5f4f2] shadow-[0_4px_0_#050505] transition-[transform,box-shadow] hover:translate-y-1 hover:shadow-[0_1px_0_#050505] disabled:opacity-50"
            >
              Da, reîncep
            </button>
            <button
              type="button"
              onClick={() => setShowRestartDialog(false)}
              className="text-sm font-medium text-[#4d4d4d] transition-colors hover:text-[#111111]"
            >
              Anulează
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  )
}

const NODE_RADIUS = NODE_SIZE / 2
const CARD_CLEARANCE = 20
const PATH_DASH = 10
const PATH_GAP = 10
const PATH_STROKE = "#9ca3af"

type OrthogonalPath = { d: string; pairIndex: number }

function rectRelativeTo(rect: DOMRect, containerRect: DOMRect) {
  return {
    left: rect.left - containerRect.left,
    right: rect.right - containerRect.left,
    top: rect.top - containerRect.top,
    bottom: rect.bottom - containerRect.top,
  }
}

function buildMobileZigzagPath(
  fromNode: DOMRect,
  toNode: DOMRect,
  fromCard: DOMRect | null,
  toCard: DOMRect | null,
  containerRect: DOMRect,
): OrthogonalPath {
  const ax = fromNode.left + fromNode.width / 2 - containerRect.left
  const ay = fromNode.top + fromNode.height / 2 - containerRect.top
  const bx = toNode.left + toNode.width / 2 - containerRect.left
  const by = toNode.top + toNode.height / 2 - containerRect.top

  const startY = ay + NODE_RADIUS
  const endY = by - NODE_RADIUS
  let midY = (startY + endY) / 2

  const horizontalMinX = Math.min(ax, bx)
  const horizontalMaxX = Math.max(ax, bx)

  for (const card of [fromCard, toCard]) {
    if (!card) continue
    const cardRect = rectRelativeTo(card, containerRect)
    const intersectsHorizontalBand =
      midY >= cardRect.top - CARD_CLEARANCE && midY <= cardRect.bottom + CARD_CLEARANCE
    const intersectsHorizontalSpan =
      horizontalMaxX >= cardRect.left - CARD_CLEARANCE &&
      horizontalMinX <= cardRect.right + CARD_CLEARANCE

    if (intersectsHorizontalBand && intersectsHorizontalSpan) {
      midY = Math.max(midY, cardRect.bottom + CARD_CLEARANCE)
    }
  }

  const minMidY = startY + CARD_CLEARANCE
  const maxMidY = endY - CARD_CLEARANCE
  midY = Math.min(Math.max(midY, minMidY), maxMidY)

  return {
    d: `M ${ax} ${startY} L ${ax} ${midY} L ${bx} ${midY} L ${bx} ${endY}`,
  }
}

function buildOrthogonalSegments(
  fromNode: DOMRect,
  toNode: DOMRect,
  fromCard: DOMRect | null,
  toCard: DOMRect | null,
  _fromCardBelow: boolean,
  toCardBelow: boolean,
  containerRect: DOMRect,
): { d: string }[] {
  const ax = fromNode.left + fromNode.width / 2 - containerRect.left
  const ay = fromNode.top + fromNode.height / 2 - containerRect.top
  const bx = toNode.left + toNode.width / 2 - containerRect.left
  const by = toNode.top + toNode.height / 2 - containerRect.top

  const sameColumn = Math.abs(ax - bx) < 48

  if (sameColumn) {
    const goingDown = by > ay
    const startY = ay + (goingDown ? NODE_RADIUS : -NODE_RADIUS)
    const endY = by + (goingDown ? -NODE_RADIUS : NODE_RADIUS)
    return [{ d: `M ${ax} ${startY} L ${ax} ${endY}` }]
  }

  const goingRight = bx > ax
  const direction = goingRight ? 1 : -1
  const fromCardRect = fromCard ? rectRelativeTo(fromCard, containerRect) : null
  const toCardRect = toCard ? rectRelativeTo(toCard, containerRect) : null

  const startX = ax + direction * NODE_RADIUS
  const targetSideX = bx - direction * NODE_RADIUS

  const fromOuterEdge = fromCardRect
    ? goingRight
      ? fromCardRect.right
      : fromCardRect.left
    : ax
  const toOuterEdge = toCardRect
    ? goingRight
      ? toCardRect.left
      : toCardRect.right
    : bx

  const fromLaneX = fromOuterEdge + direction * CARD_CLEARANCE
  const toLaneLimitX = toOuterEdge - direction * CARD_CLEARANCE
  const hasClearLane = goingRight ? fromLaneX <= toLaneLimitX : fromLaneX >= toLaneLimitX
  const laneX =
    hasClearLane || !fromCardRect || !toCardRect
      ? fromLaneX
      : (fromOuterEdge + toOuterEdge) / 2

  const endY = !toCardBelow ? by : by - NODE_RADIUS

  return [
    {
      d: [
        `M ${startX} ${ay}`,
        `L ${laneX} ${ay}`,
        `L ${laneX} ${endY}`,
        `L ${targetSideX} ${endY}`,
      ].join(" "),
    },
  ]
}

function FizicaMapPathSegment({
  d,
  pairIndex,
  revealKey,
}: {
  d: string
  pairIndex: number
  revealKey: number
}) {
  const pathRef = useRef<SVGPathElement>(null)
  const [length, setLength] = useState(0)
  const [isDrawing, setIsDrawing] = useState(false)
  const lastRevealKeyRef = useRef<number | null>(null)

  useEffect(() => {
    const path = pathRef.current
    if (!path) return
    setLength(path.getTotalLength())
  }, [d])

  useEffect(() => {
    if (lastRevealKeyRef.current === revealKey) return
    lastRevealKeyRef.current = revealKey
    setIsDrawing(true)
  }, [revealKey])

  const drawDelay = (pairIndex + 1) * FIZICA_MAP_POP_STAGGER_MS
  const showDrawAnimation = isDrawing && length > 0

  return (
    <path
      ref={pathRef}
      d={d}
      fill="none"
      stroke={PATH_STROKE}
      strokeWidth={4.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(
        showDrawAnimation && "fizica-map-path-draw",
        !showDrawAnimation && "fizica-map-path-dashed",
      )}
      style={
        showDrawAnimation
          ? {
              strokeDasharray: length,
              strokeDashoffset: length,
              animationDelay: `${drawDelay}ms`,
            }
          : undefined
      }
      onAnimationEnd={() => setIsDrawing(false)}
    />
  )
}

function MobileMapPath({
  containerRef,
  lessons,
  selectedLessonId,
  revealKey,
}: {
  containerRef: RefObject<HTMLDivElement | null>
  lessons: MapLesson[]
  selectedLessonId: string | null
  revealKey: number
}) {
  const [paths, setPaths] = useState<OrthogonalPath[]>([])
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 })

  const updatePaths = useCallback(() => {
    const container = containerRef.current
    if (!container || lessons.length < 2) {
      setPaths([])
      return
    }

    const containerRect = container.getBoundingClientRect()
    setSvgSize({ width: containerRect.width, height: containerRect.height })

    const nextPaths: OrthogonalPath[] = []

    for (let i = 0; i < lessons.length - 1; i++) {
      const from = lessons[i]
      const to = lessons[i + 1]
      const fromNode = container.querySelector<HTMLElement>(`[data-map-node="${from.id}"]`)
      const toNode = container.querySelector<HTMLElement>(`[data-map-node="${to.id}"]`)
      if (!fromNode || !toNode) continue

      const fromCard = container.querySelector<HTMLElement>(`[data-map-card="${from.id}"]`)
      const toCard = container.querySelector<HTMLElement>(`[data-map-card="${to.id}"]`)

      nextPaths.push({
        ...buildMobileZigzagPath(
          fromNode.getBoundingClientRect(),
          toNode.getBoundingClientRect(),
          fromCard?.getBoundingClientRect() ?? null,
          toCard?.getBoundingClientRect() ?? null,
          containerRect,
        ),
        pairIndex: i,
      })
    }

    setPaths(nextPaths)
  }, [containerRef, lessons, selectedLessonId])

  useMapPathLayout(containerRef, updatePaths, lessons.length, revealKey)

  if (paths.length === 0 || svgSize.width === 0) return null

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[1] overflow-visible"
      width={svgSize.width}
      height={svgSize.height}
      aria-hidden
    >
      {paths.map((path, index) => (
        <FizicaMapPathSegment
          key={`${revealKey}-${path.pairIndex}-${index}`}
          d={path.d}
          pairIndex={path.pairIndex}
          revealKey={revealKey}
        />
      ))}
    </svg>
  )
}

function MapPath({
  containerRef,
  lessons,
  revealKey,
}: {
  containerRef: RefObject<HTMLDivElement | null>
  lessons: MapLesson[]
  revealKey: number
}) {
  const [paths, setPaths] = useState<OrthogonalPath[]>([])
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 })

  const updatePaths = useCallback(() => {
    const container = containerRef.current
    if (!container || lessons.length < 2) {
      setPaths([])
      return
    }

    const containerRect = container.getBoundingClientRect()
    setSvgSize({ width: containerRect.width, height: containerRect.height })

    const nextPaths: OrthogonalPath[] = []

    for (let i = 0; i < lessons.length - 1; i++) {
      const from = lessons[i]
      const to = lessons[i + 1]
      const fromNode = container.querySelector<HTMLElement>(`[data-map-node="${from.id}"]`)
      const toNode = container.querySelector<HTMLElement>(`[data-map-node="${to.id}"]`)
      if (!fromNode || !toNode) continue

      const fromCard = container.querySelector<HTMLElement>(`[data-map-card="${from.id}"]`)
      const toCard = container.querySelector<HTMLElement>(`[data-map-card="${to.id}"]`)

      nextPaths.push(
        ...buildOrthogonalSegments(
          fromNode.getBoundingClientRect(),
          toNode.getBoundingClientRect(),
          fromCard?.getBoundingClientRect() ?? null,
          toCard?.getBoundingClientRect() ?? null,
          from.cardPosition === "below",
          to.cardPosition === "below",
          containerRect,
        ).map((segment) => ({ ...segment, pairIndex: i })),
      )
    }

    setPaths(nextPaths)
  }, [containerRef, lessons])

  useMapPathLayout(containerRef, updatePaths, lessons.length, revealKey)

  if (paths.length === 0 || svgSize.width === 0) return null

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[1] overflow-visible"
      width={svgSize.width}
      height={svgSize.height}
      aria-hidden
    >
      {paths.map((path, index) => (
        <FizicaMapPathSegment
          key={`${revealKey}-${path.pairIndex}-${index}`}
          d={path.d}
          pairIndex={path.pairIndex}
          revealKey={revealKey}
        />
      ))}
    </svg>
  )
}

function FizicaMapLoadingSpinner() {
  return (
    <div
      className="flex min-h-[calc(100dvh-10rem)] w-full items-center justify-center lg:min-h-[calc(100dvh-12rem)]"
      aria-busy="true"
      aria-label="Se încarcă harta lecțiilor"
    >
      <Loader2 className="h-10 w-10 animate-spin text-[#2b5797]" aria-hidden />
    </div>
  )
}

function DesktopMap({
  lessons,
  onSelect,
  revealKey,
  onEnterLesson,
  isEnteringLesson,
}: {
  lessons: MapLesson[]
  onSelect: (lessonId: string) => void
  revealKey: number
  onEnterLesson: (href: string) => void
  isEnteringLesson: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const minHeight = computeFizicaMapMinHeight(lessons)

  if (lessons.length === 0) {
    return (
      <div className="hidden rounded-2xl border border-dashed border-[#0b0c0f]/10 bg-white/70 px-6 py-16 text-center lg:block">
        <p className="text-base font-semibold text-[#0b0c0f]">Nu există lecții în acest capitol.</p>
        <p className="mt-2 text-sm text-[#2c2f33]/65">
          Adaugă lecții din admin pentru a le afișa pe hartă.
        </p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="relative hidden lg:block"
      style={{ minHeight }}
    >
      <MapPath containerRef={containerRef} lessons={lessons} revealKey={revealKey} />
      {lessons.map((lesson, index) => (
        <DesktopLessonMarker
          key={lesson.id}
          lesson={lesson}
          index={index}
          onSelect={() => onSelect(lesson.id)}
          revealKey={revealKey}
          onEnterLesson={onEnterLesson}
          isEnteringLesson={isEnteringLesson}
        />
      ))}
    </div>
  )
}

function DesktopLessonMarker({
  lesson,
  index,
  onSelect,
  revealKey,
  onEnterLesson,
  isEnteringLesson,
}: {
  lesson: MapLesson
  index: number
  onSelect: () => void
  revealKey: number
  onEnterLesson: (href: string) => void
  isEnteringLesson: boolean
}) {
  const isCurrent = lesson.status === "active"
  const isSelectable = isFizicaLessonSelectable(lesson)
  const cardAbove = lesson.cardPosition === "above"
  const node = (
    <button
      type="button"
      onClick={() => {
        if (isSelectable) onSelect()
      }}
      disabled={!isSelectable}
      className={cn(
        "group shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffc800]/60 focus-visible:ring-offset-2",
        isSelectable ? "cursor-pointer" : "cursor-default",
      )}
      aria-pressed={isCurrent}
      aria-label={lesson.title}
    >
      <LessonNode lesson={lesson} isActive={isCurrent} interactive={isSelectable} />
    </button>
  )

  return (
    <div
      data-map-lesson-marker={lesson.id}
      className={cn(
        "absolute flex -translate-x-1/2 scroll-my-20 flex-col items-center lg:scroll-my-28",
        isCurrent ? "z-[4]" : "z-[2]",
      )}
      style={{
        left: `${lesson.xPercent}%`,
        top: lesson.y,
      }}
    >
      <div
        key={`${lesson.id}-${revealKey}`}
        className="fizica-map-item-pop flex flex-col items-center"
        style={{ animationDelay: `${index * FIZICA_MAP_POP_STAGGER_MS}ms` }}
      >
        {cardAbove ? (
          <>
            <div className="mb-3">
              <LessonCard
                lesson={lesson}
                onEnterLesson={onEnterLesson}
                isEnteringLesson={isEnteringLesson}
              />
            </div>
            {node}
          </>
        ) : (
          <>
            {node}
            <div className="mt-3">
              <LessonCard
                lesson={lesson}
                onEnterLesson={onEnterLesson}
                isEnteringLesson={isEnteringLesson}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function isMobileLeftSide(index: number): boolean {
  return index % 2 === 0
}

function MobileLessonMarker({
  lesson,
  index,
  isFocused,
  onSelect,
  revealKey,
  onEnterLesson,
  isEnteringLesson,
}: {
  lesson: MapLesson
  index: number
  isFocused: boolean
  onSelect: () => void
  revealKey: number
  onEnterLesson: (href: string) => void
  isEnteringLesson: boolean
}) {
  const isLeft = isMobileLeftSide(index)
  const isCurrent = lesson.status === "active"
  const isCompleted = lesson.status === "completed"
  const isSelectable = isFizicaLessonSelectable(lesson)
  const showCard = isCurrent || (isCompleted && isFocused)

  return (
    <div
      data-map-lesson-marker={lesson.id}
      className={cn(
        "relative flex w-full scroll-my-20 items-start gap-3 lg:scroll-my-28",
        isCurrent || (isCompleted && isFocused) ? "z-[4]" : "z-[2]",
        isLeft ? "flex-row justify-start pl-2 pr-3" : "flex-row-reverse justify-start pr-2 pl-3",
      )}
    >
      <div
        key={`${lesson.id}-${revealKey}`}
        className={cn(
          "fizica-map-item-pop flex w-full items-start gap-3",
          isLeft ? "flex-row justify-start" : "flex-row-reverse justify-start",
        )}
        style={{ animationDelay: `${index * FIZICA_MAP_POP_STAGGER_MS}ms` }}
      >
        <button
          type="button"
          onClick={() => {
            if (isSelectable) onSelect()
          }}
          disabled={!isSelectable}
          className={cn(
            "group relative z-[5] shrink-0 touch-manipulation rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffc800]/60 focus-visible:ring-offset-2",
            isSelectable ? "cursor-pointer" : "cursor-default",
          )}
          aria-pressed={isCurrent || (isCompleted && isFocused)}
          aria-label={lesson.title}
        >
          <LessonNode
            lesson={lesson}
            isActive={isCurrent}
            interactive={isSelectable}
          />
        </button>
        {showCard ? (
          <div className="relative z-[5] min-w-0 flex-1 pt-0.5">
            <LessonCard
              lesson={lesson}
              compact={!isCurrent}
              onEnterLesson={onEnterLesson}
              isEnteringLesson={isEnteringLesson}
            />
          </div>
        ) : lesson.status === "available" ? (
          <div className="relative z-[5] min-w-0 flex-1 pt-0.5">
            <LessonCard
              lesson={lesson}
              compact
              onEnterLesson={onEnterLesson}
              isEnteringLesson={isEnteringLesson}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function MobileMap({
  lessons,
  selectedId,
  onSelect,
  revealKey,
  onEnterLesson,
  isEnteringLesson,
}: {
  lessons: MapLesson[]
  selectedId: string | null
  onSelect: (lessonId: string) => void
  revealKey: number
  onEnterLesson: (href: string) => void
  isEnteringLesson: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const currentLessonId = lessons.find((lesson) => lesson.status === "active")?.id ?? null

  if (lessons.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#0b0c0f]/10 bg-white/70 px-6 py-12 text-center lg:hidden">
        <p className="text-base font-semibold text-[#0b0c0f]">Nu există lecții în acest capitol.</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative py-2 lg:hidden">
      <MobileMapPath
        containerRef={containerRef}
        lessons={lessons}
        selectedLessonId={currentLessonId}
        revealKey={revealKey}
      />
      <div className="relative z-[2] flex flex-col gap-y-14">
        {lessons.map((lesson, index) => (
          <MobileLessonMarker
            key={lesson.id}
            lesson={lesson}
            index={index}
            isFocused={lesson.id === selectedId}
            onSelect={() => onSelect(lesson.id)}
            revealKey={revealKey}
            onEnterLesson={onEnterLesson}
            isEnteringLesson={isEnteringLesson}
          />
        ))}
      </div>
    </div>
  )
}

export function FizicaLearningMap({
  hubCards,
  mapData,
  calendarEvents = [],
}: {
  hubCards: FizicaHubCardsData
  mapData: FizicaMapPageData
  calendarEvents?: FizicaCalendarEvent[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const completedLessonFromUrl = searchParams.get(FIZICA_MAP_COMPLETED_LESSON_PARAM)
  const [isMapNavigating, startMapTransition] = useTransition()
  const [mapRevealKey, setMapRevealKey] = useState(0)
  const [isOpeningNextChapter, setIsOpeningNextChapter] = useState(false)
  const [optimisticCompletedIds, setOptimisticCompletedIds] = useState<Set<string>>(() => new Set())
  const processedCompletionRef = useRef<string | null>(null)
  const {
    lessons,
    selectedRoute,
    selectedChapter,
    nextChapter,
    isCurrentChapterComplete,
  } = mapData
  const showHubCards =
    FIZICA_HUB_CARDS_ENABLED &&
    (hubCards.preparations.length > 0 || hubCards.nextSimulation !== null)
  const showCalendar = FIZICA_CALENDAR_ENABLED

  const displayLessons = useMemo(
    () => reconcileFizicaMapLessonStatuses(lessons, optimisticCompletedIds),
    [lessons, optimisticCompletedIds],
  )

  const chapterKey = selectedChapter?.id ?? selectedRoute?.slug ?? "default"
  const defaultSelectedId = useMemo(
    () => getDefaultSelectedLessonId(displayLessons),
    [displayLessons],
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const previousChapterKeyRef = useRef<string | null>(null)
  const [pendingLessonHref, setPendingLessonHref] = useState<string | null>(null)
  const pendingLessonHrefRef = useRef<string | null>(null)
  const [isIrisActive, setIsIrisActive] = useState(false)
  const isEnteringLesson = isIrisActive || pendingLessonHref !== null

  const handleEnterLesson = useCallback((href: string) => {
    if (isEnteringLesson) return
    pendingLessonHrefRef.current = href
    setPendingLessonHref(href)
    setIsIrisActive(true)
  }, [isEnteringLesson])

  const handleIrisComplete = useCallback(() => {
    const href = pendingLessonHrefRef.current
    if (!href) return
    router.push(href)
  }, [router])

  const handleMapNavigate = useCallback(
    (href: string) => {
      startMapTransition(() => {
        router.push(href)
      })
    },
    [router, startMapTransition],
  )

  useEffect(() => {
    if (!isMapNavigating) {
      setMapRevealKey((key) => key + 1)
    }
  }, [chapterKey, isMapNavigating])

  useEffect(() => {
    processedCompletionRef.current = null
  }, [chapterKey])

  useEffect(() => {
    setOptimisticCompletedIds((previous) => {
      let changed = false
      const next = new Set(previous)
      for (const id of previous) {
        if (lessons.some((lesson) => lesson.id === id && lesson.status === "completed")) {
          next.delete(id)
          changed = true
        }
      }
      return changed ? next : previous
    })
  }, [lessons])

  useEffect(() => {
    if (isMapNavigating) return
    setSelectedId(null)

    const previousChapterKey = previousChapterKeyRef.current
    const isChapterChange = previousChapterKey !== null && previousChapterKey !== chapterKey
    previousChapterKeyRef.current = chapterKey

    if (!defaultSelectedId) return

    if (!isChapterChange) {
      scrollLessonMarkerIntoView(defaultSelectedId)
      return
    }

    scrollMapToTop()
    const descendDelay = Math.min(
      getMapRevealAnimationMs(displayLessons.length),
      FIZICA_MAP_DESCEND_DELAY_MAX_MS,
    )
    const timeout = window.setTimeout(() => {
      scrollLessonMarkerIntoView(defaultSelectedId)
    }, descendDelay)

    return () => window.clearTimeout(timeout)
  }, [chapterKey, defaultSelectedId, displayLessons.length, isMapNavigating])

  useEffect(() => {
    if (!completedLessonFromUrl || isMapNavigating) return
    if (processedCompletionRef.current === `${chapterKey}:${completedLessonFromUrl}`) return

    processedCompletionRef.current = `${chapterKey}:${completedLessonFromUrl}`

    setOptimisticCompletedIds((previous) => {
      if (previous.has(completedLessonFromUrl)) return previous
      const next = new Set(previous)
      next.add(completedLessonFromUrl)
      return next
    })

    const reconciledLessons = reconcileFizicaMapLessonStatuses(
      lessons,
      new Set([completedLessonFromUrl]),
    )
    const nextLessonId =
      getLessonIdAfterCompletion(reconciledLessons, completedLessonFromUrl) ??
      getDefaultSelectedLessonId(reconciledLessons)

    if (nextLessonId) {
      setSelectedId(null)
      scrollLessonMarkerIntoView(nextLessonId)
    }

    const params = new URLSearchParams(searchParams.toString())
    params.delete(FIZICA_MAP_COMPLETED_LESSON_PARAM)
    const query = params.toString()
    router.replace(query ? `/invata/fizica?${query}` : "/invata/fizica", { scroll: false })
    router.refresh()
  }, [chapterKey, completedLessonFromUrl, isMapNavigating, lessons, router, searchParams])

  const handleSelectLesson = useCallback(
    (lessonId: string) => {
      const lesson = displayLessons.find((entry) => entry.id === lessonId)
      if (!lesson || !isFizicaLessonSelectable(lesson)) return

      if (lesson.status === "active") {
        scrollLessonMarkerIntoView(lessonId)
        return
      }

      setSelectedId((previous) => (previous === lessonId ? null : lessonId))
      scrollLessonMarkerIntoView(lessonId)
    },
    [displayLessons],
  )

  const chatContext = useMemo(() => buildFizicaMapInsightContext(mapData), [mapData])
  const chatProblemId = useMemo(() => {
    const routeSlug = selectedRoute?.slug ?? "default"
    const chapterSlug = selectedChapter?.slug ?? "default"
    return `invata-fizica-map:${routeSlug}:${chapterSlug}`
  }, [selectedChapter?.slug, selectedRoute?.slug])

  const insightGlobal = useInsightGlobal()
  const setInsightPageContext = insightGlobal?.setPageContext
  const clearInsightPageContext = insightGlobal?.clearPageContext

  useEffect(() => {
    if (!setInsightPageContext) return

    setInsightPageContext({
      problemId: chatProblemId,
      problemStatement: chatContext,
      problemContextPreamble: "",
      contextPreviewLabel: selectedChapter
        ? `Capitol curent: ${selectedChapter.title}`
        : 'Harta lecțiilor de fizică',
      keepContextAfterSend: true,
      persona: "problem_tutor",
      starterQuestionChips: FIZICA_INSIGHT_STARTER_CHIPS,
    })

    return () => {
      clearInsightPageContext?.()
    }
  }, [chatContext, chatProblemId, clearInsightPageContext, selectedChapter, setInsightPageContext])

  const handleJumpToNextChapter = useCallback(() => {
    if (!nextChapter || !selectedRoute || isOpeningNextChapter || !isCurrentChapterComplete) return
    setIsOpeningNextChapter(true)
    startMapTransition(() => {
      router.push(getFizicaMapHref(selectedRoute.slug, nextChapter.slug))
    })
  }, [
    isCurrentChapterComplete,
    isOpeningNextChapter,
    nextChapter,
    router,
    selectedRoute,
    startMapTransition,
  ])

  const handleSubjectSelect = useCallback(
    (id: InvataSubjectId) => {
      const subject = INVATA_SUBJECTS.find((entry) => entry.id === id)
      if (subject) {
        router.push(subject.href)
      }
    },
    [router],
  )

  return (
    <div className="flex h-full min-h-0 flex-row">
      <aside className="fixed bottom-0 left-0 top-16 z-30 hidden w-[300px] bg-white lg:block">
        <div className="catalog-sidebar-scroll flex h-full flex-col overflow-y-auto px-5 py-5">
          <SidebarNav mapData={mapData} onNavigate={handleMapNavigate} />
          <div className="mt-auto pt-8">
            <FizicaBacCountdown />
            <InvataSubjectSelector
              selectedId="fizica"
              onSelect={handleSubjectSelect}
              variant="sidebar"
            />
          </div>
        </div>
      </aside>

      <div
        className={cn(
          "relative min-w-0 flex-1 lg:ml-[300px] h-full transition-[margin] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
        )}
      >
        <div className="absolute inset-0 top-0 overflow-hidden bg-white lg:inset-[3px] lg:rounded-xl lg:bg-[#f5f4f2]">
          {showCalendar && !isMapNavigating ? (
            <FizicaCalendarCard
              initialEvents={calendarEvents}
              variant="desktop"
              className="fizica-ai-fab-enter"
            />
          ) : null}
          <div
            className={cn(
              "catalog-problems-scroll h-full overflow-y-auto",
              showHubCards ? "pb-36 sm:pb-32" : "pb-12",
              MOBILE_BOTTOM_NAV_PADDING_CLASS,
              "burger:pb-12",
            )}
          >
            <div className="px-5 pb-12 pt-5 sm:px-8 lg:px-10 lg:pt-8 xl:px-12">
              <MobileRouteChapterPicker mapData={mapData} onNavigate={handleMapNavigate} />
              {showCalendar && !isMapNavigating ? (
                <div className="mb-5 lg:hidden">
                  <FizicaCalendarCard
                    initialEvents={calendarEvents}
                    variant="mobile"
                    className="fizica-ai-fab-enter"
                  />
                </div>
              ) : null}
              {!isMapNavigating && selectedChapter ? (
                <h2 className="mb-5 text-center text-lg font-bold leading-tight text-[#0b0c0f] sm:mb-6 lg:mb-8 lg:text-3xl xl:text-4xl">
                  {selectedChapter.title}
                </h2>
              ) : null}
              {isMapNavigating ? (
                <FizicaMapLoadingSpinner />
              ) : (
                <>
                  <DesktopMap
                    lessons={displayLessons}
                    onSelect={handleSelectLesson}
                    revealKey={mapRevealKey}
                    onEnterLesson={handleEnterLesson}
                    isEnteringLesson={isEnteringLesson}
                  />
                  <MobileMap
                    lessons={displayLessons}
                    selectedId={selectedId}
                    onSelect={handleSelectLesson}
                    revealKey={mapRevealKey}
                    onEnterLesson={handleEnterLesson}
                    isEnteringLesson={isEnteringLesson}
                  />
                </>
              )}

              {nextChapter && selectedRoute ? (
                <LearningPathUpNextSection
                  heading="Următorul"
                  ariaLabel="Următorul capitol"
                  title={nextChapter.title}
                  description="Continuă traseul cu următorul capitol."
                  isCurrentLessonComplete={isCurrentChapterComplete}
                  isOpening={isOpeningNextChapter}
                  onJumpAhead={handleJumpToNextChapter}
                  incompleteMessage="Îți recomandăm să termini tot capitolul curent înainte să treci la următorul."
                  className="pb-4 lg:pb-8"
                />
              ) : null}
            </div>
          </div>

          {showHubCards ? (
            <div
              className={cn(
                "pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-3 pt-6 sm:px-6 lg:px-8",
                MOBILE_BOTTOM_NAV_OFFSET_CLASS,
              )}
            >
              <div className="pointer-events-auto w-full max-w-3xl">
                <FizicaSimulationCards
                  preparations={hubCards.preparations}
                  nextSimulation={hubCards.nextSimulation}
                  overlay
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <FizicaLessonIrisTransition active={isIrisActive} onComplete={handleIrisComplete} />
    </div>
  )
}
