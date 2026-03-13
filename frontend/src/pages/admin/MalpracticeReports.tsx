import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Footer from '../../components/Footer';
import {
  Shield,
  AlertTriangle,
  Eye,
  Clock,
  ArrowLeft,
  Search,
  Download,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  User,
} from "lucide-react";
import { Link } from "react-router-dom";
import { adminApi, getApiErrorMessage } from "../../utils/api";
import { toast } from "react-hot-toast";

type ViolationBreakdownItem = {
  violation_type: string;
  count: number;
  severity: string;
};

type ConsolidatedReport = {
  report_id: number;
  interview_id: number;
  student_name: string;
  student_email: string;
  interview_type: string;
  interview_date: string;
  overall_score: number | null;
  total_violations: number;
  overall_severity: string;
  violation_breakdown: ViolationBreakdownItem[];
  first_detected_at: string;
  status: string;
  actions_taken: string | null;
};

const SEVERITY_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case "low":      return "text-yellow-700 bg-yellow-100 border-yellow-300";
    case "medium":   return "text-orange-700 bg-orange-100 border-orange-300";
    case "high":     return "text-red-700 bg-red-100 border-red-300";
    case "critical": return "text-red-900 bg-red-200 border-red-400";
    default:         return "text-gray-600 bg-gray-100 border-gray-300";
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "pending":      return "text-blue-700 bg-blue-100";
    case "investigating":return "text-yellow-700 bg-yellow-100";
    case "resolved":     return "text-green-700 bg-green-100";
    case "dismissed":    return "text-gray-600 bg-gray-100";
    case "warned":       return "text-orange-700 bg-orange-100";
    case "penalized":    return "text-red-700 bg-red-100";
    default:             return "text-gray-600 bg-gray-100";
  }
};

const getGrade = (score: number | null) => {
  if (score === null || score === undefined) return "N/A";
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B+";
  if (score >= 60) return "B";
  if (score >= 50) return "C";
  return "D";
};

const getScoreColor = (score: number | null) => {
  if (score === null) return "text-gray-500";
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  return "text-red-600";
};

const VIOLATION_LABELS: Record<string, string> = {
  multiple_faces:    "Multiple Faces",
  tab_switching:     "Tab Switching",
  no_face_detected:  "No Face Detected",
  audio_anomaly:     "Audio Anomaly",
  phone_detected:    "Phone Detected",
  fullscreen_exit:   "Fullscreen Exit",
  copy_paste:        "Copy / Paste",
  right_click:       "Right Click",
  prohibited_keys:   "Prohibited Keys",
  window_blur:       "Window Blur",
  look_away:         "Look Away",
  multiple_persons:  "Multiple Persons",
};

