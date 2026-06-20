import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { FizicaLessonStatus, FizicaLessonType } from "@/lib/invata-fizica-config"
import type { GuestLearningPathProgressMap } from "@/lib/guest-learning-path-cookie"
import {
  buildFizicaMapLessonLayouts,
  type FizicaMapLessonLayout,
  type FizicaMapLessonLayoutInput,
} from "@/lib/fizica-map-layout"
import {
  appendFizicaMapItemQuery,
  buildFizicaMapReturnAfterLessonHref,
  type FizicaMapItemContext,
} from "@/lib/fizica-map-item-navigation"
import {
  getCompletedLearningPathItemIdsForUser,
  getLearningPathItemHref,
  getLearningPathRouteSegments,
  type LearningPathChapter,
  type LearningPathLesson,
  type LearningPathLessonItem,
} from "@/lib/supabase-learning-paths"
import { computeLearningPathLessonEloTotal } from "@/lib/learning-path-elo"

export const FIZICA_ROUTE_SLUGS = ["mecanica", "termodinamica", "electricitate", "optica"] as const
export type FizicaRouteSlug = (typeof FIZICA_ROUTE_SLUGS)[number]

export interface FizicaRoute {
  id: string
  slug: FizicaRouteSlug
  title: string
  order_index: number
  is_active: boolean
}

export interface FizicaChapter {
  id: string
  route_id: string
  slug: string
  title: string
  order_index: number
  is_active: boolean
}

export interface FizicaLesson {
  id: string
  chapter_id: string
  title: string
  duration_minutes: number
  lesson_type: FizicaLessonType
  order_index: number
  is_active: boolean
}

export interface FizicaLessonItemAssignment {
  id: string
  fizica_lesson_id: string
  learning_path_lesson_item_id: string
  order_index: number
}

export interface FizicaMapLesson extends FizicaMapLessonLayout {
  fizicaLessonId: string
}

export interface FizicaMapPageData {
  routes: FizicaRoute[]
  chapters: FizicaChapter[]
  selectedRoute: FizicaRoute | null
  selectedChapter: FizicaChapter | null
  nextChapter: FizicaChapter | null
  lessons: FizicaMapLesson[]
  completedLessonCount: number
  isCurrentChapterComplete: boolean
}

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) return null
  return createClient(supabaseUrl, supabaseAnonKey)
}

export function isFizicaRouteSlug(value: string | null | undefined): value is FizicaRouteSlug {
  return !!value && (FIZICA_ROUTE_SLUGS as readonly string[]).includes(value)
}

async function fetchRoutes(): Promise<FizicaRoute[]> {
  const supabase = getSupabaseClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from("fizica_routes")
    .select("id, slug, title, order_index, is_active")
    .eq("is_active", true)
    .order("order_index", { ascending: true })

  if (error || !data) return []
  return data as FizicaRoute[]
}

async function fetchChaptersForRoute(routeId: string): Promise<FizicaChapter[]> {
  const supabase = getSupabaseClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from("fizica_chapters")
    .select("id, route_id, slug, title, order_index, is_active")
    .eq("route_id", routeId)
    .eq("is_active", true)
    .order("order_index", { ascending: true })

  if (error || !data) return []
  return data as FizicaChapter[]
}

async function fetchLessonsForChapter(chapterId: string): Promise<FizicaLesson[]> {
  const supabase = getSupabaseClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from("fizica_lessons")
    .select("id, chapter_id, title, duration_minutes, lesson_type, order_index, is_active")
    .eq("chapter_id", chapterId)
    .eq("is_active", true)
    .order("order_index", { ascending: true })

  if (error || !data) return []
  return data as FizicaLesson[]
}

async function fetchLessonItemAssignments(lessonIds: string[]): Promise<FizicaLessonItemAssignment[]> {
  if (lessonIds.length === 0) return []
  const supabase = getSupabaseClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from("fizica_lesson_items")
    .select("id, fizica_lesson_id, learning_path_lesson_item_id, order_index")
    .in("fizica_lesson_id", lessonIds)
    .order("order_index", { ascending: true })

  if (error || !data) return []
  return data as FizicaLessonItemAssignment[]
}

interface LearningPathItemContext {
  item: LearningPathLessonItem
  lesson: LearningPathLesson
  chapter: LearningPathChapter
  itemIndex: number
}

