import React from 'react';
import { BackButton } from '../common/BackButton';

interface DoctorPageHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  back?: { onClick: () => void; label: string };
  /** Status chips or other short metadata, shown under the title. */
  meta?: React.ReactNode;
  /** Search, filters or other full-width controls, shown under the title row. */
  toolbar?: React.ReactNode;
  /** The shared Samwad Assistant. Always pinned to the upper-right corner. */
  assistant?: React.ReactNode;
}

/**
 * One header layout for every authenticated doctor page.
 *
 * The Samwad Assistant sits in the upper-right corner at every width (Figma `140:8`
 * places it at x=922, y=26 in the 1280-wide dashboard frame, level with the page title).
 * The title column is the only flexible element: it takes the remaining width, wraps, and
 * never pushes the assistant down, sideways or below the content. Search/filter controls
 * live on their own row so they can never displace the assistant either.
 */
export const DoctorPageHeader: React.FC<DoctorPageHeaderProps> = ({
  title,
  subtitle,
  back,
  meta,
  toolbar,
  assistant,
}) => (
  <header className="flex flex-col gap-4">
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {back && (
          <div className="mt-1 shrink-0">
            <BackButton onClick={back.onClick} label={back.label} />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-[20px] font-bold leading-tight tracking-tight text-[#1d2433] sm:text-[23px] lg:text-[26px]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 break-words text-[11px] leading-snug text-[#4a5470] sm:text-[12px]">{subtitle}</p>
          )}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
      </div>

      {assistant && (
        <div className="shrink-0 pt-0.5" data-assistant-slot="upper-right">
          {assistant}
        </div>
      )}
    </div>

    {toolbar && <div>{toolbar}</div>}
  </header>
);
