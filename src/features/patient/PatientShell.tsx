import React from 'react';

export const PatientShell: React.FC = () => {
  return (
    <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 md:p-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Patient Intake</h1>
          <p className="text-sm text-slate-500">Welcome &amp; pre-visit consultation</p>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-medium">
          Route: /
        </span>
      </div>

      <div className="mt-6 space-y-4 text-slate-700 text-sm leading-relaxed">
        <p>
          Welcome to Samvad HealthDesk AI. This demo assists with preliminary pre-visit intake and smart hospital referral.
        </p>
        <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
          <h2 className="font-semibold text-slate-800 text-xs uppercase tracking-wide">
            Foundation Shell Active
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            M1-S2 foundation shell verified. Full conversational intake flow and bilingual (Hindi/English) interfaces will be integrated in M2.
          </p>
        </div>
      </div>
    </section>
  );
};

