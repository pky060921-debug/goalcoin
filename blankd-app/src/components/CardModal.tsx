import React, { useEffect, useRef } from "react";

export const CardModal = ({ 
  activeCard, 
  totalTimeLimit, 
  elapsed, 
  inputStatus, 
  renderContent, 
  onClose,
  goalBalance,
  handleUseItem,
  isFrozen
}: any) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, [activeCard]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT') {
          const inputValue = (target as HTMLInputElement).value.trim();
          if (inputValue !== '') return; 
        }
        const showAnswerBtn = document.getElementById('show-answer-btn');
        if (showAnswerBtn) showAnswerBtn.click();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  if (!activeCard) return null;

  const progressPercent = totalTimeLimit > 0 ? Math.min((elapsed / totalTimeLimit) * 100, 100) : 0;
  const timeLeft = Math.max(0, totalTimeLimit - elapsed);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0a0a0c] border border-white/10 rounded-sm shadow-2xl w-[95vw] max-w-6xl max-h-[85vh] flex flex-col relative overflow-hidden">
        
        <div className="absolute top-0 left-0 h-1 bg-white/10 w-full z-10">
          {/* 💡 직접 조작을 위해 id="progress-bar-fill" 부여 */}
          <div id="progress-bar-fill" className={`h-full transition-all duration-100 ease-linear ${isFrozen ? 'bg-blue-400 shadow-[0_0_10px_#60a5fa]' : progressPercent > 80 ? 'bg-red-500' : 'bg-teal-500'}`} style={{ width: `${progressPercent}%` }} />
        </div>
        
        <div className="flex justify-between items-center border-b border-white/10 p-3 bg-black/40">
            <div className="flex items-center gap-3 pl-2">
              <span className="text-white/40 text-xs font-bold hidden sm:inline">학습 진행 중</span>
              <div className="flex items-center gap-1.5 bg-black/60 border border-white/10 px-2.5 py-1 rounded font-mono text-[11px] sm:text-xs text-amber-400 shadow-inner">
                <span className="animate-pulse">⏱️</span>
                {/* 💡 직접 조작을 위해 id 부여 */}
                <span id="elapsed-time-display" className="text-white">진행: {elapsed.toFixed(1)}초</span>
                <span className="text-white/30">|</span>
                <span id="time-left-display" className={`${timeLeft < 5 ? 'text-red-400 font-bold' : 'text-teal-400'}`}>남은시간: {timeLeft.toFixed(1)}초</span>
              </div>
            </div>
            <button onClick={onClose} className="text-white/50 hover:text-white px-2 font-bold transition-colors">✕</button>
        </div>

        <div className="flex justify-between items-center bg-indigo-950/30 p-2.5 border-b border-indigo-500/20 px-4">
          <div className="flex gap-2">
             <button onClick={() => handleUseItem('hint', 10)} className="px-2 sm:px-3 py-1.5 bg-indigo-900/50 border border-indigo-500/50 text-indigo-300 text-[10px] sm:text-xs rounded-sm hover:bg-indigo-600/50 transition-colors shadow-sm flex items-center gap-1 active:scale-95">
               <span>🔍 힌트 (10P)</span>
             </button>
             <button onClick={() => handleUseItem('freeze', 20)} className={`px-2 sm:px-3 py-1.5 border text-[10px] sm:text-xs rounded-sm transition-colors shadow-sm flex items-center gap-1 active:scale-95 ${isFrozen ? 'bg-blue-600 text-white border-blue-400 animate-pulse' : 'bg-blue-900/50 border-blue-500/50 text-blue-300 hover:bg-blue-600/50'}`}>
               <span>⏳ 얼음 (20P)</span>
             </button>
             <button onClick={() => handleUseItem('magic', 30)} className="px-2 sm:px-3 py-1.5 bg-amber-900/50 border border-amber-500/50 text-amber-300 text-[10px] sm:text-xs rounded-sm hover:bg-amber-600/50 transition-colors shadow-sm flex items-center gap-1 active:scale-95">
               <span>🪄 마법 (30P)</span>
             </button>
          </div>
          <div className="text-amber-400 font-bold text-[11px] sm:text-xs font-mono bg-black/50 px-3 py-1 rounded border border-amber-500/30">
            보유: {goalBalance} P
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {renderContent()}
        </div>
      </div>
    </div>
  );
};
