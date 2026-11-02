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

  const tabs: { key: DoctorAppointmentsTab; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'past', label: 'Past' },
  ];

  return (
    <div className="space-y-6">
      {/* Header matching Figma D6 */}
      <div>
        <h1 className="text-[26px] font-bold text-[#1d2433] tracking-tight">
          Appointments
        </h1>
        <p className="text-[12px] text-[#4a5470] mt-0.5">
          Patient consultations scheduled via Samvad HealthDesk AI referral.
        </p>
      </div>

      {/* Frosted Table Card matching Figma 82:416 */}
      <div className="rounded-[24px] bg-[rgba(255,255,255,0.55)] backdrop-blur-[9px] border border-white p-6 shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.13)] space-y-6">
        {/* Figma Pill Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`h-[34px] px-5 rounded-full text-[11px] font-semibold transition-all ${
                  isActive
                    ? 'bg-[#1f2a44] text-white shadow-sm'
                    : 'bg-[rgba(255,255,255,0.55)] backdrop-blur-[6px] text-[#4a5470] border border-white hover:bg-white/80'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Appointments Table */}
        {filteredAppointments.length === 0 ? (
          <div className="p-12 text-center text-xs text-[#4a5470]">
            No appointments found in the {activeTab} view.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#dde3ee]/80 text-[#1d2433] font-bold text-[11px]">
                <tr>
                  <th className="pb-3 px-4">Date</th>
                  <th className="pb-3 px-4">Time</th>
                  <th className="pb-3 px-4">Patient</th>
                  <th className="pb-3 px-4">Age / Gender</th>
                  <th className="pb-3 px-4">Concern</th>
                  <th className="pb-3 px-4">Status</th>
                  {onSelectReport && <th className="pb-3 px-4 text-right">Intake</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#dde3ee]/60 text-[#1d2433]">
                {filteredAppointments.map((apt) => {
                  const isCompleted = new Date(apt.slot_end).getTime() < now.getTime();
                  const slotDate = new Date(apt.slot_start);
                  const dateStr = slotDate.toLocaleDateString('en-US', {
                    weekday: 'short',
                    day: '2-digit',
                    month: 'short',
                  });
                  const timeStr = slotDate.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                  });

                  return (
                    <tr
                      key={apt.id}
                      className="hover:bg-white/50 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-medium text-[10px] text-[#1d2433]">
                        {dateStr}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-[10px] text-[#1d2433]">
                        {timeStr}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-[11px] text-[#1d2433]">
                        {apt.patient_name}
                      </td>
                      <td className="py-3.5 px-4 text-[10px] text-[#4a5470]">
                        {apt.department_name}
                      </td>
                      <td className="py-3.5 px-4 text-[10px] text-[#4a5470] max-w-xs truncate">
                        Ref: <span className="font-mono">{apt.reference_code}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        {isCompleted ? (
                          <span className="inline-block px-3 py-1 rounded-full text-[10px] font-semibold bg-[#dcf3e6] text-[#176a3b]">
                            Completed
                          </span>
                        ) : (
                          <span className="inline-block px-3 py-1 rounded-full text-[10px] font-semibold bg-[#e1ebfd] text-[#284c91]">
                            Upcoming
                          </span>
                        )}
                      </td>
                      {onSelectReport && (
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => onSelectReport(apt.report_id)}
                            aria-label={`View intake report for ${apt.patient_name}`}
                            className="text-xs font-semibold text-[#1f2a44] hover:underline focus:outline-none"
                          >
                            View Intake &rarr;
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
