import { Link } from 'react-router-dom'
import { Mic, Users, Shield, BarChart3, Zap, CheckCircle, FileText, Target, CalendarCheck, ArrowRight, UserPlus, LayoutGrid, MessageSquare, TrendingUp } from 'lucide-react'
import Footer from '../components/Footer'
import { useEffect, useRef, useState } from 'react'

/* ─────────────────────────────────────────────────────────────────────────────
   useReveal — re-triggers EVERY time the element enters the viewport.
───────────────────────────────────────────────────────────────────────────── */
function useReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (exitTimer.current) clearTimeout(exitTimer.current)
          setVisible(true)
        } else {
          exitTimer.current = setTimeout(() => setVisible(false), 50)
        }
      },
      { threshold, rootMargin: '0px 0px -40px 0px' }
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (exitTimer.current) clearTimeout(exitTimer.current)
    }
  }, [threshold])

  return { ref, visible }
}

/* ─────────────────────────────────────────────────────────────────────────────
   useStepReveal — per-step IntersectionObserver.
   Each step row gets its own instance so it fires exactly when THAT row
   crosses the viewport — not when the whole section does.
   Re-triggers on every scroll-in / scroll-out cycle.
───────────────────────────────────────────────────────────────────────────── */
function useStepReveal() {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (timer.current) clearTimeout(timer.current)
          setVisible(true)
        } else {
          // Small debounce — prevents snap-reset while element is still partially visible
          timer.current = setTimeout(() => setVisible(false), 60)
        }
      },
      { threshold: 0.2, rootMargin: '0px 0px -48px 0px' }
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  return { ref, visible }
}

/* ─────────────────────────────────────────────────────────────────────────────
   Reveal — wraps any content with a fade + translateY animation.
───────────────────────────────────────────────────────────────────────────── */
interface RevealProps {
  children: React.ReactNode
  delay?: number
  y?: number
  duration?: number
  easing?: string
  className?: string
  scale?: boolean
}

function Reveal({
  children,
  delay = 0,
  y = 28,
  duration = 600,
  easing = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  className = '',
  scale = false,
}: RevealProps) {
  const { ref, visible } = useReveal()
  const hiddenTransform = scale ? `translateY(${y}px) scale(0.97)` : `translateY(${y}px)`

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0) scale(1)' : hiddenTransform,
        transition: visible
          ? `opacity ${duration}ms ${easing} ${delay}ms, transform ${duration}ms ${easing} ${delay}ms`
          : `opacity 300ms ease 0ms, transform 300ms ease 0ms`,
        willChange: 'opacity, transform',
      }}
    >
      {children}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Counter — animated number that re-runs every time it enters the viewport.
───────────────────────────────────────────────────────────────────────────── */
function Counter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0)
  const { ref, visible } = useReveal(0.3)
  const raf = useRef<number | null>(null)

  useEffect(() => {
    if (raf.current) cancelAnimationFrame(raf.current)
    if (!visible) { setCount(0); return }
    const duration = 1200
    const start = performance.now()
    function tick(now: number) {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 4)
      setCount(Math.round(eased * target))
      if (progress < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [visible, target])

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>
}

/* ─────────────────────────────────────────────────────────────────────────────
   useSectionReveal — single observer for containers (PracticeSection etc.)
───────────────────────────────────────────────────────────────────────────── */
function useSectionReveal(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (timer.current) clearTimeout(timer.current)
          setVisible(true)
        } else {
          timer.current = setTimeout(() => setVisible(false), 60)
        }
      },
      { threshold, rootMargin: '0px 0px -60px 0px' }
    )
    observer.observe(el)
    return () => { observer.disconnect(); if (timer.current) clearTimeout(timer.current) }
  }, [threshold])

  return { ref, visible }
}

/* ─────────────────────────────────────────────────────────────────────────────
   ModeType
───────────────────────────────────────────────────────────────────────────── */
interface ModeType {
  title: string
  subtitle: string
  description: string
  Icon: React.ElementType
  accent: string
  accentBg: string
  tag: string
  number: string
  path: string
}

