"use client"

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/components/auth-provider'
import { supabase } from '@/lib/supabaseClient'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { X, Paperclip, Send, Chrome, Github, Loader2, Camera } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { FreePlanComparisonOverlay } from '@/components/invata/free-plan-comparison-overlay'
import { AnonLimitLockedContent } from '@/components/anon-limit-locked-content'
import { cn } from '@/lib/utils'
import InsightMessageArtifacts from '@/components/insight-message-artifacts'
import type { InsightMessageArtifact } from '@/lib/insight/agent/types'
import {
  INSIGHT_ATTACHMENTS_BUCKET,
  MAX_INSIGHT_ATTACHMENTS_PER_MESSAGE,
} from '@/lib/insight-attachments'
import {
  MAX_INSIGHT_ATTACHMENT_BYTES,
  prepareInsightImageForUpload,
} from '@/lib/insight-client-image'

type InsightChatImageRef = {
  storagePath: string
  /** Object URL (just sent) or signed URL (from history) */
  previewUrl: string
}

type ChatMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
  /** Vizitatori fără cont: placeholder blur-at după limită */
  anonLimitLocked?: boolean
  attachments?: InsightChatImageRef[]
  agentArtifacts?: InsightMessageArtifact[]
}

type PendingInsightImage = {
  id: string
  file: File
  preview: string
  compressedFile?: File
}

type MobileSwipeState = {
  startX: number
  startY: number
  lastX: number
  lastY: number
  startedAt: number
  horizontal: boolean
}

type PointerSwipeState = MobileSwipeState & {
  pointerId: number
}

interface InsightChatSidebarProps {
  isOpen: boolean
  onClose: () => void
  problemId: string
  problemStatement: string
  persona?: string
  embedOnDesktop?: boolean
  problemLightTheme?: boolean
  onFreePlanMessage?: () => void
  onMobileUpgradePrompt?: () => void
  /** When set, send this as the first user message as soon as the sidebar is ready (e.g. from Hint). */
  initialUserMessage?: string | null
  /** If set, this is shown in the chat as the user message instead of the full content sent to the model (e.g. "Am nevoie de un hint"). */
  initialUserMessageDisplay?: string | null
  /** Called after initialUserMessage has been sent so parent can clear it. */
  onInitialMessageSent?: () => void
  /**
   * Prefix prepended to problemStatement as hidden context for the first user message.
   * - undefined: default "Rezolva problema asta:\\n\\n" (catalog problem pages)
   * - "": use problemStatement only
   * - other: that string + "\\n\\n" + statement
   */
  problemContextPreamble?: string
  /** Light UI (same chrome as embedded problem chat) when not embedded. */
  lightChromeWhenSlideOver?: boolean
  /** With embedOnDesktop: show header close (learning path). Catalog problem page omits. */
  showCloseWhenDesktopEmbedded?: boolean
  /** Override embedded top offset (default top-16 for catalog nav). */
  embedDesktopTopClass?: string
  /** Override embedded height (default h-[calc(100dvh-4rem)]). */
  embedDesktopHeightClass?: string
  /** After slide-out `transform` transition (learning path). Catalog omits. */
  onExitAnimationComplete?: () => void
  /** Replace default problem_tutor starter chips when opening empty chat (e.g. /grile). */
  starterQuestionChips?: string[] | null
  /** Skip fade/slide-in on starter chips, context pill, and suggested questions. */
  disableEntranceAnimations?: boolean
  /** Override panel slide transition classes (embedded desktop / mobile slide-over). */
  panelSlideTransitionClass?: string
  /** User-facing label for the hidden context attached to the next message. */
  contextPreviewLabel?: string
  /** Keep page context attached to each message instead of consuming it once. */
  keepContextAfterSend?: boolean
}

interface SuggestedQuestionsProps {
  questions: string[]
  onSelect: (question: string) => void
  isLightTheme?: boolean
  disableEntranceAnimations?: boolean
}

function SuggestedQuestions({
  questions,
  onSelect,
  isLightTheme = false,
  disableEntranceAnimations = false,
}: SuggestedQuestionsProps) {
  if (!questions || questions.length === 0) return null

  return (
    <div
      className={cn(
        "flex flex-col gap-2 mt-4",
        !disableEntranceAnimations && "animate-in fade-in slide-in-from-bottom-2 duration-300",
      )}
    >
      <p className={cn("text-xs font-semibold uppercase tracking-wider ml-1 mb-1", isLightTheme ? "text-[#4b5563]" : "text-white/40")}>
        Sugestii de întrebări
      </p>
      {questions.map((q, i) => (
        <button
          key={i}
          onClick={() => onSelect(q)}
          className={cn(
            "text-left text-sm p-3 rounded-xl transition-all duration-200 shadow-sm active:scale-[0.98]",
            isLightTheme
              ? "bg-white hover:bg-[#f8fafc] border border-[#0b0d10]/12 hover:border-[#0b0d10]/20 text-[#111827]"
              : "bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white/90"
          )}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
              p: ({ node, ...props }: any) => <span {...props} />,
              code: ({ node, inline, className, children, ...props }: any) => (
                <code
                  className={cn(
                    "rounded px-1",
                    isLightTheme ? "bg-[#eef2f7] text-[#1f2937]" : "bg-white/10 text-white",
                    className || ''
                  )}
                  {...props}
                >
                  {children}
                </code>
              )
            }}
          >
            {normalizeLatexDelimiters(q)}
          </ReactMarkdown>
        </button>
      ))}
    </div>
  )
}

/** Same asset as dashboard streak card (mobile) — transparent PNG */
const INSIGHT_CHAT_ILLUSTRATION_SRC = '/streak-icon.png'

// Loading messages shown while AI is thinking
const loadingMessages = [
  'Mă gândesc la soluție…',
  'Analizez problema…',
  'Calculez răspunsul…',
  'Un moment, conectez toate ideile…',
  'Procesez informațiile… logic, desigur.',
  'Să vedem ce spune fizica despre asta…',
  'Conectez teoria cu practica…',
  'Să vedem dacă pot face fizica să sune simplu.',
]

const starterInsightCards = [
  'Explică-mi de unde să încep',
  'Ce formulă trebuie să aplic?',
  'Arată-mi rezolvarea completă',
]

const fullSolutionRequests = [
  'Vreau să văd soluția completă.',
  'Arată-mi rezolvarea completă',
]

const getRandomLoadingMessage = () => {
  return loadingMessages[Math.floor(Math.random() * loadingMessages.length)]
}

const normalizeUserPrompt = (text: string) => text.trim().toLocaleLowerCase().replace(/[.!?]+$/g, '')

const isInteractiveSidebarTarget = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return false

  return Boolean(
    target.closest(
      'button, a, input, textarea, select, [role="button"], [role="link"], [contenteditable="true"]'
    )
  )
}

// Keep $$...$$ as primary format, but also accept \[...\] and \(...\).
const normalizeLatexDelimiters = (text: string): string => {
  if (!text) return text

  const segments = text.split(/(```[\s\S]*?```)/g)

  return segments
    .map((segment) => {
      if (segment.startsWith('```') && segment.endsWith('```')) {
        return segment
      }

      return segment
        .replace(/\\\[([\s\S]*?)\\\]/g, (_match, math) => `$$${String(math).trim()}$$`)
        .replace(/\\\(([\s\S]*?)\\\)/g, (_match, math) => `$${String(math).trim()}$`)
    })
    .join('')
}

function buildProblemContextFromStatement(
  statement: string,
  preamble: string | undefined
): string | null {
  const trimmed = statement?.trim()
  if (!trimmed) return null
  if (preamble === undefined) {
    return `Rezolva problema asta:\n\n${trimmed}`
  }
  if (preamble === '') {
    return trimmed
  }
  return `${preamble}\n\n${trimmed}`
}