async function fetchLearningPathItemContexts(
  itemIds: string[],
): Promise<Map<string, LearningPathItemContext>> {
  const result = new Map<string, LearningPathItemContext>()
  if (itemIds.length === 0) return result

  const supabase = getSupabaseClient()
  if (!supabase) return result

  const { data: items, error: itemsError } = await supabase
    .from("learning_path_lesson_items")
    .select("*")
    .in("id", itemIds)
    .eq("is_active", true)

  if (itemsError || !items?.length) return result

  const lessonIds = [...new Set(items.map((item) => item.lesson_id))]
  const { data: lessons, error: lessonsError } = await supabase
    .from("learning_path_lessons")
    .select("*")
    .in("id", lessonIds)
    .eq("is_active", true)

  if (lessonsError || !lessons?.length) return result

  const chapterIds = [...new Set(lessons.map((lesson) => lesson.chapter_id))]
  const { data: chapters, error: chaptersError } = await supabase
    .from("learning_path_chapters")
    .select("*")
    .in("id", chapterIds)
    .eq("is_active", true)

  if (chaptersError || !chapters?.length) return result

  const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter as LearningPathChapter]))
  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson as LearningPathLesson]))

  for (const lessonId of lessonIds) {
    const { data: lessonItems } = await supabase
      .from("learning_path_lesson_items")
      .select("*")
      .eq("lesson_id", lessonId)
      .eq("is_active", true)
      .order("order_index", { ascending: true })

    if (!lessonItems) continue
    const lesson = lessonById.get(lessonId)
    if (!lesson) continue
    const chapter = chapterById.get(lesson.chapter_id)
    if (!chapter) continue

    lessonItems.forEach((item, index) => {
      if (itemIds.includes(item.id)) {
        result.set(item.id, {
          item: item as LearningPathLessonItem,
          lesson,
          chapter,
          itemIndex: index,
        })
      }
    })
  }

  return result
}

function resolveLessonStatuses(
  lessons: FizicaLesson[],
  assignmentsByLesson: Map<string, FizicaLessonItemAssignment[]>,
  itemContexts: Map<string, LearningPathItemContext>,
  completedItemIds: Set<string>,
  mapContext?: { routeSlug: string; chapterSlug: string } | null,
): { layouts: FizicaMapLessonLayoutInput[]; completedCount: number } {
  const layouts: FizicaMapLessonLayoutInput[] = []
  let completedCount = 0
  let activeAssigned = false

  for (const lesson of lessons) {
    const assignments = assignmentsByLesson.get(lesson.id) ?? []

    const assignedItemIds = assignments
      .map((assignment) => assignment.learning_path_lesson_item_id)
      .filter((itemId) => itemContexts.has(itemId))

    const allCompleted =
      assignedItemIds.length > 0 &&
      assignedItemIds.every((itemId) => completedItemIds.has(itemId))

    if (allCompleted) completedCount += 1

    const firstItemId = assignedItemIds[0] ?? null
    const firstUncompletedItemId =
      assignedItemIds.find((itemId) => !completedItemIds.has(itemId)) ?? null
    // Reia lecția de la primul item nefinalizat; cele finalizate repornesc de la început.
    const entryItemId = allCompleted ? firstItemId : firstUncompletedItemId ?? firstItemId
    const context = entryItemId ? itemContexts.get(entryItemId) : undefined

    let status: FizicaLessonStatus = "locked"
    let href: string | null = null

    if (context) {
      const baseHref = getLearningPathItemHref(context.chapter, context.lesson, context.itemIndex)
      href =
        mapContext != null
          ? appendFizicaMapItemQuery(baseHref, {
              routeSlug: mapContext.routeSlug,
              chapterSlug: mapContext.chapterSlug,
              fizicaLessonId: lesson.id,
            })
          : baseHref
      if (allCompleted) {
        status = "completed"
      } else if (!activeAssigned) {
        status = "active"
        activeAssigned = true
      } else {
        status = "available"
      }
    }

    layouts.push({
      id: lesson.id,
      title: lesson.title,
      type: lesson.lesson_type,
      durationMinutes: lesson.duration_minutes,
      status,
      href,
      orderIndex: lesson.order_index,
    })
  }

  return { layouts, completedCount }
}

function resolveCompletedItemIdsFromGuestProgress(
  itemIds: string[],
  guestProgressMap: GuestLearningPathProgressMap,
): Set<string> {
  const scopedIds = new Set(itemIds)
  const completed = new Set<string>()

  for (const ids of Object.values(guestProgressMap)) {
    if (!Array.isArray(ids)) continue
    for (const id of ids) {
      if (typeof id === "string" && scopedIds.has(id)) {
        completed.add(id)
      }
    }
  }

  return completed
}

function resolveNextChapter(
  chapters: FizicaChapter[],
  selectedChapter: FizicaChapter,
): FizicaChapter | null {
  const currentIndex = chapters.findIndex((chapter) => chapter.id === selectedChapter.id)
  if (currentIndex < 0 || currentIndex >= chapters.length - 1) return null
  return chapters[currentIndex + 1] ?? null
}

