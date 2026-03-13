import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Footer from '../../components/Footer'
import { ArrowLeft, AlertCircle, BookOpen, Calendar, Clock, Download, ShieldAlert, User } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import jsPDF from 'jspdf'
import { adminApi } from '../../utils/api'

type PerQuestion = {
  question_id?: number
  question?: string
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
}

const InterviewResults = () => {
  const navigate = useNavigate()
  const { interviewId } = useParams<{ interviewId: string }>()

  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({})

  const parsedInterviewId = Number(interviewId)
  const hasValidInterviewId = Number.isFinite(parsedInterviewId) && parsedInterviewId > 0

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

  const loadAudioUrl = async (questionId: number) => {
    const key = `${parsedInterviewId}:${questionId}`
    if (audioUrls[key]) return

    const res = await adminApi.getAnswerAudio(parsedInterviewId, questionId)
    const blob = res.data as Blob
    const url = URL.createObjectURL(blob)
    setAudioUrls((prev) => ({ ...prev, [key]: url }))
  }

  const exportToPdf = () => {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const margin = 14
    const contentW = pageW - margin * 2
    let y = margin

    const checkPage = (needed: number) => {
      if (y + needed > pageH - margin) {
        pdf.addPage()
        y = margin
      }
    }

    const addText = (text: string, opts: { size?: number; bold?: boolean; color?: [number,number,number]; indent?: number; wrap?: boolean } = {}) => {
      const { size = 10, bold = false, color = [30, 30, 30], indent = 0, wrap = true } = opts
      pdf.setFontSize(size)
      pdf.setFont('helvetica', bold ? 'bold' : 'normal')
      pdf.setTextColor(...color)
      const x = margin + indent
      const maxW = contentW - indent
      if (wrap) {
        const lines = pdf.splitTextToSize(text, maxW)
        checkPage(lines.length * (size * 0.4) + 2)
        pdf.text(lines, x, y)
        y += lines.length * (size * 0.4) + 2
      } else {
        checkPage(size * 0.4 + 2)
        pdf.text(text, x, y)
        y += size * 0.4 + 2
      }
    }

    const addHRule = (color: [number,number,number] = [220,220,220]) => {
      checkPage(4)
      pdf.setDrawColor(...color)
      pdf.line(margin, y, pageW - margin, y)
      y += 4
    }

    const addBadge = (label: string, value: string, x: number, bY: number, w: number, bgColor: [number,number,number], textColor: [number,number,number]) => {
      pdf.setFillColor(...bgColor)
      pdf.roundedRect(x, bY - 4, w, 7, 2, 2, 'F')
      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(...textColor)
      pdf.text(`${label}: ${value}`, x + w / 2, bY, { align: 'center' })
    }

    // ── HEADER BANNER ──────────────────────────────────────────
    pdf.setFillColor(30, 64, 175)
    pdf.rect(0, 0, pageW, 24, 'F')
    pdf.setFontSize(14)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(255, 255, 255)
    pdf.text('MockMentorBiz — Interview Result Report', margin, 15)
    y = 30

    // ── STUDENT INFO ───────────────────────────────────────────
    addText('Student Information', { size: 12, bold: true, color: [30, 64, 175] })
    y += 1
    addText(`Name:  ${student?.name || '—'}`, { size: 10, indent: 2 })
    addText(`Email: ${student?.email || '—'}`, { size: 10, indent: 2 })
    if (student?.department) addText(`Department: ${student.department}`, { size: 10, indent: 2 })
    addText(`Interview ID: ${interview?.interview_id || '—'}  |  Type: ${(interview?.interview_type || '').replace(/_/g, ' ')}${interview?.domain ? `  |  Domain: ${interview.domain}` : ''}`, { size: 10, indent: 2 })
    if (interview?.started_at) addText(`Date: ${new Date(interview.started_at).toLocaleDateString()}`, { size: 10, indent: 2 })
    y += 2
    addHRule()

    // ── SCORES ─────────────────────────────────────────────────
    addText('Scores', { size: 12, bold: true, color: [30, 64, 175] })
    y += 2
    const scoreItems = [
      { label: 'Overall', value: Math.round(Number(interview?.overall_score || 0)) },
      { label: 'Technical', value: Math.round(Number(scores?.technical || 0)) },
      { label: 'Communication', value: Math.round(Number(scores?.communication || 0)) },
      { label: 'Confidence', value: Math.round(Number(scores?.confidence || 0)) },
      { label: 'Completion', value: Math.round(Number(scores?.completion_rate || 0)) },
    ]
    const colW = contentW / scoreItems.length
    checkPage(16)
    scoreItems.forEach((sc, i) => {
      const bx = margin + i * colW
      const sc2 = sc.value
      const bg: [number,number,number] = sc2 >= 80 ? [220,252,231] : sc2 >= 60 ? [254,249,195] : [254,226,226]
      const fg: [number,number,number] = sc2 >= 80 ? [22,101,52] : sc2 >= 60 ? [133,77,14] : [153,27,27]
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(80, 80, 80)
      pdf.text(sc.label, bx + colW / 2, y, { align: 'center' })
      addBadge('', `${sc.value}%`, bx + 2, y + 7, colW - 4, bg, fg)
    })
    y += 14
    y += 2

    // malpractice row
    const mc = malpracticeCount
    checkPage(8)
    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(80, 80, 80)
    pdf.text(`Malpractice incidents: `, margin, y)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(mc > 0 ? 153 : 22, mc > 0 ? 27 : 101, mc > 0 ? 27 : 52)
    pdf.text(`${mc} (${mc > 0 ? 'Flagged' : 'Clean'})`, margin + 38, y)
    y += 6
    addHRule()

    // ── GRADE SCALE ────────────────────────────────────────────
    addText('Grade Scale', { size: 12, bold: true, color: [30, 64, 175] })
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
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(...fg)
      pdf.text(g, gx + 3, y)
      pdf.setFont('helvetica', 'normal')
      pdf.text(r, gx + 3 + pdf.getTextWidth(g + '  '), y)
      gx += tw + 3
    })
    y += 8
    addHRule()

    // ── SUMMARY ────────────────────────────────────────────────
    if (strengths.length > 0 || areas.length > 0) {
      addText('Summary', { size: 12, bold: true, color: [30, 64, 175] })
      y += 2
      if (strengths.length > 0) {
        addText('Strengths', { size: 10, bold: true, color: [22, 101, 52] })
        strengths.forEach(s => addText(`• ${s}`, { size: 9, indent: 4, color: [30,30,30] }))
        y += 2
      }
      if (areas.length > 0) {
        addText('Areas for Improvement', { size: 10, bold: true, color: [133, 77, 14] })
        areas.forEach(a => addText(`• ${a}`, { size: 9, indent: 4, color: [30,30,30] }))
        y += 2
      }
      addHRule()
    }

    // ── MALPRACTICE BREAKDOWN ──────────────────────────────────
    if (malpracticeCount > 0 && Object.keys(malpracticeBreakdown).length > 0) {
      addText('Malpractice Breakdown', { size: 12, bold: true, color: [153, 27, 27] })
      y += 2
      Object.entries(malpracticeBreakdown).forEach(([k, v]) => {
        addText(`• ${k.replace(/_/g, ' ')}: ${v}`, { size: 9, indent: 4 })
      })
      y += 2
      addHRule()
    }

    // ── PER-QUESTION ───────────────────────────────────────────
    if (perQuestion.length > 0) {
      addText('Per-Question Evaluation', { size: 12, bold: true, color: [30, 64, 175] })
      y += 3
      const sorted = [...perQuestion].sort((a, b) => Number(a.question_id || 0) - Number(b.question_id || 0))
      sorted.forEach((q, idx) => {
        checkPage(30)
        // Question header bar
        pdf.setFillColor(239, 246, 255)
        pdf.rect(margin, y - 4, contentW, 10, 'F')
        pdf.setFontSize(10)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(30, 64, 175)
        const qLabel = `Q${idx + 1}: ${q.question || ''}`
        const qLines = pdf.splitTextToSize(qLabel, contentW - 4)
        pdf.text(qLines, margin + 2, y)
        y += qLines.length * 5 + 2

        // Answer
        if (q.answer) {
          addText('Student\'s Answer:', { size: 9, bold: true, color: [80,80,80] })
          addText(q.answer, { size: 9, indent: 4, color: [50,50,50] })
          y += 1
        }

        // Suggested Answer
        if (q.sample_answer) {
          checkPage(14)
          pdf.setFillColor(236, 253, 245)
          const saLines = pdf.splitTextToSize(q.sample_answer, contentW - 10)
          const saH = saLines.length * 4.5 + 6
          if (y + saH > pageH - margin) { pdf.addPage(); y = margin }
          pdf.roundedRect(margin, y, contentW, saH, 2, 2, 'F')
          pdf.setFontSize(8)
          pdf.setFont('helvetica', 'bold')
          pdf.setTextColor(5, 150, 105)
          pdf.text('Suggested Answer (AI):', margin + 3, y + 4.5)
          pdf.setFont('helvetica', 'normal')
          pdf.setTextColor(6, 78, 59)
          pdf.text(saLines, margin + 3, y + 9)
          y += saH + 3
        }

        // Transcript
        if (q.transcript && q.transcript !== q.answer) {
          addText('Transcript:', { size: 9, bold: true, color: [80,80,80] })
          addText(q.transcript, { size: 9, indent: 4, color: [50,50,50] })
          y += 1
        }

        // Score chips row
        checkPage(10)
        const chips = [
          { label: 'Technical', val: q.technical_score, bg: [219,234,254] as [number,number,number], fg: [29,78,216] as [number,number,number] },
          { label: 'Communication', val: q.communication_score, bg: [220,252,231] as [number,number,number], fg: [22,101,52] as [number,number,number] },
          { label: 'Relevance', val: q.relevance_score, bg: [243,232,255] as [number,number,number], fg: [109,40,217] as [number,number,number] },
          { label: 'Time', val: q.response_time, bg: [243,244,246] as [number,number,number], fg: [75,85,99] as [number,number,number], suffix: 's' },
        ]
        let cx = margin
        chips.forEach(({ label, val, bg, fg, suffix }) => {
          if (val === undefined || val === null) return
          const chipTxt = `${label}: ${typeof val === 'number' && !suffix ? Math.round(val) + '%' : val + (suffix || '')}`
          const cw = pdf.getTextWidth(chipTxt) + 6
          pdf.setFillColor(...bg)
          pdf.roundedRect(cx, y - 3.5, cw, 6, 1.5, 1.5, 'F')
          pdf.setFontSize(8)
          pdf.setFont('helvetica', 'bold')
          pdf.setTextColor(...fg)
          pdf.text(chipTxt, cx + 3, y)
          cx += cw + 3
        })
        y += 7

        // Strengths
        if (q.strengths && q.strengths.length > 0) {
          addText('Strengths:', { size: 9, bold: true, color: [22, 101, 52] })
          q.strengths.forEach(s => addText(`• ${s}`, { size: 9, indent: 6, color: [30,30,30] }))
          y += 1
        }

        // Weaknesses
        if (q.weaknesses && q.weaknesses.length > 0) {
          addText('Weaknesses:', { size: 9, bold: true, color: [133, 77, 14] })
          q.weaknesses.forEach(w => addText(`• ${w}`, { size: 9, indent: 6, color: [30,30,30] }))
          y += 1
        }

        // Feedback
        if (q.feedback) {
          checkPage(14)
          pdf.setFillColor(239, 246, 255)
          const fbLines = pdf.splitTextToSize(q.feedback, contentW - 10)
          const fbH = fbLines.length * 4.5 + 6
          if (y + fbH > pageH - margin) { pdf.addPage(); y = margin }
          pdf.roundedRect(margin, y, contentW, fbH, 2, 2, 'F')
          pdf.setFontSize(8)
          pdf.setFont('helvetica', 'bold')
          pdf.setTextColor(30, 64, 175)
          pdf.text('Feedback:', margin + 3, y + 4.5)
          pdf.setFont('helvetica', 'normal')
          pdf.setTextColor(30, 30, 80)
          pdf.text(fbLines, margin + 3, y + 9)
          y += fbH + 3
        }

        y += 5
        if (idx < sorted.length - 1) {
          pdf.setDrawColor(200, 200, 200)
          pdf.setLineDashPattern([2, 2], 0)
          pdf.line(margin, y - 2, pageW - margin, y - 2)
          pdf.setLineDashPattern([], 0)
        }
      })
    }

    // ── FOOTER ─────────────────────────────────────────────────
    const totalPages = (pdf as any).internal.getNumberOfPages()
    for (let p = 1; p <= totalPages; p++) {
      pdf.setPage(p)
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(150, 150, 150)
      pdf.text(`MockMentorBiz Interview Report  |  Page ${p} of ${totalPages}`, margin, pageH - 6)
      pdf.text(new Date().toLocaleDateString(), pageW - margin, pageH - 6, { align: 'right' })
    }

    pdf.save(`interview-result-${parsedInterviewId}.pdf`)
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-interview-results', parsedInterviewId],
    queryFn: () => adminApi.getInterviewResults(parsedInterviewId),
    enabled: hasValidInterviewId,
  })

  const payload = data?.data

  if (!hasValidInterviewId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Invalid interview</h3>
          <button
            onClick={() => navigate('/admin/schedule')}
            className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium"
          >
            Back to Scheduling
          </button>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (error || !payload) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Unable to load results</h3>
          <p className="text-gray-600 mb-4">Please try again.</p>
          <button
            onClick={() => navigate('/admin/schedule')}
            className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium"
          >
            Back to Scheduling
          </button>
        </div>
      </div>
    )
  }

  const student = payload.student
  const interview = payload.interview
  const scores = payload.scores
  const strengths: string[] = payload.strengths || []
  const areas: string[] = payload.areas_for_improvement || []
  const malpracticeCount: number = payload.malpractice_count || 0
  const malpracticeBreakdown: Record<string, number> = payload.malpractice_breakdown || {}
  const perQuestion: PerQuestion[] = payload.per_question || []

  const scoreBadge = (v: number) => {
    const score = Number(v || 0)
    const cls = score >= 80 ? 'text-green-600 bg-green-100' : score >= 60 ? 'text-yellow-600 bg-yellow-100' : 'text-red-600 bg-red-100'
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${cls}`}>{Math.round(score)}%</span>
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <button
                onClick={() => navigate('/admin/schedule')}
                className="flex items-center text-gray-500 hover:text-gray-700 mr-4"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </button>
              <h1 className="text-xl font-semibold text-gray-900">Submission Details</h1>
            </div>
            <button
              onClick={exportToPdf}
              className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center"
            >
              <Download className="h-4 w-4 mr-2" />
              Export PDF
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center text-gray-900 font-semibold text-lg">
                <User className="h-5 w-5 mr-2 text-gray-400" />
                {student?.name || 'Student'}
              </div>
              <p className="text-sm text-gray-600">{student?.email}</p>
              {student?.department && <p className="text-sm text-gray-600">{student.department}</p>}
            </div>

            <div className="text-right">
              <div className="text-sm text-gray-600">Interview ID: {interview?.interview_id}</div>
              <div className="text-sm text-gray-600 capitalize">{(interview?.interview_type || '').replace(/_/g, ' ')}</div>
              {interview?.domain && (
                <div className="flex items-center justify-end text-sm text-gray-600 mt-1">
                  <BookOpen className="h-4 w-4 mr-1 text-gray-400" />
                  {interview.domain}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Overall</p>
              <div className="flex items-center justify-between">
                <p className="text-lg font-semibold text-gray-900">{Math.round(Number(interview?.overall_score || 0))}%</p>
                {scoreBadge(Number(interview?.overall_score || 0))}
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Technical</p>
              <div className="flex items-center justify-between">
                <p className="text-lg font-semibold text-gray-900">{Math.round(Number(scores?.technical || 0))}%</p>
                {scoreBadge(Number(scores?.technical || 0))}
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Communication</p>
              <div className="flex items-center justify-between">
                <p className="text-lg font-semibold text-gray-900">{Math.round(Number(scores?.communication || 0))}%</p>
                {scoreBadge(Number(scores?.communication || 0))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Confidence</p>
              <div className="flex items-center justify-between">
                <p className="text-lg font-semibold text-gray-900">{Math.round(Number(scores?.confidence || 0))}%</p>
                {scoreBadge(Number(scores?.confidence || 0))}
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Completion</p>
              <div className="flex items-center justify-between">
                <p className="text-lg font-semibold text-gray-900">{Math.round(Number(scores?.completion_rate || 0))}%</p>
                {scoreBadge(Number(scores?.completion_rate || 0))}
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Malpractice</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <ShieldAlert className="h-4 w-4 mr-2 text-gray-400" />
                  <p className="text-lg font-semibold text-gray-900">{malpracticeCount}</p>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${malpracticeCount > 0 ? 'text-red-600 bg-red-100' : 'text-green-600 bg-green-100'}`}>
                  {malpracticeCount > 0 ? 'Flagged' : 'Clean'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center text-sm text-gray-500 mt-6 space-x-6">
            {interview?.started_at && (
              <div className="flex items-center">
                <Calendar className="h-4 w-4 mr-1" />
                {new Date(interview.started_at).toLocaleDateString()}
              </div>
            )}
            {interview?.ended_at && (
              <div className="flex items-center">
                <Clock className="h-4 w-4 mr-1" />
                {new Date(interview.ended_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
        </div>

        {/* Grade Scale */}
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

        {(strengths.length > 0 || areas.length > 0) && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Summary</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="font-medium text-gray-900 mb-2">Strengths</p>
                {strengths.length ? (
                  <ul className="space-y-2">
                    {strengths.map((s, idx) => (
                      <li key={idx} className="text-sm text-gray-700 bg-green-50 border border-green-100 rounded-lg p-3">
                        {s}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500">No strengths recorded</p>
                )}
              </div>
              <div>
                <p className="font-medium text-gray-900 mb-2">Areas for improvement</p>
                {areas.length ? (
                  <ul className="space-y-2">
                    {areas.map((a, idx) => (
                      <li key={idx} className="text-sm text-gray-700 bg-yellow-50 border border-yellow-100 rounded-lg p-3">
                        {a}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500">No improvements recorded</p>
                )}
              </div>
            </div>
          </div>
        )}

        {malpracticeCount > 0 && Object.keys(malpracticeBreakdown).length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Malpractice breakdown</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(malpracticeBreakdown).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between border border-gray-200 rounded-lg p-3">
                  <span className="text-sm text-gray-700 capitalize">{k.replace(/_/g, ' ')}</span>
                  <span className="text-sm font-medium text-gray-900">{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {perQuestion.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Per-question evaluation</h2>
            <div className="space-y-6">
              {perQuestion
                .slice()
                .sort((a, b) => Number(a.question_id || 0) - Number(b.question_id || 0))
                .map((q, idx) => (
                  <div key={`q-${idx}`} className="border border-gray-200 rounded-xl overflow-hidden">

                    {/* Question header */}
                    <div className="bg-blue-50 border-b border-blue-100 px-5 py-3">
                      <p className="text-sm font-semibold text-blue-900">
                        Q{idx + 1}: {q.question || ''}
                      </p>
                    </div>

                    <div className="p-5 space-y-4">

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
                            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Student's Answer</p>
                          </div>
                          <div className="p-4">
                            {q.answer ? (
                              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{q.answer}</p>
                            ) : (
                              <p className="text-sm text-gray-400 italic">No written answer recorded</p>
                            )}

                            {/* Voice answer */}
                            {q.audio && (q.audio.path || q.audio.filename) && typeof q.question_id === 'number' && (
                              <div className="mt-3 pt-3 border-t border-gray-100">
                                <p className="text-xs font-medium text-gray-500 mb-2">Voice Answer</p>
                                {audioUrls[`${parsedInterviewId}:${q.question_id}`] ? (
                                  <audio controls src={audioUrls[`${parsedInterviewId}:${q.question_id}`]} className="w-full" />
                                ) : (
                                  <button
                                    onClick={() => loadAudioUrl(q.question_id!)}
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

                        {/* Suggested Answer (AI) */}
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
                                {q.strengths.map((s, i) => (
                                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
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
                                {q.weaknesses.map((w, i) => (
                                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
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
      <Footer />
    </div>
  )
}

export default InterviewResults
