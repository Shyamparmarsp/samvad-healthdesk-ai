import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { I18nProvider } from './i18n';
import { PatientShell } from './features/patient/PatientShell';

const DoctorShell = lazy(() =>
  import('./features/doctor/DoctorShell').then((m) => ({ default: m.DoctorShell }))
);

const AppNav: React.FC = () => {
  const location = useLocation();
  const isDoctor = location.pathname.startsWith('/doctor');

  return (
    <header className="border-b border-white/60 bg-[rgba(255,255,255,0.65)] backdrop-blur-[9px] sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="font-bold text-base text-[#1d2433] tracking-tight hover:opacity-90 flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-[8px] bg-[#1f2a44] border border-white text-white flex items-center justify-center text-lg font-bold shadow-sm">
              +
            </span>
            <span>Samvad HealthDesk AI</span>
          </Link>
        </div>

        <nav className="flex items-center gap-2 text-xs font-semibold">
          <Link
            to="/"
            className={`px-3.5 py-1.5 rounded-full transition-all ${
              !isDoctor
                ? 'bg-[#1f2a44] text-white shadow-sm'
                : 'text-[#4a5470] hover:text-[#1d2433] hover:bg-white/60'
            }`}
          >
            Patient Intake
          </Link>
          <Link
            to="/doctor"
            className={`px-3.5 py-1.5 rounded-full transition-all ${
              isDoctor
                ? 'bg-[#1f2a44] text-white shadow-sm'
                : 'text-[#4a5470] hover:text-[#1d2433] hover:bg-white/60'
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
              <Route
                path="/doctor"
                element={
                  <Suspense
                    fallback={
                      <div className="flex items-center justify-center py-20 text-xs text-slate-500 gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping"></span>
                        Loading Doctor Portal...
                      </div>
                    }
                  >
                    <DoctorShell />
                  </Suspense>
                }
              />
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
