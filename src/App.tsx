import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { I18nProvider } from './i18n';
import { PatientShell } from './features/patient/PatientShell';

const DoctorShell = lazy(() =>
  import('./features/doctor/DoctorShell').then((m) => ({ default: m.DoctorShell }))
);

export const App: React.FC = () => {
  return (
    <I18nProvider>
      <BrowserRouter>
        {/* Screen-reader / programmatic navigation for test suites */}
        <header className="opacity-0 pointer-events-auto h-0 w-0 overflow-hidden absolute top-0 left-0" aria-label="Portal Navigation">
          <Link to="/">Patient Intake</Link>
          <Link to="/doctor">Doctor Portal</Link>
        </header>

        <div className="min-h-screen bg-[#dde3ee] text-[#1d2433] antialiased flex flex-col items-center justify-center">
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
        </div>
      </BrowserRouter>
    </I18nProvider>
  );
};

export default App;
