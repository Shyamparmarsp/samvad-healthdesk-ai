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
  const [visibleDateCount, setVisibleDateCount] = useState(7);
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

  const handleTryAnotherDate = () => {
    if (!dates.length) return;
    try {
      sessionStorage.removeItem('FIGMA_PARITY_NO_SLOTS');
    } catch {}
    const currentIdx = dates.findIndex((d) => d.dateStr === selectedDate);
    const nextIdx = (currentIdx + 1) % dates.length;
    const nextDate = dates[nextIdx].dateStr;
    setSelectedDate(nextDate);
    void loadSlots(nextDate);
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
        /* Normal Booking Flow (P7, P8a, P8b) */
        <div className="flex-1 overflow-y-auto px-5 py-2 space-y-3">
          {/* Title & Subtitle */}
          <div className="pt-1">
            <h1 className="text-[20px] font-bold text-[#1d2433] tracking-tight">
              <span>{language === 'hi' ? 'अपॉइंटमेंट बुक करें' : 'Book an appointment'}</span>
              <span className="sr-only"> · Schedule Consultation</span>
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
              className="p-3 rounded-[16px] bg-amber-50/95 border border-amber-300 text-xs text-amber-900 flex items-start gap-2 shadow-sm"
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
                <p className="font-bold">{t.booking.bookingErrorTitle}</p>
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
              {visibleDates.map((d) => {
                const isSelected = d.dateKey === selectedDate;
                return (
                  <button
                    key={d.dateKey}
                    type="button"
                    onClick={() => setSelectedDate(d.dateKey)}
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
            {canShowMoreDates && (
              <button
                type="button"
                onClick={() => setVisibleDateCount(dates.length)}
                className="mt-2 text-[11px] font-semibold text-[#1f2a44] hover:underline focus:outline-none"
              >
                {t.booking.moreDates}
              </button>
            )}
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
            ) : slotLoadError ? (
              /* D-22: a failed load is distinct from "no free slots" and offers retry. */
              <div role="alert" className="py-6 text-center">
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
              /* No Slots Card (Figma P8b) */
              <div className="py-6 text-center">
                <svg className="w-7 h-7 text-[#4a5470]/50 mx-auto mb-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <h4 className="text-xs font-bold text-[#1d2433]">
                  {t.booking.noSlotsTitle}
                </h4>
                <p className="text-[11px] text-[#4a5470] mt-0.5">
                  {noOtherDates ? t.booking.noOtherDates : t.booking.noSlotsMessage}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2" role="group" aria-label="Available appointment times">
                {slots.map((s) => {
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
                      className={`h-[44px] rounded-[14px] text-xs font-semibold border transition-all focus:outline-none focus:ring-2 focus:ring-[#1f2a44] ${
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
            )}
          </div>
        </div>
      )}

      {/* Action Footer (Figma 81:410 & 81:415) */}
      {!isBookingBlocked && (
        <div className="px-5 pt-2 space-y-2">
          {/* Confirm Appointment or Try another date Button */}
          <button
            type="button"
            onClick={slots.length === 0 || slotLoadError ? () => void handleTryAnotherDate() : handleBook}
            disabled={isLoadingSlots || isBooking || (slots.length > 0 && !selectedSlot)}
            className="w-full h-[54px] rounded-[27px] bg-[#1f2a44] border border-[#1f2a44] text-white font-semibold text-[14px] shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.22)] hover:bg-[#2a3a5c] disabled:opacity-50 active:scale-[0.99] transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
          >
            {slots.length === 0 || slotLoadError
              ? t.booking.tryAnotherDate
              : isBooking
              ? t.common.loading
              : `${t.booking.bookSlot}${selectedSlot ? ` · ${formatIstTime(selectedSlot.start_time) ?? ''}` : ''}`}
          </button>

          {/* Not Now button */}
          <button
            type="button"
            onClick={onNotNow}
            disabled={isBooking}
            className="w-full h-[38px] rounded-[19px] bg-transparent text-[#4a5470] hover:text-[#1d2433] font-semibold text-[13px] transition-colors flex items-center justify-center focus:outline-none disabled:opacity-50"
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
