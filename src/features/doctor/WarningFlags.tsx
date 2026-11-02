import React from 'react';
import type { ReportRow } from '../../types/report';
import { describeWarningFlags } from '../../lib/report-presentation';

interface WarningFlagsProps {
  /**
   * The authoritative report row. The flags are read directly from
   * `possible_urgent`, `needs_human_review` and `emergency_rule_id`.
   */
  report: ReportRow | null | undefined;
  /** True while the report row is still loading. */
  isLoading?: boolean;
  className?: string;
  headingClassName?: string;
}

/**
 * Doctor-facing warning flags (P0 D-01).
 *
 * "None" is rendered only when the source row genuinely says there are no flags.
 * Missing or uninterpretable data is stated as such, never as "None".
 */
export const WarningFlags: React.FC<WarningFlagsProps> = ({
  report,
  isLoading = false,
  className = '',
  headingClassName = 'text-[12px] font-bold text-[#1d2433] mb-1',
}) => {
  if (isLoading) {
    return (
      <div className={className}>
        <h3 className={headingClassName}>Warning flags</h3>
        <p role="status" aria-live="polite" className="text-[11px] text-[#4a5470]">
          Loading warning flags…
        </p>
      </div>
    );
  }

  const summary = describeWarningFlags(report);

  return (
    <div className={className} data-testid="warning-flags" data-state={summary.state}>
      <h3 className={headingClassName}>Warning flags</h3>

      {summary.state === 'unavailable' && (
        <p role="alert" className="text-[11px] text-[#a12626]">
          Warning flags unavailable — this report did not include warning data. Do not assume the
          report is unflagged.
        </p>
      )}

      {summary.flags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 mt-1" aria-label="Report warning flags">
          {summary.flags.map((flag) => (
            <li
              key={flag.kind}
              data-flag={flag.kind}
              className="inline-block px-3 py-0.5 rounded-full bg-[#fde2e2] text-[#a12626] text-[10px] font-semibold"
            >
              {flag.label}
            </li>
          ))}
        </ul>
      )}

      {summary.state !== 'unavailable' && summary.flags.length === 0 && (
        <p className="text-[11px] text-[#4a5470]">None</p>
      )}

      {summary.state === 'malformed' && (
        <p className="text-[10px] text-[#a12626] mt-1">
          Some warning data could not be interpreted{summary.flags.length > 0 ? '; the flags shown above are the ones that could be read' : ''}.
        </p>
      )}
    </div>
  );
};
