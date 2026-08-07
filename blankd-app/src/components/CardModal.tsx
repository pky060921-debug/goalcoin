import React, { useEffect, useRef } from "react";

export const CardModal = ({ 
  activeCard, 
  renderContent, 
  onClose,
  goalBalance,
  handleUseItem
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0a0a0c] border border-white/10 rounded-sm shadow-2xl w-[95vw] max-w-6xl max-h-[85vh] flex flex-col relative overflow-hidden">
        
        {/* 상단 헤더: 타이머 삭제 및 깔끔한 상태 표시만 남김 */}
        <div className="flex justify-between items-center border-b border-white/10 p-3 bg-black/40">
            <div className="flex items-center gap-3 pl-2">
              <span className="text-white/60 text-[13px] font-bold tracking-widest">학습 진행 중 📖</span>
            </div>
            <button onClick={onClose} className="text-white/50 hover:text-white px-2 font-bold transition-colors text-lg">✕</button>
        </div>

        {/* 아이템 사용 및 포인트 표시 영역 */}
        <div className="flex justify-between items-center bg-indigo-950/30 p-2.5 border-b border-indigo-500/20 px-4">
          <div className="flex gap-2">
             <button onClick={() => handleUseItem('hint', 10)} className="px-2 sm:px-3 py-1.5 bg-indigo-900/50 border border-indigo-500/50 text-indigo-300 text-[10px] sm:text-xs rounded-sm hover:bg-indigo-600/50 transition-colors shadow-sm flex items-center gap-1 active:scale-95">
               <span>🔍 첫 글자 힌트 (10P)</span>
             </button>
             <button onClick={() => handleUseItem('magic', 30)} className="px-2 sm:px-3 py-1.5 bg-amber-900/50 border border-amber-500/50 text-amber-300 text-[10px] sm:text-xs rounded-sm hover:bg-amber-600/50 transition-colors shadow-sm flex items-center gap-1 active:scale-95">
               <span>🪄 강제 정답 처리 (30P)</span>
             </button>
          </div>
          <div className="text-amber-400 font-bold text-[11px] sm:text-xs font-mono bg-black/50 px-3 py-1 rounded border border-amber-500/30 shadow-inner">
            보유: {goalBalance} P
          </div>
        </div>
        
        {/* 본문 렌더링 영역 */}
        <div className="flex-1 overflow-hidden">
            {renderContent()}
        </div>
      </div>
    </div>
  );
};