function isFizicaChapterComplete(
  lessons: FizicaLesson[],
  assignmentsByLesson: Map<string, FizicaLessonItemAssignment[]>,
  completedItemIds: Set<string>,
): boolean {
  const lessonsWithItems = lessons.filter(
    (lesson) => (assignmentsByLesson.get(lesson.id) ?? []).length > 0,
  )
  if (lessonsWithItems.length === 0) return false

  return lessonsWithItems.every((lesson) => {
    const assignedItemIds = (assignmentsByLesson.get(lesson.id) ?? []).map(
      (assignment) => assignment.learning_path_lesson_item_id,
    )
    return assignedItemIds.every((itemId) => completedItemIds.has(itemId))
  })
}

export async function fetchFizicaMapPageData(options: {
  routeSlug?: string | null
  chapterSlug?: string | null
  userId?: string | null
  progressClient?: SupabaseClient | null
  guestProgressMap?: GuestLearningPathProgressMap
}): Promise<FizicaMapPageData> {
  const routes = await fetchRoutes()
  const selectedRoute =
    routes.find((route) => route.slug === options.routeSlug) ?? routes[0] ?? null

  const chapters = selectedRoute ? await fetchChaptersForRoute(selectedRoute.id) : []
  const selectedChapter =
    chapters.find((chapter) => chapter.slug === options.chapterSlug) ?? chapters[0] ?? null

  if (!selectedChapter) {
    return {
      routes,
      chapters,
      selectedRoute,
      selectedChapter: null,
      nextChapter: null,
      lessons: [],
      completedLessonCount: 0,
      isCurrentChapterComplete: false,
    }
  }

  const nextChapter = resolveNextChapter(chapters, selectedChapter)

  const fizicaLessons = await fetchLessonsForChapter(selectedChapter.id)
  const lessonIds = fizicaLessons.map((lesson) => lesson.id)
  const assignments = await fetchLessonItemAssignments(lessonIds)

  const assignmentsByLesson = new Map<string, FizicaLessonItemAssignment[]>()
  for (const assignment of assignments) {
    const list = assignmentsByLesson.get(assignment.fizica_lesson_id) ?? []
    list.push(assignment)
    assignmentsByLesson.set(assignment.fizica_lesson_id, list)
  }

  const itemIds = assignments.map((assignment) => assignment.learning_path_lesson_item_id)
  const itemContexts = await fetchLearningPathItemContexts(itemIds)

  let completedItemIds = new Set<string>()
  if (options.userId && options.progressClient && itemIds.length > 0) {
    completedItemIds = new Set(
      await getCompletedLearningPathItemIdsForUser(
        options.progressClient,
        options.userId,
        itemIds,
      ),
    )
  } else if (options.guestProgressMap && itemIds.length > 0) {
    completedItemIds = resolveCompletedItemIdsFromGuestProgress(
      itemIds,
      options.guestProgressMap,
    )
  }

  const { layouts, completedCount } = resolveLessonStatuses(
    fizicaLessons,
    assignmentsByLesson,
    itemContexts,
    completedItemIds,
    selectedRoute && selectedChapter
      ? { routeSlug: selectedRoute.slug, chapterSlug: selectedChapter.slug }
      : null,
  )

  const mapLessons: FizicaMapLesson[] = buildFizicaMapLessonLayouts(layouts).map((layout) => ({
    ...layout,
    fizicaLessonId: layout.id,
  }))

  const isCurrentChapterComplete = isFizicaChapterComplete(
    fizicaLessons,
    assignmentsByLesson,
    completedItemIds,
  )

  return {
    routes,
    chapters,
    selectedRoute,
    selectedChapter,
    nextChapter,
    lessons: mapLessons,
    completedLessonCount: completedCount,
    isCurrentChapterComplete,
  }
}

export async function fetchFizicaMapAdminTree(): Promise<{
  routes: FizicaRoute[]
  chapters: FizicaChapter[]
  lessons: FizicaLesson[]
  assignments: FizicaLessonItemAssignment[]
}> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return { routes: [], chapters: [], lessons: [], assignments: [] }
  }

  const { data: routes } = await supabase
    .from("fizica_routes")
    .select("id, slug, title, order_index, is_active")
    .order("order_index", { ascending: true })

  const { data: chapters } = await supabase
    .from("fizica_chapters")
    .select("id, route_id, slug, title, order_index, is_active")
    .order("order_index", { ascending: true })

  const { data: lessons } = await supabase
    .from("fizica_lessons")
    .select("id, chapter_id, title, duration_minutes, lesson_type, order_index, is_active")
    .order("order_index", { ascending: true })

  const { data: assignments } = await supabase
    .from("fizica_lesson_items")
    .select("id, fizica_lesson_id, learning_path_lesson_item_id, order_index")
    .order("order_index", { ascending: true })

  return {
    routes: (routes ?? []) as FizicaRoute[],
    chapters: (chapters ?? []) as FizicaChapter[],
    lessons: (lessons ?? []) as FizicaLesson[],
    assignments: (assignments ?? []) as FizicaLessonItemAssignment[],
  }
}

