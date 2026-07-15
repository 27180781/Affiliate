import { useState } from 'react';

export default function ReferralWidget({ link, refCode }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked — select fallback
      const el = document.getElementById('ref-link-input');
      if (el) {
        el.select();
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    }
  }

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900">קישור ההפניה שלך</h3>
        <span className="badge bg-brand-50 text-brand-700">קוד: {refCode}</span>
      </div>
      <p className="mb-3 text-sm text-slate-500">
        שתפו את הקישור. כל רכישה שתתבצע דרכו — בכל תת-דומיין של clicker.co.il — תזוכה לחשבונכם.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="ref-link-input"
          readOnly
          value={link}
          dir="ltr"
          className="input flex-1 text-left font-mono text-xs"
          onFocus={(e) => e.target.select()}
        />
        <button className="btn-primary shrink-0" onClick={copy}>
          {copied ? '✓ הועתק' : 'העתקת קישור'}
        </button>
      </div>
    </div>
  );
}
