import React from 'react';

export interface BackButtonProps {
  onClick?: () => void;
  label?: string;
  className?: string;
}

/**
 * Shared Figma-aligned Back Navigation Button (Figma node `report/back-arrow`, 25x25)
 * Used across all non-home screens in Patient Intake and Doctor Portal.
 */
export const BackButton: React.FC<BackButtonProps> = ({
  onClick,
  label = 'Go back',
  className = '',
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`group flex items-center justify-center size-[36px] -m-1.5 rounded-full text-[#1f2a44] hover:bg-black/5 active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1f2a44] select-none ${className}`}
    >
      <svg
        width="25"
        height="25"
        viewBox="0 0 25 25"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-[25px] h-[25px] transition-transform group-hover:-translate-x-0.5"
        aria-hidden="true"
      >
        <path
          d="M14.5833 19.7917L7.29167 12.5L14.5833 5.20833M7.29167 12.5H21.875"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </button>
  );
};