export function getFizicaMapHref(routeSlug: string, chapterSlug: string): string {
  return `/invata/fizica?traseu=${encodeURIComponent(routeSlug)}&capitol=${encodeURIComponent(chapterSlug)}`
}

export interface FizicaMapAssignmentItemRoute {
  chapterSlug: string
  lessonSlug: string
  itemIndex: number
}

export interface FizicaMapItemNavigation {
  nextItemHref: string
  prevItemHref: string | null
  isLastItemInAssignment: boolean
  assignmentItems: FizicaMapAssignmentItemRoute[]
  assignmentItemIds: string[]
  fizicaLessonTotalElo: number
}

async function resolveFizicaMapAssignmentData(
  context: FizicaMapItemContext,
): Promise<{
  assignmentItems: FizicaMapAssignmentItemRoute[]
  orderedContexts: LearningPathItemContext[]
} | null> {
  const assignments = await fetchLessonItemAssignments([context.fizicaLessonId])
  if (assignments.length === 0) return null

  const itemIds = assignments.map((assignment) => assignment.learning_path_lesson_item_id)
  const itemContexts = await fetchLearningPathItemContexts(itemIds)
  const orderedContexts = assignments
    .map((assignment) => itemContexts.get(assignment.learning_path_lesson_item_id))
    .filter((entry): entry is LearningPathItemContext => entry != null)

  if (orderedContexts.length === 0) return null

  const assignmentItems = orderedContexts.map((entry) => {
    const { chapterSegment, lessonSegment } = getLearningPathRouteSegments(entry.chapter, entry.lesson)
    return {
      chapterSlug: chapterSegment,
      lessonSlug: lessonSegment,
      itemIndex: entry.itemIndex + 1,
    }
  })

  return { assignmentItems, orderedContexts }
}

export async function resolveFizicaMapItemNavigation(
  currentLearningPathItemId: string,
  context: FizicaMapItemContext,
): Promise<FizicaMapItemNavigation | null> {
  const assignmentData = await resolveFizicaMapAssignmentData(context)
  if (!assignmentData) return null

  const { assignmentItems, orderedContexts } = assignmentData
  const currentIndex = orderedContexts.findIndex(
    (entry) => entry.item.id === currentLearningPathItemId,
  )
  if (currentIndex < 0) return null

  const isLastItemInAssignment = currentIndex >= orderedContexts.length - 1
  const nextItemHref = isLastItemInAssignment
    ? buildFizicaMapReturnAfterLessonHref(
        context.routeSlug,
        context.chapterSlug,
        context.fizicaLessonId,
      )
    : appendFizicaMapItemQuery(
        getLearningPathItemHref(
          orderedContexts[currentIndex + 1].chapter,
          orderedContexts[currentIndex + 1].lesson,
          orderedContexts[currentIndex + 1].itemIndex,
        ),
        context,
      )

  const prevItemHref =
    currentIndex > 0
      ? appendFizicaMapItemQuery(
          getLearningPathItemHref(
            orderedContexts[currentIndex - 1].chapter,
            orderedContexts[currentIndex - 1].lesson,
            orderedContexts[currentIndex - 1].itemIndex,
          ),
          context,
        )
      : null

  return {
    nextItemHref,
    prevItemHref,
    isLastItemInAssignment,
    assignmentItems,
    assignmentItemIds: orderedContexts.map((entry) => entry.item.id),
    fizicaLessonTotalElo: computeLearningPathLessonEloTotal(
      orderedContexts.map((entry) => entry.item),
    ),
  }
}

export function getLearningPathItemLabel(
  item: LearningPathLessonItem,
  lesson?: LearningPathLesson | null,
  chapter?: LearningPathChapter | null,
): string {
  if (item.title?.trim()) return item.title.trim()
  if (lesson?.title?.trim()) return `${lesson.title} · ${item.item_type}`
  if (chapter?.title?.trim()) return `${chapter.title} · ${item.item_type}`
  return `${item.item_type} (${item.id.slice(0, 8)})`
}