/* ─────────────────────────────────────────────────────────────────────────────
   PracticeCard
───────────────────────────────────────────────────────────────────────────── */
function PracticeCard({ mode, index, visible }: { mode: ModeType; index: number; visible: boolean }) {
  const [hovered, setHovered] = useState(false)
  const { Icon } = mode
  const enterDelay = index * 140
  const ENTER_DUR  = 650
  const ENTER_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
  const EXIT_DUR   = 250

  const baseStyle: React.CSSProperties = {
    opacity:   visible ? 1 : 0,
    transform: visible ? 'translateY(0px) scale(1)' : 'translateY(52px) scale(0.97)',
    transition: visible
      ? `opacity ${ENTER_DUR}ms ${ENTER_EASE} ${enterDelay}ms, transform ${ENTER_DUR}ms ${ENTER_EASE} ${enterDelay}ms`
      : `opacity ${EXIT_DUR}ms ease 0ms, transform ${EXIT_DUR}ms ease 0ms`,
    willChange: 'opacity, transform',
  }

  return (
    <div style={baseStyle}>
      <Link
        to={mode.path}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', flexDirection: 'column', textDecoration: 'none',
          position: 'relative', borderRadius: 20, background: '#ffffff',
          border: `1.5px solid ${hovered ? mode.accent + '50' : '#eaeff6'}`,
          boxShadow: hovered
            ? `0 24px 56px rgba(0,0,0,0.11), 0 2px 8px rgba(0,0,0,0.05)`
            : '0 1px 4px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
          transform: hovered ? 'translateY(-8px)' : 'translateY(0)',
          transition: 'border-color 350ms ease, box-shadow 400ms ease, transform 400ms cubic-bezier(0.22,1,0.36,1)',
          padding: '32px 28px 28px',
          height: '100%', cursor: 'pointer', overflow: 'hidden',
        }}
      >
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: mode.accent, borderRadius: '20px 20px 0 0',
          opacity: hovered ? 1 : 0, transition: 'opacity 350ms ease',
        }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#cbd5e1', letterSpacing: '0.05em' }}>{mode.number}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
            color: mode.accent, background: mode.accentBg, border: `1px solid ${mode.accent}25`,
            borderRadius: 100, padding: '3px 10px',
          }}>{mode.tag}</span>
        </div>
        <div style={{
          width: 52, height: 52, borderRadius: 15, background: hovered ? mode.accent : mode.accentBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
          transform: hovered ? 'scale(1.08) rotate(-4deg)' : 'scale(1) rotate(0deg)',
          transition: 'background 380ms ease, transform 420ms cubic-bezier(0.34,1.56,0.64,1)',
          boxShadow: hovered ? `0 8px 24px ${mode.accent}40` : 'none',
        }}>
          <Icon size={23} strokeWidth={1.75} style={{ color: hovered ? '#fff' : mode.accent, transition: 'color 300ms ease' }} />
        </div>
        <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6 }}>{mode.subtitle}</p>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: 12 }}>{mode.title}</h3>
        <p style={{ fontSize: '0.88rem', color: '#64748b', lineHeight: 1.75, flexGrow: 1 }}>{mode.description}</p>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginTop: 24,
          paddingTop: 18, borderTop: '1px solid #f1f5f9',
          opacity: hovered ? 1 : 0,
          transform: hovered ? 'translateX(0)' : 'translateX(-6px)',
          transition: 'opacity 300ms ease, transform 300ms ease',
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: mode.accent }}>Start practising</span>
          <ArrowRight size={13} style={{
            color: mode.accent,
            transform: hovered ? 'translateX(4px)' : 'translateX(0)',
            transition: 'transform 300ms cubic-bezier(0.34,1.56,0.64,1)',
          }} />
        </div>
      </Link>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   PracticeSection
