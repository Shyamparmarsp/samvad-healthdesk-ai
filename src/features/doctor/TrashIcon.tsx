import React from 'react';

/**
 * Clean red trash-can icon for the report delete action.
 *
 * Drawn locally as vector paths (no stock image, no watermark, no background): a solid
 * red body, a clearly separated lid with a handle, and two white cut-outs that read as
 * the bin's slits at 18–20 px.
 */
export const TrashIcon: React.FC<{ className?: string }> = ({ className = 'h-5 w-5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
    focusable="false"
  >
    {/* Handle */}
    <path
      d="M9.1 4.2h5.8a1.3 1.3 0 0 1 1.3 1.3V6H7.8v-.5a1.3 1.3 0 0 1 1.3-1.3Z"
      fill="currentColor"
    />
    {/* Lid */}
    <rect x="4.4" y="6" width="15.2" height="2.6" rx="1.3" fill="currentColor" />
    {/* Body */}
    <path
      d="M6.2 9.2h11.6l-1 9.9a1.7 1.7 0 0 1-1.7 1.5H8.9a1.7 1.7 0 0 1-1.7-1.5l-1-9.9Z"
      fill="currentColor"
    />
    {/* White slits */}
    <rect x="9.55" y="11.3" width="1.5" height="6.6" rx="0.75" fill="#ffffff" />
    <rect x="12.95" y="11.3" width="1.5" height="6.6" rx="0.75" fill="#ffffff" />
  </svg>
);
