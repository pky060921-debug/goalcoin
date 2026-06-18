import React, { useEffect, useRef } from "react";

export const CardModal = ({ 
  activeCard, 
  totalTimeLimit, 
  elapsed, 
  inputStatus, 
  renderContent, 
  onClose,
  goalBalance,     // 💡 포인트 잔액
  handleUseItem,   // 💡 아이템 사용 함수
  isFrozen         // 💡 얼음 스킬 상태
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0a0a0c] border border-white/10 rounded-sm shadow-2xl w-[95vw] max-w-6xl max-h-[85vh] flex flex-col relative overflow-hidden">
        
        {/* 상단 타임 게이지 (얼음 스킬 사용 시 파란색으로 변함) */}
        <div className="absolute top-0 left-0 h-1 bg-white/10 w-full z-10">
          <div className={`h-full transition-all duration-100 ease-linear ${isFrozen ? 'bg-blue-400 shadow-[0_0_10px_#60a5fa]' : progressPercent > 80 ? 'bg-red-500' : 'bg-teal-500'}`} style={{ width: `${progressPercent}%` }} />
        </div>
        
        {/* 모달 상단 컨트롤 및 닫기 버튼 */}
        <div className="flex justify-between items-center border-b border-white/10 p-3 bg-black/40">
            <span className="text-white/40 text-xs font-bold pl-2">학습 진행 중...</span>
            <button onClick={onClose} className="text-white/50 hover:text-white px-2 font-bold transition-colors">✕</button>
        </div>

        {/* 💡 [스킬 상점 UI] 아이템 사용 퀵 슬롯 */}
        <div className="flex justify-between items-center bg-indigo-950/30 p-2.5 border-b border-indigo-500/20 px-4">
          <div className="flex gap-2">
             <button onClick={() => handleUseItem('hint', 10)} className="px-2 sm:px-3 py-1.5 bg-indigo-900/50 border border-indigo-500/50 text-indigo-300 text-[10px] sm:text-xs rounded-sm hover:bg-indigo-600/50 transition-colors shadow-sm flex items-center gap-1 active:scale-95">
               <span>🔍 첫 글자 힌트 (10P)</span>
             </button>
             <button onClick={() => handleUseItem('freeze', 20)} className={`px-2 sm:px-3 py-1.5 border text-[10px] sm:text-xs rounded-sm transition-colors shadow-sm flex items-center gap-1 active:scale-95 ${isFrozen ? 'bg-blue-600 text-white border-blue-400 animate-pulse' : 'bg-blue-900/50 border-blue-500/50 text-blue-300 hover:bg-blue-600/50'}`}>
               <span>⏳ 시간 정지 (20P)</span>
             </button>
             <button onClick={() => handleUseItem('magic', 30)} className="px-2 sm:px-3 py-1.5 bg-amber-900/50 border border-amber-500/50 text-amber-300 text-[10px] sm:text-xs rounded-sm hover:bg-amber-600/50 transition-colors shadow-sm flex items-center gap-1 active:scale-95">
               <span>🪄 강제 정답 (30P)</span>
             </button>
          </div>
          <div className="text-amber-400 font-bold text-[11px] sm:text-xs font-mono bg-black/50 px-3 py-1 rounded border border-amber-500/30">
            보유: {goalBalance} P
          </div>
        </div>
        
        {/* 콘텐츠 영역 */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {renderContent()}
        </div>
      </div>
    </div>
  );
};
