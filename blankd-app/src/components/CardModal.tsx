import React, { useEffect, useRef } from "react";

interface CardModalProps {
  activeCard: any;
  totalTimeLimit: number;
  elapsed: number;
  answerInput: string;
  setAnswerInput: (val: string) => void;
  inputStatus: 'idle' | 'correct' | 'wrong';
  handleSequentialInput: (overrideInput?: string | any) => void;
  renderContent: () => React.ReactNode;
  onClose: () => void;
}

export const CardModal: React.FC<CardModalProps> = ({
  activeCard,
  totalTimeLimit,
  elapsed,
  answerInput,
  setAnswerInput,
  inputStatus,
  handleSequentialInput,
  renderContent,
  onClose
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [activeCard, answerInput]);

  if (!activeCard) return null;

  const progressPercent = totalTimeLimit > 0 ? Math.min((elapsed / totalTimeLimit) * 100, 100) : 0;
  const remainingTime = Math.max(0, totalTimeLimit - elapsed).toFixed(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0a0a0c] border border-white/10 rounded-sm shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col relative overflow-hidden">
        
        {/* 상단 타이머 프로그레스 바 */}
        <div className="absolute top-0 left-0 h-1 bg-white/10 w-full z-10">
          <div 
            className={`h-full transition-all duration-100 ease-linear ${progressPercent > 80 ? 'bg-red-500' : 'bg-teal-500'}`} 
            style={{ width: `${progressPercent}%` }} 
          />
        </div>

        {/* 💡 타이머 숫자 표시 (좌측 상단 플로팅) */}
        <div className="absolute top-3 left-4 text-xs font-mono font-bold z-20 flex items-center gap-1.5 bg-black/60 px-2 py-1 rounded border border-white/5">
            <span>⏱️</span>
            <span className={progressPercent > 80 ? 'text-red-400 animate-pulse' : 'text-teal-400'}>
                {remainingTime}s
            </span>
            <span className="text-white/30 text-[10px]">/ {totalTimeLimit.toFixed(1)}s</span>
        </div>

        {/* 우측 상단 닫기 버튼 */}
        <button 
          onClick={onClose} 
          className="absolute top-3 right-3 text-white/50 hover:text-white bg-white/5 hover:bg-white/10 rounded-full w-8 h-8 flex items-center justify-center transition-colors z-20"
        >
          ✕
        </button>

        {/* 메인 컨텐츠 영역 */}
        <div className="p-6 sm:p-8 flex-1 overflow-y-auto custom-scrollbar mt-6 relative z-10">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};
