import React, { useState, useEffect } from 'react';
import { useI18n } from '../../i18n';
import { AppointmentSlot } from '../../types/doctor';
import { ReportRow } from '../../types/report';
import { getAvailableSlots } from '../../lib/api';
import { PatientHeader } from './PatientHeader';

interface BookingViewProps {
  report: ReportRow;
  onBookAppointment: (slotId: string) => Promise<void>;
  onNotNow: () => void;
}

export const BookingView: React.FC<BookingViewProps> = ({
  report,
  onBookAppointment,
  onNotNow,
}) => {
  const { t } = useI18n();

  // Generate next 7 weekdays
  const generateDates = () => {
    const dates: { dateStr: string; label: string; dayName: string }[] = [];
    const now = new Date();
    let count = 0;
    let offset = 1;

    while (count < 7) {
      const d = new Date(now.getTime() + offset * 86400000);
      const day = d.getDay();
      if (day !== 0 && day !== 6) {
        // Weekday
        const dateStr = d.toISOString().slice(0, 10);
        const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
        const label = `${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'short' })}`;
        dates.push({ dateStr, label, dayName });
        count++;
      }
      offset++;
    }
    return dates;
  };

  const dates = generateDates();
  const [selectedDate, setSelectedDate] = useState<string>(dates[0]?.dateStr || '');
  const [slots, setSlots] = useState<AppointmentSlot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [slotTakenError, setSlotTakenError] = useState(false);
  const [bookingErrorMessage, setBookingErrorMessage] = useState<string | null>(null);
  const [isBooking, setIsBooking] = useState(false);

  // Check if booking is held pending human review (D4 copy)
  const isBookingBlocked = (report.possible_urgent || report.needs_human_review) && !report.reviewed_at;

  useEffect(() => {
    if (selectedDate && !isBookingBlocked) {
      loadSlots(selectedDate);
    }
  }, [selectedDate, report.doctor_id, isBookingBlocked]);

  const loadSlots = async (date: string) => {
    setIsLoadingSlots(true);
    setSlotTakenError(false);
    setBookingErrorMessage(null);
    try {
      const data = await getAvailableSlots(report.id, date);
      setSlots(data);
      // Select first available slot
      const firstFree = data.find((s) => s.is_available);
      setSelectedSlotId(firstFree ? firstFree.id : null);
    } catch {
      setSlots([]);
    } finally {
      setIsLoadingSlots(false);
    }
  };

  const handleBook = async () => {
    if (!selectedSlotId || isBooking) return;
    setIsBooking(true);
    setSlotTakenError(false);
    setBookingErrorMessage(null);
    try {
      await onBookAppointment(selectedSlotId);
    } catch (err: any) {
      if (err?.message?.includes('taken') || err?.message?.includes('23505')) {
        setSlotTakenError(true);
        // Refresh slots
        await loadSlots(selectedDate);
      } else {
        setBookingErrorMessage(err?.message || 'Unable to complete appointment booking. Please try another slot or consult staff.');
      }
    } finally {
      setIsBooking(false);
    }
  };

  return (
    <div className="flex flex-col h-full justify-between pb-4 select-none relative overflow-hidden">
      {/* Top Header & Language Toggle (Figma 72:301) */}
      <PatientHeader progress={1} />

      {/* Booking Blocked State (Decision D4 Copy) */}
      {isBookingBlocked ? (
        <div className="p-6 my-auto text-center flex flex-col items-center">
          <div className="w-14 h-14 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center mb-4 shadow-sm">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-[#1d2433] mb-2">
            {t.booking.bookingBlockedTitle}
          </h3>
          <p className="text-xs text-[#4a5470] leading-relaxed max-w-xs">
            {t.booking.bookingBlockedMessage}
          </p>
          <button
            type="button"
            onClick={onNotNow}
            className="mt-6 px-6 py-2.5 rounded-[22px] bg-[#1f2a44] text-white text-xs font-semibold shadow hover:bg-[#2a3a5c]"
          >
            {t.common.done}
          </button>
        </div>
      ) : (
        /* Normal Booking Flow (P7, P8a, P8b) */
        <div className="flex-1 overflow-y-auto px-5 py-2 space-y-3">
          {/* Title & Subtitle */}
          <div className="pt-1">
            <h1 className="text-[20px] font-bold text-[#1d2433] tracking-tight">
              {t.booking.title}
            </h1>
            <p className="text-[12px] text-[#4a5470] mt-0.5">
              {t.booking.subtitle}
            </p>
          </div>

          {/* Assigned Doctor Card */}
          <div className="backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white rounded-[20px] p-3.5 shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.12)] flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-[#1f2a44] text-white font-bold text-xs flex items-center justify-center shadow-sm flex-shrink-0">
              {report.report.routing_snapshot.doctor_name
                .split(' ')
                .map((n) => n[0])
                .slice(1, 3)
                .join('')}
            </div>
            <div>
              <span className="text-[10px] font-bold text-[#284c91] uppercase tracking-wider block">
                {t.booking.doctorAssigned}
              </span>
              <h4 className="font-bold text-[13px] text-[#1d2433]">
                {report.report.routing_snapshot.doctor_name}
              </h4>
              <p className="text-[11px] text-[#4a5470]">
                {report.report.routing_snapshot.department_name}
              </p>
            </div>
          </div>

          {/* Slot Taken Error Banner (Figma P8a) */}
          {slotTakenError && (
            <div
              role="alert"
              aria-live="assertive"
              className="p-3 rounded-[16px] bg-amber-50/95 border border-amber-300 text-xs text-amber-900 flex items-start gap-2 shadow-sm animate-pulse"
            >
              <svg className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="font-bold">{t.booking.slotTakenTitle}</p>
                <p className="text-[11px] mt-0.5">{t.booking.slotTakenMessage}</p>
              </div>
            </div>
          )}

          {/* Generic Booking Failure Banner */}
          {bookingErrorMessage && (
            <div
              role="alert"
              aria-live="assertive"
              className="p-3 rounded-[16px] bg-red-50/95 border border-red-300 text-xs text-red-900 flex items-start gap-2 shadow-sm"
            >
              <svg className="w-4 h-4 text-red-700 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="font-bold">Booking Error</p>
                <p className="text-[11px] mt-0.5">{bookingErrorMessage}</p>
              </div>
            </div>
          )}

          {/* Date Selector Card (Figma 81:384) */}
          <div className="backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white rounded-[20px] p-3 shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.12)]">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#4a5470] mb-2 px-1">
              {t.booking.selectDate}
            </label>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none" role="group" aria-label="Consultation dates">
              {dates.map((d) => {
                const isSelected = d.dateStr === selectedDate;
                return (
                  <button
                    key={d.dateStr}
                    type="button"
                    onClick={() => setSelectedDate(d.dateStr)}
                    aria-label={`Select date ${d.dayName} ${d.label}`}
                    aria-pressed={isSelected}
                    className={`flex-shrink-0 w-[94px] py-2.5 rounded-[16px] text-center border transition-all focus:outline-none focus:ring-2 focus:ring-[#1f2a44] ${
                      isSelected
                        ? 'bg-[#1f2a44] border-[#1f2a44] text-white shadow-sm'
                        : 'bg-white/80 border-white text-[#1d2433] hover:bg-white'
                    }`}
                  >
                    <span className="text-[10px] uppercase font-bold block opacity-75">
                      {d.dayName}
                    </span>
                    <span className="text-xs font-semibold block mt-0.5">
                      {d.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time Slot Chips Card (Figma 81:396) */}
          <div className="backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white rounded-[20px] p-3.5 shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.12)]">
            <div className="flex items-center justify-between mb-2 px-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-[#4a5470]">
                {t.booking.selectTime}
              </label>
              <span className="text-[10px] text-[#4a5470]/70">
                30 min slots
              </span>
            </div>

            {isLoadingSlots ? (
              <div role="status" aria-live="polite" className="py-8 text-center text-xs text-[#4a5470]">
                {t.common.loading}
              </div>
            ) : slots.length === 0 ? (
              /* No Slots Card (Figma P8b) */
              <div className="py-6 text-center">
                <svg className="w-7 h-7 text-[#4a5470]/50 mx-auto mb-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <h4 className="text-xs font-bold text-[#1d2433]">
                  {t.booking.noSlotsTitle}
                </h4>
                <p className="text-[11px] text-[#4a5470] mt-0.5">
                  {t.booking.noSlotsMessage}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2" role="group" aria-label="Available appointment times">
                {slots.map((s) => {
                  const isSelected = s.id === selectedSlotId;
                  const isFree = s.is_available;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={!isFree}
                      onClick={() => setSelectedSlotId(s.id)}
                      aria-label={`${s.time_display}${isFree ? ', available' : ', unavailable'}`}
                      aria-pressed={isSelected}
                      className={`h-[44px] rounded-[14px] text-xs font-semibold border transition-all focus:outline-none focus:ring-2 focus:ring-[#1f2a44] ${
                        isSelected
                          ? 'bg-[#1f2a44] border-[#1f2a44] text-white shadow-sm'
                          : isFree
                          ? 'bg-white/80 border-white text-[#1d2433] hover:bg-white'
                          : 'bg-slate-200/50 border-transparent text-[#4a5470]/50 line-through cursor-not-allowed'
                      }`}
                    >
                      {s.time_display}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Footer (Figma 81:410 & 81:415) */}
      {!isBookingBlocked && (
        <div className="px-5 pt-2 space-y-2">
          {/* Confirm Appointment Button */}
          <button
            type="button"
            onClick={handleBook}
            disabled={!selectedSlotId || isBooking || slots.length === 0}
            className="w-full h-[54px] rounded-[27px] bg-[#1f2a44] border border-[#1f2a44] text-white font-semibold text-[14px] shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.22)] hover:bg-[#2a3a5c] disabled:opacity-50 active:scale-[0.99] transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
          >
            {isBooking ? t.common.loading : t.booking.bookSlot}
          </button>

          {/* Not Now button */}
          <button
            type="button"
            onClick={onNotNow}
            disabled={isBooking}
            className="w-full h-[38px] rounded-[19px] bg-transparent text-[#4a5470] hover:text-[#1d2433] font-semibold text-[13px] transition-colors flex items-center justify-center focus:outline-none"
          >
            {t.booking.notNow}
          </button>

          {/* Footer Disclaimer */}
          <p className="text-[9px] text-center text-[#4a5470] pt-0.5 leading-tight font-normal">
            {t.welcome.disclaimer}
          </p>
        </div>
      )}
    </div>
  );
};
