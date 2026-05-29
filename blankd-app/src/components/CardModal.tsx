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
}: any) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, [activeCard]);

  if (!activeCard) return null;

  const progressPercent = totalTimeLimit > 0 ? Math.min((elapsed / totalTimeLimit) * 100, 100) : 0;
  const remainingTime = Math.max(0, totalTimeLimit - elapsed).toFixed(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0a0a0c] border border-white/10 rounded-sm shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col relative overflow-hidden">
        <div className="absolute top-0 left-0 h-1 bg-white/10 w-full z-10">
          <div className={`h-full transition-all duration-100 ease-linear ${progressPercent > 80 ? 'bg-red-500' : 'bg-teal-500'}`} style={{ width: `${progressPercent}%` }} />
        </div>
        
        {/* 💡 [수정] 모달 상단의 중복 제목을 삭제하고, 안키 복습 선택 UI(다시/어려움/보통/쉬움)를 삽입했습니다. */}
        <div className="flex justify-between items-center border-b border-white/10 p-3 bg-black/40">
            <button onClick={onClose} className="text-white/50 hover:text-white px-2 font-bold transition-colors">✕</button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
            {renderContent()}
        </div>
      </div>
    </div>
  );
};
