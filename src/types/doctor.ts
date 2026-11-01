/**
 * Doctor and Appointment Types
 * Source: docs/demo-seed-data.md, docs/report-design.md
 */

import { DepartmentKey } from './report';

export interface DoctorProfile {
  id: string;
  name: string;
  department_key: DepartmentKey;
  department_name: string;
  title: string;
  initials: string;
  email: string;
  routine_slots_enabled: boolean;
}

export interface AppointmentSlot {
  id: string;
  doctor_id: string;
  start_time: string; // ISO string
  end_time: string;   // ISO string
  date: string;       // YYYY-MM-DD
  time_display: string; // e.g. "09:30 AM"
  is_available: boolean;
}

export interface Appointment {
  id: string;
  report_id: string;
  doctor_id: string;
  doctor_name: string;
  department_name: string;
  slot_id: string;
  slot_start: string; // ISO string
  slot_end: string;   // ISO string
  reference_code: string; // e.g. "APT-20261102-K9X2"
  patient_name: string;
  created_at: string;
  status: 'confirmed' | 'cancelled';
}

export interface DoctorDashboardStats {
  urgent: number;
  new_reports: number;
  booked: number;
  not_booked: number;
}

export type DoctorReportsTab = 'all' | 'urgent' | 'booked' | 'not_booked';
export type DoctorAppointmentsTab = 'today' | 'upcoming' | 'past';
