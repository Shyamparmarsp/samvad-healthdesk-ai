import React from 'react';

export const DoctorShell: React.FC = () => {
  return (
    <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 md:p-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Doctor Portal</h1>
          <p className="text-sm text-slate-500">Clinical intake &amp; review dashboard</p>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-800 font-medium">
          Route: /doctor
        </span>
      </div>

      <div className="mt-6 space-y-4 text-slate-700 text-sm leading-relaxed">
        <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
          <h2 className="font-semibold text-slate-800 text-xs uppercase tracking-wide">
            Evaluator Access
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Credentials are shared privately with reviewers. Not displayed in public project materials.
          </p>
        </div>

        <p className="text-xs text-slate-500">
          M1-S2 foundation shell verified. Assigned reports, urgent flags, and booking review will be connected in subsequent milestones.
        </p>
      </div>
    </section>
  );
};