const MalpracticeReports = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedReport, setSelectedReport] = useState<ConsolidatedReport | null>(null);
  const [expandedReports, setExpandedReports] = useState<Set<number>>(new Set());
  const [reviewNotes, setReviewNotes] = useState("");
  const [notesError, setNotesError] = useState(false);

  const queryClient = useQueryClient();

  const { data: reportsData, isLoading } = useQuery({
    queryKey: ["admin-malpractice-reports"],
    queryFn: () => adminApi.getMalpracticeReports({}),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ reportId, action, notes }: { reportId: number; action: string; notes: string }) =>
      adminApi.reviewMalpracticeReport(String(reportId), { action, notes }),
    onSuccess: () => {
      toast.success("Report reviewed successfully");
      setSelectedReport(null);
      setReviewNotes("");
      setNotesError(false);
      queryClient.invalidateQueries({ queryKey: ["admin-malpractice-reports"] });
    },
    onError: (error: any) => {
      toast.error(getApiErrorMessage(error, "Failed to review report"));
    },
  });

  const handleReview = (action: string) => {
    if (!selectedReport) return;
    if (!reviewNotes.trim()) {
      toast.error("Review notes are required before taking any action.");
      setNotesError(true);
      return;
    }
    setNotesError(false);
    reviewMutation.mutate({ reportId: selectedReport.report_id, action, notes: reviewNotes });
  };

  const allReports: ConsolidatedReport[] = reportsData?.data || [];

  // Client-side filter
  const reports = allReports.filter((r) => {
    const matchSearch =
      !searchTerm ||
      r.student_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.student_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(r.interview_id).includes(searchTerm);
    const matchSeverity = filterSeverity === "all" || r.overall_severity === filterSeverity;
    const matchStatus = filterStatus === "all" || r.status === filterStatus;
    return matchSearch && matchSeverity && matchStatus;
  });

  const toggleExpand = (id: number) => {
    setExpandedReports((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Link to="/admin" className="flex items-center text-gray-500 hover:text-gray-700 mr-4">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Malpractice Reports</h1>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Shield className="h-4 w-4" />
              {reports.length} report{reports.length !== 1 ? "s" : ""} shown
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-5 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search student or interview…"
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <select
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
            >
              <option value="all">All Severities</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>

            <select
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="investigating">Investigating</option>
              <option value="warned">Warned</option>
              <option value="penalized">Penalized</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
            </select>

            <button
              onClick={() => { setSearchTerm(""); setFilterSeverity("all"); setFilterStatus("all"); }}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm"
            >
              Clear Filters
            </button>
          </div>
        </div>

        {/* Reports */}
        <div className="space-y-4">
          {isLoading ? (
            [...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg shadow p-6 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
                <div className="h-4 bg-gray-200 rounded w-1/4" />
              </div>
            ))
          ) : reports.length > 0 ? (
            reports.map((report) => {
              const isExpanded = expandedReports.has(report.interview_id);
              const scoreGrade = getGrade(report.overall_score);

              return (
                <div key={report.interview_id} className="bg-white rounded-lg shadow hover:shadow-md transition-shadow">
                  {/* Card header row */}
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      {/* Left: student + meta */}
                      <div className="flex items-start gap-4 flex-1 min-w-0">
                        <div className={`shrink-0 p-2.5 rounded-lg border ${getSeverityColor(report.overall_severity)}`}>
                          <Shield className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="font-semibold text-gray-900 text-base">{report.student_name}</span>
                            <span className="text-xs text-gray-400">{report.student_email}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getSeverityColor(report.overall_severity)}`}>
                              {report.overall_severity.toUpperCase()} severity
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(report.status)}`}>
                              {report.status}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-4 text-xs text-gray-500 mb-3">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              {new Date(report.interview_date).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                            </span>
                            <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-medium">
                              {report.interview_type.replace(/_/g, " ").toUpperCase()}
                            </span>
                            <span>Interview #{report.interview_id}</span>
                          </div>

                          {/* Summary stats row */}
                          <div className="flex flex-wrap gap-6">
                            <div>
                              <div className="text-xs text-gray-500 mb-0.5">Total Violations</div>
                              <div className="text-xl font-bold text-red-600">{report.total_violations}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-0.5">Violation Types</div>
                              <div className="text-xl font-bold text-gray-800">{report.violation_breakdown.length}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-0.5">Interview Score</div>
                              <div className={`text-xl font-bold ${getScoreColor(report.overall_score)}`}>
                                {report.overall_score !== null ? `${Math.round(report.overall_score)}% (${scoreGrade})` : "—"}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right: action buttons */}
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <button
                          onClick={() => { setSelectedReport(report); setReviewNotes(""); setNotesError(false); }}
                          className="flex items-center px-3 py-1.5 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-lg"
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Review
                        </button>
                        <button
                          onClick={() => toggleExpand(report.interview_id)}
                          className="flex items-center px-3 py-1.5 text-sm border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg"
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
                          {isExpanded ? "Hide" : "Details"}
                        </button>
                      </div>
                    </div>

                    {/* Violation type pills (always visible) */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {report.violation_breakdown
                        .slice()
                        .sort((a, b) => (SEVERITY_ORDER[b.severity] ?? 0) - (SEVERITY_ORDER[a.severity] ?? 0))
                        .map((v) => (
                          <span
                            key={v.violation_type}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${getSeverityColor(v.severity)}`}
                          >
                            {VIOLATION_LABELS[v.violation_type] ?? v.violation_type.replace(/_/g, " ")}
                            <span className="font-bold bg-white bg-opacity-60 rounded-full px-1.5">{v.count}×</span>
                          </span>
                        ))}
                    </div>
                  </div>

                  {/* Expanded breakdown table */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 px-5 pb-5 pt-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Violation Breakdown</h4>
                      <div className="overflow-x-auto rounded-lg border border-gray-200">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                            <tr>
                              <th className="px-4 py-2 text-left">Violation Type</th>
                              <th className="px-4 py-2 text-center">Count</th>
                              <th className="px-4 py-2 text-center">Severity</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {report.violation_breakdown
                              .slice()
                              .sort((a, b) => (SEVERITY_ORDER[b.severity] ?? 0) - (SEVERITY_ORDER[a.severity] ?? 0))
                              .map((v) => (
                                <tr key={v.violation_type} className="hover:bg-gray-50">
                                  <td className="px-4 py-2 font-medium text-gray-800">
                                    {VIOLATION_LABELS[v.violation_type] ?? v.violation_type.replace(/_/g, " ")}
                                  </td>
                                  <td className="px-4 py-2 text-center font-bold text-red-600">{v.count}</td>
                                  <td className="px-4 py-2 text-center">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getSeverityColor(v.severity)}`}>
                                      {v.severity}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            <tr className="bg-gray-50 font-semibold">
                              <td className="px-4 py-2 text-gray-700">Total</td>
                              <td className="px-4 py-2 text-center text-red-700">{report.total_violations}</td>
                              <td className="px-4 py-2 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getSeverityColor(report.overall_severity)}`}>
                                  {report.overall_severity} (overall)
                                </span>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {report.actions_taken && (
                        <div className="mt-3 text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                          <span className="font-medium">Review notes: </span>{report.actions_taken}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No malpractice reports</h3>
              <p className="text-gray-500 text-sm">
                {searchTerm || filterSeverity !== "all" || filterStatus !== "all"
                  ? "No reports match your current filters"
                  : "No malpractice incidents have been detected"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Review Modal */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-semibold text-gray-900">Review Malpractice Report</h3>
                <button onClick={() => { setSelectedReport(null); setNotesError(false); setReviewNotes(""); }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
              </div>

              {/* Student & Interview info */}
              <div className="grid grid-cols-2 gap-4 mb-5">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <User className="h-4 w-4 text-gray-400" />
                    <span className="text-xs font-medium text-gray-500 uppercase">Student</span>
                  </div>
                  <div className="font-semibold text-gray-900">{selectedReport.student_name}</div>
                  <div className="text-xs text-gray-500">{selectedReport.student_email}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs font-medium text-gray-500 uppercase mb-1">Interview</div>
                  <div className="font-semibold text-gray-900">#{selectedReport.interview_id}</div>
                  <div className="text-xs text-gray-500">{selectedReport.interview_type.replace(/_/g, " ")}</div>
                  <div className="text-xs text-gray-500">{new Date(selectedReport.interview_date).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</div>
                </div>
              </div>

              {/* Score & severity */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="text-center bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">Interview Score</div>
                  <div className={`text-2xl font-bold ${getScoreColor(selectedReport.overall_score)}`}>
                    {selectedReport.overall_score !== null ? `${Math.round(selectedReport.overall_score)}%` : "—"}
                  </div>
                  <div className="text-sm text-gray-500">{getGrade(selectedReport.overall_score)}</div>
                </div>
                <div className="text-center bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">Total Violations</div>
                  <div className="text-2xl font-bold text-red-600">{selectedReport.total_violations}</div>
                </div>
                <div className="text-center bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">Overall Severity</div>
                  <span className={`inline-block mt-1 px-3 py-1 rounded-full text-xs font-medium border ${getSeverityColor(selectedReport.overall_severity)}`}>
                    {selectedReport.overall_severity.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Violation breakdown */}
              <div className="mb-5">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Violation Breakdown</h4>
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="px-3 py-2 text-left">Type</th>
                        <th className="px-3 py-2 text-center">Count</th>
                        <th className="px-3 py-2 text-center">Severity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selectedReport.violation_breakdown
                        .slice()
                        .sort((a, b) => (SEVERITY_ORDER[b.severity] ?? 0) - (SEVERITY_ORDER[a.severity] ?? 0))
                        .map((v) => (
                          <tr key={v.violation_type}>
                            <td className="px-3 py-2 font-medium text-gray-800">
                              {VIOLATION_LABELS[v.violation_type] ?? v.violation_type.replace(/_/g, " ")}
                            </td>
                            <td className="px-3 py-2 text-center font-bold text-red-600">{v.count}</td>
                            <td className="px-3 py-2 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getSeverityColor(v.severity)}`}>
                                {v.severity}
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Current status */}
              <div className="flex items-center gap-3 mb-5">
                <span className="text-sm text-gray-500">Current status:</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedReport.status)}`}>
                  {selectedReport.status}
                </span>
              </div>

              {/* Review notes */}
              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Review Notes <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={reviewNotes}
                  onChange={(e) => { setReviewNotes(e.target.value); if (e.target.value.trim()) setNotesError(false); }}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent ${notesError ? "border-red-500 bg-red-50" : "border-gray-300"}`}
                  placeholder="Notes are required before taking any action…"
                />
                {notesError && (
                  <p className="mt-1 text-xs text-red-600">Please enter review notes before proceeding.</p>
                )}
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <button
                  onClick={() => handleReview("dismiss")}
                  disabled={reviewMutation.isPending}
                  className="flex items-center justify-center px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm disabled:opacity-50"
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Dismiss
                </button>
                <button
                  onClick={() => handleReview("investigate")}
                  disabled={reviewMutation.isPending}
                  className="flex items-center justify-center px-3 py-2 bg-yellow-100 hover:bg-yellow-200 text-yellow-700 rounded-lg text-sm disabled:opacity-50"
                >
                  <AlertTriangle className="h-4 w-4 mr-1" />
                  Investigate
                </button>
                <button
                  onClick={() => handleReview("warn_student")}
                  disabled={reviewMutation.isPending}
                  className="flex items-center justify-center px-3 py-2 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-lg text-sm disabled:opacity-50"
                >
                  <AlertCircle className="h-4 w-4 mr-1" />
                  Warn
                </button>
                <button
                  onClick={() => handleReview("penalize")}
                  disabled={reviewMutation.isPending}
                  className="flex items-center justify-center px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm disabled:opacity-50"
                >
                  <Shield className="h-4 w-4 mr-1" />
                  Penalize
                </button>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  onClick={() => { setSelectedReport(null); setNotesError(false); setReviewNotes(""); }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleReview("resolve")}
                  disabled={reviewMutation.isPending}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm disabled:opacity-50 flex items-center gap-2"
                >
                  <CheckCircle className="h-4 w-4" />
                  {reviewMutation.isPending ? "Saving…" : "Mark Resolved"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <Footer />
    </div>
  );
};

export default MalpracticeReports;