export default function InsightChatSidebar({
  isOpen,
  onClose,
  problemId,
  problemStatement,
  persona = 'problem_tutor',
  embedOnDesktop = false,
  problemLightTheme = false,
  onFreePlanMessage,
  onMobileUpgradePrompt,
  initialUserMessage,
  initialUserMessageDisplay,
  onInitialMessageSent,
  problemContextPreamble,
  lightChromeWhenSlideOver = false,
  showCloseWhenDesktopEmbedded = false,
  embedDesktopTopClass,
  embedDesktopHeightClass,
  onExitAnimationComplete,
  starterQuestionChips,
  disableEntranceAnimations = false,
  panelSlideTransitionClass,
  contextPreviewLabel,
  keepContextAfterSend = false,
}: InsightChatSidebarProps) {
  const { user, profile, loginWithGoogle, loginWithGitHub } = useAuth()
  const { toast } = useToast()
  const [loginLoading, setLoginLoading] = useState<'google' | 'github' | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'system',
      content: persona === 'problem_tutor'
        ? 'Ești Insight, un profesor de fizică răbdător.'
        : 'Ești Insight, un asistent inteligent pentru fizică pe planck.academy. Ajută utilizatorii să înțeleagă concepte de fizică și să rezolve probleme.',
    },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [loadingSession, setLoadingSession] = useState(true)
  const endRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const mobileSwipeRef = useRef<MobileSwipeState | null>(null)
  const pointerSwipeRef = useRef<PointerSwipeState | null>(null)
  const [textareaHeight, setTextareaHeight] = useState(40)
  const abortControllerRef = useRef<AbortController | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const [followStreamToLatest, setFollowStreamToLatest] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null)
  const [problemContext, setProblemContext] = useState<string | null>(null)
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([])
  const [premiumUpgradeOpen, setPremiumUpgradeOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [viewportModeResolved, setViewportModeResolved] = useState(false)
  const pendingStreamAnchorRef = useRef(false)
  const streamingAssistantRef = useRef<HTMLDivElement | null>(null)
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const cameraAttachmentInputRef = useRef<HTMLInputElement>(null)
  const [pendingAttachments, setPendingAttachments] = useState<PendingInsightImage[]>([])
  const [uploadingAttachments, setUploadingAttachments] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024)
    checkMobile()
    setViewportModeResolved(true)
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const isDesktopEmbedded = embedOnDesktop && viewportModeResolved && !isMobile
  // When the desktop panel can be closed (showCloseWhenDesktopEmbedded), effectiveOpen
  // follows isOpen so the panel does not initialize/stream while slid out but still mounted.
  // Otherwise (e.g. catalog problem page where the panel is always visible on desktop),
  // keep the previous behaviour so the panel stays active while embedded.
  const effectiveOpen = showCloseWhenDesktopEmbedded ? isOpen : (isOpen || isDesktopEmbedded)
  const isProblemLightTheme = Boolean(
    problemLightTheme && (isDesktopEmbedded || lightChromeWhenSlideOver)
  )

  const starterChipsToShow = useMemo(
    () => starterQuestionChips ?? starterInsightCards,
    [starterQuestionChips]
  )

  // Handle mobile keyboard resizing and prevent body scroll
  const [viewportHeight, setViewportHeight] = useState<string | undefined>(undefined)
  const [viewportOffset, setViewportOffset] = useState<number>(0)

  // Block body scroll when chat is open on mobile
  useEffect(() => {
    if (!isOpen) return

    if (isMobile) {
      // Save current scroll position and lock body scroll
      const scrollY = window.scrollY
      document.body.style.position = 'fixed'
      document.body.style.top = `-${scrollY}px`
      document.body.style.left = '0'
      document.body.style.right = '0'
      document.body.style.overflow = 'hidden'

      return () => {
        // Restore scroll position when chat closes
        document.body.style.position = ''
        document.body.style.top = ''
        document.body.style.left = ''
        document.body.style.right = ''
        document.body.style.overflow = ''
        window.scrollTo(0, scrollY)
      }
    }
  }, [isOpen, isMobile])

  useEffect(() => {
    if (!isMobile || !isOpen) {
      setViewportHeight(undefined)
      setViewportOffset(0)
      return
    }

    const handleVisualViewportResize = () => {
      if (window.visualViewport) {
        // Set height to visual viewport height 
        const height = window.visualViewport.height
        setViewportHeight(`${height}px`)

        // Calculate offset from top (when keyboard pushes content up)
        const offset = window.visualViewport.offsetTop
        setViewportOffset(offset)
      }
    }

    // Initial check
    if (window.visualViewport) {
      handleVisualViewportResize()
      window.visualViewport.addEventListener('resize', handleVisualViewportResize)
      window.visualViewport.addEventListener('scroll', handleVisualViewportResize)
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleVisualViewportResize)
        window.visualViewport.removeEventListener('scroll', handleVisualViewportResize)
      }
    }
  }, [isMobile, isOpen])

  useEffect(() => {
    if (effectiveOpen) return
    pendingStreamAnchorRef.current = false
    streamingAssistantRef.current = null
    setShouldAutoScroll(true)
    setFollowStreamToLatest(false)
  }, [effectiveOpen])


  const markdownComponents = useMemo(
    () => ({
      p: ({ node, ...props }: any) => (
        <p
          className={cn(
            "whitespace-pre-wrap break-words leading-relaxed",
            isProblemLightTheme ? "text-[#111827]" : "text-gray-200"
          )}
          {...props}
        />
      ),
      strong: ({ node, ...props }: any) => (
        <strong className={cn(isProblemLightTheme ? "text-[#0b0d10]" : "text-white")} {...props} />
      ),
      em: ({ node, ...props }: any) => (
        <em className={cn(isProblemLightTheme ? "text-[#374151]" : "text-gray-300")} {...props} />
      ),
      h1: ({ node, ...props }: any) => (
        <h1 className={cn("text-xl font-semibold", isProblemLightTheme ? "text-[#0b0d10]" : "text-white")} {...props} />
      ),
      h2: ({ node, ...props }: any) => (
        <h2 className={cn("text-lg font-semibold", isProblemLightTheme ? "text-[#0b0d10]" : "text-white")} {...props} />
      ),
      h3: ({ node, ...props }: any) => (
        <h3 className={cn("text-base font-semibold", isProblemLightTheme ? "text-[#0b0d10]" : "text-white")} {...props} />
      ),
      ul: ({ node, ordered, ...props }: any) => (
        <ul className={cn("list-disc pl-5 space-y-1", isProblemLightTheme ? "text-[#1f2937]" : "text-gray-200")} {...props} />
      ),
      ol: ({ node, ordered, ...props }: any) => (
        <ol className={cn("list-decimal pl-5 space-y-1", isProblemLightTheme ? "text-[#1f2937]" : "text-gray-200")} {...props} />
      ),
      li: ({ node, ...props }: any) => (
        <li className="leading-relaxed" {...props} />
      ),
      code: ({
        node,
        inline,
        className,
        children,
        ...props
      }: any) => (
        <code
          className={cn(
            "rounded px-1.5 py-0.5 font-mono text-[13px]",
            isProblemLightTheme ? "bg-[#eef2f7] text-[#1f2937]" : "bg-white/5 text-gray-100",
            className ?? ''
          )}
          {...props}
        >
          {children}
        </code>
      ),
    }),
    [isProblemLightTheme],
  )

  // Load session for this problem
  // NOTE: For problem pages, we don't load existing sessions - each visit starts fresh
  // Sessions are still saved for history on the dedicated chat page (/insight/chat)
  const loadProblemSession = async (accessToken: string) => {
    try {
      // Don't load existing session for problem pages
      // Always start with a fresh chat on the problem page
      // Sessions remain saved in database for history on /insight/chat page
      setSessionId(null)
      setMessages([
        {
          role: 'system',
          content: persona === 'problem_tutor'
            ? 'Ești Insight, un profesor de fizică răbdător.'
            : 'Ești Insight, un asistent inteligent pentru fizică pe planck.academy. Ajută utilizatorii să înțeleagă concepte de fizică și să rezolve probleme.',
        },
      ])
      // Also clear suggestions on session reset if any
      setSuggestedQuestions([])
      return null
    } catch (e: any) {
      console.error('Failed to load problem session:', e)
      return null
    }
  }

  // Load session messages
  const loadSessionMessages = async (sessionIdToLoad: string, accessToken: string) => {
    try {
      const res = await fetch(`/api/insight/messages?sessionId=${sessionIdToLoad}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!res.ok) {
        throw new Error('Nu am putut încărca mesajele.')
      }

      const data = await res.json()
      const loadedMessages: ChatMessage[] = await Promise.all(
        (data.messages || []).map(async (m: Record<string, unknown>) => {
          const role = m.role as 'user' | 'assistant' | 'system'
          const content = String(m.content ?? '')
          const artifacts = Array.isArray(m.agent_artifacts)
            ? (m.agent_artifacts as InsightMessageArtifact[])
            : []
          const base: ChatMessage = { role, content, agentArtifacts: artifacts }
          if (
            role === 'user' &&
            Array.isArray(m.attachments) &&
            (m.attachments as unknown[]).length > 0
          ) {
            const imgs: InsightChatImageRef[] = []
            for (const raw of m.attachments as Array<Record<string, unknown>>) {
              const bucket =
                typeof raw.bucket === 'string' ? raw.bucket : INSIGHT_ATTACHMENTS_BUCKET
              const path = typeof raw.path === 'string' ? raw.path : ''
              if (!path) continue
              const { data: signed, error } = await supabase.storage
                .from(bucket)
                .createSignedUrl(path, 3600)
              if (!error && signed?.signedUrl) {
                imgs.push({ storagePath: path, previewUrl: signed.signedUrl })
              }
            }
            if (imgs.length) base.attachments = imgs
          }
          return base
        })
      )

      setMessages([
        {
          role: 'system',
          content: persona === 'problem_tutor'
            ? 'Ești Insight, un profesor de fizică răbdător.'
            : 'Ești Insight, un asistent inteligent pentru fizică pe planck.academy. Ajută utilizatorii să înțeleagă concepte de fizică și să rezolve probleme.',
        },
        ...loadedMessages,
      ])

      // If the last message is from assistant, we might want to check for suggestions
      // But usually history doesn't persist the raw suggestions format if we strip it?
      // For now we assume history is just content.
      setSuggestedQuestions([])
    } catch (e: any) {
      console.error('Failed to load session messages:', e)
    }
  }

  const visibleMessages = useMemo(
    () => messages.filter((m) => m.role !== 'system'),
    [messages]
  )
  const hasMessages = visibleMessages.length > 0
  const userMessagesCount = visibleMessages.filter((m) => m.role === 'user').length
  const normalizedFullSolutionRequests = new Set(fullSolutionRequests.map(normalizeUserPrompt))
  const hasSolutionRequest = visibleMessages.some(
    (m) => m.role === 'user' && normalizedFullSolutionRequests.has(normalizeUserPrompt(m.content))
  )
  const canShowStarterCards =
    persona === 'problem_tutor' &&
    userMessagesCount === 0 &&
    (disableEntranceAnimations || !loadingSession) &&
    !busy &&
    effectiveOpen &&
    !initialUserMessage?.trim() &&
    starterChipsToShow.length > 0
  const lastVisibleMessage = visibleMessages.length > 0
    ? visibleMessages[visibleMessages.length - 1]
    : null
  const lastAssistantMessageIndex = useMemo(() => {
    for (let i = visibleMessages.length - 1; i >= 0; i--) {
      if (visibleMessages[i]?.role === 'assistant') return i
    }
    return -1
  }, [visibleMessages])
  const canShowSuggestions =
    !busy &&
    suggestedQuestions.length > 0 &&
    lastVisibleMessage?.role === 'assistant' &&
    !hasSolutionRequest
  const canShowSolutionButton =
    persona === 'problem_tutor' &&
    userMessagesCount >= 3 &&
    !hasSolutionRequest &&
    !busy
  const shouldShowJumpToLatest =
    hasMessages &&
    ((isStreaming && !followStreamToLatest) || (!isStreaming && !shouldAutoScroll))

  // Initialize session when sidebar opens
  useEffect(() => {
    if (!effectiveOpen) return

    if (!user) {
      const initGuest = async () => {
        setLoadingSession(true)
        try {
          if (problemStatement) {
            setProblemContext(buildProblemContextFromStatement(problemStatement, problemContextPreamble))
          }
          setTimeout(() => {
            if (window.innerWidth >= 1024) {
              textareaRef.current?.focus()
            }
          }, 100)
        } finally {
          setLoadingSession(false)
        }
      }
      void initGuest()
      return
    }

    // If we already have messages or a session active, don't re-initialize
    if (hasMessages || sessionId) {
      // Just focus if needed
      setTimeout(() => {
        if (window.innerWidth >= 1024) {
          textareaRef.current?.focus()
        }
      }, 100)
      return
    }

    const initializeSession = async () => {
      try {
        setLoadingSession(true)
        const { data: sessionData } = await supabase.auth.getSession()
        const accessToken = sessionData.session?.access_token
        if (!accessToken) {
          toast({
            title: 'Eroare',
            description: 'Necesită autentificare.',
            variant: 'destructive',
          })
          return
        }

        // Always start with a fresh session for problem pages
        // Don't load existing sessions - they remain in history but not shown here
        await loadProblemSession(accessToken)

        // Auto-fill problem statement for fresh chat as context
        if (problemStatement) {
          setProblemContext(buildProblemContextFromStatement(problemStatement, problemContextPreamble))
        }

        // Focus textarea after a short delay only on desktop
        setTimeout(() => {
          if (window.innerWidth >= 1024) {
            textareaRef.current?.focus()
          }
        }, 100)
      } catch (e: any) {
        console.error('Failed to initialize session:', e)
      } finally {
        setLoadingSession(false)
      }
    }

    initializeSession()
  }, [effectiveOpen, user, problemId, problemStatement, problemContextPreamble])

  // Reset state when problem changes
  useEffect(() => {
    setSessionId(null)
    setMessages([
      {
        role: 'system',
        content: persona === 'problem_tutor'
          ? 'Ești Insight, un profesor de fizică răbdător.'
          : 'Ești Insight, un asistent inteligent pentru fizică pe planck.academy. Ajută utilizatorii să înțeleagă concepte de fizică și să rezolve probleme.',
      },
    ])
    setInput('')
    setError(null)
    setPendingAttachments((prev) => {
      for (const p of prev) {
        if (p.preview.startsWith('blob:')) URL.revokeObjectURL(p.preview)
      }
      return []
    })
    setProblemContext(
      problemStatement
        ? buildProblemContextFromStatement(problemStatement, problemContextPreamble)
        : null
    )
  }, [problemContextPreamble, problemId, problemStatement])

  // Cleanup only on unmount
  useEffect(() => {
    return () => {
      setPendingAttachments((prev) => {
        for (const p of prev) {
          if (p.preview.startsWith('blob:')) URL.revokeObjectURL(p.preview)
        }
        return []
      })
      // Reset state when component unmounts
      setSessionId(null)
      setMessages([
        {
          role: 'system',
          content: persona === 'problem_tutor'
            ? 'Ești Insight, un profesor de fizică răbdător.'
            : 'Ești Insight, un asistent inteligent pentru fizică pe planck.academy. Ajută utilizatorii să înțeleagă concepte de fizică și să rezolve probleme.',
        },
      ])
      setInput('')
      setError(null)
      setProblemContext(null)
    }
  }, [])


  // Check if user is at bottom of messages container
  const checkIfAtBottom = useCallback(() => {
    if (!messagesContainerRef.current) return true

    const container = messagesContainerRef.current
    const threshold = 100 // pixels from bottom to consider "at bottom"
    const isAtBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < threshold

    return isAtBottom
  }, [])

  // Handle scroll events to track if user is at bottom
  const handleScroll = useCallback(() => {
    const isAtBottom = checkIfAtBottom()
    setShouldAutoScroll(isAtBottom)
    // During streaming, follow mode should only be user-explicit (jump button),
    // not re-enabled implicitly by intermediate scroll events.
    if (isStreaming && followStreamToLatest && !isAtBottom) {
      setFollowStreamToLatest(false)
    }
  }, [checkIfAtBottom, isStreaming, followStreamToLatest])

  const scrollToLatest = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      const container = messagesContainerRef.current
      if (!container) return
      container.scrollTo({
        top: container.scrollHeight,
        behavior,
      })
    },
    []
  )

  useEffect(() => {
    if (!effectiveOpen || !isStreaming || !pendingStreamAnchorRef.current) return

    const container = messagesContainerRef.current
    const anchorElement = streamingAssistantRef.current
    if (!container || !anchorElement) return

    const containerRect = container.getBoundingClientRect()
    const anchorRect = anchorElement.getBoundingClientRect()
    const targetScrollTop = container.scrollTop + (anchorRect.top - containerRect.top) - 8

    container.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: 'auto',
    })
    setShouldAutoScroll(false)
    setFollowStreamToLatest(false)
    pendingStreamAnchorRef.current = false
  }, [effectiveOpen, isStreaming, messages])

  // Auto-scroll to bottom only when user is already at bottom
  useEffect(() => {
    if (!effectiveOpen || !shouldAutoScroll) return
    if (isStreaming && !followStreamToLatest) return

    scrollToLatest(isStreaming ? 'auto' : 'smooth')
  }, [messages, busy, effectiveOpen, shouldAutoScroll, isStreaming, followStreamToLatest, scrollToLatest])

  // Function to adjust textarea height
  const adjustTextareaHeight = useCallback(() => {
    if (!textareaRef.current) return

    const textarea = textareaRef.current
    const originalMinHeight = textarea.style.minHeight
    textarea.style.minHeight = '0'
    textarea.style.height = 'auto'

    const lineHeight = 24
    const maxHeight = lineHeight * 5 // Maximum 5 rows
    const scrollHeight = textarea.scrollHeight

    textarea.style.minHeight = originalMinHeight

    if (scrollHeight <= maxHeight) {
      const newHeight = Math.max(40, scrollHeight)
      setTextareaHeight(newHeight)
      textarea.style.height = `${newHeight}px`
      textarea.style.overflowY = 'hidden'
    } else {
      setTextareaHeight(maxHeight)
      textarea.style.height = `${maxHeight}px`
      textarea.style.overflowY = 'auto'
    }
  }, [])

  useEffect(() => {
    adjustTextareaHeight()
  }, [input, adjustTextareaHeight])

  // Handle suggested question selection
  const handleSuggestionSelect = (question: string) => {
    submitMessage(question)
  }

  const handleStarterCardSelect = (question: string) => {
    submitMessage(question, question)
  }

  const revokePendingPreview = useCallback((preview: string) => {
    if (preview.startsWith('blob:')) URL.revokeObjectURL(preview)
  }, [])

  const removePendingAttachment = useCallback(
    (id: string) => {
      setPendingAttachments((prev) => {
        const found = prev.find((p) => p.id === id)
        if (found) revokePendingPreview(found.preview)
        return prev.filter((p) => p.id !== id)
      })
    },
    [revokePendingPreview]
  )

  const handleInsightAttachmentInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files?.length || !user) {
        if (!user) {
          toast({
            title: 'Cont necesar',
            description: 'Atașarea imaginilor în Insight este disponibilă doar după autentificare.',
            variant: 'destructive',
          })
        }
        e.target.value = ''
        return
      }
      const additions: PendingInsightImage[] = []
      for (let i = 0; i < files.length; i++) {
        const f = files[i]
        if (!f || !f.type.startsWith('image/')) continue
        let prepared: File
        try {
          prepared = await prepareInsightImageForUpload(f)
        } catch (err) {
          const code = err instanceof Error ? err.message : ''
          if (code === 'FILE_TOO_LARGE') {
            toast({
              title: 'Fișier prea mare',
              description: `Maxim ${Math.round(MAX_INSIGHT_ATTACHMENT_BYTES / (1024 * 1024))} MB per imagine înainte de procesare.`,
              variant: 'destructive',
            })
          } else if (code === 'INVALID_TYPE') {
            toast({
              title: 'Fișier invalid',
              description: 'Selectează doar imagini.',
              variant: 'destructive',
            })
          } else if (code === 'ENCODE_TOO_LARGE') {
            toast({
              title: 'Imaginea nu a putut fi redusă suficient',
              description: 'Încearcă o poză cu rezoluție mai mică sau mai puțin detaliu.',
              variant: 'destructive',
            })
          } else {
            toast({
              title: 'Eroare la procesarea imaginii',
              description: 'Încearcă alt format sau o imagine mai mică.',
              variant: 'destructive',
            })
          }
          continue
        }
        if (prepared.size > MAX_INSIGHT_ATTACHMENT_BYTES) {
          toast({
            title: 'Fișier prea mare',
            description: `După compresie imaginea depășește ${Math.round(MAX_INSIGHT_ATTACHMENT_BYTES / (1024 * 1024))} MB.`,
            variant: 'destructive',
          })
          continue
        }
        const preview = URL.createObjectURL(prepared)
        additions.push({
          id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
          file: f,
          compressedFile: prepared,
          preview,
        })
      }
      if (additions.length === 0) {
        e.target.value = ''
        return
      }
      setPendingAttachments((prev) => {
        const room = MAX_INSIGHT_ATTACHMENTS_PER_MESSAGE - prev.length
        if (room <= 0) {
          additions.forEach((a) => revokePendingPreview(a.preview))
          toast({
            title: 'Prea multe imagini',
            description: `Maxim ${MAX_INSIGHT_ATTACHMENTS_PER_MESSAGE} imagini per mesaj.`,
            variant: 'destructive',
          })
          return prev
        }
        const take = additions.slice(0, room)
        if (additions.length > room) {
          additions.slice(room).forEach((a) => revokePendingPreview(a.preview))
          toast({
            title: 'Prea multe imagini',
            description: `Maxim ${MAX_INSIGHT_ATTACHMENTS_PER_MESSAGE} imagini per mesaj.`,
            variant: 'destructive',
          })
        }
        return [...prev, ...take]
      })
      e.target.value = ''
    },
    [user, toast, revokePendingPreview]
  )

  const submitMessage = async (
    textOverride?: string,
    displayContentOverride?: string,
    options?: { includeProblemContext?: boolean }
  ) => {
    const textToSend = textOverride ?? input
    const contextForSend = problemContext ?? (
      options?.includeProblemContext
        ? buildProblemContextFromStatement(problemStatement, problemContextPreamble)
        : null
    )
    const attachmentsSnapshot = [...pendingAttachments]
    if ((!textToSend.trim() && !contextForSend && attachmentsSnapshot.length === 0) || busy) return

    if (!user && attachmentsSnapshot.length > 0) {
      toast({
        title: 'Cont necesar',
        description: 'Atașarea imaginilor necesită autentificare.',
        variant: 'destructive',
      })
      return
    }

    setBusy(true)
    setError(null)
    setPremiumUpgradeOpen(false)
    setIsStreaming(true)
    setSuggestedQuestions([]) // Clear suggestions when new message starts

    // Show upgrade banner logic
    const isFreePlan = !profile?.plan || profile.plan === 'free'
    const userMessageCount = messages.filter(m => m.role === 'user').length

    if (isFreePlan) {
      const isMobile = window.innerWidth < 1024

      if (isMobile) {
        // On mobile: show large card after 2 messages (so when sending the 2nd message, count is 1)
        if (userMessageCount === 1 && onMobileUpgradePrompt) {
          onMobileUpgradePrompt()
        }
      } else {
        // On desktop: show banner on first message
        if (userMessageCount === 0 && onFreePlanMessage) {
          onFreePlanMessage()
        }
      }
    }

    try {
      abortControllerRef.current?.abort()
      const controller = new AbortController()
      abortControllerRef.current = controller

      const isGuest = !user

      let accessToken: string | null = null
      if (!isGuest) {
        const { data: sessionData } = await supabase.auth.getSession()
        accessToken = sessionData.session?.access_token ?? null

        if (!accessToken) {
          toast({
            title: 'Eroare',
            description: 'Necesită autentificare.',
            variant: 'destructive',
          })
          setBusy(false)
          setIsStreaming(false)
          return
        }
      }

      let currentSessionId = sessionId
      if (!isGuest && accessToken && !currentSessionId) {
        const problemSessionTitle = `Problem: ${problemId}`
        const sessRes = await fetch('/api/insight/sessions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            title: problemSessionTitle,
          }),
        })

        if (!sessRes.ok) {
          throw new Error('Nu am putut crea sesiunea.')
        }

        const sessData = await sessRes.json()
        currentSessionId = sessData.sessionId
        setSessionId(currentSessionId)
      }

      let uploadedPaths: string[] = []
      if (!isGuest && attachmentsSnapshot.length > 0) {
        if (!currentSessionId) {
          throw new Error('Sesiunea lipsește pentru încărcarea imaginilor.')
        }
        setUploadingAttachments(true)
        try {
          const { data: userData } = await supabase.auth.getUser()
          const uid = userData.user?.id
          if (!uid) {
            throw new Error('Utilizator necunoscut.')
          }
          for (const item of attachmentsSnapshot) {
            const file = item.compressedFile ?? item.file
            const ext =
              file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
            const path = `${uid}/${currentSessionId}/${crypto.randomUUID()}.${ext}`
            const { error: upErr } = await supabase.storage
              .from(INSIGHT_ATTACHMENTS_BUCKET)
              .upload(path, file, {
                contentType: file.type || 'image/jpeg',
                upsert: false,
              })
            if (upErr) {
              throw new Error(upErr.message || 'Eroare la încărcarea imaginii.')
            }
            uploadedPaths.push(path)
          }
        } finally {
          setUploadingAttachments(false)
        }
      }

      // Combine context and input if context exists (this is what we send to the API)
      let finalContent = textToSend.trim()
      if (contextForSend) {
        finalContent = finalContent ? `${contextForSend}\n\n${finalContent}` : contextForSend
      }

      const priorForApi = messages
        .filter((m) => m.role !== 'system')
        .filter((m) => !(m.role === 'assistant' && !(m.content || '').trim()))

      const displayContent =
        displayContentOverride !== undefined && displayContentOverride !== null
          ? displayContentOverride
          : textToSend.trim()

      const attachmentRefs: InsightChatImageRef[] =
        uploadedPaths.length > 0
          ? uploadedPaths.map((path, idx) => ({
              storagePath: path,
              previewUrl: attachmentsSnapshot[idx]!.preview,
            }))
          : []

      const newUserMsg: ChatMessage = {
        role: 'user',
        content: displayContent,
        ...(attachmentRefs.length ? { attachments: attachmentRefs } : {}),
      }

      setMessages((prev) => [...prev, newUserMsg])
      if (!textOverride) setInput('')
      setPendingAttachments([])
      if (!keepContextAfterSend) {
        setProblemContext(null)
      }
      setShouldAutoScroll(true)
      setFollowStreamToLatest(false)

      // Add empty assistant message that will be updated incrementally
      streamingAssistantRef.current = null
      pendingStreamAnchorRef.current = true
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

      // Set random loading message
      setLoadingMessage(getRandomLoadingMessage())

      const fetchHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (accessToken) {
        fetchHeaders.Authorization = `Bearer ${accessToken}`
      }

      const res = await fetch('/api/insight/chat', {
        method: 'POST',
        credentials: 'include',
        headers: fetchHeaders,
        body: JSON.stringify(
          isGuest
            ? {
                messages: [...priorForApi, { role: 'user', content: finalContent }],
                persona,
              }
            : {
                sessionId: currentSessionId,
                input: finalContent,
                visibleInput: displayContent,
                persona,
                ...(uploadedPaths.length ? { attachmentPaths: uploadedPaths } : {}),
              }
        ),
        signal: controller.signal,
      })

      // Check for non-streaming errors (429, etc.)
      if (res.status === 429) {
        const data = await res.json()
        if (data.resetTime) {
          setPremiumUpgradeOpen(true)
        } else {
          setError(data.error || 'Limită zilnică atinsă.')
        }

        // Remove the user message and empty assistant message we added tentatively
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          const secondLast = prev[prev.length - 2]
          if (last?.role === 'assistant' && secondLast?.role === 'user') {
            return prev.slice(0, -2)
          }
          return prev.slice(0, -1)
        })

        pendingStreamAnchorRef.current = false
        setBusy(false)
        setIsStreaming(false)
        return
      }

      if (!res.ok) {
        const data = await res.json()
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          const secondLast = prev[prev.length - 2]
          if (last?.role === 'assistant' && secondLast?.role === 'user') {
            return prev.slice(0, -2)
          }
          return prev
        })
        throw new Error(data.error || 'Eroare la Insight.')
      }

      // Check if response is streaming (text/event-stream)
      const contentType = res.headers.get('content-type')
      if (contentType?.includes('text/event-stream')) {
        // Process streaming response
        const reader = res.body?.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let fullAssistantContent = ''

        if (!reader) {
          throw new Error('Nu s-a putut citi răspunsul.')
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))

                if (data.type === 'session' && data.sessionId) {
                  setSessionId(data.sessionId)
                } else if (data.type === 'text' && data.content) {
                  // Clear loading message when first content arrives
                  setLoadingMessage(null)
                  fullAssistantContent += data.content

                  // Parsing for suggestions
                  let displayContent = fullAssistantContent
                  const suggestionsMarker = '---SUGGESTIONS---'

                  if (fullAssistantContent.includes(suggestionsMarker)) {
                    const parts = fullAssistantContent.split(suggestionsMarker)
                    displayContent = parts[0].trim()

                    // Robust JSON extraction
                    const rawSuggestions = parts[1].trim()
                    const jsonStartIndex = rawSuggestions.indexOf('[')
                    const jsonEndIndex = rawSuggestions.lastIndexOf(']')

                    if (jsonStartIndex !== -1 && jsonEndIndex !== -1 && jsonEndIndex > jsonStartIndex) {
                      const potentialJson = rawSuggestions.substring(jsonStartIndex, jsonEndIndex + 1)
                      try {
                        const parsedSuggestions = JSON.parse(potentialJson)
                        if (Array.isArray(parsedSuggestions)) {
                          setSuggestedQuestions(parsedSuggestions)
                        }
                      } catch (e) {
                        // Incomplete JSON, ignore for now
                      }
                    }
                  }

                  // Update assistant message incrementally
                  setMessages((prev) => {
                    const newMessages = [...prev]
                    // Find the last assistant message
                    for (let i = newMessages.length - 1; i >= 0; i--) {
                      if (newMessages[i]?.role === 'assistant') {
                        newMessages[i] = {
                          ...newMessages[i],
                          role: 'assistant',
                          content: displayContent,
                        }
                        break
                      }
                    }
                    return newMessages
                  })
                } else if (data.type === 'done') {
                  if (data.anonLimitReached) {
                    setMessages((prev) => {
                      const next = [...prev]
                      for (let i = next.length - 1; i >= 0; i--) {
                        if (next[i].role === 'assistant') {
                          next[i] = { ...next[i], anonLimitLocked: true }
                          break
                        }
                      }
                      return next
                    })
                  }
                  if (Array.isArray(data.agentArtifacts) && data.agentArtifacts.length > 0) {
                    setMessages((prev) => {
                      const next = [...prev]
                      for (let i = next.length - 1; i >= 0; i--) {
                        if (next[i].role === 'assistant') {
                          next[i] = {
                            ...next[i],
                            agentArtifacts: data.agentArtifacts as InsightMessageArtifact[],
                          }
                          break
                        }
                      }
                      return next
                    })
                  }
                  // Handle final metadata if needed
                  if (!currentSessionId && data.sessionId) {
                    setSessionId(data.sessionId)
                  }
                } else if (data.type === 'error') {
                  throw new Error(data.error || 'Eroare la procesarea răspunsului.')
                }
              } catch (parseError) {
                console.error('Error parsing stream data:', parseError)
              }
            }
          }
        }
      } else {
        // Fallback for non-streaming responses (shouldn't happen, but handle gracefully)
        const data = await res.json()
        setMessages((prev) => {
          const newMessages = [...prev]
          const lastIndex = newMessages.length - 1
          if (lastIndex >= 0 && newMessages[lastIndex]?.role === 'assistant') {
            newMessages[lastIndex] = {
              ...newMessages[lastIndex],
              role: 'assistant',
              content: data.output || 'Nu am primit răspuns.',
              agentArtifacts: Array.isArray(data.agentArtifacts)
                ? (data.agentArtifacts as InsightMessageArtifact[])
                : newMessages[lastIndex]?.agentArtifacts,
            }
          }
          return newMessages
        })
      }
    } catch (e: any) {
      if (abortControllerRef.current?.signal?.aborted) {
        // Abort has already been handled by stopGeneration
        return
      }

      if (e?.name === 'AbortError') {
        return
      }

      setMessages((prev) => {
        const last = prev[prev.length - 1]
        const secondLast = prev[prev.length - 2]
        if (
          last?.role === 'assistant' &&
          secondLast?.role === 'user' &&
          !(last.content || '').trim()
        ) {
          return prev.slice(0, -2)
        }
        return prev
      })

      const errorMsg = e.message || 'Eroare la comunicarea cu Insight.'
      setError(errorMsg)
      toast({
        title: 'Eroare',
        description: errorMsg,
        variant: 'destructive',
      })
    } finally {
      abortControllerRef.current = null
      pendingStreamAnchorRef.current = false
      setBusy(false)
      setIsStreaming(false)
      setFollowStreamToLatest(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submitMessage()
    }
  }

  const initialMessageSentRef = useRef(false)
  useEffect(() => {
    if (!effectiveOpen) {
      initialMessageSentRef.current = false
      return
    }
    if (!initialUserMessage?.trim()) {
      initialMessageSentRef.current = false
      return
    }
    if (loadingSession || busy || initialMessageSentRef.current) return
    initialMessageSentRef.current = true
    const display = (initialUserMessageDisplay !== undefined && initialUserMessageDisplay !== null)
      ? initialUserMessageDisplay
      : initialUserMessage.trim()
    submitMessage(initialUserMessage.trim(), display, { includeProblemContext: true })
    onInitialMessageSent?.()
  }, [effectiveOpen, initialUserMessage, initialUserMessageDisplay, loadingSession, busy])

  const handleGoogleLogin = async () => {
    setLoginLoading('google')
    const { error, popupBlocked } = await loginWithGoogle()
    if (error) {
      toast({
        title: 'Eroare la autentificare cu Google',
        description: popupBlocked
          ? 'Permite ferestrele pop-up pentru acest site, apoi încearcă din nou.'
          : error.message,
        variant: 'destructive',
      })
    }
    setLoginLoading(null)
  }

  const handleGitHubLogin = async () => {
    setLoginLoading('github')
    const { error, popupBlocked } = await loginWithGitHub()
    if (error) {
      toast({
        title: 'Eroare la autentificare cu GitHub',
        description: popupBlocked
          ? 'Permite ferestrele pop-up pentru acest site, apoi încearcă din nou.'
          : error.message,
        variant: 'destructive',
      })
    }
    setLoginLoading(null)
  }

  const stopGeneration = useCallback(() => {
    if (!isStreaming) return

    const controller = abortControllerRef.current
    abortControllerRef.current = null

    try {
      controller?.abort()
    } catch (err) {
      console.error('Failed to abort streaming response:', err)
    }

    setIsStreaming(false)
    setFollowStreamToLatest(false)
    setBusy(false)
    setLoadingMessage(null)
    pendingStreamAnchorRef.current = false
  }, [isStreaming])

  const send = () => submitMessage()
  const isInputDisabled = busy
  const embeddedPanelSlideTransition =
    panelSlideTransitionClass ?? "transition-transform duration-300 ease-out"
  const slideOverPanelTransition =
    panelSlideTransitionClass ?? "transition-transform duration-300 ease-in-out"

  const handlePanelTransitionEnd = useCallback(
    (e: React.TransitionEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return
      if (e.propertyName !== "transform") return
      if (!isOpen && onExitAnimationComplete) {
        onExitAnimationComplete()
      }
    },
    [isOpen, onExitAnimationComplete]
  )

  const handleSidebarTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (isDesktopEmbedded || !isOpen || e.touches.length !== 1) return
      if (isInteractiveSidebarTarget(e.target)) return

      const touch = e.touches[0]
      mobileSwipeRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        lastY: touch.clientY,
        startedAt: Date.now(),
        horizontal: false,
      }
    },
    [isDesktopEmbedded, isOpen]
  )

  const handleSidebarTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const state = mobileSwipeRef.current
    if (!state || e.touches.length !== 1) return

    const touch = e.touches[0]
    state.lastX = touch.clientX
    state.lastY = touch.clientY

    const dx = state.lastX - state.startX
    const dy = state.lastY - state.startY
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)

    if (!state.horizontal && absDx > 18 && absDx > absDy * 1.25) {
      state.horizontal = true
    }

    if (state.horizontal && dx > 0) {
      e.preventDefault()
    }
  }, [])

  const handleSidebarTouchEnd = useCallback(() => {
    const state = mobileSwipeRef.current
    mobileSwipeRef.current = null
    if (!state) return

    const dx = state.lastX - state.startX
    const dy = state.lastY - state.startY
    const elapsed = Date.now() - state.startedAt
    const isFastSwipe = elapsed < 320 && dx > 64
    const isCommittedSwipe = dx > 96

    if (dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.25 && (isFastSwipe || isCommittedSwipe)) {
      onClose()
    }
  }, [onClose])

  const handleSidebarTouchCancel = useCallback(() => {
    mobileSwipeRef.current = null
  }, [])

  const handleSidebarPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType !== 'mouse' || isDesktopEmbedded || !isOpen || e.button !== 0) return
      if (isInteractiveSidebarTarget(e.target)) return

      pointerSwipeRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        startedAt: Date.now(),
        horizontal: false,
      }

      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [isDesktopEmbedded, isOpen]
  )

  const handleSidebarPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const state = pointerSwipeRef.current
    if (!state || state.pointerId !== e.pointerId) return

    state.lastX = e.clientX
    state.lastY = e.clientY

    const dx = state.lastX - state.startX
    const dy = state.lastY - state.startY
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)

    if (!state.horizontal && absDx > 18 && absDx > absDy * 1.25) {
      state.horizontal = true
    }

    if (state.horizontal && dx > 0) {
      e.preventDefault()
    }
  }, [])

  const handleSidebarPointerEnd = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const state = pointerSwipeRef.current
      if (!state || state.pointerId !== e.pointerId) return

      pointerSwipeRef.current = null

      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }

      const dx = state.lastX - state.startX
      const dy = state.lastY - state.startY
      const elapsed = Date.now() - state.startedAt
      const isFastSwipe = elapsed < 320 && dx > 64
      const isCommittedSwipe = dx > 96

      if (dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.25 && (isFastSwipe || isCommittedSwipe)) {
        onClose()
      }
    },
    [onClose]
  )

  const handleSidebarPointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerSwipeRef.current?.pointerId === e.pointerId) {
      pointerSwipeRef.current = null
    }
  }, [])

  // Prevent page scroll when hovering over sidebar
  useEffect(() => {
    if (!effectiveOpen || !sidebarRef.current || isDesktopEmbedded) return

    const handleMouseEnter = () => {
      document.body.style.overflow = 'hidden'
    }

    const handleMouseLeave = () => {
      document.body.style.overflow = ''
    }

    const sidebarElement = sidebarRef.current
    sidebarElement.addEventListener('mouseenter', handleMouseEnter)
    sidebarElement.addEventListener('mouseleave', handleMouseLeave)

    return () => {
      sidebarElement.removeEventListener('mouseenter', handleMouseEnter)
      sidebarElement.removeEventListener('mouseleave', handleMouseLeave)
      document.body.style.overflow = ''
    }
  }, [effectiveOpen, isDesktopEmbedded])

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[499] lg:hidden touch-none"
          onClick={onClose}
          onTouchMove={(e) => e.preventDefault()}
        />
      )}

      {/* Sidebar: on desktop (lg) full height and above navbar (z-[500] > navbar z-[300]); on mobile unchanged */}
      <div
        ref={sidebarRef}
        onTransitionEnd={handlePanelTransitionEnd}
        onTouchStart={handleSidebarTouchStart}
        onTouchMove={handleSidebarTouchMove}
        onTouchEnd={handleSidebarTouchEnd}
        onTouchCancel={handleSidebarTouchCancel}
        onPointerDown={handleSidebarPointerDown}
        onPointerMove={handleSidebarPointerMove}
        onPointerUp={handleSidebarPointerEnd}
        onPointerCancel={handleSidebarPointerCancel}
        className={`fixed right-0 ${
          isProblemLightTheme
            ? isDesktopEmbedded
              ? "bg-white"
              : "bg-white border-l border-[#0b0d10]/10"
            : "bg-[#101010] border-l border-white/10"
        } z-[500] flex flex-col overscroll-contain ${
          isDesktopEmbedded
            ? showCloseWhenDesktopEmbedded
              ? cn(
                  embedDesktopTopClass ?? "top-16",
                  embedDesktopHeightClass ?? "h-[calc(100dvh-4rem)]",
                  "bottom-0 w-[25vw] rounded-tl-xl rounded-bl-xl overflow-hidden",
                  embeddedPanelSlideTransition,
                  isOpen ? "translate-x-0" : "translate-x-full",
                )
              : cn(
                  embedDesktopTopClass ?? "top-16",
                  embedDesktopHeightClass ?? "h-[calc(100dvh-4rem)]",
                  "bottom-0 w-[25vw] translate-x-0 transition-none rounded-tl-xl rounded-bl-xl overflow-hidden",
                )
            : `top-0 h-dvh lg:h-dvh w-[90vw] lg:w-[25vw] ${slideOverPanelTransition} ${
                isOpen ? 'translate-x-0' : 'translate-x-full'
              }`
        }`}
        style={
          isDesktopEmbedded
            ? undefined
            : {
                maxWidth: '90vw',
                ...(isMobile && viewportHeight
                  ? {
                      height: viewportHeight,
                      top: `${viewportOffset}px`,
                    }
                  : {}),
              }
        }
      >
        {/* Header */}
        <div
          className={cn(
            'flex items-center gap-3 p-4 border-b',
            isProblemLightTheme ? 'border-[#0b0d10]/10' : 'border-white/10',
            isDesktopEmbedded && !showCloseWhenDesktopEmbedded ? 'justify-start' : 'justify-between'
          )}
        >
          <div
            className={cn(
              'flex items-center gap-3',
              !isDesktopEmbedded && 'min-w-0 flex-1',
              isDesktopEmbedded && showCloseWhenDesktopEmbedded && 'min-w-0 flex-1'
            )}
          >
            <h2 className={cn('shrink-0 font-semibold', isProblemLightTheme ? 'text-[#0b0d10]' : 'text-white')}>
              Insight Chat
            </h2>
            {userMessagesCount > 0 && (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden bg-transparent">
                <img
                  src={INSIGHT_CHAT_ILLUSTRATION_SRC}
                  alt=""
                  className="h-full w-full object-contain"
                  loading="lazy"
                />
              </div>
            )}
          </div>
          {(!isDesktopEmbedded || showCloseWhenDesktopEmbedded) && (
            <button
              type="button"
              onClick={onClose}
              className={cn(
                'group shrink-0 p-2 rounded transition-colors',
                isProblemLightTheme
                  ? 'max-lg:active:bg-transparent lg:hover:bg-[#e5e7eb]'
                  : 'max-lg:active:bg-transparent lg:hover:bg-white/10'
              )}
              aria-label="Închide chat-ul"
            >
              <X
                className={cn(
                  'w-5 h-5 transition-colors duration-150',
                  isProblemLightTheme
                    ? 'text-[#6b7280] max-lg:group-active:text-[#d1d5db]'
                    : 'text-gray-400 max-lg:group-active:text-gray-200'
                )}
              />
            </button>
          )}
        </div>

        {/* Messages Area */}
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="insight-chat-scroll flex-1 overflow-y-auto px-3 py-5 pb-48 sm:px-4 sm:py-6 sm:pb-52 lg:px-5 overscroll-contain"
        >
          {loadingSession && !disableEntranceAnimations ? (
            <div className="flex h-full items-center justify-center">
              <div className={cn(
                "flex flex-col items-center gap-3 rounded-2xl px-6 py-6",
                isProblemLightTheme ? "bg-white border border-[#0b0d10]/10 shadow-sm text-[#4b5563]" : "text-gray-400"
              )}>
                <Loader2 className={cn("h-8 w-8 animate-spin", isProblemLightTheme ? "text-[#111827]" : "text-white")} />
                <p className="text-sm">Se încarcă sesiunea Insight...</p>
              </div>
            </div>
          ) : hasMessages ? (
            <div className="space-y-5">
              {visibleMessages.map((m, i) => {
                const isAssistant = m.role === 'assistant'
                const isStreamingAssistant = isAssistant && i === lastAssistantMessageIndex
                return (
                  <div
                    key={i}
                    className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}
                  >
                    {isAssistant ? (
                      <div
                        ref={isStreamingAssistant ? (node) => {
                          streamingAssistantRef.current = node
                        } : undefined}
                        className={cn(
                          "w-full py-1.5",
                          isProblemLightTheme && "rounded-2xl border border-[#0b0d10]/10 bg-white px-4 py-3.5 shadow-sm"
                        )}
                      >
                        <div className={cn("text-xs uppercase tracking-wide mb-2", isProblemLightTheme ? "text-[#6b7280]" : "text-gray-500")}>
                          {m.content === '' && loadingMessage ? (
                            <span className="flex items-center gap-2">
                              <span className="shimmer-text">{loadingMessage}</span>
                              <span className="flex gap-1">
                                <span className="animate-pulse">●</span>
                                <span className="animate-pulse delay-75">●</span>
                                <span className="animate-pulse delay-150">●</span>
                              </span>
                            </span>
                          ) : (
                            'Insight'
                          )}
                        </div>
                        {m.content && (
                          <AnonLimitLockedContent active={Boolean(m.anonLimitLocked)}>
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm, remarkMath]}
                              rehypePlugins={[rehypeKatex]}
                              components={markdownComponents}
                              className="space-y-3 [&_.katex-display]:my-3 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:scrollbar-thin [&_.katex-display]:scrollbar-track-transparent [&_.katex-display]:scrollbar-thumb-gray-700"
                            >
                              {normalizeLatexDelimiters(m.content)}
                            </ReactMarkdown>
                          </AnonLimitLockedContent>
                        )}
                        <InsightMessageArtifacts
                          artifacts={m.agentArtifacts}
                          light={isProblemLightTheme}
                          singleColumn
                          onAnswerSelect={(answer) => void submitMessage(answer, answer)}
                        />
                      </div>
                    ) : (
                      <div
                        className={cn(
                          "max-w-[82%] lg:max-w-[74%] rounded-2xl px-4 py-3.5 shadow-sm",
                          isProblemLightTheme
                            ? "bg-[#edf1f6] border border-[#0b0d10]/10 text-[#0f172a]"
                            : "bg-[#212121] text-white"
                        )}
                      >
                        <div
                          className={cn(
                            "text-xs uppercase tracking-wide mb-2 opacity-70",
                            isProblemLightTheme ? "text-[#6b7280]" : "text-gray-400"
                          )}
                        >
                          Tu
                        </div>
                        {m.attachments && m.attachments.length > 0 && (
                          <div className="mb-3 flex flex-wrap gap-2">
                            {m.attachments.map((att) => (
                              <a
                                key={att.storagePath}
                                href={att.previewUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block shrink-0 overflow-hidden rounded-lg border border-black/10"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={att.previewUrl}
                                  alt="Atașament trimis"
                                  className="max-h-40 max-w-[200px] object-contain"
                                />
                              </a>
                            ))}
                          </div>
                        )}
                        {(m.content || '').trim() ? (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkMath]}
                          rehypePlugins={[rehypeKatex]}
                          components={markdownComponents}
                          className="space-y-3 [&_.katex-display]:my-3 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:scrollbar-thin [&_.katex-display]:scrollbar-track-transparent [&_.katex-display]:scrollbar-thumb-gray-700"
                        >
                          {normalizeLatexDelimiters(m.content)}
                        </ReactMarkdown>
                        ) : null}
                      </div>
                    )}
                  </div>
                )
              })}
              <div ref={endRef} />

              {/* Show suggestions if available and not busy */}
              {canShowSuggestions && (
                  <SuggestedQuestions
                    questions={suggestedQuestions}
                    onSelect={handleSuggestionSelect}
                    isLightTheme={isProblemLightTheme}
                    disableEntranceAnimations={disableEntranceAnimations}
                  />
                )}
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col px-4">
              {/* Spacer flex: content sits in the upper part of the free area (above composer), centered horizontally */}
              <div className="min-h-0 flex-[0.55]" aria-hidden />
              <div className="flex shrink-0 flex-col items-center justify-center">
                <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden bg-transparent sm:h-32 sm:w-32">
                  <img
                    src={INSIGHT_CHAT_ILLUSTRATION_SRC}
                    alt=""
                    className="h-full w-full object-contain"
                    loading="lazy"
                  />
                </div>
                <p
                  className={cn(
                    'mt-0 text-center text-base font-bold leading-tight',
                    isProblemLightTheme ? 'text-[#6b7280]' : 'text-gray-400'
                  )}
                >
                  Ai nevoie de un sfat?
                </p>
              </div>
              <div className="min-h-0 flex-[1]" aria-hidden />
            </div>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="pointer-events-none absolute inset-x-0 bottom-24 z-20 px-4">
            <div className={cn(
              "pointer-events-auto rounded p-2 text-sm",
              isProblemLightTheme
                ? "bg-red-50 border border-red-200 text-red-700"
                : "bg-red-900/20 border border-red-800 text-red-300"
            )}>
              {error}
            </div>
          </div>
        )}

        {/* Chatbox Area */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 isolate p-4">
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-x-0 bottom-0 z-0 h-44 sm:h-52",
              isProblemLightTheme
                ? "bg-gradient-to-t from-white via-white/95 to-transparent"
                : "bg-gradient-to-t from-black/90 via-black/50 to-transparent"
            )}
          />
          <div className="pointer-events-auto relative z-10 flex w-full flex-col">
              <>
                {shouldShowJumpToLatest && (
                  <div className="pointer-events-none absolute -top-12 right-0 z-20">
                    <button
                      onClick={() => {
                        setShouldAutoScroll(true)
                        setFollowStreamToLatest(true)
                        scrollToLatest(isStreaming ? 'auto' : 'smooth')
                      }}
                      className={cn(
                        "pointer-events-auto rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                        isProblemLightTheme
                          ? "border border-[#0b0d10]/15 bg-white text-[#111827] hover:bg-[#f8fafc]"
                          : "border border-white/15 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      Vezi ultimele mesaje
                    </button>
                  </div>
                )}

                {canShowStarterCards && (
                  <div
                    className={cn(
                      "mb-2 flex flex-col gap-2",
                      !disableEntranceAnimations && "animate-in fade-in slide-in-from-bottom-2 duration-300",
                    )}
                  >
                    {starterChipsToShow.map((cardText) => (
                      <button
                        key={cardText}
                        onClick={() => handleStarterCardSelect(cardText)}
                        className={cn(
                          "text-left text-sm rounded-xl px-3.5 py-3 transition-all duration-200 shadow-sm active:scale-[0.98]",
                          isProblemLightTheme
                            ? "bg-white hover:bg-[#f8fafc] border border-[#0b0d10]/12 hover:border-[#0b0d10]/20 text-[#111827]"
                            : "bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white/90"
                        )}
                      >
                        {cardText}
                      </button>
                    ))}
                  </div>
                )}

                {/* Context Card */}
                {problemContext && !busy && (
                  <div className={cn(
                    "flex items-center justify-between border border-b-0 rounded-t-2xl p-3 text-sm",
                    !disableEntranceAnimations && "animate-in fade-in slide-in-from-bottom-2 duration-200",
                    isProblemLightTheme
                      ? "bg-white border-[#0b0d10]/12 text-[#4b5563]"
                      : "bg-[#1a1a1a] border-white/10 text-gray-300"
                  )}>
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className={cn("text-xs font-medium uppercase flex-shrink-0", isProblemLightTheme ? "text-[#2563eb]" : "text-blue-400")}>Context:</span>
                      <p className="truncate opacity-80 text-xs">
                        {(contextPreviewLabel ?? problemContext).slice(0, 70)}...
                      </p>
                    </div>
                    <button
                      onClick={() => setProblemContext(null)}
                      className={cn(
                        "p-1 rounded-full transition-colors ml-2 flex-shrink-0",
                        isProblemLightTheme ? "hover:bg-[#f3f4f6]" : "hover:bg-white/10"
                      )}
                      title="Șterge contextul"
                    >
                      <X className={cn("w-3 h-3", isProblemLightTheme ? "text-[#6b7280]" : "text-white/50")} />
                    </button>
                  </div>
                )}

                {/* Solution Request Button */}
                {canShowSolutionButton && (
                    <div className="flex justify-end mb-0">
                      <button
                        onClick={() => submitMessage("Vreau să văd soluția completă.")}
                        className={cn(
                          "border border-b-0 rounded-t-xl px-4 py-1.5 text-xs font-semibold transition-all ml-auto mr-0 shadow-lg translate-y-[1px] z-10",
                          isProblemLightTheme
                            ? "bg-white border-[#0b0d10]/12 text-[#b45309] hover:text-[#92400e] hover:bg-[#f8fafc]"
                            : "bg-[#212121] border-white/10 text-orange-500 hover:text-orange-400 hover:bg-[#2a2a2a]"
                        )}
                      >
                        Vezi soluția
                      </button>
                    </div>
                  )}

                {/* Pending image attachments */}
                {pendingAttachments.length > 0 && !busy && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {pendingAttachments.map((p) => (
                      <div
                        key={p.id}
                        className={cn(
                          'relative inline-block overflow-hidden rounded-lg border',
                          isProblemLightTheme ? 'border-[#0b0d10]/15' : 'border-white/15'
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.preview} alt="" className="h-20 w-auto max-w-[140px] object-cover" />
                        <button
                          type="button"
                          onClick={() => removePendingAttachment(p.id)}
                          className={cn(
                            'absolute right-1 top-1 rounded-full p-0.5 shadow',
                            isProblemLightTheme ? 'bg-white/90 text-[#111827]' : 'bg-black/60 text-white'
                          )}
                          aria-label="Elimină imaginea"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Input Area */}
                <div className={`relative flex items-end gap-2 ${isProblemLightTheme ? "bg-white border border-[#0b0d10]/12" : "bg-[#212121] border border-white/10"} p-2.5 sm:p-3 shadow-lg transition-all duration-200 ${problemContext
                  ? 'rounded-b-2xl rounded-t-none border-t-0'
                  : canShowSolutionButton
                    ? 'rounded-b-2xl rounded-tr-none rounded-tl-2xl border-t-0'
                    : 'rounded-2xl'
                  }`}>
                  <input
                    ref={attachmentInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="hidden"
                    onChange={handleInsightAttachmentInput}
                  />
                  <input
                    ref={cameraAttachmentInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    className="hidden"
                    onChange={handleInsightAttachmentInput}
                  />
                  <button
                    type="button"
                    className={cn(
                      'group h-10 w-10 rounded transition-colors flex items-center justify-center flex-shrink-0 self-end',
                      isProblemLightTheme
                        ? 'max-lg:active:bg-transparent lg:hover:bg-[#f3f4f6]'
                        : 'max-lg:active:bg-transparent lg:hover:bg-gray-700',
                      (!user || busy || uploadingAttachments) && 'opacity-40 cursor-not-allowed'
                    )}
                    disabled={!user || busy || uploadingAttachments}
                    title={
                      user
                        ? `Atașează imagini (max. ${MAX_INSIGHT_ATTACHMENTS_PER_MESSAGE}, max ${Math.round(MAX_INSIGHT_ATTACHMENT_BYTES / (1024 * 1024))} MB/fișier, convertite la WebP sau JPEG)`
                        : 'Autentifică-te pentru a atașa imagini'
                    }
                    onClick={() => user && !busy && !uploadingAttachments && attachmentInputRef.current?.click()}
                  >
                    <Paperclip
                      className={cn(
                        'w-5 h-5 transition-colors duration-150',
                        isProblemLightTheme
                          ? 'text-[#6b7280] max-lg:group-active:text-[#d1d5db]'
                          : 'text-gray-400 max-lg:group-active:text-gray-200'
                      )}
                    />
                  </button>
                  {isMobile ? (
                    <button
                      type="button"
                      className={cn(
                        'group h-10 w-10 rounded transition-colors flex items-center justify-center flex-shrink-0 self-end active:bg-transparent',
                        (!user || busy || uploadingAttachments) && 'opacity-40 cursor-not-allowed'
                      )}
                      disabled={!user || busy || uploadingAttachments}
                      title={
                        user
                          ? 'Fă o poză la caiet / problemă (cameră)'
                          : 'Autentifică-te pentru a atașa imagini'
                      }
                      onClick={() =>
                        user &&
                        !busy &&
                        !uploadingAttachments &&
                        cameraAttachmentInputRef.current?.click()
                      }
                    >
                      <Camera
                        className={cn(
                          'w-5 h-5 transition-colors duration-150',
                          isProblemLightTheme
                            ? 'text-[#6b7280] group-active:text-[#d1d5db]'
                            : 'text-gray-400 group-active:text-gray-200'
                        )}
                      />
                    </button>
                  ) : null}
                  <Textarea
                    ref={textareaRef}
                    placeholder={problemContext ? (isMobile ? "Scrie..." : "Adaugă detalii sau întreabă...") : "Scrie un mesaj..."}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    rows={1}
                    className={cn(
                      "flex-1 bg-transparent border-0 resize-none focus-visible:ring-0 focus-visible:ring-offset-0 min-h-[40px] py-2",
                      isProblemLightTheme ? "text-[#111827] placeholder:text-[#6b7280]" : "text-white placeholder:text-gray-400"
                    )}
                    disabled={isInputDisabled}
                    style={{
                      height: `${textareaHeight}px`,
                      overflowY: textareaHeight > 24 * 5 ? 'auto' : 'hidden',
                    }}
                  />
                  {busy && isStreaming ? (
                    <button
                      onClick={stopGeneration}
                      aria-label="Oprește răspunsul"
                      className="h-10 w-10 rounded transition-colors flex items-center justify-center flex-shrink-0 self-end disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Oprește răspunsul"
                    >
                      <span className="flex items-center justify-center w-5 h-5">
                        <span className={cn("flex items-center justify-center w-4 h-4 rounded-full", isProblemLightTheme ? "bg-[#0f172a]" : "bg-white")}>
                          <span className={cn("w-2 h-2", isProblemLightTheme ? "bg-white" : "bg-black")} />
                        </span>
                      </span>
                    </button>
                  ) : (
                    <button
                      onClick={send}
                      aria-label="Trimite mesajul"
                      disabled={
                        isInputDisabled ||
                        uploadingAttachments ||
                        (!input.trim() && !problemContext && pendingAttachments.length === 0)
                      }
                      className={cn(
                        'group h-10 w-10 rounded transition-colors flex items-center justify-center flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed self-end',
                        isProblemLightTheme
                          ? 'max-lg:active:bg-transparent lg:hover:bg-[#f3f4f6]'
                          : 'max-lg:active:bg-transparent lg:hover:bg-gray-700'
                      )}
                    >
                      <Send
                        className={cn(
                          'w-5 h-5 transition-colors duration-150',
                          isProblemLightTheme
                            ? 'text-[#6b7280] max-lg:group-active:text-[#d1d5db]'
                            : 'text-gray-400 max-lg:group-active:text-gray-200'
                        )}
                      />
                    </button>
                  )}
                </div>
              </>
          </div>
        </div>
      </div>
      {premiumUpgradeOpen ? (
        <FreePlanComparisonOverlay onClose={() => setPremiumUpgradeOpen(false)} />
      ) : null}
    </>
  )
}
