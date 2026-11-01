import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { PatientShell } from './features/patient/PatientShell';
import { DoctorShell } from './features/doctor/DoctorShell';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
        <header className="border-b border-slate-200 bg-white">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-lg text-indigo-700 tracking-tight">
                Samvad HealthDesk AI
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                Educational Demo
              </span>
            </div>
            <nav className="flex items-center gap-4 text-sm font-medium">
              <Link
                to="/"
                className="text-slate-600 hover:text-indigo-600 transition-colors"
              >
                Patient Portal
              </Link>
              <Link
                to="/doctor"
                className="text-slate-600 hover:text-indigo-600 transition-colors"
              >
                Doctor Portal
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8">
          <Routes>
            <Route path="/" element={<PatientShell />} />
            <Route path="/doctor" element={<DoctorShell />} />
            <Route
              path="*"
              element={
                <div className="text-center py-12">
                  <h1 className="text-2xl font-bold text-slate-800">404 — Page Not Found</h1>
                  <p className="mt-2 text-slate-600">The requested page does not exist.</p>
                  <Link
                    to="/"
                    className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:underline"
                  >
                    Return to Patient Portal
                  </Link>
                </div>
              }
            />
          </Routes>
        </main>

        <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
          <p>Samvad HealthDesk AI — Fictional demo environment. Not for clinical or diagnostic use.</p>
        </footer>
      </div>
    </BrowserRouter>
  );
};

export default App;