───────────────────────────────────────────────────────────────────────────── */
function PracticeSection({ modes }: { modes: ModeType[] }) {
  const { ref, visible } = useSectionReveal(0.1)
  return (
    <div ref={ref} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {modes.map((mode, i) => (
        <PracticeCard key={i} mode={mode} index={i} visible={visible} />
      ))}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   StepType
───────────────────────────────────────────────────────────────────────────── */
interface StepType {
  step: string
  title: string
  description: string
  Icon: React.ElementType
}

/* ─────────────────────────────────────────────────────────────────────────────
   TextBlock — desktop zigzag content pane
───────────────────────────────────────────────────────────────────────────── */
interface TextBlockProps {
  item: StepType
  accent: string
  isHov: boolean
  align: 'left' | 'right'
  visible: boolean
  isLeft: boolean
  onEnter: () => void
  onLeave: () => void
}
function TextBlock({ item, accent, isHov, align, visible, isLeft, onEnter, onLeave }: TextBlockProps) {
  const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

  const style: React.CSSProperties = {
    opacity:   visible ? 1 : 0,
    transform: visible
      ? `translateX(0) translateY(${isHov ? '-5px' : '0'})`
      : `translateX(${isLeft ? '-68px' : '68px'}) translateY(10px)`,
    transition: visible
      ? `opacity 680ms ${EASE} 60ms, transform 680ms ${EASE} 60ms`
      : 'opacity 220ms ease 0ms, transform 220ms ease 0ms',
    willChange: 'opacity, transform',
    maxWidth: 400,
    textAlign: align,
    cursor: 'default',
  }

  return (
    <div style={style} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <span style={{
        fontSize: 10, fontWeight: 800, letterSpacing: '0.16em',
        textTransform: 'uppercase', color: accent,
        display: 'block', marginBottom: 10, opacity: 0.9,
      }}>
        Step {item.step}
      </span>
      <h3 style={{
        fontSize: '1.5rem', fontWeight: 700, color: '#0f172a',
        letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: 10,
      }}>
        {item.title}
      </h3>
      <p style={{ fontSize: '0.92rem', color: '#64748b', lineHeight: 1.75, margin: 0 }}>
        {item.description}
      </p>
      {/* hover underline */}
      <div style={{
        marginTop: 16, height: 2, borderRadius: 2, background: accent,
        width: isHov ? '44px' : '0px',
        transition: 'width 380ms cubic-bezier(0.22,1,0.36,1)',
        marginLeft: align === 'right' ? 'auto' : 0,
      }} />
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   StepRow — one zigzag row with its OWN IntersectionObserver.
   Fires only when this specific row enters the viewport.
   Re-triggers every time it scrolls in/out.
───────────────────────────────────────────────────────────────────────────── */
interface StepRowProps {
  item: StepType
  index: number
  accent: string
  isHov: boolean
  stepsTotal: number
  onEnter: () => void
  onLeave: () => void
}

function StepRow({ item, index, accent, isHov, stepsTotal, onEnter, onLeave }: StepRowProps) {
  const { ref, visible } = useStepReveal()
  const Icon = item.Icon
  const isLeft = index % 2 === 0   // even → text left, odd → text right

  const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

  // Node pops in with spring — starts immediately when row becomes visible
  const nodeStyle: React.CSSProperties = {
    transform: visible ? 'scale(1)' : 'scale(0)',
    transition: visible
      ? 'transform 520ms cubic-bezier(0.34, 1.56, 0.64, 1) 0ms'
      : 'transform 180ms ease 0ms',
  }

  // Watermark fades up from the opposite side
  const wmStyle: React.CSSProperties = {
    opacity:   visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(20px)',
    transition: visible
      ? `opacity 600ms ease 100ms, transform 600ms ${EASE} 100ms`
      : 'opacity 200ms ease 0ms, transform 200ms ease 0ms',
  }

  return (
    <div ref={ref}>
      {/* ── Desktop zigzag row ── */}
      <div
        className="hidden md:grid"
        style={{
          gridTemplateColumns: '1fr 80px 1fr',
          alignItems: 'center',
          minHeight: 160,
        }}
      >
        {/* Left cell */}
        <div style={{ paddingRight: 52, paddingTop: 28, paddingBottom: 28, display: 'flex', justifyContent: 'flex-end' }}>
          {isLeft ? (
            <TextBlock
              item={item} accent={accent} isHov={isHov} align="right"
              visible={visible} isLeft={isLeft} onEnter={onEnter} onLeave={onLeave}
            />
          ) : (
            <span style={{
              fontSize: '7.5rem', fontWeight: 900, color: '#f1f5f9',
              lineHeight: 1, userSelect: 'none', fontFamily: 'monospace',
              display: 'block', ...wmStyle,
            }}>{item.step}</span>
          )}
        </div>

        {/* Central node */}
        <div style={{ display: 'flex', justifyContent: 'center', zIndex: 2 }}>
          <div style={nodeStyle}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: isHov ? accent : '#ffffff',
              border: `2.5px solid ${accent}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: isHov
                ? `0 0 0 7px ${accent}18, 0 10px 28px ${accent}30`
                : `0 0 0 5px ${accent}12`,
              transition: 'background 350ms ease, box-shadow 380ms ease',
            }}>
              <Icon size={21} strokeWidth={1.7}
                style={{ color: isHov ? '#fff' : accent, transition: 'color 300ms ease' }} />
            </div>
          </div>
        </div>

        {/* Right cell */}
        <div style={{ paddingLeft: 52, paddingTop: 28, paddingBottom: 28, display: 'flex', justifyContent: 'flex-start' }}>
          {!isLeft ? (
            <TextBlock
              item={item} accent={accent} isHov={isHov} align="left"
              visible={visible} isLeft={isLeft} onEnter={onEnter} onLeave={onLeave}
            />
          ) : (
            <span style={{
              fontSize: '7.5rem', fontWeight: 900, color: '#f1f5f9',
              lineHeight: 1, userSelect: 'none', fontFamily: 'monospace',
              display: 'block', ...wmStyle,
            }}>{item.step}</span>
          )}
        </div>
      </div>

      {/* ── Mobile row ── */}
      <div
        className="flex md:hidden"
        style={{ paddingBottom: index < stepsTotal - 1 ? 44 : 0 }}
      >
        {/* node */}
        <div style={{ width: 48, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
          <div style={nodeStyle}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: isHov ? accent : '#ffffff',
              border: `2.5px solid ${accent}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: isHov ? `0 0 0 5px ${accent}18` : `0 0 0 3px ${accent}12`,
              transition: 'background 350ms ease, box-shadow 350ms ease',
            }}>
              <Icon size={18} strokeWidth={1.75}
                style={{ color: isHov ? '#fff' : accent, transition: 'color 300ms ease' }} />
            </div>
          </div>
        </div>
        {/* text */}
        <div
          style={{
            paddingLeft: 20, paddingTop: 8, paddingBottom: 4,
            opacity:   visible ? 1 : 0,
            transform: visible ? 'translateX(0)' : 'translateX(32px)',
            transition: visible
              ? 'opacity 650ms cubic-bezier(0.22,1,0.36,1) 80ms, transform 650ms cubic-bezier(0.22,1,0.36,1) 80ms'
              : 'opacity 200ms ease 0ms, transform 200ms ease 0ms',
            willChange: 'opacity, transform',
          }}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          <span style={{
            fontSize: 10, fontWeight: 800, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: accent, display: 'block', marginBottom: 5,
          }}>Step {item.step}</span>
          <h3 style={{
            fontSize: '1.1rem', fontWeight: 700, color: '#0f172a',
            letterSpacing: '-0.02em', marginBottom: 6, lineHeight: 1.25,
          }}>{item.title}</h3>
          <p style={{ fontSize: '0.875rem', color: '#64748b', lineHeight: 1.7, margin: 0 }}>
            {item.description}
          </p>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   HowItWorksSection — vertical zigzag timeline.
   • Spine: one observer on the outer wrapper, fires as soon as the section
     is 5% visible — starts growing immediately.
   • Each StepRow has its OWN observer — fires only when that row enters the
     viewport, giving true one-by-one scroll animation as you scroll down.
   • Both spine and rows reset on exit and re-trigger on re-entry.
───────────────────────────────────────────────────────────────────────────── */
function HowItWorksSection({ steps }: { steps: StepType[] }) {
  const spineRef = useRef<HTMLDivElement>(null)
  const [spineVisible, setSpineVisible] = useState(false)
  const [hovered, setHovered]           = useState<number | null>(null)

  // Lightweight observer just for the spine line
  useEffect(() => {
    const el = spineRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => setSpineVisible(entry.isIntersecting),
      { threshold: 0.04 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const EASE      = 'cubic-bezier(0.22, 1, 0.36, 1)'
  // Spine grows for 2s — long enough to cover the full section height
  const SPINE_DUR = 2000
  const accents   = ['#2563eb', '#4f46e5', '#7c3aed', '#059669']

  const spineLineStyle: React.CSSProperties = {
    position: 'absolute', inset: 0,
    background: 'linear-gradient(180deg, #bfdbfe 0%, #a5b4fc 50%, #6ee7b7 100%)',
    borderRadius: 'inherit',
    transformOrigin: 'top center',
    transform:  spineVisible ? 'scaleY(1)' : 'scaleY(0)',
    transition: spineVisible
      ? `transform ${SPINE_DUR}ms ${EASE} 80ms`
      : 'transform 220ms ease 0ms',
  }

  return (
    <div ref={spineRef} style={{ position: 'relative' }}>

      {/* ── Desktop spine ── */}
      <div className="hidden md:block" style={{
        position: 'absolute', left: '50%', top: 0, bottom: 0,
        width: 2, transform: 'translateX(-50%)',
        background: 'transparent', borderRadius: 2,
      }}>
        <div style={spineLineStyle} />
      </div>

      {/* ── Mobile spine ── */}
      <div className="md:hidden absolute" style={{
        left: 23, top: 0, bottom: 0, width: 2,
        borderRadius: 2, transformOrigin: 'top center',
        transform:  spineVisible ? 'scaleY(1)' : 'scaleY(0)',
        transition: spineVisible
          ? `transform ${SPINE_DUR}ms ${EASE} 80ms`
          : 'transform 220ms ease 0ms',
        background: 'linear-gradient(180deg, #bfdbfe 0%, #a5b4fc 50%, #6ee7b7 100%)',
      }} />

      {/* ── Step rows ── each owns its own observer ── */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {steps.map((item, i) => (
          <StepRow
            key={i}
            item={item}
            index={i}
            accent={accents[i]}
            isHov={hovered === i}
            stepsTotal={steps.length}
            onEnter={() => setHovered(i)}
            onLeave={() => setHovered(null)}
          />
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════ */
const LandingPage = () => {

  /* ── Sticky nav glassmorphism ── */
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /* ── Hero entrance (page-load, not scroll) ── */
  const [heroReady, setHeroReady] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setHeroReady(true), 80)
    return () => clearTimeout(t)
  }, [])

  /* ── Underline width for hero ── */
  const [underlineReady, setUnderlineReady] = useState(false)
  useEffect(() => {
    if (!heroReady) return
    const t = setTimeout(() => setUnderlineReady(true), 750)
    return () => clearTimeout(t)
  }, [heroReady])

  const ease = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'

  const features = [
    { icon: Mic,         title: 'Voice & Text Interviews',  description: 'Practice with AI-powered questions using voice or text responses' },
    { icon: Users,       title: 'Admin Hierarchy',          description: 'Organised management from super admins to department admins and students' },
    { icon: Shield,      title: 'Proctored Interviews',     description: 'Advanced proctoring system to ensure interview integrity' },
    { icon: BarChart3,   title: 'Performance Analytics',    description: 'Detailed insights and improvement recommendations' },
    { icon: Zap,         title: 'AI-Powered Questions',     description: 'Smart question generation based on resume or domain expertise' },
    { icon: CheckCircle, title: 'Multiple Interview Modes', description: 'Resume-based, domain-specific, or scheduled interviews' },
  ]

  const interviewModes: ModeType[] = [
    {
      number: '01',
      title: 'Resume-Based',
      subtitle: 'Interview',
      description: 'Upload your resume and receive deeply personalised questions tailored to your experience, projects, and skills.',
      Icon: FileText,
      accent: '#2563eb',
      accentBg: 'rgba(37,99,235,0.08)',
      tag: 'Most Popular',
      path: '/student/interview/resume',
    },
    {
      number: '02',
      title: 'Domain-Specific',
      subtitle: 'Interview',
      description: 'Choose your field and practise with curated technical and behavioural questions from industry experts.',
      Icon: Target,
      accent: '#7c3aed',
      accentBg: 'rgba(124,58,237,0.08)',
      tag: 'Deep Focus',
      path: '/student/interview/domain',
    },
    {
      number: '03',
      title: 'Scheduled',
      subtitle: 'Interview',
      description: 'Join admin-scheduled sessions with full proctoring — simulating real interview conditions precisely.',
      Icon: CalendarCheck,
      accent: '#059669',
      accentBg: 'rgba(5,150,105,0.08)',
      tag: 'Live Proctored',
      path: '/student/scheduled',
    },
  ]

  const steps: StepType[] = [
    { step: '01', title: 'Register',    description: 'Sign up with your admin ID from your department',                  Icon: UserPlus },
    { step: '02', title: 'Choose Mode', description: 'Select resume-based, domain-specific, or scheduled interview',      Icon: LayoutGrid },
    { step: '03', title: 'Practice',    description: 'Answer questions using voice or text with real-time AI feedback',   Icon: MessageSquare },
    { step: '04', title: 'Improve',     description: 'Review performance analytics and track your growth over time',      Icon: TrendingUp },
  ]

  /* hero element style helper */
  const heroStyle = (delayMs: number, extraTransform = 'translateY(22px)'): React.CSSProperties => ({
    opacity: heroReady ? 1 : 0,
    transform: heroReady ? 'translateY(0)' : extraTransform,
    transition: `opacity 700ms ${ease} ${delayMs}ms, transform 700ms ${ease} ${delayMs}ms`,
    willChange: 'opacity, transform',
  })

  return (
    <div className="min-h-screen bg-white flex flex-col overflow-x-hidden">

      {/* ── Nav ───────────────────────────────────────────────────────────── */}
      <nav
        className="fixed top-0 inset-x-0 z-50"
        style={{
          background: scrolled ? 'rgba(255,255,255,0.82)' : '#ffffff',
          backdropFilter: scrolled ? 'blur(16px) saturate(180%)' : 'none',
          WebkitBackdropFilter: scrolled ? 'blur(16px) saturate(180%)' : 'none',
          boxShadow: scrolled ? '0 1px 0 rgba(0,0,0,0.08)' : '0 1px 0 rgba(0,0,0,0.05)',
          transition: `background 400ms ${ease}, box-shadow 400ms ${ease}`,
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between h-16 items-center">
          <span className="text-xl font-bold text-primary-600 tracking-tight">MockMentorBiz</span>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm font-medium text-gray-500 hover:text-gray-900 px-3 py-2 rounded-lg"
              style={{ transition: `color 200ms ease` }}
            >
              Sign in
            </Link>
            <Link
              to="/register"
              className="btn-primary text-sm"
              style={{ transition: 'transform 200ms ease, box-shadow 200ms ease' }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.04)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden pt-24 sm:pt-32 md:pt-36 pb-20 sm:pb-28"
        style={{ background: 'linear-gradient(145deg, #eff6ff 0%, #eef2ff 50%, #ffffff 100%)' }}
      >
        <div style={{ position: 'absolute', top: '-80px', left: '-80px', width: '480px', height: '480px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(147,197,253,0.35) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-80px', right: '-80px', width: '480px', height: '480px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(165,180,252,0.28) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div style={heroStyle(0)} className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 text-blue-600 text-sm font-medium px-4 py-1.5 rounded-full mb-8">
            <Zap className="w-3.5 h-3.5" />
            AI-Powered Mock Interviews
          </div>
          <h1
            className="text-4xl sm:text-5xl md:text-6xl lg:text-[4.25rem] font-bold text-gray-900 leading-[1.1] tracking-tight mb-6"
            style={heroStyle(120, 'translateY(32px)')}
          >
            Master Your
            <br />
            <span className="text-primary-600 relative inline-block">
              Interview Skills
              <span style={{
                position: 'absolute', bottom: '4px', left: 0,
                height: '3px', borderRadius: '2px', background: 'currentColor',
                opacity: 0.25, width: underlineReady ? '100%' : '0%',
                transition: `width 900ms ${ease}`,
              }} />
            </span>
          </h1>
          <p className="text-lg md:text-xl text-gray-500 leading-relaxed mb-10 max-w-2xl mx-auto" style={heroStyle(240)}>
            AI-powered mock interview platform designed specifically for college students.
            Practice with voice interactions, get instant feedback, and track your progress.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center" style={heroStyle(360)}>
            <Link
              to="/register"
              className="btn-primary text-base px-8 py-3 shadow-md shadow-blue-100"
              style={{ transition: 'transform 200ms ease, box-shadow 200ms ease' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(59,130,246,0.25)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '' }}
            >
              Start Practicing Now
            </Link>
            <Link
              to="/login"
              className="btn-secondary text-base px-8 py-3"
              style={{ transition: 'transform 200ms ease' }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
            >
              Sign In
            </Link>
          </div>
          <div className="mt-12 md:mt-16 flex justify-center gap-8 md:gap-16" style={heroStyle(500)}>
            {[
              { value: 500,   suffix: '+', label: 'Students' },
              { value: 10000, suffix: '+', label: 'Interviews' },
              { value: 98,    suffix: '%', label: 'Satisfaction' },
            ].map(s => (
              <div key={s.label} className="text-center">
                <div className="text-3xl font-bold text-gray-900 tabular-nums">
                  <Counter target={s.value} suffix={s.suffix} />
                </div>
                <div className="text-xs text-gray-400 mt-1 uppercase tracking-widest">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div
          className="absolute bottom-7 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5"
          style={{ opacity: heroReady ? 0.4 : 0, transition: `opacity 1s ease 1.4s` }}
        >
          <div className="w-[1px] h-8 bg-gray-400" style={{ animation: 'lineDrop 1.6s ease-in-out infinite' }} />
        </div>
      </section>

      {/* ── Interview Modes ────────────────────────────────────────────────── */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center mb-12 sm:mb-14">
            <p className="text-xs font-bold uppercase tracking-widest text-primary-600 mb-3">Practice Formats</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight mb-4">Three Ways to Practice</h2>
            <p className="text-lg text-gray-400 max-w-md mx-auto leading-relaxed">
              Choose the interview style that works best for your preparation
            </p>
          </Reveal>
          <PracticeSection modes={interviewModes} />
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────────── */}
      <section className="py-16 sm:py-24" style={{ background: '#f8fafc' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center mb-12 sm:mb-16">
            <p className="text-xs font-semibold text-primary-600 uppercase tracking-widest mb-3">Capabilities</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight mb-4">Powerful Features for Success</h2>
            <p className="text-lg text-gray-400">Everything you need to excel in your interviews</p>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((feature, i) => {
              const Icon = feature.icon
              return (
                <Reveal key={i} delay={i * 70} scale>
                  <div
                    className="bg-white rounded-2xl p-6 border border-gray-100 h-full"
                    style={{ transition: 'box-shadow 280ms ease, transform 280ms ease', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-3px)' }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'translateY(0)' }}
                  >
                    <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl mb-5" style={{ background: 'rgba(59,130,246,0.08)' }}>
                      <Icon className="h-5 w-5 text-primary-600" />
                    </div>
                    <h3 className="text-base font-semibold text-gray-900 mb-2">{feature.title}</h3>
                    <p className="text-gray-400 text-sm leading-relaxed">{feature.description}</p>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── How It Works ──────────────────────────────────────────────────── */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center mb-12 sm:mb-16">
            <p className="text-xs font-bold uppercase tracking-widest text-primary-600 mb-3">Process</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight mb-4">How It Works</h2>
            <p className="text-lg text-gray-400 max-w-sm mx-auto leading-relaxed">
              From sign-up to growth in four steps
            </p>
          </Reveal>
          <HowItWorksSection steps={steps} />
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section
        className="py-16 sm:py-24 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1d4ed8 0%, #4338ca 100%)' }}
      >
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.06,
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.8) 1px, transparent 1px)',
          backgroundSize: '32px 32px', pointerEvents: 'none',
        }} />
        <div style={{ position: 'absolute', top: '-120px', right: '-120px', width: '400px', height: '400px', borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Reveal y={20} duration={550}>
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-4">
              Ready to Ace Your Next Interview?
            </h2>
            <p className="text-lg text-blue-200 mb-10 leading-relaxed">
              Join thousands of students who have improved their interview skills with MockMentorBiz
            </p>
            <Link
              to="/register"
              className="inline-block bg-white text-primary-600 font-semibold text-base px-9 py-3.5 rounded-xl"
              style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.18)', transition: 'transform 220ms ease, box-shadow 220ms ease' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 10px 32px rgba(0,0,0,0.22)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.18)' }}
            >
              Get Started Free
            </Link>
          </Reveal>
        </div>
      </section>

      <Footer />

      <style>{`
        @keyframes lineDrop {
          0%   { transform: scaleY(0); transform-origin: top; opacity: 0; }
          30%  { opacity: 1; }
          100% { transform: scaleY(1); transform-origin: top; opacity: 0; }
        }
      `}</style>
    </div>
  )
}

export default LandingPage
