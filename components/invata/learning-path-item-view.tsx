"use client"

import type { LearningPathItemPayload } from "@/lib/learning-path-item-loader"
import { LessonItemShell } from "@/components/invata/lesson-item-shell"
import {
  ITEM_TYPE_LABEL,
  LearningPathItemBody,
  getItemIcon,
} from "@/components/invata/learning-path-item-body"
import { ProblemSection } from "@/components/invata/problem-section"
import { LearningPathCodingProblemSection } from "@/components/invata/learning-path-coding-problem-section"
import { LearningPathItemNavigationProvider } from "@/components/invata/learning-path-item-navigation-context"
import { LearningPathFlashcardFlowProvider } from "@/components/invata/learning-path-flashcard-flow-context"
import type { LearningPathSlideDirection } from "@/components/invata/learning-path-item-slide-container"
import { LearningPathItemEnterUp } from "@/components/invata/learning-path-item-enter-up"
import { getFizicaMapHref } from "@/lib/supabase-fizica-learning-map"

interface LearningPathItemViewProps {
  payload: LearningPathItemPayload
  goToNextItem: () => Promise<void>
  goToPrevItem: () => Promise<void>
  isNavigating: boolean
  slideDirection: LearningPathSlideDirection
  usesFizicaLessonCompletionScreen?: boolean
  animateFirstItemEntry?: boolean
}

