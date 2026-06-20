"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
} from "react"
import { ro } from "date-fns/locale"
import { eachDayOfInterval, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns"
import { DayPicker, type DayButtonProps } from "react-day-picker"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  FIZICA_CALENDAR_EVENT_TYPES,
  type FizicaCalendarEventType,
} from "@/lib/invata-fizica-config"
import {
  buildFizicaCalendarEventsMap,
  fetchFizicaCalendarEventsForRange,
  formatFizicaEventTime,
  getFizicaCalendarDefaultRange,
  getMonthRange,
  hexToRgba,
  toFizicaCalendarDateKey,
  type FizicaCalendarEvent,
} from "@/lib/supabase-fizica-calendar"

interface FizicaCalendarCardProps {
  initialEvents: FizicaCalendarEvent[]
  variant?: "desktop" | "mobile"
  className?: string
}

const EventsMapContext = createContext<Map<string, FizicaCalendarEvent>>(new Map())
const CalendarExpandedContext = createContext(false)

const WEEKDAY_LABELS = ["Lu", "Ma", "Mi", "Jo", "Vi", "Sâ", "Du"]

function EventDayPopoverContent({ event }: { event: FizicaCalendarEvent }) {
  const typeMeta = FIZICA_CALENDAR_EVENT_TYPES[event.event_type]

  return (
    <div className="space-y-2">
      <span
        className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
        style={{ backgroundColor: event.color }}
      >
        {typeMeta.label}
      </span>
      <div>
        <p className="font-semibold text-[#0b0c0f]">{event.title}</p>
        <p className="text-sm text-[#6b7280]">{formatFizicaEventTime(event.start_time)}</p>
      </div>
      {event.description ? (
        <p className="text-sm leading-relaxed text-[#374151]">{event.description}</p>
      ) : null}
    </div>
  )
}

interface EventDayCellProps {
  date: Date
  compact?: boolean
  muted?: boolean
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
}

function EventDayCell({ date, compact = false, muted = false, onClick }: EventDayCellProps) {
  const eventsMap = useContext(EventsMapContext)
  const isExpanded = useContext(CalendarExpandedContext)
  const dateKey = toFizicaCalendarDateKey(date)
  const event = eventsMap.get(dateKey)
  const isToday = toFizicaCalendarDateKey(new Date()) === dateKey

  const baseClassName = cn(
    buttonVariants({ variant: "ghost" }),
    "relative overflow-hidden p-0 font-normal",
    compact ? "h-6 w-6 rounded-md" : isExpanded ? "h-11 w-11" : "h-9 w-9",
    muted && "text-[#9ca3af]",
    isToday && !event && "bg-[#f3f4f6] font-semibold text-[#0b0c0f]",
  )

  const dayContent = (
    <>
      {event ? (
        <>
          <span
            className="absolute inset-0"
            style={{ backgroundColor: hexToRgba(event.color, 0.18) }}
            aria-hidden
          />
          {event.image_url ? (
            <img
              src={event.image_url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              aria-hidden
            />
          ) : null}
        </>
      ) : null}
      <span className="relative z-[1] flex flex-col items-center leading-none">
        <span className={cn(compact ? "text-[10px]" : "text-sm", isExpanded && !compact && "text-base")}>
          {date.getDate()}
        </span>
        {event && !compact ? (
          <span className={cn("mt-0.5 font-medium text-[#374151]", isExpanded ? "text-[10px]" : "text-[9px]")}>
            {formatFizicaEventTime(event.start_time)}
          </span>
        ) : null}
      </span>
    </>
  )

  const handleClick = (clickEvent: React.MouseEvent<HTMLButtonElement>) => {
    if (event) {
      clickEvent.stopPropagation()
    }
    onClick?.(clickEvent)
  }

  if (!event) {
    return (
      <button
        type="button"
        className={baseClassName}
        aria-label={`${date.getDate()} ${date.toLocaleDateString("ro-RO", { month: "long" })}`}
        onClick={handleClick}
      >
        {dayContent}
      </button>
    )
  }

  const typeLabel = FIZICA_CALENDAR_EVENT_TYPES[event.event_type as FizicaCalendarEventType].label

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={baseClassName}
          aria-label={`${typeLabel}: ${event.title}, ${formatFizicaEventTime(event.start_time)}`}
          onClick={handleClick}
        >
          {dayContent}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 border-[#0b0c0f]/10 bg-white p-4 shadow-lg"
        align="center"
        onClick={(clickEvent) => clickEvent.stopPropagation()}
      >
        <EventDayPopoverContent event={event} />
      </PopoverContent>
    </Popover>
  )
}

function FizicaEventDayButton({ day, modifiers }: DayButtonProps) {
  return <EventDayCell date={day.date} muted={modifiers.outside} />
}

function MinimizedMonthCalendar({ referenceDate }: { referenceDate: Date }) {
  const monthDays = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(referenceDate), { locale: ro })
    const gridEnd = endOfWeek(endOfMonth(referenceDate), { locale: ro })
    return eachDayOfInterval({ start: gridStart, end: gridEnd })
  }, [referenceDate])

  const monthLabel = format(referenceDate, "LLLL yyyy", { locale: ro })
  const currentMonth = referenceDate.getMonth()

  return (
    <div className="flex flex-col gap-1">
      <p className="truncate text-center text-[10px] font-semibold capitalize leading-none text-[#0b0c0f]">
        {monthLabel}
      </p>
      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAY_LABELS.map((label) => (
          <span
            key={label}
            className="flex h-4 items-center justify-center text-[8px] font-medium uppercase text-[#9ca3af]"
          >
            {label}
          </span>
        ))}
        {monthDays.map((day) => (
          <div key={day.toISOString()} className="flex items-center justify-center">
            <EventDayCell date={day} compact muted={day.getMonth() !== currentMonth} />
          </div>
        ))}
      </div>
    </div>
  )
}

