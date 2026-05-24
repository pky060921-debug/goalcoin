import React, { useEffect, useRef } from "react";
import { formatCardText } from "../utils/constants";

export const CardModal = ({ 
  activeCard, 
  totalTimeLimit, 
  elapsed, 
  answerInput, 
  setAnswerInput, 
  inputStatus, 
  handleSequentialInput, 
  renderContent, 
  onClose,
  handleReviewSelect // 💡 [추가] 복습 선택 핸들러 전달받음
}: any) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, [activeCard, answerInput]);

  if (!activeCard) return null;

  const progressPercent = totalTimeLimit > 0 ? Math.min((elapsed / totalTimeLimit) * 100, 100) : 0;
  const remainingTime = Math.max(0, totalTimeLimit - elapsed).toFixed(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0a0a0c] border border-white/10 rounded-sm shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col relative overflow-hidden">
        <div className="absolute top-0 left-0 h-1 bg-white/10 w-full z-10">
          <div className={`h-full transition-all duration-100 ease-linear ${progressPercent > 80 ? 'bg-red-500' : 'bg-teal-500'}`} style={{ width: `${progressPercent}%` }} />
        </div>
        
        {/* 💡 [수정] 중복되던 제목을 지우고, 안키 복습 선택 UI로 교체 */}
        <div className="flex justify-between items-center border-b border-white/10 p-3 bg-black/40">
            <div className="flex gap-2">
                <span className="text-[10px] text-white/40 flex items-center mr-2 uppercase tracking-widest font-bold">복습 선택:</span>
                <button onClick={() => handleReviewSelect(1)} className="px-3 py-1 text-[11px] font-bold bg-red-900/30 text-red-400 border border-red-500/30 hover:bg-red-900/60 transition-all rounded-sm shadow-sm">다시 (1일)</button>
                <button onClick={() => handleReviewSelect(4)} className="px-3 py-1 text-[11px] font-bold bg-orange-900/30 text-orange-400 border border-orange-500/30 hover:bg-orange-900/60 transition-all rounded-sm shadow-sm">어려움 (4일)</button>
                <button onClick={() => handleReviewSelect(7)} className="px-3 py-1 text-[11px] font-bold bg-teal-900/30 text-teal-400 border border-teal-500/30 hover:bg-teal-900/60 transition-all rounded-sm shadow-sm">보통 (7일)</button>
                <button onClick={() => handleReviewSelect(14)} className="px-3 py-1 text-[11px] font-bold bg-blue-900/30 text-blue-400 border border-blue-500/30 hover:bg-blue-900/60 transition-all rounded-sm shadow-sm">쉬움 (14일)</button>
            </div>
            <button onClick={onClose} className="text-white/50 hover:text-white px-2 font-bold transition-colors">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {renderContent()}
        </div>
      </div>
    </div>
  );
};