export function LearningPathItemView({
  payload,
  goToNextItem,
  goToPrevItem,
  isNavigating,
  slideDirection,
  usesFizicaLessonCompletionScreen = false,
  animateFirstItemEntry = false,
}: LearningPathItemViewProps) {
  const {
    chapterSlug,
    lessonSlug,
    itemIndex,
    item,
    items,
    lessonId,
    lessonBaseHref,
    nextItemHref,
    initialCurrentItemCompleted,
    completedItemIdsForLesson,
    fizicaAssignmentItemIds,
    isTextLesson,
    hideBottomCta,
    overflowHidden,
    fullWidth,
    sourceLesson,
    sourceProblem,
    sourceCodingProblem,
    sourceCodingExamples,
    sourceQuizQuestion,
    isLastItem,
    lesson,
    chapter,
  } = payload

  const routeMeta = {
    chapterSlug,
    lessonSlug,
    chapterId: chapter.id,
  }

  const prevItemHref =
    payload.prevItemHref ?? (itemIndex > 1 ? `${lessonBaseHref}/${itemIndex - 1}` : null)

  const exitHref = payload.fizicaMapContext
    ? getFizicaMapHref(payload.fizicaMapContext.routeSlug, payload.fizicaMapContext.chapterSlug)
    : lessonBaseHref

  const isPoll = item.item_type === "poll"
  const isProblem =
    (item.item_type === "problem" || item.item_type === "math_problem") && !!sourceProblem
  const isCodingProblem = item.item_type === "coding_problem" && !!sourceCodingProblem
  const isSimulation = item.item_type === "simulation"
  const isTest = item.item_type === "test"
  const isCustomTextItem = item.item_type === "custom_text"
  const isCardSort = item.item_type === "card_sort"
  const isFillSlot = item.item_type === "fill_slot"
  const isMatch = item.item_type === "match"
  const isBareInteractiveItem =
    isCardSort ||
    isFillSlot ||
    isMatch ||
    item.item_type === "graph_build" ||
    item.item_type === "code_trace" ||
    item.item_type === "swipe_classify" ||
    item.item_type === "slider_explore" ||
    item.item_type === "memory_flip" ||
    item.item_type === "reveal_steps"

  const ItemIcon = getItemIcon(item.item_type)

  const navigationValue = {
    itemIndex,
    nextItemHref,
    prevItemHref,
    isLastItem,
    isNavigating,
    slideDirection,
    goToNextItem,
    goToPrevItem,
    usesFizicaLessonCompletionScreen,
    animateFirstItemEntry,
  }

  return (
    <LearningPathFlashcardFlowProvider
      currentItemId={item.id}
      goToNextItem={goToNextItem}
    >
      <LearningPathItemNavigationProvider value={navigationValue}>
        <LessonItemShell
        chapterSlug={chapterSlug}
        lessonSlug={lessonSlug}
        itemIndex={itemIndex}
        items={items}
        lessonId={lessonId}
        currentItemId={item.id}
        initialCurrentItemCompleted={initialCurrentItemCompleted}
        completedItemIdsForLesson={completedItemIdsForLesson}
        fizicaAssignmentItemIds={fizicaAssignmentItemIds}
        lessonBaseHref={lessonBaseHref}
        exitHref={exitHref}
        isTextLesson={isTextLesson}
        hideBottomCta={hideBottomCta}
        overflowHidden={overflowHidden}
        fullWidth={fullWidth}
        grilaQuestion={item.item_type === "grila" ? sourceQuizQuestion : undefined}
        chapterId={chapter.id}
        itemTitle={item.title}
      >
        {isTest ? (
          <LearningPathItemEnterUp delayIndex={1}>
            <LearningPathItemBody
              item={item}
              sourceLesson={sourceLesson}
              sourceProblem={sourceProblem}
              sourceQuizQuestion={sourceQuizQuestion}
              nextItemHref={nextItemHref}
              lessonId={lessonId}
              isLastItem={isLastItem}
              {...routeMeta}
            />
          </LearningPathItemEnterUp>
        ) : isPoll ? (
          <LearningPathItemEnterUp delayIndex={1}>
            <LearningPathItemBody
              item={item}
              sourceLesson={sourceLesson}
              sourceProblem={sourceProblem}
              sourceQuizQuestion={sourceQuizQuestion}
              nextItemHref={nextItemHref}
              lessonId={lessonId}
              isLastItem={isLastItem}
              {...routeMeta}
            />
          </LearningPathItemEnterUp>
        ) : isProblem && sourceProblem ? (
          <LearningPathItemEnterUp delayIndex={1}>
            <ProblemSection
              problem={sourceProblem}
              nextItemHref={nextItemHref}
              itemIndex={itemIndex}
              lessonId={lessonId}
              currentItemId={item.id}
              isLastItem={isLastItem}
              itemType={item.item_type}
              itemTitle={item.title}
              {...routeMeta}
            />
          </LearningPathItemEnterUp>
        ) : isCodingProblem && sourceCodingProblem ? (
          <LearningPathItemEnterUp delayIndex={1}>
            <LearningPathCodingProblemSection
              problem={sourceCodingProblem}
              examples={sourceCodingExamples}
              itemIndex={itemIndex}
              lessonId={lessonId}
              currentItemId={item.id}
              isLastItem={isLastItem}
              nextItemHref={nextItemHref}
              initialCompleted={initialCurrentItemCompleted}
            />
          </LearningPathItemEnterUp>
        ) : isCustomTextItem ? (
          <LearningPathItemEnterUp
            delayIndex={1}
            className="flex min-h-[calc(100svh-3.5rem-6.5rem)] w-full flex-col justify-center py-6 sm:py-10"
          >
            <LearningPathItemBody
              item={item}
              sourceLesson={sourceLesson}
              sourceProblem={sourceProblem}
              sourceQuizQuestion={sourceQuizQuestion}
              nextItemHref={nextItemHref}
              lessonId={lessonId}
              isLastItem={isLastItem}
              {...routeMeta}
            />
          </LearningPathItemEnterUp>
        ) : item.item_type === "grila" ? (
          <LearningPathItemEnterUp
            delayIndex={1}
            className="flex min-h-[calc(100svh-3.5rem-6.5rem)] w-full flex-col items-center justify-center py-6 sm:py-10"
          >
            <div className="w-full max-w-3xl">
              <LearningPathItemBody
                item={item}
                sourceLesson={sourceLesson}
                sourceProblem={sourceProblem}
                sourceQuizQuestion={sourceQuizQuestion}
                nextItemHref={nextItemHref}
                lessonId={lessonId}
                isLastItem={isLastItem}
                {...routeMeta}
              />
            </div>
          </LearningPathItemEnterUp>
        ) : isSimulation ? (
          <LearningPathItemEnterUp
            as="section"
            delayIndex={1}
            className="flex min-h-[calc(100svh-3.5rem-6.5rem)] w-full flex-col items-center justify-center py-6 sm:py-10"
          >
            <LearningPathItemBody
              item={item}
              sourceLesson={sourceLesson}
              sourceProblem={sourceProblem}
              sourceQuizQuestion={sourceQuizQuestion}
              nextItemHref={nextItemHref}
              lessonId={lessonId}
              isLastItem={isLastItem}
              {...routeMeta}
            />
          </LearningPathItemEnterUp>
        ) : isBareInteractiveItem ? (
          <LearningPathItemEnterUp as="section" delayIndex={1} className="mt-6 pb-2 sm:mt-8">
            <LearningPathItemBody
              item={item}
              sourceLesson={sourceLesson}
              sourceProblem={sourceProblem}
              sourceQuizQuestion={sourceQuizQuestion}
              nextItemHref={nextItemHref}
              lessonId={lessonId}
              isLastItem={isLastItem}
              {...routeMeta}
            />
          </LearningPathItemEnterUp>
        ) : (
          <LearningPathItemEnterUp
            as="section"
            delayIndex={1}
            className="mt-6 overflow-hidden rounded-[30px] border border-[#ebe4f1] bg-white shadow-[0_18px_50px_rgba(76,44,114,0.08)]"
          >
            <header className="border-b border-[#eee7f3] bg-[linear-gradient(180deg,#fcfbfe_0%,#f7f4fb_100%)] px-5 py-5 sm:px-7">
              <LearningPathItemEnterUp delayIndex={2} className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-r from-[#8b5cf6] to-[#7c3aed] text-white shadow-[0_8px_16px_rgba(124,58,237,0.24)]">
                  <ItemIcon className="h-5 w-5" />
                </div>

                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8b6fac]">
                    Pasul {itemIndex} din {items.length}
                  </p>
                  <h1 className="mt-2 text-2xl font-bold leading-tight text-[#111111] sm:text-3xl">
                    {item.title || (sourceProblem?.title ?? ITEM_TYPE_LABEL[item.item_type])}
                  </h1>
                  <p className="mt-2 text-sm text-[#6f657b]">
                    {ITEM_TYPE_LABEL[item.item_type]} din lecția {lesson.title}
                  </p>
                </div>
              </LearningPathItemEnterUp>
            </header>

            <LearningPathItemEnterUp delayIndex={3} className="px-5 py-6 sm:px-7">
              <LearningPathItemBody
                item={item}
                sourceLesson={sourceLesson}
                sourceProblem={sourceProblem}
                sourceQuizQuestion={sourceQuizQuestion}
                nextItemHref={nextItemHref}
                lessonId={lessonId}
                isLastItem={isLastItem}
                {...routeMeta}
              />
            </LearningPathItemEnterUp>
          </LearningPathItemEnterUp>
        )}
      </LessonItemShell>
      </LearningPathItemNavigationProvider>
    </LearningPathFlashcardFlowProvider>
  )
}
