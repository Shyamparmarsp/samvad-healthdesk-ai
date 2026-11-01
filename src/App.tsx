import React from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { I18nProvider } from './i18n';
import { PatientShell } from './features/patient/PatientShell';
import { DoctorShell } from './features/doctor/DoctorShell';

const AppNav: React.FC = () => {
  const location = useLocation();
  const isDoctor = location.pathname.startsWith('/doctor');

  return (
    <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-md sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="font-bold text-lg text-brand-navy tracking-tight hover:opacity-90 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-black shadow-sm">
              S
            </span>
            Samvad HealthDesk AI
          </Link>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-900 font-bold uppercase tracking-wider">
            Educational Demo
          </span>
        </div>

        <nav className="flex items-center gap-2 text-xs font-semibold">
          <Link
            to="/"
            className={`px-3.5 py-1.5 rounded-full transition-all ${
              !isDoctor
                ? 'bg-brand-navy text-white shadow-sm'
                : 'text-slate-600 hover:text-brand-navy hover:bg-slate-100'
            }`}
          >
            Patient Intake
          </Link>
          <Link
            to="/doctor"
            className={`px-3.5 py-1.5 rounded-full transition-all ${
              isDoctor
                ? 'bg-brand-navy text-white shadow-sm'
                : 'text-slate-600 hover:text-brand-navy hover:bg-slate-100'
            }`}
          >
            Doctor Portal
          </Link>
        </nav>
      </div>
    </header>
  );
};

export const App: React.FC = () => {
  return (
    <I18nProvider>
      <BrowserRouter>
        <div className="min-h-screen flex flex-col bg-surface-desktop text-text-primary antialiased">
          <AppNav />

          <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
            <Routes>
              <Route path="/" element={<PatientShell />} />
              <Route path="/doctor" element={<DoctorShell />} />
              <Route
                path="*"
                element={
                  <div className="text-center py-16">
                    <h1 className="text-2xl font-bold text-text-primary">404 — Page Not Found</h1>
                    <p className="mt-2 text-xs text-text-secondary">The requested route does not exist.</p>
                    <Link
                      to="/"
                      className="mt-4 inline-block text-xs font-semibold text-brand-navy underline"
                    >
                      Return to Patient Intake
                    </Link>
                  </div>
                }
              />
            </Routes>
          </main>

          <footer className="border-t border-slate-200/80 bg-white/70 backdrop-blur-sm py-4 text-center text-[11px] text-text-secondary">
            <p>
              Samvad HealthDesk AI — Educational demo. Synthetic patients, fictional doctors and schedules only. Not for clinical diagnosis or treatment.
            </p>
          </footer>
        </div>
      </BrowserRouter>
    </I18nProvider>
  );
};

export default App;
