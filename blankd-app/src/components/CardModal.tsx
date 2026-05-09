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

        {/* 우측 상단 닫기 버튼 */}
        <button 
          onClick={onClose} 
          className="absolute top-3 right-3 text-white/40 hover:text-white z-20 p-2 font-bold transition-colors"
        >
          ✕
        </button>

        {/* 본문 렌더링 영역 (인라인 입력창 포함) */}
        <div className="p-6 sm:p-8 overflow-y-auto custom-scrollbar flex-1 mt-4">
          {renderContent()}
        </div>
        
      </div>
    </div>
  );
};
