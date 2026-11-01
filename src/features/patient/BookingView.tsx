import React, { useState, useEffect } from 'react';
import { useI18n } from '../../i18n';
import { AppointmentSlot } from '../../types/doctor';
import { ReportRow } from '../../types/report';
import { getAvailableSlots } from '../../lib/api';

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
    try {
      await onBookAppointment(selectedSlotId);
    } catch (err: any) {
      if (err?.message?.includes('taken') || err?.message?.includes('23505')) {
        setSlotTakenError(true);
        // Refresh slots
        await loadSlots(selectedDate);
      }
    } finally {
      setIsBooking(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface-mobile">
      {/* Header */}
      <div className="px-6 py-4 bg-white/70 backdrop-blur-md border-b border-slate-200/60 sticky top-0 z-10">
        <h2 className="text-xl font-bold text-text-primary tracking-tight">
          {t.booking.title}
        </h2>
        <p className="text-xs text-text-secondary mt-0.5">
          {t.booking.subtitle}
        </p>
      </div>

      {/* Booking Blocked State (Decision D4 Copy) */}
      {isBookingBlocked ? (
        <div className="p-6 my-auto text-center flex flex-col items-center">
          <div className="w-14 h-14 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center mb-4">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-2">
            {t.booking.bookingBlockedTitle}
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed max-w-xs">
            {t.booking.bookingBlockedMessage}
          </p>
          <button
            onClick={onNotNow}
            className="mt-6 px-6 py-2.5 rounded-pill bg-brand-navy text-white text-xs font-semibold shadow hover:bg-brand-navy-light"
          >
            {t.common.done}
          </button>
        </div>
      ) : (
        /* Normal Booking Flow (P7, P8a, P8b) */
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Assigned Doctor Card */}
          <div className="p-4 rounded-card bg-white border border-slate-200 shadow-sm flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-brand-navy to-indigo-600 text-white font-bold text-sm flex items-center justify-center shadow-sm">
              {report.report.routing_snapshot.doctor_name
                .split(' ')
                .map((n) => n[0])
                .slice(1, 3)
                .join('')}
            </div>
            <div>
              <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider block">
                {t.booking.doctorAssigned}
              </span>
              <h4 className="font-bold text-sm text-text-primary">
                {report.report.routing_snapshot.doctor_name}
              </h4>
              <p className="text-xs text-text-secondary">
                {report.report.routing_snapshot.department_name}
              </p>
            </div>
          </div>

          {/* Slot Taken Error Banner (P8a) */}
          {slotTakenError && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-900 flex items-start gap-2 shadow-sm animate-pulse">
              <svg className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="font-bold">{t.booking.slotTakenTitle}</p>
                <p className="text-[11px] mt-0.5">{t.booking.slotTakenMessage}</p>
              </div>
            </div>
          )}

          {/* Date Selector Chips */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              {t.booking.selectDate}
            </label>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
              {dates.map((d) => {
                const isSelected = d.dateStr === selectedDate;
                return (
                  <button
                    key={d.dateStr}
                    onClick={() => setSelectedDate(d.dateStr)}
                    className={`flex-shrink-0 px-3.5 py-2 rounded-xl text-center border transition-all ${
                      isSelected
                        ? 'bg-brand-navy border-brand-navy text-white shadow-sm'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-[10px] uppercase font-bold block opacity-80">
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

          {/* Time Slot Chips Grid */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {t.booking.selectTime}
              </label>
              <span className="text-[10px] text-slate-400">
                30 min slots
              </span>
            </div>

            {isLoadingSlots ? (
              <div className="py-8 text-center text-xs text-slate-500">
                {t.common.loading}
              </div>
            ) : slots.length === 0 ? (
              /* No Slots Card (P8b) */
              <div className="p-6 rounded-card bg-white border border-slate-200 text-center">
                <svg className="w-8 h-8 text-slate-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <h4 className="text-xs font-bold text-slate-700">
                  {t.booking.noSlotsTitle}
                </h4>
                <p className="text-[11px] text-slate-400 mt-1">
                  {t.booking.noSlotsMessage}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {slots.map((s) => {
                  const isSelected = s.id === selectedSlotId;
                  const isFree = s.is_available;
                  return (
                    <button
                      key={s.id}
                      disabled={!isFree}
                      onClick={() => setSelectedSlotId(s.id)}
                      className={`py-2 px-1 text-center rounded-lg text-xs font-medium border transition-all ${
                        isSelected
                          ? 'bg-brand-navy border-brand-navy text-white shadow-sm'
                          : isFree
                          ? 'bg-white border-slate-200 text-slate-800 hover:border-slate-300'
                          : 'bg-slate-100 border-slate-100 text-slate-400 line-through cursor-not-allowed'
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

      {/* Action Footer */}
      {!isBookingBlocked && (
        <div className="p-4 bg-white/80 border-t border-slate-200/60 backdrop-blur-md space-y-2">
          <button
            onClick={handleBook}
            disabled={!selectedSlotId || isBooking || slots.length === 0}
            className="w-full h-btn-mobile rounded-pill bg-brand-navy text-white font-semibold text-sm shadow-md hover:bg-brand-navy-light disabled:opacity-50 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
          >
            {isBooking ? t.common.loading : t.booking.bookSlot}
          </button>

          {/* Not Now button (creates no appointment; report remains submitted) */}
          <button
            onClick={onNotNow}
            disabled={isBooking}
            className="w-full py-2.5 text-xs text-slate-500 hover:text-slate-800 font-medium transition-colors"
          >
            {t.booking.notNow}
          </button>
        </div>
      )}
    </div>
  );
};