function MinimizedWeekCalendar({ referenceDate }: { referenceDate: Date }) {
  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(referenceDate, { locale: ro })
    const weekEnd = endOfWeek(referenceDate, { locale: ro })
    return eachDayOfInterval({ start: weekStart, end: weekEnd })
  }, [referenceDate])

  const monthLabel = format(referenceDate, "LLLL yyyy", { locale: ro })

  return (
    <div className="flex flex-col gap-1">
      <p className="truncate text-center text-[10px] font-semibold capitalize leading-none text-[#0b0c0f]">
        {monthLabel}
      </p>
      <div className="grid grid-cols-7 gap-1">
        {weekDays.map((day, index) => (
          <div key={day.toISOString()} className="flex flex-col items-center gap-0.5">
            <span className="text-[8px] font-medium uppercase text-[#9ca3af]">
              {WEEKDAY_LABELS[index]}
            </span>
            <EventDayCell date={day} compact />
          </div>
        ))}
      </div>
    </div>
  )
}

function CalendarNavButton({
  className,
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        buttonVariants({ variant: "outline" }),
        "h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100",
        className,
      )}
      {...props}
      onClick={(event) => {
        event.stopPropagation()
        onClick?.(event)
      }}
    />
  )
}

export function FizicaCalendarCard({
  initialEvents,
  variant = "desktop",
  className,
}: FizicaCalendarCardProps) {
  const defaultRange = useMemo(() => getFizicaCalendarDefaultRange(), [])
  const today = useMemo(() => new Date(), [])
  const [isExpanded, setIsExpanded] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(() => new Date())
  const [eventsMap, setEventsMap] = useState(() => buildFizicaCalendarEventsMap(initialEvents))
  const loadedRangeRef = useRef(defaultRange)
  const fetchingRef = useRef(false)

  useEffect(() => {
    setEventsMap(buildFizicaCalendarEventsMap(initialEvents))
    loadedRangeRef.current = defaultRange
  }, [defaultRange, initialEvents])

  const mergeEvents = useCallback((events: FizicaCalendarEvent[]) => {
    setEventsMap((current) => {
      const next = new Map(current)
      for (const event of events) {
        next.set(event.event_date, event)
      }
      return next
    })
  }, [])

  const ensureMonthLoaded = useCallback(
    async (month: Date) => {
      const monthRange = getMonthRange(month.getFullYear(), month.getMonth())
      const { startDate, endDate } = loadedRangeRef.current

      if (monthRange.startDate >= startDate && monthRange.endDate <= endDate) {
        return
      }

      if (fetchingRef.current) return
      fetchingRef.current = true

      try {
        const fetchStart =
          monthRange.startDate < startDate ? monthRange.startDate : startDate
        const fetchEnd = monthRange.endDate > endDate ? monthRange.endDate : endDate
        const events = await fetchFizicaCalendarEventsForRange(fetchStart, fetchEnd)
        mergeEvents(events)
        loadedRangeRef.current = { startDate: fetchStart, endDate: fetchEnd }
      } finally {
        fetchingRef.current = false
      }
    },
    [mergeEvents],
  )

  const handleMonthChange = useCallback(
    (month: Date) => {
      if (!isExpanded) return
      setCurrentMonth(month)
      void ensureMonthLoaded(month)
    },
    [ensureMonthLoaded, isExpanded],
  )

  const handleToggleExpanded = useCallback(() => {
    setIsExpanded((current) => {
      const next = !current
      if (next) {
        setCurrentMonth(new Date())
      }
      return next
    })
  }, [])

  return (
    <EventsMapContext.Provider value={eventsMap}>
      <CalendarExpandedContext.Provider value={isExpanded}>
        <div
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "Restrânge calendarul" : "Extinde calendarul"}
          onClick={handleToggleExpanded}
          className={cn(
            "cursor-pointer rounded-2xl border border-[#0b0c0f]/10 bg-white shadow-[0_8px_32px_-12px_rgba(11,12,15,0.18)] transition-[transform,width,box-shadow] duration-300 ease-out",
            variant === "desktop" && "absolute top-5 right-5 z-20 hidden lg:block",
            variant === "desktop" &&
              (isExpanded
                ? "w-[400px] shadow-[0_16px_48px_-12px_rgba(11,12,15,0.24)]"
                : "w-[196px]"),
            variant === "mobile" && "mx-auto w-full",
            variant === "mobile" &&
              isExpanded &&
              "shadow-[0_16px_48px_-12px_rgba(11,12,15,0.24)]",
            !isExpanded &&
              "[@media(hover:hover)_and_(pointer:fine)]:hover:scale-[1.03] [@media(hover:hover)_and_(pointer:fine)]:hover:shadow-[0_12px_36px_-12px_rgba(11,12,15,0.22)]",
            className,
          )}
        >
          <div className={cn("select-none", isExpanded ? "p-4" : "px-2 py-1.5")}>
            {isExpanded ? (
              <DayPicker
                mode="single"
                locale={ro}
                month={currentMonth}
                onMonthChange={handleMonthChange}
                showOutsideDays
                className="p-0 text-base"
                classNames={{
                  months: "flex flex-col",
                  month: "space-y-3",
                  caption: "relative flex items-center justify-center pt-1",
                  caption_label: "text-base font-semibold text-[#0b0c0f]",
                  nav: "flex items-center gap-1",
                  nav_button_previous: "absolute left-0",
                  nav_button_next: "absolute right-0",
                  table: "w-full border-collapse",
                  head_row: "flex",
                  head_cell: "flex-1 text-center text-xs font-medium text-[#9ca3af]",
                  row: "mt-1 flex w-full",
                  cell: "relative flex h-11 flex-1 items-center justify-center p-0 text-center",
                  day: "h-full w-full p-0 text-sm font-normal",
                  day_outside: "text-[#9ca3af]",
                  day_hidden: "invisible",
                }}
                components={{
                  DayButton: FizicaEventDayButton,
                  Chevron: ({ orientation, ...props }) =>
                    orientation === "left" ? (
                      <ChevronLeft className="h-4 w-4" {...props} />
                    ) : (
                      <ChevronRight className="h-4 w-4" {...props} />
                    ),
                  PreviousMonthButton: CalendarNavButton,
                  NextMonthButton: CalendarNavButton,
                }}
              />
            ) : variant === "mobile" ? (
              <MinimizedWeekCalendar referenceDate={today} />
            ) : (
              <MinimizedMonthCalendar referenceDate={today} />
            )}
          </div>
        </div>
      </CalendarExpandedContext.Provider>
    </EventsMapContext.Provider>
  )
}
