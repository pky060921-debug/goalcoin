import React, { useEffect, useRef } from "react";

interface CardModalProps {
  activeCard: any;
  totalTimeLimit: number;
  elapsed: number;
  answerInput: string;
  setAnswerInput: (val: string) => void;
  inputStatus: 'idle' | 'correct' | 'wrong';
  handleSequentialInput: () => void;
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

  // 모달이 열리면 자동으로 입력창에 포커스를 줍니다.
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [activeCard, answerInput]); // 값이 바뀔 때마다 포커스 유지

  if (!activeCard) return null;

  const progressPercent = totalTimeLimit > 0 ? Math.min((elapsed / totalTimeLimit) * 100, 100) : 0;
  
  // 시간에 따른 프로그레스 바 색상 변경 (여유: 초록 -> 경고: 주황 -> 위험: 빨강)
  let barColor = "bg-teal-500";
  if (progressPercent > 60) barColor = "bg-amber-500";
  if (progressPercent > 85) barColor = "bg-red-500";

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4 sm:p-6 md:p-8 animate-in fade-in duration-200">
      {/* 💡 [핵심 수정] 모달의 최대 너비를 기기별로 꽉 차게 확장 (max-w-md -> max-w-4xl, 너비 w-full 고정) */}
      <div className="bg-[#0a0a0c] border border-indigo-500/50 rounded-sm w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl relative">
        
        {/* 상단 타이머 프로그레스 바 */}
        <div className="absolute top-0 left-0 w-full h-1.5 bg-white/5 rounded-t-sm overflow-hidden">
          <div className={`h-full ${barColor} transition-all duration-100 ease-linear`} style={{ width: `${progressPercent}%` }}></div>
        </div>

        {/* 닫기 버튼 */}
        <button onClick={onClose} className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors z-10 p-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>

        {/* 본문 텍스트 영역 (스크롤 가능, 여백 축소로 더 넓게) */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-8 md:p-10 pt-12 custom-scrollbar">
          {renderContent()}
        </div>

        {/* 하단 입력 폼 영역 */}
        <div className="p-4 sm:p-6 border-t border-white/10 bg-black/40 shrink-0">
          <div className="flex items-center gap-3 w-full max-w-2xl mx-auto">
            <span className="text-[10px] text-white/30 uppercase tracking-widest font-bold whitespace-nowrap hidden sm:inline-block">Answer Input</span>
            <input
              ref={inputRef}
              type="text"
              value={answerInput}
              onChange={(e) => setAnswerInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSequentialInput();
              }}
              placeholder="빈칸의 정답을 입력하세요..."
              className={`flex-1 bg-white/5 border-b-2 outline-none px-4 py-3 sm:py-4 text-sm sm:text-base font-bold transition-all text-center placeholder:text-white/20 placeholder:font-normal
                ${inputStatus === 'correct' ? 'border-green-500 text-green-400 bg-green-500/10' : 
                  inputStatus === 'wrong' ? 'border-red-500 text-red-400 bg-red-500/10 animate-shake' : 
                  'border-indigo-500 text-white focus:border-amber-400 focus:bg-white/10'}`}
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
            />
            <button 
              onClick={handleSequentialInput}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 sm:py-4 rounded-sm font-bold text-sm transition-colors whitespace-nowrap shadow-lg shadow-indigo-500/20"
            >
              입력
            </button>
          </div>
        </div>
        
      </div>
    </div>
  );
};
