import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { 
  Mic, 
  MicOff, 
  MessageSquare, 
  Send, 
  Camera,
  CameraOff,
  AlertTriangle,
  Clock,
  GitBranch
} from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import Webcam from 'react-webcam'
import { useAudioRecorder } from 'react-audio-voice-recorder'
import { studentApi, interviewApi, ttsApi, getApiErrorMessage } from '../../utils/api'
import { detectPeopleAndPhonesFromElement } from '../../utils/proctorDetector'
import { detectLookAwayFromElement } from '../../utils/lookAwayDetector'

type ProctorEvent = {
  type: string
  timestamp: Date
  metadata?: Record<string, any>
}

const InterviewRoom = () => {
  const { interviewId } = useParams<{ interviewId: string }>()
  const navigate = useNavigate()
  const webcamRef = useRef<Webcam>(null)

  const parsedInterviewId = Number(interviewId)
  const hasValidInterviewId = Number.isFinite(parsedInterviewId) && parsedInterviewId > 0
  
  // Interview state
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [textAnswer, setTextAnswer] = useState('')
  const [responseMode, setResponseMode] = useState<'voice' | 'text'>('text')
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [responseStartTime, setResponseStartTime] = useState<number>(0)
  const [isProctoringActive, setIsProctoringActive] = useState(false)

  // FollowUpAgent: show a "thinking" indicator while the agent generates the next question
  const [isAgentThinking, setIsAgentThinking] = useState(false)

  // Confirmation dialogs
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false)

  // Voice answer review (replay + transcript before moving on)
  const [isReviewingVoiceAnswer, setIsReviewingVoiceAnswer] = useState(false)
  // Lock the current question during the voice flow so live-status polling / TTS
  // cannot switch the UI to the next question until the student clicks Next.
  const [isVoiceQuestionLocked, setIsVoiceQuestionLocked] = useState(false)
  const [reviewAudioUrl, setReviewAudioUrl] = useState<string | null>(null)
  const [reviewTranscript, setReviewTranscript] = useState<string>('')
  const [pendingNextQuestionId, setPendingNextQuestionId] = useState<number | null>(null)
  const lastVoiceBlobKeyRef = useRef<string>('')

  // Question voice playback
  const [questionAudioUrl, setQuestionAudioUrl] = useState<string | null>(null)
  const [isQuestionAudioLoading, setIsQuestionAudioLoading] = useState(false)
  const questionAudioRef = useRef<HTMLAudioElement | null>(null)
  const ttsErrorShownRef = useRef(false)
  const lastQuestionTtsKeyRef = useRef<string>('')
  
  // Proctoring state
  const [proctorWarnings, setProctorWarnings] = useState<string[]>([])
  const [tabSwitchCount, setTabSwitchCount] = useState(0)
  const [lookAwayCount, setLookAwayCount] = useState(0)
  const [multiplePeopleCount, setMultiplePeopleCount] = useState(0)
  const [mobilePhoneCount, setMobilePhoneCount] = useState(0)
  const proctorEventsRef = useRef<ProctorEvent[]>([])
  const lastFullscreenStateRef = useRef<boolean>(false)
  const proctoringAutoStartRef = useRef<boolean>(false)
  const fullscreenNudgeShownRef = useRef<boolean>(false)
  const detectionInFlightRef = useRef<boolean>(false)
  const lookAwayStateRef = useRef<'forward' | 'left' | 'right' | 'up' | 'down' | 'no_face'>('forward')
  const lookAwaySinceRef = useRef<number>(0)
  const lastLookAwayEventAtRef = useRef<number>(0)
  const lastMultiplePeopleEventAtRef = useRef<number>(0)
  const lastPhoneEventAtRef = useRef<number>(0)
  const clientTickInFlightRef = useRef<boolean>(false)

  // Prohibited keys / devtools detection throttling
  const lastProhibitedKeyAtRef = useRef<number>(0)

  // Background audio level monitoring (best-effort)
  const audioLevelRef = useRef<number | null>(null)
  const audioMonitorRef = useRef<{ stop: () => void } | null>(null)
  
  // Audio recording
  const {
    startRecording,
    stopRecording,
    recordingBlob,
    isRecording,
    recordingTime
  } = useAudioRecorder()

  // Fetch interview data
  const { data: interviewData, isLoading, refetch: refetchLiveStatus } = useQuery({
    queryKey: ['interview', parsedInterviewId],
    queryFn: () => interviewApi.getLiveStatus(parsedInterviewId),
    // Pause live-status updates while a voice answer is in review/re-record flow.
    refetchInterval: isVoiceQuestionLocked ? false : 5000,
    refetchOnWindowFocus: !isVoiceQuestionLocked,
    refetchOnReconnect: !isVoiceQuestionLocked,
    enabled: hasValidInterviewId,
  })

  // Submit answer mutation
  const submitAnswerMutation = useMutation({
    mutationFn: ({ answerData, audioFile }: { answerData: any, audioFile?: File }) => {
      setIsAgentThinking(true)
      return studentApi.submitAnswer(parsedInterviewId, answerData, audioFile)
    },
    onSuccess: (response) => {
      setIsAgentThinking(false)
      const nextQuestionId = response.data.next_question_id
      const followUpGenerated = response.data.follow_up_generated
      // For voice answers, enter review mode so the student can replay & confirm
      // before moving to the next question.
      if (responseMode === 'voice') {
        setIsVoiceQuestionLocked(true)
        setReviewTranscript(String(response.data.transcript || ''))
        setPendingNextQuestionId(nextQuestionId)
        setIsReviewingVoiceAnswer(true)
        setTextAnswer('')
        // IMPORTANT: don't refetch live status here.
        // The backend live-status calculates `current_question` from answers count,
        // which would switch the UI to the next question before the student confirms.
        return
      }

      if (nextQuestionId !== null && nextQuestionId !== undefined) {
        if (followUpGenerated) {
          toast.success('Follow-up question generated', { icon: '🔍' })
        }
        setCurrentQuestionIndex(nextQuestionId)
        setTextAnswer('')
        setResponseStartTime(Date.now())
        // Force a fresh live-status fetch so the question text updates immediately.
        refetchLiveStatus()
      } else {
        // Interview completed
        completeInterviewMutation.mutate()
      }
    },
    onError: (error: any) => {
      setIsAgentThinking(false)
      if (responseMode === 'voice') {
        setIsVoiceQuestionLocked(false)
        setIsReviewingVoiceAnswer(false)
      }
      toast.error(getApiErrorMessage(error, 'Failed to submit answer'))
    }
  })

  useEffect(() => {
    if (!interviewId) return
    if (!hasValidInterviewId) {
      toast.error('Invalid interview link. Please start the interview again.')
      navigate('/student', { replace: true })
    }
  }, [interviewId, hasValidInterviewId, navigate])

  // Complete interview mutation
  const completeInterviewMutation = useMutation({
    mutationFn: () => studentApi.completeInterview(parsedInterviewId),
    onSuccess: (response) => {
      toast.success('Interview completed successfully!')
      navigate('/student/performance', { 
        state: { completedInterview: response.data } 
      })
    },
    onError: (error: any) => {
      toast.error(getApiErrorMessage(error, 'Failed to complete interview'))
    }
  })

  // Initialize interview
  useEffect(() => {
    if (interviewData?.data) {
      setResponseStartTime(Date.now())
    }
  }, [interviewData])

  // Tab visibility change detection
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTabSwitchCount(prev => prev + 1)
        proctorEventsRef.current = [
          ...proctorEventsRef.current,
          { type: 'tab_switch', timestamp: new Date() },
        ].slice(-50)
        toast.error('Tab switching detected - stay focused on the interview')
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // Fullscreen enforcement + anti-copy / anti-right-click (proctored only)
  useEffect(() => {
    if (!interviewData?.data?.is_proctored) return

    const onFullscreenChange = () => {
      const isFs = Boolean(document.fullscreenElement)
      const wasFs = lastFullscreenStateRef.current
      lastFullscreenStateRef.current = isFs

      // If user exited fullscreen after being in it, log an incident.
      if (wasFs && !isFs) {
        proctorEventsRef.current = [
          ...proctorEventsRef.current,
          { type: 'fullscreen_exit', timestamp: new Date() },
        ].slice(-50)
        toast.error('Fullscreen exited - return to fullscreen mode')

        // Best-effort re-entry (may be blocked by browser without user gesture)
        document.documentElement.requestFullscreen().then(
          () => {
            lastFullscreenStateRef.current = true
          },
          () => {
            // ignore
          }
        )
      }
    }

    const onContextMenu = (e: Event) => {
      e.preventDefault()
      proctorEventsRef.current = [
        ...proctorEventsRef.current,
        { type: 'right_click', timestamp: new Date() },
      ].slice(-50)
      toast.error('Right click disabled during interview')
    }

    const onClipboard = (e: Event) => {
      e.preventDefault()
      const evtType = (e as any)?.type || 'copy_paste'
      proctorEventsRef.current = [
        ...proctorEventsRef.current,
        { type: evtType, timestamp: new Date() },
      ].slice(-50)
      toast.error('Copy/paste disabled during interview')
    }

    document.addEventListener('fullscreenchange', onFullscreenChange)
    document.addEventListener('contextmenu', onContextMenu)
    document.addEventListener('copy', onClipboard)
    document.addEventListener('cut', onClipboard)
    document.addEventListener('paste', onClipboard)

    const onWindowBlur = () => {
      proctorEventsRef.current = [
        ...proctorEventsRef.current,
        { type: 'window_blur', timestamp: new Date() },
      ].slice(-50)
      toast.error('Focus lost - stay on the interview')
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const key = (e.key || '').toLowerCase()
      const code = (e.code || '').toLowerCase()

      // Catch common cheating/devtools shortcuts that are possible to intercept in browser.
      // Note: OS-level shortcuts like Alt+Tab cannot be blocked.
      const ctrl = e.ctrlKey || e.metaKey
      const shift = e.shiftKey
      const alt = e.altKey

      const isDevtools =
        (key === 'f12') ||
        (ctrl && shift && (key === 'i' || key === 'j' || key === 'c')) ||
        (ctrl && (key === 'u' || key === 's' || key === 'p'))

      const isClipboard = ctrl && (key === 'c' || key === 'v' || key === 'x')
      const isPrintScreen = key === 'printscreen' || code === 'printscreen'

      const blocked = isDevtools || isClipboard || isPrintScreen
      if (!blocked) return

      const now = Date.now()
      if (now - lastProhibitedKeyAtRef.current < 750) {
        e.preventDefault()
        return
      }
      lastProhibitedKeyAtRef.current = now

      e.preventDefault()

      const comboParts = [
        ctrl ? 'Ctrl/Cmd' : null,
        alt ? 'Alt' : null,
        shift ? 'Shift' : null,
        (e.key || '').length ? e.key : e.code,
      ].filter(Boolean)

      proctorEventsRef.current = [
        ...proctorEventsRef.current,
        {
          type: 'prohibited_keys',
          timestamp: new Date(),
          metadata: {
            combo: comboParts.join('+'),
            key: e.key,
            code: e.code,
            ctrl,
            alt,
            shift,
          },
        },
      ].slice(-50)

      toast.error('Prohibited keys detected')
    }

    window.addEventListener('blur', onWindowBlur)
    window.addEventListener('keydown', onKeyDown, { capture: true })

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      document.removeEventListener('contextmenu', onContextMenu)
      document.removeEventListener('copy', onClipboard)
      document.removeEventListener('cut', onClipboard)
      document.removeEventListener('paste', onClipboard)
      window.removeEventListener('blur', onWindowBlur)
      window.removeEventListener('keydown', onKeyDown, { capture: true } as any)
    }
  }, [interviewData?.data?.is_proctored])

  // Background noise monitoring (best-effort, proctored only)
  useEffect(() => {
    if (!isProctoringActive) return

    // Don't double-start.
    if (audioMonitorRef.current) return

    let cancelled = false
    let stream: MediaStream | null = null
    let rafId: number | null = null
    let audioCtx: AudioContext | null = null
    let analyser: AnalyserNode | null = null
    let data: Uint8Array<ArrayBuffer> | null = null

    const stop = () => {
      if (rafId) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      if (stream) {
        for (const t of stream.getTracks()) {
          try { t.stop() } catch { /* ignore */ }
        }
        stream = null
      }
      if (audioCtx) {
        try { void audioCtx.close() } catch { /* ignore */ }
        audioCtx = null
      }
      analyser = null
      data = null
      audioLevelRef.current = null
      audioMonitorRef.current = null
    }

    audioMonitorRef.current = { stop }

    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (cancelled) return

        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
        const source = audioCtx.createMediaStreamSource(stream)
        analyser = audioCtx.createAnalyser()
        analyser.fftSize = 2048
        data = new Uint8Array(new ArrayBuffer(analyser.fftSize))
        source.connect(analyser)

        const loop = () => {
          if (!analyser || !data) return

          analyser.getByteTimeDomainData(data)
          let sumSq = 0
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128
            sumSq += v * v
          }
          const rms = Math.sqrt(sumSq / data.length)
          const dbfs = 20 * Math.log10(Math.max(rms, 1e-8)) // [-inf..0]
          // Convert to a 0..100-ish scale (0 very quiet, 100 very loud)
          const level = Math.max(0, Math.min(100, 100 + dbfs))
          audioLevelRef.current = level

          rafId = requestAnimationFrame(loop)
        }

        rafId = requestAnimationFrame(loop)
      } catch (err: any) {
        // Mic permission denied or not available; keep null and inform the user.
        audioLevelRef.current = null
        const isDenied =
          err?.name === 'NotAllowedError' ||
          err?.name === 'PermissionDeniedError'
        if (isDenied) {
          toast.error(
            'Microphone access denied. Please allow mic permissions for proctoring to work correctly.',
            { duration: 6000 }
          )
        }
      }
    })()

    return () => {
      cancelled = true
      stop()
    }
  }, [isProctoringActive])

  // Proctoring updates
  useEffect(() => {
    if (!isProctoringActive || !cameraEnabled) return

    const getVideo = () => {
      const wc: any = webcamRef.current
      const video = wc?.video as HTMLVideoElement | undefined
      if (!video) return null
      // HAVE_CURRENT_DATA = 2
      if ((video.readyState ?? 0) < 2) return null
      return video
    }

    // Fast client-side detection loop (instant UI incidents)
    let clientCancelled = false
    const clientTick = async () => {
      if (clientCancelled) return
      if (clientTickInFlightRef.current) return
      clientTickInFlightRef.current = true

      const video = getVideo()
      if (!video) {
        clientTickInFlightRef.current = false
        return
      }

      try {
        // Phone/person detection (best-effort)
        if (!detectionInFlightRef.current) {
          detectionInFlightRef.current = true
          try {
            const { phoneCount, personCount } = await detectPeopleAndPhonesFromElement(video)

            if (phoneCount > 0) {
              // Make the UI feel immediate by showing a local warning instantly.
              setProctorWarnings((prev) => Array.from(new Set([...(prev || []), 'Mobile phone detected'])))

              const now = Date.now()
              // Count + toast at most once per cooldown window so it reflects incidents, not frames.
              if (now - lastPhoneEventAtRef.current > 8000) {
                lastPhoneEventAtRef.current = now
                setMobilePhoneCount((prev) => prev + 1)
                toast.error('Mobile phone detected')
              }

              proctorEventsRef.current = [
                ...proctorEventsRef.current,
                { type: 'phone_detected', timestamp: new Date(), metadata: { phone_count: phoneCount } },
              ].slice(-50)
            }

            if (personCount > 1) {
              const now = Date.now()
              if (now - lastMultiplePeopleEventAtRef.current > 8000) {
                lastMultiplePeopleEventAtRef.current = now
                setMultiplePeopleCount((prev) => prev + 1)
              }
              proctorEventsRef.current = [
                ...proctorEventsRef.current,
                { type: 'multiple_persons', timestamp: new Date(), metadata: { person_count: personCount } },
              ].slice(-50)
            }
          } catch {
            // Ignore detection failures
          } finally {
            detectionInFlightRef.current = false
          }
        }

        // Look-away detection (MediaPipe FaceMesh, best-effort)
        try {
          const look = await detectLookAwayFromElement(video)
          const dir = look.direction

          const now = Date.now()
          const prev = lookAwayStateRef.current

          if (dir !== prev) {
            lookAwayStateRef.current = dir
            lookAwaySinceRef.current = now
          }

          // Log only if sustained look-away for >= 2s, with a cooldown.
          const sustainedMs = now - (lookAwaySinceRef.current || now)
          const cooldownOk = now - lastLookAwayEventAtRef.current > 8000

          if (cooldownOk && dir !== 'forward' && dir !== 'no_face' && sustainedMs >= 2000) {
            lastLookAwayEventAtRef.current = now
            setLookAwayCount((prev) => prev + 1)
            proctorEventsRef.current = [
              ...proctorEventsRef.current,
              {
                type: 'look_away',
                timestamp: new Date(),
                metadata: { direction: dir, yaw: look.yaw, pitch: look.pitch },
              },
            ].slice(-50)
          }
        } catch {
          // ignore
        }
      } finally {
        clientTickInFlightRef.current = false
      }
    }

    const clientInterval = setInterval(() => {
      void clientTick()
    }, 500)

    // Slower server upload loop (persist incidents + server-side checks)
    const serverTick = async () => {
      if (!webcamRef.current) return

      const screenshot = webcamRef.current.getScreenshot()
      const eventsToSend = proctorEventsRef.current

      try {
        const response = await interviewApi.updateProctoring({
          interview_id: parseInt(interviewId!, 10),
          frame_data: screenshot ?? undefined,
          audio_level: audioLevelRef.current ?? undefined,
          tab_switches: tabSwitchCount,
          events: eventsToSend,
          timestamp: new Date(),
        })

        if (response.data.detected_issues.length > 0) {
          const issues = response.data.detected_issues.map((issue: any) => issue.description)
          setProctorWarnings(issues)
        }

        // Clear only if the send succeeded.
        if (eventsToSend.length > 0) {
          proctorEventsRef.current = proctorEventsRef.current.slice(eventsToSend.length)
        }
      } catch (e) {
        // Proctoring upload failed silently — non-fatal
      }
    }

    const serverInterval = setInterval(() => {
      void serverTick()
    }, 5000)

    return () => {
      clientCancelled = true
      clearInterval(clientInterval)
      clearInterval(serverInterval)
    }
  }, [interviewId, cameraEnabled, tabSwitchCount, isProctoringActive])

  const requestFullscreenIfPossible = async () => {
    if (!isProctoringActive) return
    if (document.fullscreenElement) return
    try {
      await document.documentElement.requestFullscreen()
      lastFullscreenStateRef.current = true
    } catch {
      // Browser may block without user gesture; ignore.
    }
  }

  // Handle audio recording
  useEffect(() => {
    if (recordingBlob && responseMode === 'voice') {
      setIsVoiceQuestionLocked(true)

      // Prevent duplicate submissions if the recorder re-emits the same blob.
      const blobKey = `${recordingBlob.size}:${recordingBlob.type}`
      if (lastVoiceBlobKeyRef.current === blobKey) return
      lastVoiceBlobKeyRef.current = blobKey

      // Prepare local replay URL immediately.
      const url = URL.createObjectURL(recordingBlob)
      setReviewAudioUrl((prev) => {
        if (prev) {
          try {
            URL.revokeObjectURL(prev)
          } catch {
            // ignore
          }
        }
        return url
      })
      setReviewTranscript('')

      const blobType = recordingBlob.type || 'audio/webm'
      const ext = blobType.includes('wav')
        ? 'wav'
        : blobType.includes('mpeg')
          ? 'mp3'
          : blobType.includes('ogg')
            ? 'ogg'
            : 'webm'

      const audioFile = new File([recordingBlob], `response.${ext}`, { type: blobType })
      handleSubmitAnswer(audioFile)
    }
  }, [recordingBlob])

  useEffect(() => {
    return () => {
      if (reviewAudioUrl) {
        try {
          URL.revokeObjectURL(reviewAudioUrl)
        } catch {
          // ignore
        }
      }
    }
  }, [reviewAudioUrl])

  const handleSubmitAnswer = (audioFile?: File) => {
    if (!textAnswer.trim() && !audioFile) {
      toast.error('Please provide an answer')
      return
    }

    const responseTime = Math.floor((Date.now() - responseStartTime) / 1000)
    
    const answerData = {
      question_id: currentQuestionIndex,
      answer_text: textAnswer,
      response_time: responseTime
    }

    submitAnswerMutation.mutate({ answerData, audioFile })
  }

  const handleVoiceResponse = () => {
    if (isReviewingVoiceAnswer) return
    if (isRecording) {
      stopRecording()
    } else {
      setResponseMode('voice')
      startRecording()
    }
  }

  const handleReRecordVoiceAnswer = () => {
    if (submitAnswerMutation.isPending) return

    setIsReviewingVoiceAnswer(false)
    // Keep pendingNextQuestionId and keep the question locked.
    setReviewTranscript('')
    setReviewAudioUrl((prev) => {
      if (prev) {
        try {
          URL.revokeObjectURL(prev)
        } catch {
          // ignore
        }
      }
      return null
    })

    // Allow the recorder to submit again.
    lastVoiceBlobKeyRef.current = ''

    setResponseMode('voice')
    startRecording()
  }

  const handleNextQuestionAfterReview = () => {
    const nextId = pendingNextQuestionId
    setIsReviewingVoiceAnswer(false)
    setIsVoiceQuestionLocked(false)
    setPendingNextQuestionId(null)
    setReviewTranscript('')
    // Keep the audio URL around only while reviewing.
    setReviewAudioUrl((prev) => {
      if (prev) {
        try {
          URL.revokeObjectURL(prev)
        } catch {
          // ignore
        }
      }
      return null
    })

    // Stop any currently playing question audio so it doesn't overlap
    // with the next question's audio.
    if (questionAudioRef.current) {
      try {
        questionAudioRef.current.pause()
        questionAudioRef.current.currentTime = 0
      } catch {
        // ignore
      }
    }
    setQuestionAudioUrl((prev) => {
      if (prev) {
        try {
          URL.revokeObjectURL(prev)
        } catch {
          // ignore
        }
      }
      return null
    })

    if (nextId !== null && nextId !== undefined) {
      setCurrentQuestionIndex(nextId)
      setTextAnswer('')
      setResponseStartTime(Date.now())
      refetchLiveStatus()
    } else {
      completeInterviewMutation.mutate()
    }
  }

  const getCurrentQuestion = () => {
    if (!interviewData?.data?.current_question) return null
    return interviewData.data.current_question
  }

  const getProgressPercentage = () => {
    if (!interviewData?.data) return 0
    return interviewData.data.progress_percentage
  }

  const currentQuestion = getCurrentQuestion()
  const progress = getProgressPercentage()
  const isProctored = interviewData?.data?.is_proctored
  const questionsAnswered = interviewData?.data?.questions_answered ?? 0
  const totalQuestions = interviewData?.data?.total_questions ?? 0

  // Auto-enable proctoring + fullscreen when the interview starts.
  // Fullscreen requests can be blocked without a user gesture, so we:
  // 1) Try immediately (best-effort)
  // 2) Also retry on the first user interaction inside the page.
  useEffect(() => {
    if (interviewData?.data?.is_proctored && !isProctoringActive) {
      setIsProctoringActive(true)
      // Turn camera on by default for proctored interviews.
      setCameraEnabled(true)
    }
  }, [interviewData?.data?.is_proctored, isProctoringActive])

  useEffect(() => {
    if (!isProctoringActive) return
    if (proctoringAutoStartRef.current) return
    proctoringAutoStartRef.current = true

    // Best-effort initial attempt (may be blocked by the browser)
    void requestFullscreenIfPossible()

    // Camera enabled logic moved to activation effect above

    const onFirstUserGesture = async () => {
      await requestFullscreenIfPossible()
      if (!document.fullscreenElement && !fullscreenNudgeShownRef.current) {
        fullscreenNudgeShownRef.current = true
        toast.error('Please allow fullscreen to continue the proctored interview')
      }
    }

    // Any of these should count as a user gesture in most browsers.
    window.addEventListener('pointerdown', onFirstUserGesture, { once: true, capture: true })
    window.addEventListener('keydown', onFirstUserGesture, { once: true, capture: true })

    return () => {
      window.removeEventListener('pointerdown', onFirstUserGesture, { capture: true } as any)
      window.removeEventListener('keydown', onFirstUserGesture, { capture: true } as any)
    }
  }, [isProctoringActive])

  const playQuestionAudio = async () => {
    if (questionAudioRef.current) {
      try {
        questionAudioRef.current.currentTime = 0
        await questionAudioRef.current.play()
      } catch {
        // Autoplay may be blocked; ignore.
      }
    }
  }

  useEffect(() => {
    if (isVoiceQuestionLocked) return
    const text = (currentQuestion?.question || '').trim()
    if (!text) return

    // Generate audio only when the *actual question* changes.
    // Live-status refetches can recreate objects / whitespace without meaningfully changing the question.
    const questionIdPart = (currentQuestion as any)?.id ?? ''
    const questionKey = `${questionIdPart}:${text}`
    if (lastQuestionTtsKeyRef.current === questionKey) return
    lastQuestionTtsKeyRef.current = questionKey

    let cancelled = false
    setIsQuestionAudioLoading(true)

    ttsApi
      .speak(text)
      .then((res) => {
        if (cancelled) return

        const blob = new Blob([res.data], { type: 'audio/mpeg' })
        const url = URL.createObjectURL(blob)

        setQuestionAudioUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return url
        })

        // Replace the audio element to ensure it plays the latest question.
        if (questionAudioRef.current) {
          try {
            questionAudioRef.current.pause()
          } catch {
            // ignore
          }
        }

        const audio = new Audio(url)
        questionAudioRef.current = audio

        // Best-effort autoplay.
        audio.play().catch(() => {
          // Browser might block autoplay. User can click the question text to replay.
        })
      })
      .catch((err) => {
        // Don't spam toasts; show once per session.
        if (!ttsErrorShownRef.current) {
          ttsErrorShownRef.current = true
          toast.error(getApiErrorMessage(err, 'Unable to generate voice for the question'))
        }
      })
      .finally(() => {
        if (!cancelled) setIsQuestionAudioLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [isVoiceQuestionLocked, currentQuestion?.question])

  useEffect(() => {
    return () => {
      if (questionAudioRef.current) {
        try {
          questionAudioRef.current.pause()
        } catch {
          // ignore
        }
      }
      setQuestionAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }, [])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Loading interview room...</p>
        </div>
      </div>
    )
  }

  return (
    <>
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-lg font-semibold">Interview Room</h1>
              {isProctoringActive && (
                <span className="bg-red-600 px-2 py-1 rounded text-xs font-medium">
                  PROCTORED
                </span>
              )}
            </div>
            
            <div className="flex items-center space-x-6">
              <div className="text-sm text-gray-300">
                Progress: {Number(progress).toFixed(1)}%
              </div>
              <div className="flex items-center text-sm text-gray-300">
                <Clock className="h-4 w-4 mr-1" />
                {Math.floor(interviewData?.data?.elapsed_minutes || 0)}min
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Interview Area */}
          <div className="lg:col-span-2 space-y-6">
            {/* Progress Bar */}
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-300">Question {currentQuestionIndex + 1}</span>
                <span className="text-sm text-gray-300">
                  {interviewData?.data?.questions_answered || 0} of {interviewData?.data?.total_questions || 0}
                </span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>

            {/* Question Display */}
            {!currentQuestion ? (
              <div className="bg-gray-800 rounded-lg p-6 flex items-center justify-center min-h-[180px]">
                <div className="text-center text-gray-400">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400 mx-auto mb-3"></div>
                  <p className="text-sm">Loading question…</p>
                </div>
              </div>
            ) : (
              <div className="bg-gray-800 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-medium">Question</h2>
                    {(currentQuestion as any).is_followup && (
                      <span className="flex items-center gap-1 bg-indigo-600 text-white px-2 py-0.5 rounded-full text-xs font-medium">
                        <GitBranch className="h-3 w-3" />
                        Follow-up
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {isQuestionAudioLoading && (
                      <span className="text-xs text-gray-400">Generating voice…</span>
                    )}
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      currentQuestion.difficulty === 'easy' ? 'bg-green-600' :
                      currentQuestion.difficulty === 'medium' ? 'bg-yellow-600' : 'bg-red-600'
                    }`}>
                      {currentQuestion.difficulty}
                    </span>
                  </div>
                </div>
                <p
                  className="text-lg leading-relaxed mb-6 cursor-pointer"
                  onClick={playQuestionAudio}
                  title={questionAudioUrl ? 'Click to replay question audio' : undefined}
                >
                  {currentQuestion.question}
                </p>
                
                {/* Response Mode Toggle */}
                <div className="flex items-center space-x-4 mb-6">
                  <button
                    onClick={() => !isReviewingVoiceAnswer && setResponseMode('text')}
                    className={`flex items-center px-4 py-2 rounded-lg transition-colors ${
                      responseMode === 'text' 
                        ? 'bg-primary-600 text-white' 
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Text Response
                  </button>
                  <button
                    onClick={() => !isReviewingVoiceAnswer && setResponseMode('voice')}
                    className={`flex items-center px-4 py-2 rounded-lg transition-colors ${
                      responseMode === 'voice' 
                        ? 'bg-primary-600 text-white' 
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <Mic className="h-4 w-4 mr-2" />
                    Voice Response
                  </button>
                </div>

                {/* Response Input */}
                {responseMode === 'text' ? (
                  <div className="space-y-4">
                    <textarea
                      value={textAnswer}
                      onChange={(e) => setTextAnswer(e.target.value)}
                      placeholder="Type your answer here..."
                      className="w-full h-32 bg-gray-700 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    {isAgentThinking ? (
                      <div className="flex items-center gap-3 bg-indigo-900 border border-indigo-700 rounded-lg px-4 py-3">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-300 flex-shrink-0"></div>
                        <span className="text-sm text-indigo-200 font-medium">
                          AI is analyzing your answer and generating the next question…
                        </span>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleSubmitAnswer()}
                        disabled={!textAnswer.trim() || submitAnswerMutation.isPending}
                        className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Send className="h-4 w-4 mr-2" />
                        {submitAnswerMutation.isPending ? 'Submitting...' : 'Submit Answer'}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {isReviewingVoiceAnswer ? (
                      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                        <p className="text-sm text-gray-200 font-medium mb-2">Review your voice answer</p>
                        {reviewAudioUrl ? (
                          <audio controls src={reviewAudioUrl} className="w-full" />
                        ) : (
                          <p className="text-sm text-gray-400">Preparing audio…</p>
                        )}

                        <div className="mt-3">
                          <p className="text-xs font-medium text-gray-400 mb-1">Transcript</p>
                          <p className="text-sm text-gray-200 whitespace-pre-wrap">
                            {submitAnswerMutation.isPending
                              ? 'Transcribing…'
                              : (reviewTranscript || '—')}
                          </p>
                        </div>

                        <div className="mt-4 flex items-center justify-end">
                          <button
                            onClick={handleReRecordVoiceAnswer}
                            disabled={submitAnswerMutation.isPending}
                            className="btn-secondary mr-3 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Re-record
                          </button>
                          <button
                            onClick={handleNextQuestionAfterReview}
                            disabled={submitAnswerMutation.isPending}
                            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Next Question
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-center">
                          <button
                            onClick={handleVoiceResponse}
                            className={`flex items-center px-6 py-3 rounded-full text-lg font-medium transition-colors ${
                              isRecording
                                ? 'bg-red-600 hover:bg-red-700 animate-pulse'
                                : 'bg-primary-600 hover:bg-primary-700'
                            }`}
                          >
                            {isRecording ? (
                              <>
                                <MicOff className="h-5 w-5 mr-2" />
                                Stop Recording ({recordingTime}s)
                              </>
                            ) : (
                              <>
                                <Mic className="h-5 w-5 mr-2" />
                                Start Recording
                              </>
                            )}
                          </button>
                        </div>
                        {isRecording && (
                          <p className="text-center text-gray-300 text-sm">
                            Speak clearly and press "Stop Recording" when finished
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Camera Preview */}
            {isProctoringActive && (
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium">Camera Preview</h3>
                  <button
                    onClick={async () => {
                      if (!cameraEnabled) {
                        await requestFullscreenIfPossible()
                        // Pre-check camera permission before enabling
                        try {
                          const testStream = await navigator.mediaDevices.getUserMedia({ video: true })
                          testStream.getTracks().forEach((t) => t.stop())
                          setCameraEnabled(true)
                        } catch (err: any) {
                          const isDenied =
                            err?.name === 'NotAllowedError' ||
                            err?.name === 'PermissionDeniedError'
                          toast.error(
                            isDenied
                              ? 'Camera access denied. Please allow camera permissions in your browser settings.'
                              : 'Could not access camera. Make sure no other application is using it.',
                            { duration: 6000 }
                          )
                        }
                      } else {
                        setCameraEnabled(false)
                      }
                    }}
                    className={`p-2 rounded-lg ${
                      cameraEnabled ? 'bg-green-600' : 'bg-gray-600'
                    }`}
                  >
                    {cameraEnabled ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />}
                  </button>
                </div>
                {cameraEnabled ? (
                  <Webcam
                    ref={webcamRef}
                    audio={false}
                    screenshotFormat="image/jpeg"
                    screenshotQuality={0.7}
                    videoConstraints={{
                      width: 480,
                      height: 270,
                      facingMode: 'user',
                    }}
                    className="w-full rounded-lg"
                  />
                ) : (
                  <div className="bg-gray-700 h-32 rounded-lg flex items-center justify-center">
                    <p className="text-sm text-gray-400">Camera disabled</p>
                  </div>
                )}
              </div>
            )}

            {/* Proctoring Warnings */}
            {proctorWarnings.length > 0 && (
              <div className="bg-red-900 border border-red-700 rounded-lg p-4">
                <div className="flex items-center mb-2">
                  <AlertTriangle className="h-4 w-4 text-red-400 mr-2" />
                  <h3 className="font-medium text-red-200">Proctoring Alerts</h3>
                </div>
                <ul className="text-sm text-red-300 space-y-1">
                  {proctorWarnings.map((warning, index) => (
                    <li key={index}>• {warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Interview Stats */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="font-medium mb-3">Interview Stats</h3>
              <div className="space-y-2 text-sm text-gray-300">
                <div className="flex justify-between">
                  <span>Questions Answered:</span>
                  <span>{interviewData?.data?.questions_answered || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Time Elapsed:</span>
                  <span>{Math.floor(interviewData?.data?.elapsed_minutes || 0)} min</span>
                </div>
                {isProctored && (
                  <div className="flex justify-between">
                    <span>Tab Switches:</span>
                    <span className={tabSwitchCount > 3 ? 'text-red-400' : ''}>
                      {tabSwitchCount}
                    </span>
                  </div>
                )}
                {isProctored && (
                  <div className="flex justify-between">
                    <span>Look Away:</span>
                    <span className={lookAwayCount > 0 ? 'text-red-400' : ''}>{lookAwayCount}</span>
                  </div>
                )}
                {isProctored && (
                  <div className="flex justify-between">
                    <span>Multiple People:</span>
                    <span className={multiplePeopleCount > 0 ? 'text-red-400' : ''}>{multiplePeopleCount}</span>
                  </div>
                )}
                {isProctored && (
                  <div className="flex justify-between">
                    <span>Mobile Phones:</span>
                    <span className={mobilePhoneCount > 0 ? 'text-red-400' : ''}>{mobilePhoneCount}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Emergency Actions */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="font-medium mb-3">Actions</h3>
              <div className="space-y-2">
                <button
                  onClick={() => setShowCompleteConfirm(true)}
                  disabled={questionsAnswered === 0 || completeInterviewMutation.isPending}
                  title={questionsAnswered === 0 ? 'Answer at least one question before completing' : ''}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Complete Interview
                </button>
                <button
                  onClick={() => setShowExitConfirm(true)}
                  className="w-full bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Exit Interview
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Exit Interview Confirmation Dialog */}
    {showExitConfirm && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Exit interview?</h3>
          <p className="text-sm text-gray-600 mb-6">
            Your progress so far will be saved, but the interview will remain incomplete. You can continue later from Scheduled Interviews.
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowExitConfirm(false)}
              className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium"
            >
              Stay
            </button>
            <button
              onClick={() => navigate('/student')}
              className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium"
            >
              Exit anyway
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Complete Interview Confirmation Dialog */}
    {showCompleteConfirm && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Complete interview?</h3>
          <p className="text-sm text-gray-600 mb-2">
            You have answered <span className="font-semibold">{questionsAnswered}</span> of <span className="font-semibold">{totalQuestions}</span> questions.
          </p>
          {questionsAnswered < totalQuestions && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
              Completing now will skip the remaining questions. Your score will be calculated based on answers submitted so far.
            </p>
          )}
          <div className="flex justify-end gap-3 mt-4">
            <button
              onClick={() => setShowCompleteConfirm(false)}
              className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium"
            >
              Continue answering
            </button>
            <button
              onClick={() => { setShowCompleteConfirm(false); completeInterviewMutation.mutate() }}
              disabled={completeInterviewMutation.isPending}
              className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium"
            >
              {completeInterviewMutation.isPending ? 'Completing…' : 'Complete'}
            </button>
          </div>
        </div>
      </div>
    )}
  </>
  )
}

export default InterviewRoom