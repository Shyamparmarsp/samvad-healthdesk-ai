import React, { useState } from 'react';
import { Appointment, DoctorAppointmentsTab } from '../../types/doctor';

interface DoctorAppointmentsViewProps {
  appointments: Appointment[];
  onSelectReport?: (reportId: string) => void;
}

export function getIstDateStr(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
}

export function filterAppointmentsByTab(
  appointments: Appointment[],
  tab: DoctorAppointmentsTab,
  now: Date = new Date()
): Appointment[] {
  const todayDateStr = getIstDateStr(now);

  return appointments.filter((apt) => {
    const slotStartDate = new Date(apt.slot_start);
    const slotDateStr = getIstDateStr(slotStartDate);

    if (tab === 'today') {
      return slotDateStr === todayDateStr;
    } else if (tab === 'upcoming') {
      return slotDateStr > todayDateStr;
    } else if (tab === 'past') {
      return slotDateStr < todayDateStr;
    }
    return true;
  });
}

export const DoctorAppointmentsView: React.FC<DoctorAppointmentsViewProps> = ({
  appointments,
  onSelectReport,
}) => {
  const [activeTab, setActiveTab] = useState<DoctorAppointmentsTab>('today');
  const now = new Date();

  // Derive Today, Upcoming, Past based on slot_start in Asia/Kolkata
  const filteredAppointments = filterAppointmentsByTab(appointments, activeTab, now);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">
          Clinical Appointments
        </h1>
        <p className="text-xs text-text-secondary mt-0.5">
          Patient consultations scheduled via Samvad HealthDesk AI referral.
        </p>
      </div>

      {/* Tabs (Today / Upcoming / Past) */}
      <div className="flex border-b border-slate-200 gap-6 text-xs font-semibold">
        {(['today', 'upcoming', 'past'] as DoctorAppointmentsTab[]).map((tab) => {
          const isActive = activeTab === tab;
          const labels: Record<DoctorAppointmentsTab, string> = {
            today: 'Today',
            upcoming: 'Upcoming',
            past: 'Past',
          };
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 capitalize transition-colors relative ${
                isActive
                  ? 'text-brand-navy border-b-2 border-brand-navy font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {labels[tab]}
            </button>
          );
        })}
      </div>

      {/* Appointments List */}
      <div className="space-y-3">
        {filteredAppointments.length === 0 ? (
          <div className="p-12 rounded-card bg-white border border-slate-200 text-center text-xs text-slate-400">
            No appointments found in the {activeTab} view.
          </div>
        ) : (
          filteredAppointments.map((apt) => {
            const isCompleted = new Date(apt.slot_end).getTime() < now.getTime();
            return (
              <div
                key={apt.id}
                className="p-5 rounded-card bg-white border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 hover:border-slate-300 transition-all"
              >
                <div className="flex items-center gap-4">
                  {/* Time Badge */}
                  <div className="px-3.5 py-2.5 rounded-xl bg-slate-100 text-center min-w-[75px]">
                    <span className="text-xs font-bold text-brand-navy block">
                      {new Date(apt.slot_start).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                    <span className="text-[10px] text-slate-500 uppercase font-medium">
                      30 min
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-text-primary">
                      {apt.patient_name}
                    </h3>
                    <p className="text-xs text-text-secondary mt-0.5">
                      Ref: <span className="font-mono">{apt.reference_code}</span> • {apt.department_name}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Derived Completed badge */}
                  {isCompleted ? (
                    <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-[11px] font-semibold">
                      Completed
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-semibold">
                      Confirmed
                    </span>
                  )}

                  {onSelectReport && (
                    <button
                      onClick={() => onSelectReport(apt.report_id)}
                      aria-label={`View intake report for ${apt.patient_name}`}
                      className="text-xs font-semibold text-brand-navy hover:underline px-2 py-1 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-navy"
                    >
                      View Intake &rarr;
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

