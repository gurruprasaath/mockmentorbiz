import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Footer from '../../components/Footer'
import { 
  ArrowLeft, 
  TrendingUp, 
  Award, 
  Clock, 
  BarChart3,
  Calendar,
  Download,
  FileSpreadsheet,
  Star,
  Target,
  User,
  FileText
} from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import jsPDF from 'jspdf'
import { studentApi } from '../../utils/api'

interface InterviewResult {
  id: string
  interview_type: string
  completed_at: string
  duration_minutes: number
  overall_score: number
  technical_score: number
  communication_score: number
  confidence_score: number
  feedback: string
  strengths: string[]
  areas_for_improvement: string[]
  recommendations: string[]
  malpractice_count?: number
  malpractice_breakdown?: Record<string, number>
  per_question?: Array<{
    question_id: number
    question: string
    answer?: string
    transcript?: string
    sample_answer?: string
    audio?: {
      filename?: string
      original_filename?: string
      content_type?: string
      path?: string
    } | null
    response_time?: number
    technical_score?: number
    communication_score?: number
    relevance_score?: number
    strengths?: string[]
    weaknesses?: string[]
    feedback?: string
  }>
}

const PerformancePage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [selectedTimeframe, setSelectedTimeframe] = useState('all')
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({})

  const completedInterview = (location.state as any)?.completedInterview as Partial<InterviewResult> | undefined
  const showSingleInterview = Boolean(completedInterview)

  const { data: performanceData, isLoading, isError } = useQuery({
    queryKey: ['student-performance', selectedTimeframe],
    queryFn: () => studentApi.getPerformance(selectedTimeframe),
  })

  const results = performanceData?.data?.interviews || []
  const stats = performanceData?.data?.stats || {}
  const byType: Record<string, { count: number; avg_score: number; avg_technical: number; avg_communication: number; avg_confidence: number }> = stats.by_type || {}

  useEffect(() => {
    return () => {
      Object.values(audioUrls).forEach((u) => {
        try {
          URL.revokeObjectURL(u)
        } catch {
          // ignore
        }
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadAudioUrl = async (interviewId: string | number, questionId: number) => {
    const key = `${interviewId}:${questionId}`
    if (audioUrls[key]) return

    const res = await studentApi.getAnswerAudio(interviewId, questionId)
    const blob = res.data as Blob
    const url = URL.createObjectURL(blob)
    setAudioUrls((prev) => ({ ...prev, [key]: url }))
  }

  const displayResults: InterviewResult[] = showSingleInterview
    ? [
        {
          ...(completedInterview as any),
          id: String((completedInterview as any)?.id ?? (completedInterview as any)?.interview_id ?? 'completed'),
          interview_type: String((completedInterview as any)?.interview_type ?? 'unknown'),
          completed_at: String((completedInterview as any)?.completed_at ?? new Date().toISOString()),
          duration_minutes: Number((completedInterview as any)?.duration_minutes ?? 0),
          overall_score: Number((completedInterview as any)?.overall_score ?? 0),
          technical_score: Number((completedInterview as any)?.technical_score ?? 0),
          communication_score: Number((completedInterview as any)?.communication_score ?? 0),
          confidence_score: Number((completedInterview as any)?.confidence_score ?? 0),
          feedback: String((completedInterview as any)?.feedback ?? ''),
          strengths: Array.isArray((completedInterview as any)?.strengths) ? ((completedInterview as any)?.strengths as any) : [],
          areas_for_improvement: Array.isArray((completedInterview as any)?.areas_for_improvement)
            ? ((completedInterview as any)?.areas_for_improvement as any)
            : [],
          recommendations: Array.isArray((completedInterview as any)?.recommendations) ? ((completedInterview as any)?.recommendations as any) : [],
        } as InterviewResult,
      ]
    : results

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-100'
    if (score >= 60) return 'text-yellow-600 bg-yellow-100'
    return 'text-red-600 bg-red-100'
  }

  const getGradeFromScore = (score: number) => {
    if (score >= 90) return 'A+'
    if (score >= 80) return 'A'
    if (score >= 70) return 'B+'
    if (score >= 60) return 'B'
    if (score >= 50) return 'C'
    return 'D'
  }

  const exportResults = () => {
    // Create CSV content
    const csvContent = [
      ['Date', 'Type', 'Duration', 'Overall Score', 'Technical', 'Communication', 'Confidence'],
      ...displayResults.map((result: InterviewResult) => [
        new Date(result.completed_at).toLocaleDateString(),
        result.interview_type.replace(/_/g, ' '),
        `${result.duration_minutes} min`,
        result.overall_score,
        result.technical_score,
        result.communication_score,
        result.confidence_score
      ])
    ].map(row => row.join(',')).join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'interview_performance.csv'
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const exportToPdf = () => {
    if (displayResults.length === 0) return

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const margin = 14
    const contentW = pageW - margin * 2
    let y = margin

    const checkPage = (needed: number) => {
      if (y + needed > pageH - margin) { pdf.addPage(); y = margin }
    }

    const addText = (text: string, opts: { size?: number; bold?: boolean; color?: [number,number,number]; indent?: number } = {}) => {
      const { size = 10, bold = false, color = [30,30,30], indent = 0 } = opts
      pdf.setFontSize(size)
      pdf.setFont('helvetica', bold ? 'bold' : 'normal')
      pdf.setTextColor(...color)
      const lines = pdf.splitTextToSize(text, contentW - indent)
      checkPage(lines.length * (size * 0.4) + 2)
      pdf.text(lines, margin + indent, y)
      y += lines.length * (size * 0.4) + 2
    }

    const addHRule = () => {
      checkPage(4)
      pdf.setDrawColor(220, 220, 220)
      pdf.line(margin, y, pageW - margin, y)
      y += 4
    }

    // ── HEADER (first page only) ──────────────────────────────
    pdf.setFillColor(30, 64, 175)
    pdf.rect(0, 0, pageW, 24, 'F')
    pdf.setFontSize(14)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(255, 255, 255)
    const reportTitle = displayResults.length > 1
      ? `MockMentorBiz — Interview Performance Report (${displayResults.length} interviews)`
      : 'MockMentorBiz — Interview Result Report'
    pdf.text(reportTitle, margin, 15)
    y = 30

    // ── PER-RESULT LOOP ───────────────────────────────────────
    displayResults.forEach((result, resultIdx) => {
      // Separator between results (not before the first)
      if (resultIdx > 0) {
        pdf.addPage()
        y = margin
        // Mini header bar for subsequent results
        pdf.setFillColor(30, 64, 175)
        pdf.rect(0, 0, pageW, 14, 'F')
        pdf.setFontSize(10); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(255, 255, 255)
        pdf.text(`MockMentorBiz — Interview Result Report (${resultIdx + 1} of ${displayResults.length})`, margin, 10)
        y = 20
      }

      // ── INTERVIEW INFO ──────────────────────────────────────
      addText('Interview Details', { size: 12, bold: true, color: [30,64,175] })
      y += 1
      addText(`Type: ${result.interview_type.replace(/_/g, ' ').toUpperCase()}`, { size: 10, indent: 2 })
      addText(`Date: ${new Date(result.completed_at).toLocaleDateString()} at ${new Date(result.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, { size: 10, indent: 2 })
      addText(`Duration: ${result.duration_minutes} minutes`, { size: 10, indent: 2 })
      y += 2
      addHRule()

      // ── SCORES ─────────────────────────────────────────────
      addText('Scores', { size: 12, bold: true, color: [30,64,175] })
      y += 2
      const scoreItems = [
        { label: 'Overall',       value: result.overall_score },
        { label: 'Technical',     value: result.technical_score },
        { label: 'Communication', value: result.communication_score },
        { label: 'Confidence',    value: result.confidence_score },
      ]
      const colW = contentW / scoreItems.length
      checkPage(16)
      scoreItems.forEach((sc, i) => {
        const bx = margin + i * colW
        const v = Math.round(sc.value)
        const bg: [number,number,number] = v >= 80 ? [220,252,231] : v >= 60 ? [254,249,195] : [254,226,226]
        const fg: [number,number,number] = v >= 80 ? [22,101,52] : v >= 60 ? [133,77,14] : [153,27,27]
        pdf.setFontSize(8); pdf.setFont('helvetica','normal'); pdf.setTextColor(80,80,80)
        pdf.text(sc.label, bx + colW/2, y, { align: 'center' })
        pdf.setFillColor(...bg)
        pdf.roundedRect(bx + 2, y + 2, colW - 4, 7, 2, 2, 'F')
        pdf.setFontSize(9); pdf.setFont('helvetica','bold'); pdf.setTextColor(...fg)
        pdf.text(`${v}% (${getGradeFromScore(v)})`, bx + colW/2, y + 7, { align: 'center' })
      })
      y += 16
      addHRule()

      // ── GRADE SCALE ─────────────────────────────────────────
      addText('Grade Scale', { size: 12, bold: true, color: [30,64,175] })
      y += 2
      checkPage(10)
      const grades = [
        { g: 'A+', r: '90–100%', bg: [22,101,52] as [number,number,number],  fg: [255,255,255] as [number,number,number] },
        { g: 'A',  r: '80–89%',  bg: [21,128,61] as [number,number,number],  fg: [255,255,255] as [number,number,number] },
        { g: 'B+', r: '70–79%',  bg: [29,78,216] as [number,number,number],  fg: [255,255,255] as [number,number,number] },
        { g: 'B',  r: '60–69%',  bg: [96,165,250] as [number,number,number], fg: [255,255,255] as [number,number,number] },
        { g: 'C',  r: '50–59%',  bg: [202,138,4] as [number,number,number],  fg: [255,255,255] as [number,number,number] },
        { g: 'D',  r: 'Below 50%', bg: [185,28,28] as [number,number,number],fg: [255,255,255] as [number,number,number] },
      ]
      let gx = margin
      grades.forEach(({ g, r, bg, fg }) => {
        const label = `${g}  ${r}`
        const tw = pdf.getTextWidth(label) + 6
        pdf.setFillColor(...bg)
        pdf.roundedRect(gx, y - 4, tw, 7, 2, 2, 'F')
        pdf.setFontSize(8); pdf.setFont('helvetica','bold'); pdf.setTextColor(...fg)
        pdf.text(g, gx + 3, y)
        pdf.setFont('helvetica','normal')
        pdf.text(r, gx + 3 + pdf.getTextWidth(g + '  '), y)
        gx += tw + 3
      })
      y += 8
      addHRule()

      // ── FEEDBACK ────────────────────────────────────────────
      if (result.feedback) {
        addText('Feedback', { size: 12, bold: true, color: [30,64,175] })
        addText(result.feedback, { size: 9, indent: 2 })
        y += 2
        addHRule()
      }

      // ── STRENGTHS + AREAS ───────────────────────────────────
      if (result.strengths.length > 0 || result.areas_for_improvement.length > 0) {
        addText('Summary', { size: 12, bold: true, color: [30,64,175] })
        y += 2
        if (result.strengths.length > 0) {
          addText('Strengths', { size: 10, bold: true, color: [22,101,52] })
          result.strengths.forEach(s => addText(`• ${s}`, { size: 9, indent: 4 }))
          y += 2
        }
        if (result.areas_for_improvement.length > 0) {
          addText('Areas for Improvement', { size: 10, bold: true, color: [133,77,14] })
          result.areas_for_improvement.forEach(a => addText(`• ${a}`, { size: 9, indent: 4 }))
          y += 2
        }
        addHRule()
      }

      // ── RECOMMENDATIONS ─────────────────────────────────────
      if (result.recommendations && result.recommendations.length > 0) {
        addText('Recommendations', { size: 12, bold: true, color: [30,64,175] })
        result.recommendations.forEach(rec => addText(`• ${rec}`, { size: 9, indent: 4 }))
        y += 2
        addHRule()
      }

      // ── PER-QUESTION ─────────────────────────────────────────
      if (result.per_question && result.per_question.length > 0) {
        addText('Per-Question Evaluation', { size: 12, bold: true, color: [30,64,175] })
        y += 3
        const sorted = [...result.per_question].sort((a, b) => (a.question_id ?? 0) - (b.question_id ?? 0))
        sorted.forEach((q, idx) => {
          checkPage(30)
          pdf.setFillColor(239, 246, 255)
          pdf.rect(margin, y - 4, contentW, 10, 'F')
          pdf.setFontSize(10); pdf.setFont('helvetica','bold'); pdf.setTextColor(30,64,175)
          const qLabel = `Q${idx + 1}: ${q.question || ''}`
          const qLines = pdf.splitTextToSize(qLabel, contentW - 4)
          pdf.text(qLines, margin + 2, y)
          y += qLines.length * 5 + 2

          if (q.answer) {
            addText('Student\'s Answer:', { size: 9, bold: true, color: [80,80,80] })
            addText(q.answer, { size: 9, indent: 4, color: [50,50,50] })
            y += 1
          }
          if (q.transcript && q.transcript !== q.answer) {
            addText('Transcript:', { size: 9, bold: true, color: [80,80,80] })
            addText(q.transcript, { size: 9, indent: 4, color: [50,50,50] })
            y += 1
          }

          // Suggested Answer (AI)
          if (q.sample_answer) {
            const saLines = pdf.splitTextToSize(q.sample_answer, contentW - 10)
            const saH = saLines.length * 4.5 + 6
            if (y + saH > pageH - margin) { pdf.addPage(); y = margin }
            pdf.setFillColor(236, 253, 245)
            pdf.roundedRect(margin, y, contentW, saH, 2, 2, 'F')
            pdf.setFontSize(8); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(5, 150, 105)
            pdf.text('Suggested Answer (AI):', margin + 3, y + 4.5)
            pdf.setFont('helvetica', 'normal'); pdf.setTextColor(6, 78, 59)
            pdf.text(saLines, margin + 3, y + 9)
            y += saH + 3
          }

          // Score chips
          checkPage(10)
          const chips = [
            { label: 'Technical',     val: q.technical_score,     bg: [219,234,254] as [number,number,number], fg: [29,78,216] as [number,number,number] },
            { label: 'Communication', val: q.communication_score, bg: [220,252,231] as [number,number,number], fg: [22,101,52] as [number,number,number] },
            { label: 'Relevance',     val: q.relevance_score,     bg: [243,232,255] as [number,number,number], fg: [109,40,217] as [number,number,number] },
            { label: 'Time',          val: q.response_time,       bg: [243,244,246] as [number,number,number], fg: [75,85,99] as [number,number,number], suffix: 's' },
          ]
          let cx = margin
          chips.forEach(({ label, val, bg, fg, suffix }) => {
            if (val === undefined || val === null) return
            const chipTxt = suffix ? `${label}: ${val}${suffix}` : `${label}: ${Math.round(val as number)}%`
            const cw = pdf.getTextWidth(chipTxt) + 6
            pdf.setFillColor(...bg)
            pdf.roundedRect(cx, y - 3.5, cw, 6, 1.5, 1.5, 'F')
            pdf.setFontSize(8); pdf.setFont('helvetica','bold'); pdf.setTextColor(...fg)
            pdf.text(chipTxt, cx + 3, y)
            cx += cw + 3
          })
          y += 7

          if (q.strengths && q.strengths.length > 0) {
            addText('Strengths:', { size: 9, bold: true, color: [22,101,52] })
            q.strengths.forEach(s => addText(`• ${s}`, { size: 9, indent: 6 }))
            y += 1
          }
          if (q.weaknesses && q.weaknesses.length > 0) {
            addText('Weaknesses:', { size: 9, bold: true, color: [133,77,14] })
            q.weaknesses.forEach(w => addText(`• ${w}`, { size: 9, indent: 6 }))
            y += 1
          }
          if (q.feedback) {
            const fbLines = pdf.splitTextToSize(q.feedback, contentW - 10)
            const fbH = fbLines.length * 4.5 + 6
            if (y + fbH > pageH - margin) { pdf.addPage(); y = margin }
            pdf.setFillColor(239, 246, 255)
            pdf.roundedRect(margin, y, contentW, fbH, 2, 2, 'F')
            pdf.setFontSize(8); pdf.setFont('helvetica','bold'); pdf.setTextColor(30,64,175)
            pdf.text('Feedback:', margin + 3, y + 4.5)
            pdf.setFont('helvetica','normal'); pdf.setTextColor(30,30,80)
            pdf.text(fbLines, margin + 3, y + 9)
            y += fbH + 3
          }
          y += 5
          if (idx < sorted.length - 1) {
            pdf.setDrawColor(200,200,200)
            pdf.setLineDashPattern([2,2], 0)
            pdf.line(margin, y - 2, pageW - margin, y - 2)
            pdf.setLineDashPattern([], 0)
          }
        })
      }
    }) // end displayResults.forEach

    // ── FOOTER ────────────────────────────────────────────────
    const totalPages = (pdf as any).internal.getNumberOfPages()
    for (let p = 1; p <= totalPages; p++) {
      pdf.setPage(p)
      pdf.setFontSize(8); pdf.setFont('helvetica','normal'); pdf.setTextColor(150,150,150)
      pdf.text('MockMentorBiz Interview Report  |  Page ' + p + ' of ' + totalPages, margin, pageH - 6)
      pdf.text(new Date().toLocaleDateString(), pageW - margin, pageH - 6, { align: 'right' })
    }

    pdf.save(`interview-result-${Date.now()}.pdf`)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-700 font-medium mb-2">Failed to load performance data</p>
          <p className="text-sm text-gray-500">Check your connection and refresh the page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between min-h-16 py-3 gap-3 flex-wrap">
            <div className="flex items-center min-w-0">
              <button 
                onClick={() => navigate('/student')}
                className="flex items-center text-gray-500 hover:text-gray-700 mr-3 shrink-0 transition-colors"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Back to Dashboard</span>
              </button>
              <h1 className="text-lg sm:text-xl font-semibold text-gray-900 truncate">
                {showSingleInterview ? 'Interview Result' : 'Performance Analytics'}
              </h1>
            </div>
            
            {!showSingleInterview && (
              <div className="flex items-center flex-wrap gap-2">
                <select
                  value={selectedTimeframe}
                  onChange={(e) => setSelectedTimeframe(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="all">All Time</option>
                  <option value="30">Last 30 Days</option>
                  <option value="90">Last 3 Months</option>
                  <option value="365">Last Year</option>
                </select>
                <button
                  onClick={exportResults}
                  className="border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium flex items-center transition-colors"
                >
                  <FileSpreadsheet className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Export CSV</span>
                </button>
                <button
                  onClick={exportToPdf}
                  className="bg-primary-600 hover:bg-primary-700 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center transition-colors"
                >
                  <Download className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Export PDF</span>
                </button>
              </div>
            )}
            {showSingleInterview && (
              <button
                onClick={exportToPdf}
                className="bg-primary-600 hover:bg-primary-700 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center transition-colors shrink-0"
              >
                <Download className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Export PDF</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!showSingleInterview && (
        <>
        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 mb-8">
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg shrink-0">
                <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
              </div>
              <div className="ml-3 sm:ml-4 min-w-0">
                <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">Total Interviews</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">{stats.total_interviews || 0}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg shrink-0">
                <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6 text-green-600" />
              </div>
              <div className="ml-3 sm:ml-4 min-w-0">
                <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">Average Score</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">
                  {stats.average_score ? Math.round(stats.average_score) : 0}%
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm">
            <div className="flex items-center">
              <div className="p-2 bg-yellow-100 rounded-lg shrink-0">
                <Award className="h-5 w-5 sm:h-6 sm:w-6 text-yellow-600" />
              </div>
              <div className="ml-3 sm:ml-4 min-w-0">
                <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">Best Score</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">
                  {stats.best_score ? Math.round(stats.best_score) : 0}%
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg shrink-0">
                <Clock className="h-5 w-5 sm:h-6 sm:w-6 text-purple-600" />
              </div>
              <div className="ml-3 sm:ml-4 min-w-0">
                <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">Total Time</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">
                  {stats.total_minutes ? Math.round(stats.total_minutes / 60) : 0}h
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Grade Criteria Legend */}
        <div className="bg-white rounded-lg shadow-sm p-5 mb-8">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Grade Scale</h2>
          <div className="flex flex-wrap gap-2">
            {[
              { grade: 'A+', range: '90–100%', color: 'bg-green-600 text-white' },
              { grade: 'A',  range: '80–89%',  color: 'bg-green-500 text-white' },
              { grade: 'B+', range: '70–79%',  color: 'bg-blue-500 text-white' },
              { grade: 'B',  range: '60–69%',  color: 'bg-blue-400 text-white' },
              { grade: 'C',  range: '50–59%',  color: 'bg-yellow-500 text-white' },
              { grade: 'D',  range: 'Below 50%', color: 'bg-red-500 text-white' },
            ].map(({ grade, range, color }) => (
              <div key={grade} className={`flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${color}`}>
                <span className="font-bold mr-1">{grade}</span>
                <span className="opacity-90">{range}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Performance Chart */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Performance Trends</h2>
            <BarChart3 className="h-5 w-5 text-gray-400" />
          </div>
          
          {results.length > 0 ? (
            <div className="space-y-4">
              {/* Score Categories */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-sm text-gray-600 mb-2">Technical Skills</p>
                  <div className="relative pt-1">
                    <div className="flex mb-2 items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold inline-block text-blue-600">
                          {Math.round(stats.avg_technical || 0)}%
                        </span>
                      </div>
                    </div>
                    <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-blue-100">
                      <div 
                        style={{ width: `${stats.avg_technical || 0}%` }}
                        className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-500"
                      ></div>
                    </div>
                  </div>
                </div>
                
                <div className="text-center">
                  <p className="text-sm text-gray-600 mb-2">Communication</p>
                  <div className="relative pt-1">
                    <div className="flex mb-2 items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold inline-block text-green-600">
                          {Math.round(stats.avg_communication || 0)}%
                        </span>
                      </div>
                    </div>
                    <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-green-100">
                      <div 
                        style={{ width: `${stats.avg_communication || 0}%` }}
                        className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-green-500"
                      ></div>
                    </div>
                  </div>
                </div>
                
                <div className="text-center">
                  <p className="text-sm text-gray-600 mb-2">Confidence</p>
                  <div className="relative pt-1">
                    <div className="flex mb-2 items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold inline-block text-purple-600">
                          {Math.round(stats.avg_confidence || 0)}%
                        </span>
                      </div>
                    </div>
                    <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-purple-100">
                      <div 
                        style={{ width: `${stats.avg_confidence || 0}%` }}
                        className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-purple-500"
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No interview data available</p>
            </div>
          )}
        </div>

        {/* Performance by Interview Type */}
        {Object.keys(byType).length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Performance by Interview Type</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Object.entries(byType).map(([type, data]) => (
                <div key={type} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium bg-gray-100 text-gray-800 px-2 py-1 rounded">
                      {type.replace(/_/g, ' ').toUpperCase()}
                    </span>
                    <span className={`text-lg font-bold px-2 py-0.5 rounded-full text-sm ${
                      data.avg_score >= 80 ? 'text-green-600 bg-green-100' :
                      data.avg_score >= 60 ? 'text-yellow-600 bg-yellow-100' :
                      'text-red-600 bg-red-100'
                    }`}>
                      {Math.round(data.avg_score)}% ({getGradeFromScore(data.avg_score)})
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">{data.count} interview{data.count !== 1 ? 's' : ''} completed</p>
                  <div className="space-y-2 text-sm">
                    {[
                      { label: 'Technical', value: data.avg_technical, color: 'bg-blue-500' },
                      { label: 'Communication', value: data.avg_communication, color: 'bg-green-500' },
                      { label: 'Confidence', value: data.avg_confidence, color: 'bg-purple-500' },
                    ].map(({ label, value, color }) => (
                      <div key={label}>
                        <div className="flex justify-between mb-1">
                          <span className="text-gray-600">{label}</span>
                          <span className="font-medium">{Math.round(value)}%</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div className={`${color} h-1.5 rounded-full`} style={{ width: `${value}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        </>
        )}

        {/* Grade Scale — always visible (inline for single result, standalone for history) */}
        {showSingleInterview && (
          <div className="bg-white rounded-lg shadow-sm p-5 mb-6">
            <h2 className="text-base font-semibold text-gray-900 mb-3">Grade Scale</h2>
            <div className="flex flex-wrap gap-2">
              {[
                { grade: 'A+', range: '90–100%', color: 'bg-green-600 text-white' },
                { grade: 'A',  range: '80–89%',  color: 'bg-green-500 text-white' },
                { grade: 'B+', range: '70–79%',  color: 'bg-blue-500 text-white' },
                { grade: 'B',  range: '60–69%',  color: 'bg-blue-400 text-white' },
                { grade: 'C',  range: '50–59%',  color: 'bg-yellow-500 text-white' },
                { grade: 'D',  range: 'Below 50%', color: 'bg-red-500 text-white' },
              ].map(({ grade, range, color }) => (
                <div key={grade} className={`flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${color}`}>
                  <span className="font-bold mr-1">{grade}</span>
                  <span className="opacity-90">{range}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Interview History */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              {showSingleInterview ? 'Your Interview Result' : 'Interview History'}
            </h2>
          </div>
          
          {displayResults.length > 0 ? (
            <div className="divide-y divide-gray-200">
              {displayResults.map((result: InterviewResult) => (
                <div key={result.id} className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <div className="flex items-center">
                          <Calendar className="h-4 w-4 text-gray-400 mr-1.5" />
                          <span className="text-sm text-gray-600">
                            {new Date(result.completed_at).toLocaleDateString()} at{' '}
                            {new Date(result.completed_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                        <div className="flex items-center">
                          <Clock className="h-4 w-4 text-gray-400 mr-1.5" />
                          <span className="text-sm text-gray-600">{result.duration_minutes} min</span>
                        </div>
                        <span className="text-sm bg-gray-100 text-gray-800 px-2 py-1 rounded-lg">
                          {result.interview_type.replace(/_/g, ' ').toUpperCase()}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div className="text-center">
                          <p className="text-xs text-gray-600 mb-1">Overall</p>
                          <span className={`px-2 py-1 rounded-full text-sm font-medium ${
                            getScoreColor(result.overall_score)
                          }`}>
                            {result.overall_score}% ({getGradeFromScore(result.overall_score)})
                          </span>
                        </div>
                        
                        <div className="text-center">
                          <p className="text-xs text-gray-600 mb-1">Technical</p>
                          <span className="text-sm font-medium text-gray-900">
                            {result.technical_score}%
                          </span>
                        </div>
                        
                        <div className="text-center">
                          <p className="text-xs text-gray-600 mb-1">Communication</p>
                          <span className="text-sm font-medium text-gray-900">
                            {result.communication_score}%
                          </span>
                        </div>
                        
                        <div className="text-center">
                          <p className="text-xs text-gray-600 mb-1">Confidence</p>
                          <span className="text-sm font-medium text-gray-900">
                            {result.confidence_score}%
                          </span>
                        </div>
                      </div>
                      
                      {result.feedback && (
                        <div className="bg-gray-50 rounded-lg p-3 mb-3">
                          <p className="text-sm text-gray-700">{result.feedback}</p>
                        </div>
                      )}
                      
                      <div className="grid md:grid-cols-2 gap-4 text-sm">
                        {result.strengths && result.strengths.length > 0 && (
                          <div>
                            <p className="font-medium text-green-700 mb-2 flex items-center">
                              <Star className="h-4 w-4 mr-1" />
                              Strengths
                            </p>
                            <ul className="space-y-1">
                              {result.strengths.map((strength, index) => (
                                <li key={index} className="text-gray-600 flex items-start">
                                  <span className="text-green-500 mr-2">•</span>
                                  {strength}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {result.areas_for_improvement && result.areas_for_improvement.length > 0 && (
                          <div>
                            <p className="font-medium text-orange-700 mb-2 flex items-center">
                              <Target className="h-4 w-4 mr-1" />
                              Areas for Improvement
                            </p>
                            <ul className="space-y-1">
                              {result.areas_for_improvement.map((area, index) => (
                                <li key={index} className="text-gray-600 flex items-start">
                                  <span className="text-orange-500 mr-2">•</span>
                                  {area}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                      
                      {result.recommendations && result.recommendations.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <p className="font-medium text-blue-700 mb-2 flex items-center">
                            <User className="h-4 w-4 mr-1" />
                            Recommendations
                          </p>
                          <ul className="space-y-1">
                            {result.recommendations.map((rec, index) => (
                              <li key={index} className="text-sm text-gray-600 flex items-start">
                                <span className="text-blue-500 mr-2">•</span>
                                {rec}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                          {(result.malpractice_count || 0) > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                              <p className="font-medium text-red-700 mb-2">Malpractice Incidents</p>
                              <p className="text-sm text-gray-700">
                                Total: <span className="font-medium">{result.malpractice_count}</span>
                              </p>
                              {result.malpractice_breakdown && (
                                <div className="mt-2 text-sm text-gray-600">
                                  {Object.entries(result.malpractice_breakdown).map(([k, v]) => (
                                    <div key={k}>
                                      {k.split('_').join(' ')}: {v}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {result.per_question && result.per_question.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                              <p className="font-medium text-gray-900 mb-3">Per-question Feedback</p>
                              <div className="space-y-4">
                                {result.per_question
                                  .slice()
                                  .sort((a, b) => (a.question_id ?? 0) - (b.question_id ?? 0))
                                  .map((q, qIdx) => (
                                    <div key={qIdx} className="border border-gray-200 rounded-xl overflow-hidden">

                                      {/* Question header */}
                                      <div className="bg-blue-50 border-b border-blue-100 px-4 py-2.5">
                                        <p className="text-sm font-semibold text-blue-900">
                                          Q{qIdx + 1}: {q.question}
                                        </p>
                                      </div>

                                      <div className="p-4 space-y-4">

                                        {/* Score chips */}
                                        <div className="flex flex-wrap items-center gap-2">
                                          {typeof q.technical_score === 'number' && (
                                            <span className="text-xs px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">Technical: {Math.round(q.technical_score)}%</span>
                                          )}
                                          {typeof q.communication_score === 'number' && (
                                            <span className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-700 font-medium">Communication: {Math.round(q.communication_score)}%</span>
                                          )}
                                          {typeof q.relevance_score === 'number' && (
                                            <span className="text-xs px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 font-medium">Relevance: {Math.round(q.relevance_score)}%</span>
                                          )}
                                          {typeof q.response_time === 'number' && (
                                            <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 font-medium">Time: {q.response_time}s</span>
                                          )}
                                        </div>

                                        {/* Student Answer vs Suggested Answer — side by side */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                                          {/* Student's Answer */}
                                          <div className="rounded-lg border border-gray-200 overflow-hidden">
                                            <div className="flex items-center gap-2 bg-gray-50 px-4 py-2.5 border-b border-gray-200">
                                              <span className="h-2 w-2 rounded-full bg-blue-500" />
                                              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Your Answer</p>
                                            </div>
                                            <div className="p-4">
                                              {q.answer ? (
                                                <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{q.answer}</p>
                                              ) : (
                                                <p className="text-sm text-gray-400 italic">No written answer recorded</p>
                                              )}

                                              {/* Voice answer */}
                                              {q.audio && (q.audio.path || q.audio.filename) && (
                                                <div className="mt-3 pt-3 border-t border-gray-100">
                                                  <p className="text-xs font-medium text-gray-500 mb-2">Voice Answer</p>
                                                  {audioUrls[`${result.id}:${q.question_id}`] ? (
                                                    <audio
                                                      controls
                                                      src={audioUrls[`${result.id}:${q.question_id}`]}
                                                      className="w-full"
                                                    />
                                                  ) : (
                                                    <button
                                                      onClick={() => loadAudioUrl(result.id, q.question_id)}
                                                      className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
                                                    >
                                                      Load & Play Audio
                                                    </button>
                                                  )}
                                                  {(q.transcript || q.answer) && (
                                                    <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                                                      <span className="font-medium">Transcript: </span>
                                                      {(q.transcript || q.answer || '').toString()}
                                                    </p>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          </div>

                                          {/* AI Suggested Answer */}
                                          <div className="rounded-lg border border-emerald-200 overflow-hidden">
                                            <div className="flex items-center gap-2 bg-emerald-50 px-4 py-2.5 border-b border-emerald-200">
                                              <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                              <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">AI Suggested Answer</p>
                                            </div>
                                            <div className="p-4">
                                              {q.sample_answer ? (
                                                <p className="text-sm text-emerald-900 whitespace-pre-wrap leading-relaxed">{q.sample_answer}</p>
                                              ) : (
                                                <p className="text-sm text-gray-400 italic">No suggested answer available</p>
                                              )}
                                            </div>
                                          </div>
                                        </div>

                                        {/* Strengths & Weaknesses */}
                                        {((q.strengths && q.strengths.length > 0) || (q.weaknesses && q.weaknesses.length > 0)) && (
                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {q.strengths && q.strengths.length > 0 && (
                                              <div>
                                                <p className="text-xs font-semibold text-green-700 mb-2 uppercase tracking-wide">Strengths</p>
                                                <ul className="space-y-1">
                                                  {q.strengths.map((s, idx) => (
                                                    <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                                                      <span className="text-green-500 mt-0.5">✓</span>
                                                      {s}
                                                    </li>
                                                  ))}
                                                </ul>
                                              </div>
                                            )}
                                            {q.weaknesses && q.weaknesses.length > 0 && (
                                              <div>
                                                <p className="text-xs font-semibold text-amber-700 mb-2 uppercase tracking-wide">Areas to Improve</p>
                                                <ul className="space-y-1">
                                                  {q.weaknesses.map((w, idx) => (
                                                    <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                                                      <span className="text-amber-500 mt-0.5">→</span>
                                                      {w}
                                                    </li>
                                                  ))}
                                                </ul>
                                              </div>
                                            )}
                                          </div>
                                        )}

                                        {/* Feedback */}
                                        {q.feedback && (
                                          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                                            <p className="text-xs font-semibold text-blue-800 mb-1.5 uppercase tracking-wide">AI Feedback</p>
                                            <p className="text-sm text-blue-900 whitespace-pre-wrap leading-relaxed">{q.feedback}</p>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Award className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No interview history</h3>
              <p className="text-gray-600">Complete your first interview to see performance analytics.</p>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  )
}

export default PerformancePage