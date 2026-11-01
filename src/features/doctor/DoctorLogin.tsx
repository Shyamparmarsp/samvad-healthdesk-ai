import React, { useState } from 'react';
import { doctorLogin, FICTIONAL_DOCTORS, getAppMode } from '../../lib/api';
import { DoctorProfile } from '../../types/doctor';

interface DoctorLoginProps {
  onLoginSuccess: (doctor: DoctorProfile) => void;
}

export const DoctorLogin: React.FC<DoctorLoginProps> = ({ onLoginSuccess }) => {
  const isMockMode = getAppMode() === 'mock';
  const [email, setEmail] = useState(isMockMode ? 'aditi.rao@hospital.demo' : '');
  const [password, setPassword] = useState(isMockMode ? '••••••••••••' : '');
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLoginError(null);
    try {
      const res = await doctorLogin(email, password);
      onLoginSuccess(res.doctor);
    } catch (err: any) {
      setLoginError(err?.message || 'Invalid email or password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[720px] flex items-center justify-center p-6 bg-slate-100">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-brand-navy text-white flex items-center justify-center mx-auto shadow-md mb-3">
            <svg className="w-8 h-8 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            Samvad Clinical Desk
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            Doctor Intake Review &amp; Consultation Portal
          </p>
        </div>

        {/* Mandatory Evaluator Access Card (Exact D8 / AGENTS.md Copy) */}
        <div className="p-4 rounded-xl bg-indigo-50/80 border border-indigo-200 text-indigo-950 shadow-sm text-center">
          <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-900 mb-1">
            Evaluator access
          </h2>
          <p className="text-xs font-medium">
            Credentials are shared privately with reviewers.
          </p>
          <p className="text-[11px] text-indigo-700 mt-0.5">
            Not displayed in public project materials.
          </p>
        </div>

        {/* Login Error Alert */}
        {loginError && (
          <div className="p-3.5 rounded-xl bg-red-100 border border-red-300 text-red-900 text-xs font-medium flex items-center gap-2">
            <svg className="w-4 h-4 text-red-700 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{loginError}</span>
          </div>
        )}

        {/* Login Form (D1) */}
        <form
          onSubmit={handleLogin}
          className="p-6 rounded-card bg-white border border-slate-200 shadow-lg space-y-4"
        >
          {/* Identity Quick Select for Judges / Evaluators (Restricted to Mock Mode per AGENTS.md) */}
          {isMockMode && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Select Demo Identity (Mock Mode)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEmail(FICTIONAL_DOCTORS.general_medicine.email);
                    setLoginError(null);
                  }}
                  className={`py-2 px-2.5 rounded-lg text-xs font-semibold border text-left transition-all ${
                    email === FICTIONAL_DOCTORS.general_medicine.email
                      ? 'bg-brand-navy border-brand-navy text-white shadow-sm'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="block font-bold">Dr. Aditi Rao</span>
                  <span className="text-[10px] opacity-80 block">General Medicine</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setEmail(FICTIONAL_DOCTORS.emergency.email);
                    setLoginError(null);
                  }}
                  className={`py-2 px-2.5 rounded-lg text-xs font-semibold border text-left transition-all ${
                    email === FICTIONAL_DOCTORS.emergency.email
                      ? 'bg-red-700 border-red-700 text-white shadow-sm'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="block font-bold">Dr. Neha Verma</span>
                  <span className="text-[10px] opacity-80 block">Emergency</span>
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Doctor Account Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setLoginError(null);
              }}
              required
              className="w-full h-11 px-3.5 rounded-input border border-slate-300 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-navy"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setLoginError(null);
              }}
              required
              className="w-full h-11 px-3.5 rounded-input border border-slate-300 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-navy font-mono"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-btn-desktop rounded-pill bg-brand-navy text-white font-semibold text-sm shadow hover:bg-brand-navy-light disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {isLoading ? 'Signing In...' : 'Sign In to Portal'}
          </button>
        </form>
      </div>
    </div>
  );
};

