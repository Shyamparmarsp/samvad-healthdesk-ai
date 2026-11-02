import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doctorLogin, FICTIONAL_DOCTORS, getAppMode } from '../../lib/api';
import { DoctorProfile } from '../../types/doctor';
import { BackButton } from '../common/BackButton';

interface DoctorLoginProps {
  onLoginSuccess: (doctor: DoctorProfile) => void;
}

export const DoctorLogin: React.FC<DoctorLoginProps> = ({ onLoginSuccess }) => {
  const navigate = useNavigate();
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
    <div className="w-full flex justify-center py-4">
      {/* Outer Desktop Shell Container matching Figma D1 (74:2) */}
      <div className="w-full max-w-[1260px] min-h-[760px] rounded-[30px] bg-[rgba(221,227,238,0.45)] border border-white shadow-xl p-8 md:p-14 flex flex-col md:flex-row items-center justify-between gap-10 relative overflow-hidden select-none">
        {/* Figma Ambient Glow Orbs (82:2 & 82:3) */}
        <div className="absolute w-[420px] h-[400px] right-[-100px] bottom-[-100px] rounded-full glow-lilac z-0" aria-hidden="true" />
        <div className="absolute w-[420px] h-[380px] left-[-160px] bottom-[-100px] rounded-full glow-sand z-0" aria-hidden="true" />

        {/* Left Hero Area (Figma 82:5 - 82:9) */}
        <div className="relative z-10 max-w-md space-y-4">
          <div className="flex items-center gap-3">
            <BackButton onClick={() => navigate('/')} label="Back to Patient Intake" />
            <div
              className="w-[42px] h-[42px] rounded-[12px] bg-[#1f2a44] border border-white text-white flex items-center justify-center font-bold text-[30px] leading-none shadow-sm flex-shrink-0"
              aria-hidden="true"
            >
              +
            </div>
            <span className="font-bold text-[16px] text-[#1d2433] tracking-tight">
              Samvad HealthDesk AI
            </span>
          </div>

          <div className="pt-8">
            <h1 className="text-[34px] font-bold text-[#1d2433] tracking-tight leading-tight">
              Doctor Login
            </h1>
            <p className="text-[15px] text-[#4a5470] mt-2 leading-relaxed">
              Sign in to view patient reports and appointments.
            </p>
          </div>
        </div>

        {/* Right Form Card (Figma 82:10 login/form-card) */}
        <div className="relative z-10 w-full max-w-[480px]">
          <div className="backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white rounded-[30px] p-8 shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.13)] space-y-4">
            {/* Login Error Alert */}
            {loginError && (
              <div
                role="alert"
                aria-live="assertive"
                className="p-3 rounded-[16px] bg-red-100/90 border border-red-300 text-red-900 text-xs font-medium flex items-center gap-2"
              >
                <svg className="w-4 h-4 text-red-700 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{loginError}</span>
              </div>
            )}

            {/* Identity Quick Select for Judges / Evaluators (Mock Mode) */}
            {isMockMode && (
              <div className="pb-1">
                <label className="block text-[11px] font-semibold text-[#4a5470] uppercase tracking-wider mb-1.5">
                  Select Demo Identity (Mock Mode)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(FICTIONAL_DOCTORS.general_medicine.email);
                      setLoginError(null);
                    }}
                    aria-label="Select Dr. Aditi Rao, General Medicine"
                    className={`py-2 px-3 rounded-[14px] text-xs font-semibold border text-left transition-all focus:outline-none focus:ring-2 focus:ring-[#1f2a44] ${
                      email === FICTIONAL_DOCTORS.general_medicine.email
                        ? 'bg-[#1f2a44] border-[#1f2a44] text-white shadow-sm'
                        : 'bg-white/80 border-white text-[#1d2433] hover:bg-white'
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
                    aria-label="Select Dr. Neha Verma, Emergency"
                    className={`py-2 px-3 rounded-[14px] text-xs font-semibold border text-left transition-all focus:outline-none focus:ring-2 focus:ring-[#1f2a44] ${
                      email === FICTIONAL_DOCTORS.emergency.email
                        ? 'bg-[#1f2a44] border-[#1f2a44] text-white shadow-sm'
                        : 'bg-white/80 border-white text-[#1d2433] hover:bg-white'
                    }`}
                  >
                    <span className="block font-bold">Dr. Neha Verma</span>
                    <span className="text-[10px] opacity-80 block">Emergency</span>
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              {/* Email (Figma 82:12 & 82:13) */}
              <div>
                <label className="block text-[11px] font-medium text-[#4a5470] mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setLoginError(null);
                  }}
                  required
                  placeholder="doctor@hospital.demo"
                  className="w-full h-[44px] px-3.5 rounded-[13px] backdrop-blur-[9px] bg-white/70 border border-white text-xs text-[#1d2433] focus:outline-none focus:ring-2 focus:ring-[#1f2a44] shadow-inner"
                />
              </div>

              {/* Password (Figma 82:15 & 82:16) */}
              <div>
                <label className="block text-[11px] font-medium text-[#4a5470] mb-1">
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
                  className="w-full h-[44px] px-3.5 rounded-[13px] backdrop-blur-[9px] bg-white/70 border border-white text-xs text-[#1d2433] focus:outline-none focus:ring-2 focus:ring-[#1f2a44] font-mono shadow-inner"
                />
              </div>

              {/* Log in Button (Figma 82:20 btn-login) */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-[54px] rounded-[27px] bg-[#1f2a44] border border-[#1f2a44] text-white font-semibold text-[13px] shadow-[0px_4px_12px_-3px_rgba(41,51,79,0.18)] hover:bg-[#2a3a5c] disabled:opacity-50 transition-all flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-[#1f2a44]"
              >
                {isLoading ? 'Signing In...' : 'Log in'}
              </button>
            </form>

            {/* Evaluator Access Card (Figma 82:22 login/evaluator-access-card) */}
            <div className="backdrop-blur-[9px] bg-[rgba(255,255,255,0.55)] border border-white rounded-[20px] p-4 shadow-[0px_7px_22px_-3px_rgba(41,51,79,0.13)] space-y-1">
              <h2 className="text-[13px] font-bold text-[#1d2433]">
                Evaluator access
              </h2>
              <p className="text-[12px] text-[#4a5470]">
                Credentials are shared privately with reviewers.
              </p>
              <p className="text-[12px] text-[#4a5470]">
                Not displayed in public project materials.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
