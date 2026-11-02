import React, { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../i18n';
import { AppointmentSlot } from '../../types/doctor';
import { ReportRow } from '../../types/report';
import { getAvailableSlots } from '../../lib/api';
import { buildWeekdayDateOptions, DateOption, formatIstTime } from '../../lib/booking-time';
import { PatientHeader } from './PatientHeader';
import { BackButton } from '../common/BackButton';

interface BookingViewProps {
  report: ReportRow;
  /**
   * D-03: the booked slot is passed as both its id and its authoritative ISO start
   * timestamp. A slot id is never used as a date.
   */
  onBookAppointment: (slotId: string, slotStart: string) => Promise<void>;
  onNotNow: () => void;
  onBack?: () => void;
}

export const BookingView: React.FC<BookingViewProps> = ({
  report,
  onBookAppointment,
  onNotNow,
  onBack,
}) => {
  const { t, language } = useI18n();

  // Asia/Kolkata weekday options (D-21).
  const dates: DateOption[] = useMemo(() => buildWeekdayDateOptions(new Date(), 14, 1), []);
  const [visibleDateCount, setVisibleDateCount] = useState(3);
  const [selectedDate, setSelectedDate] = useState<string>(dates[0]?.dateKey || '');
  const [slots, setSlots] = useState<AppointmentSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AppointmentSlot | null>(null);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [slotLoadError, setSlotLoadError] = useState(false);
  const [noOtherDates, setNoOtherDates] = useState(false);
  const [slotTakenError, setSlotTakenError] = useState(false);
  const [bookingErrorMessage, setBookingErrorMessage] = useState<string | null>(null);
  const [isBooking, setIsBooking] = useState(false);

  // Check if booking is held pending human review (D4 copy)
  const isBookingBlocked = (report.possible_urgent || report.needs_human_review) && !report.reviewed_at;

  useEffect(() => {
    if (selectedDate && !isBookingBlocked) {
      void loadSlots(selectedDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, report.doctor_id, isBookingBlocked]);

  const loadSlots = async (date: string) => {
    setIsLoadingSlots(true);
    setSlotTakenError(false);
    setBookingErrorMessage(null);
    setSlotLoadError(false);
    setNoOtherDates(false);

    try {
      const data = await getAvailableSlots(report.id, date);
      setSlots(data);
      const firstFree = data.find((s) => s.is_available) ?? null;
      setSelectedSlot(firstFree);
    } catch {
      // D-22: a load failure is not the same as "no free slots".
      setSlots([]);
      setSelectedSlot(null);
      setSlotLoadError(true);
    } finally {
      setIsLoadingSlots(false);
    }
  };

  const handleBook = async () => {
    if (!selectedSlot || isBooking) return;
    setIsBooking(true);
    setSlotTakenError(false);
    setBookingErrorMessage(null);
    try {
      await onBookAppointment(selectedSlot.id, selectedSlot.start_time);
    } catch (err: any) {
      const code = err?.code;
      if (code === 'already_booked') {
        setBookingErrorMessage(t.booking.alreadyBooked);
      } else if (code === 'slot_taken' || err?.message?.includes('taken') || err?.message?.includes('23505')) {
        setSlotTakenError(true);
        await loadSlots(selectedDate);
      } else {
        setBookingErrorMessage(err?.message || t.booking.bookingErrorTitle);
      }
    } finally {
      setIsBooking(false);
    }
  };

  /** D-13: move to the next date that actually has a free slot. */
  const handleTryAnotherDate = async () => {
    if (isLoadingSlots) return;
    const currentIndex = dates.findIndex((d) => d.dateKey === selectedDate);
    const candidates = dates.slice(Math.max(0, currentIndex + 1));
    if (candidates.length === 0) {
      setNoOtherDates(true);
      return;
    }

    setIsLoadingSlots(true);
    setSlotLoadError(false);
    setNoOtherDates(false);
    try {
      for (const candidate of candidates) {
        const data = await getAvailableSlots(report.id, candidate.dateKey);
        if (data.some((slot) => slot.is_available)) {
          setVisibleDateCount(dates.length);
          setSelectedDate(candidate.dateKey);
          return;
        }
      }
      setNoOtherDates(true);
    } catch {
      setSlotLoadError(true);
    } finally {
      setIsLoadingSlots(false);
    }
  };

  const visibleDates = dates.slice(0, visibleDateCount);
  const canShowMoreDates = visibleDateCount < dates.length;

  return (
    <div className="flex flex-col h-full justify-between pb-4 select-none relative overflow-hidden">
      {/* Top Header & Language Toggle (Figma 72:301) */}
      <PatientHeader progress={1} />

      {onBack && (
        <div className="px-5 pt-0.5 pb-1 flex items-center">
          <BackButton onClick={onBack} />
        </div>
      )}

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
        /* Normal Booking Flow (Figma P7, P8a, P8b) */
        <div className="flex-1 overflow-y-auto px-5 py-2 space-y-3.5 flex flex-col justify-between">
          <div className="space-y-3.5">
            {/* Title & Subtitle matching Figma P7 */}
            <div className="pt-1">
              <h1 className="text-[22px] font-bold text-[#1d2433] tracking-tight">
                <span>{language === 'hi' ? 'अपॉइंटमेंट बुक करें' : 'Book an appointment'}</span>
                <span className="sr-only"> · Schedule Consultation</span>
              </h1>
              <p className="text-[13px] text-[#4a5470] mt-0.5">
                {report.report.routing_snapshot.doctor_name} · {report.report.routing_snapshot.department_name}
              </p>
            </div>

            {/* Slot Taken Error Banner (Figma P8a) */}
            {slotTakenError && (
              <div
                role="alert"
                aria-live="assertive"
                className="rounded-[18px] bg-[#fde8e8] border border-[#fbd5d5] p-3.5 text-center shadow-sm"
              >
                <p className="text-[12px] font-medium text-[#c81e1e]">
                  {language === 'hi' ? 'यह स्लॉट अभी बुक हो गया। कृपया दूसरा चुनें।' : 'That slot was just taken. Please choose another.'}
                </p>
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
                  <p className="font-bold">{t.booking.bookingErrorTitle}</p>
                  <p className="text-[11px] mt-0.5">{bookingErrorMessage}</p>
                </div>
              </div>
            )}

            {/* Date Selector Card (Figma P7 / 81:384) */}
            <div className="backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white rounded-[22px] p-3.5 shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.12)]">
              <div className="grid grid-cols-3 gap-2" role="group" aria-label="Consultation dates">
                {visibleDates.slice(0, visibleDateCount).map((d) => {
                  const isSelected = d.dateKey === selectedDate;
                  return (
                    <button
                      key={d.dateKey}
                      type="button"
                      onClick={() => setSelectedDate(d.dateKey)}
                      aria-label={`Select date ${d.dayName} ${d.label}`}
                      aria-pressed={isSelected}
                      className={`py-2.5 rounded-[16px] text-center border transition-all focus:outline-none focus:ring-2 focus:ring-[#1f2a44] ${
                        isSelected
                          ? 'bg-[#1f2a44] border-[#1f2a44] text-white shadow-sm'
                          : 'bg-white/80 border-white text-[#1d2433] hover:bg-white'
                      }`}
                    >
                      <span className="text-[10px] font-medium block opacity-80">
                        {d.dayName}
                      </span>
                      <span className="text-[12px] font-bold block mt-0.5">
                        {d.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              {canShowMoreDates && (
                <div className="text-center mt-2">
                  <button
                    type="button"
                    onClick={() => setVisibleDateCount(dates.length)}
                    className="text-[11px] font-semibold text-[#1f2a44] hover:underline focus:outline-none"
                  >
                    {t.booking.moreDates}
                  </button>
                </div>
              )}
            </div>

            {/* Time Slot Chips Card (Figma P7 / 81:396 & P8b dedicated state) */}
            {isLoadingSlots ? (
              <div className="backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white rounded-[22px] p-8 text-center text-xs text-[#4a5470] shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.12)]" role="status" aria-live="polite">
                {t.common.loading}
              </div>
            ) : slotLoadError ? (
              /* D-22: a failed load is distinct from "no free slots" and offers retry. */
              <div className="backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white rounded-[22px] p-6 text-center shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.12)]" role="alert">
                <h4 className="text-xs font-bold text-[#a12626]">{t.booking.loadErrorTitle}</h4>
                <p className="text-[11px] text-[#4a5470] mt-0.5">{t.booking.loadErrorMessage}</p>
                <button
                  type="button"
                  onClick={() => void loadSlots(selectedDate)}
                  className="mt-3 px-4 py-1.5 rounded-full bg-[#1f2a44] text-white text-[11px] font-semibold"
                >
                  {t.common.retry}
                </button>
              </div>
            ) : slots.length === 0 ? (
              /* Dedicated No Slots Card matching Figma P8b */
              <div className="backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white rounded-[22px] p-6 shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.12)] text-center space-y-3">
                <h3 className="text-[15px] font-bold text-[#1d2433]">
                  {noOtherDates ? t.booking.noOtherDates : (language === 'hi' ? 'इस तिथि पर कोई स्लॉट उपलब्ध नहीं है।' : 'No free slots on this date.')}
                </h3>
                <button
                  type="button"
                  onClick={() => void handleTryAnotherDate()}
                  disabled={noOtherDates}
                  className="w-full h-[46px] rounded-full bg-[#1f2a44] text-white font-semibold text-[13px] shadow hover:bg-[#2a3a5c] transition-all disabled:opacity-50"
                >
                  {t.booking.tryAnotherDate}
                </button>
                <button
                  type="button"
                  onClick={onNotNow}
                  className="w-full h-[46px] rounded-full bg-white/80 border border-white text-[#1d2433] font-semibold text-[13px] shadow-sm hover:bg-white transition-all"
                >
                  {t.booking.notNow}
                </button>
              </div>
            ) : (
              /* Slots Grid matching Figma P7 (2 rows of 3 pills) */
              <div className="backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white rounded-[22px] p-4 shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.12)]">
                <div className="grid grid-cols-3 gap-2.5" role="group" aria-label="Available appointment times">
                  {slots.slice(0, 6).map((s) => {
                    const isSelected = selectedSlot?.id === s.id;
                    const isFree = s.is_available;
                    const timeLabel = formatIstTime(s.start_time) ?? s.time_display;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={!isFree}
                        onClick={() => setSelectedSlot(s)}
                        aria-label={`${timeLabel}${isFree ? ', available' : ', unavailable'}`}
                        aria-pressed={isSelected}
                        className={`h-[46px] rounded-[16px] text-xs font-semibold border transition-all focus:outline-none focus:ring-2 focus:ring-[#1f2a44] ${
                          isSelected
                            ? 'bg-[#1f2a44] border-[#1f2a44] text-white shadow-sm'
                            : isFree
                            ? 'bg-white/80 border-white text-[#1d2433] hover:bg-white'
                            : 'bg-slate-200/50 border-transparent text-[#4a5470]/50 line-through cursor-not-allowed'
                        }`}
                      >
                        {timeLabel}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Footer matching Figma P7 (81:410 & 81:415) */}
      {!isBookingBlocked && slots.length > 0 && !slotLoadError && (
        <div className="px-5 pt-1 space-y-2">
          {/* Confirm Appointment with Calendar Icon matching Figma P7 */}
          <button
            type="button"
            onClick={handleBook}
            disabled={isLoadingSlots || isBooking || !selectedSlot}
            aria-label={t.booking.bookSlot}
            className="w-full h-[52px] rounded-full bg-[#1f2a44] border border-[#1f2a44] text-white font-semibold text-[14px] shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.22)] hover:bg-[#2a3a5c] disabled:opacity-50 active:scale-[0.99] transition-all flex items-center justify-center gap-2.5 focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            <span>
              {isBooking
                ? t.common.loading
                : selectedSlot
                ? `${language === 'hi' ? 'बुक करें' : 'Book'} ${formatIstTime(selectedSlot.start_time) ?? ''}`
                : t.booking.bookSlot}
            </span>
            <span className="sr-only"> · {t.booking.bookSlot}</span>
          </button>

          {/* Not Now text button */}
          <div className="text-center pt-0.5">
            <button
              type="button"
              onClick={onNotNow}
              disabled={isBooking}
              className="text-[13px] font-medium text-[#4a5470] hover:text-[#1d2433] transition-colors focus:outline-none disabled:opacity-50"
            >
              {t.booking.notNow}
            </button>
          </div>

          {/* Footer Disclaimer */}
          <p className="text-[9px] text-center text-[#4a5470] pt-0.5 leading-tight font-normal">
            {t.welcome.disclaimer}
          </p>
        </div>
      )}
    </div>
  );
};
