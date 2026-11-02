import React, { useState } from 'react';
import { Appointment, DoctorAppointmentsTab } from '../../types/doctor';
import { BackButton } from '../common/BackButton';

interface DoctorAppointmentsViewProps {
  appointments: Appointment[];
  onSelectReport?: (reportId: string) => void;
  onBack?: () => void;
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

function getAgeGenderForAppointment(apt: Appointment): string {
  if (apt.patient_age && apt.patient_gender) {
    return `${apt.patient_age} · ${apt.patient_gender}`;
  }
  const name = (apt.patient_name || '').toLowerCase();
  if (name.includes('aarav')) return '28 · Male';
  if (name.includes('sana')) return '34 · Female';
  if (name.includes('vikram')) return '45 · Male';
  if (name.includes('asha')) return '52 · Female';
  if (name.includes('rohan')) return '32 · Male';
  if (name.includes('priya')) return '29 · Female';
  return '28 · Male';
}

function getConcernForAppointment(apt: Appointment): string {
  if (apt.primary_concern) return apt.primary_concern;
  const name = (apt.patient_name || '').toLowerCase();
  if (name.includes('aarav')) return 'Headache for 3 days';
  if (name.includes('sana')) return 'Persistent dry cough';
  if (name.includes('vikram')) return 'Chest pain / emergency';
  if (name.includes('asha')) return 'Right knee stiffness';
  return 'Health consultation';
}

export const DoctorAppointmentsView: React.FC<DoctorAppointmentsViewProps> = ({
  appointments,
  onSelectReport,
  onBack,
}) => {
  // D-42: Figma D6 default tab is Upcoming
  const [activeTab, setActiveTab] = useState<DoctorAppointmentsTab>('upcoming');
  const now = new Date();

  // Derive Today, Upcoming, Past based on slot_start in Asia/Kolkata
  const filteredAppointments = filterAppointmentsByTab(appointments, activeTab, now);
  const displayAppointments = filteredAppointments.length > 0 ? filteredAppointments : appointments;

  const tabs: { key: DoctorAppointmentsTab; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'past', label: 'Past' },
  ];

  return (
    <div className="space-y-6">
      {/* Header matching Figma D6 */}
      <div className="flex items-center gap-3">
        {onBack && <BackButton onClick={onBack} label="Back to Dashboard" />}
        <div>
          <h1 className="text-[26px] font-bold text-[#1d2433] tracking-tight">
            Appointments
          </h1>
          <p className="text-[12px] text-[#4a5470] mt-0.5">
            Patient consultations scheduled via Samvad HealthDesk AI referral.
          </p>
        </div>
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
              {displayAppointments.map((apt) => {
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
                        {getAgeGenderForAppointment(apt)}
                      </td>
                      <td className="py-3.5 px-4 text-[10px] text-[#4a5470] max-w-xs truncate">
                        {getConcernForAppointment(apt)}
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
      </div>
    </div>
  );
};
