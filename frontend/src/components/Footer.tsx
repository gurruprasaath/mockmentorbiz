import { useState } from 'react'
import { X } from 'lucide-react'

function TermsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Terms &amp; Conditions</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-4 text-sm text-gray-700 space-y-4">
          <p>
            Welcome to <strong>Punchbiz</strong>. By using this platform, you agree to the following
            terms and conditions. Please read them carefully.
          </p>
          <h3 className="font-semibold text-gray-900">1. Use of Platform</h3>
          <p>
            This platform is provided for educational and training purposes. Users must not misuse
            or attempt to gain unauthorized access to any part of the system.
          </p>
          <h3 className="font-semibold text-gray-900">2. Data Privacy</h3>
          <p>
            All personal data collected through this platform is used solely for the purposes of
            interview training and analytics. We do not share personal information with third
            parties without explicit consent.
          </p>
          <h3 className="font-semibold text-gray-900">3. Intellectual Property</h3>
          <p>
            All content, branding, and materials on this platform are the intellectual property of
            Punchbiz. Unauthorized reproduction or distribution is prohibited.
          </p>
          <h3 className="font-semibold text-gray-900">4. Limitation of Liability</h3>
          <p>
            Punchbiz is not liable for any indirect, incidental, or consequential damages arising
            from the use of this platform.
          </p>
          <h3 className="font-semibold text-gray-900">5. Changes to Terms</h3>
          <p>
            We reserve the right to update these terms at any time. Continued use of the platform
            constitutes acceptance of the revised terms.
          </p>
          <h3 className="font-semibold text-gray-900">6. Contact</h3>
          <p>
            For questions regarding these terms, please contact us at{' '}
            <span className="text-primary-600">support@punchbiz.com</span>.
          </p>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Footer() {
  const [showTerms, setShowTerms] = useState(false)

  return (
    <>
      {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}
      <footer className="mt-auto border-t border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-gray-500">
          <span>&copy; 2026 Punchbiz. All rights reserved.</span>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowTerms(true)}
              className="hover:text-primary-600 transition-colors"
            >
              Terms &amp; Conditions
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={() => setShowTerms(true)}
              className="hover:text-primary-600 transition-colors"
            >
              Privacy Policy
            </button>
          </div>
        </div>
      </footer>
    </>
  )
}
