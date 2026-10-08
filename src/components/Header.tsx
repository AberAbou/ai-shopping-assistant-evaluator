import React from 'react';
import { ShieldCheck, Sparkles, AlertOctagon, HelpCircle, CheckCircle, Ban } from 'lucide-react';

interface HeaderProps {
  onLoadTestA: () => void;
  onLoadTestB: () => void;
  onLoadTestC: () => void;
  onLoadTestD: () => void;
  onLoadTestE: () => void;
  onLoadTestF: () => void;
  onClear: () => void;
  onOpenQAModal?: () => void;
  hasInputs: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onLoadTestA,
  onLoadTestB,
  onLoadTestC,
  onLoadTestD,
  onLoadTestE,
  onLoadTestF,
  onClear,
  onOpenQAModal,
  hasInputs,
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          
          {/* Brand & Subtitle */}
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h1 className="text-lg font-semibold tracking-tight text-white">
                AI Shopping Assistant Evaluator
              </h1>
              <span className="text-xs text-slate-400 hidden sm:inline-flex items-center gap-1.5 pl-2 border-l border-slate-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Checkpoint 13: QA &amp; Regression Test Suite Active
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-xl">
              Automated constraints, claims, rubric gates, root causes, actionable remediation, auditable reports, and permanent regression suite
            </p>
          </div>

          {/* Quick Test Presets (Populate EXACTLY the Two Inputs) */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {onOpenQAModal && (
              <button
                type="button"
                onClick={onOpenQAModal}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-950/70 border border-emerald-700/80 text-emerald-300 hover:text-emerald-100 hover:bg-emerald-900/60 transition-colors cursor-pointer mr-1 font-medium shadow-xs"
                title="Open automated QA & Regression Test Suite modal (Scenarios A–F)"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>QA Suite</span>
                <span className="text-[10px] px-1 py-0.2 rounded bg-emerald-900/80 text-emerald-300 font-mono">6/6</span>
              </button>
            )}

            <span className="text-slate-500 text-[11px] hidden xl:inline">Presets:</span>
            
            <button
              type="button"
              onClick={onLoadTestA}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Test A (Hard Failure): Luxury Sunscreen ($32 vs $25, HC-01, SAF-01)"
            >
              <Sparkles className="w-3 h-3 text-rose-400" />
              <span>Test A (Hard Fail)</span>
            </button>

            <button
              type="button"
              onClick={onLoadTestB}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Test B (Missing Evidence): Summit Trek Boots (RET-01, DAT-01)"
            >
              <HelpCircle className="w-3 h-3 text-amber-400" />
              <span>Test B (Missing)</span>
            </button>

            <button
              type="button"
              onClick={onLoadTestC}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Test C (Intent Mismatch): TrailAir vs MountainGuard (INT-01)"
            >
              <Sparkles className="w-3 h-3 text-cyan-400" />
              <span>Test C (Intent)</span>
            </button>

            <button
              type="button"
              onClick={onLoadTestD}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Test D (Contradiction): StormShell Jacket (FAC-01)"
            >
              <AlertOctagon className="w-3 h-3 text-purple-400" />
              <span>Test D (Contradiction)</span>
            </button>

            <button
              type="button"
              onClick={onLoadTestE}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Test E (No Failure): RainShield Jacket $89 (NO_OBSERVED_FAILURE)"
            >
              <CheckCircle className="w-3 h-3 text-emerald-400" />
              <span>Test E (No Fail)</span>
            </button>

            <button
              type="button"
              onClick={onLoadTestF}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Test F (Negative Constraint): RoadMaster 5 with leather (NC-01)"
            >
              <Ban className="w-3 h-3 text-rose-400" />
              <span>Test F (Exclusion)</span>
            </button>

            {hasInputs && (
              <button
                type="button"
                onClick={onClear}
                className="px-2 py-1.5 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

        </div>
      </div>
    </header>
  );
};
