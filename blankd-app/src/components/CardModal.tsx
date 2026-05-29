import React, { useState, useEffect, useRef } from "react";
import { formatCardText } from "../utils/constants";

// =====================================================================
// 💡 1. 인라인 빈칸용 초고속 컴포넌트
// =====================================================================
export const FastBlankInput = ({ value, onChange, onEnter }: any) => {
  const [localValue, setLocalValue] = useState(value || "");

  useEffect(() => {
    setLocalValue(value || "");
  }, [value]);

  return (
    <input
      type="text"
      value={localValue}
      onChange={(e) => {
        setLocalValue(e.target.value); // 나 혼자만 변경! (렉 0%)
      }}
      onBlur={() => onChange(localValue)}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return; 
        if (e.key === 'Enter') {
          onChange(localValue);
          setTimeout(() => { if (onEnter) onEnter(); }, 10);
        }
      }}
      className="bg-transparent border-b-2 border-teal-500/50 text-teal-300 w-16 text-center focus:outline-none focus:border-teal-300 font-bold"
    />
  );
};

// =====================================================================
// 💡 2. 메인 CardModal 컴포넌트
// =====================================================================
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

  // 💡 [핵심 해결 1] 커서 납치 버그 완벽 차단!
  // answerInput이 변경될 때마다 포커스를 강제로 뺏어오던 코드를 삭제했습니다.
  // 이제 카드가 처음 열릴 때 딱 한 번만 아래쪽 창에 포커스가 갑니다.
  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, [activeCard]); 

  // 💡 [핵심 해결 2] 타자 렉 완벽 차단 (로컬 상태 격리)
  // 부모(App.tsx)를 괴롭히지 않고, 모달창 혼자서 글자를 기억합니다.
  const [localAnswer, setLocalAnswer] = useState(answerInput || "");

  // 외부(부모)에서 정답 판정 후 입력창을 비울 때 동기화해 줍니다.
  useEffect(() => {
    setLocalAnswer(answerInput || "");
  }, [answerInput]);

  if (!activeCard) return null;

  const progressPercent = totalTimeLimit > 0 ? Math.min((elapsed / totalTimeLimit) * 100, 100) : 0;
  const remainingTime = Math.max(0, totalTimeLimit - elapsed).toFixed(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0a0a0c] border border-white/10 rounded-sm shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col relative overflow-hidden">
        
        <div className="absolute top-0 left-0 h-1 bg-white/10 w-full z-10">
          <div className={`h-full transition-all duration-100 ease-linear ${progressPercent > 80 ? 'bg-red-500' : 'bg-teal-500'}`} style={{ width: `${progressPercent}%` }} />
        </div>
        
        <div className="flex justify-between items-center p-4 border-b border-white/10">
           <div className="text-white/50 text-xs font-mono">
             TIME <span className={`ml-1 ${progressPercent > 80 ? 'text-red-400 font-bold animate-pulse' : 'text-white'}`}>{remainingTime}s</span>
           </div>
           <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
           </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar text-white/80 leading-relaxed font-sans text-sm sm:text-base">
          {renderContent ? renderContent() : null}
        </div>

        <div className="p-4 sm:p-6 border-t border-white/10 bg-white/5">
          <div className={`flex items-center gap-3 bg-black/40 border p-3 rounded transition-colors ${
            inputStatus === 'correct' ? 'border-teal-500/50 shadow-[0_0_15px_rgba(20,184,166,0.2)]' :
            inputStatus === 'wrong' ? 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]' :
            'border-white/10 focus-within:border-teal-500/50'
          }`}>
            <span className="text-sm">✏️</span>
            <div className="flex-1">
              <input 
                ref={inputRef}
                type="text"
                value={localAnswer} 
                onChange={(e) => {
                  // 💡 앱 전체를 새로고침하지 않고, 모달창 내부의 텍스트만 바꿉니다! (렉 제로)
                  setLocalAnswer(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === 'Enter') {
                    // 💡 엔터를 치는 그 순간에만 딱 한 번! 앱(App.tsx)으로 정답을 보냅니다.
                    setAnswerInput(localAnswer);
                    setTimeout(() => {
                      if (handleSequentialInput) handleSequentialInput(e);
                    }, 0);
                  }
                }}
                placeholder="정답 입력 후 엔터" 
                className="w-full text-[13px] bg-transparent text-white outline-none placeholder-white/30"
              />
            </div>
          </div>
          <div className="text-[10px] sm:text-xs text-white/30 text-center font-mono mt-2">
            Press <span className="text-white/50 bg-white/10 px-1.5 py-0.5 rounded">Enter</span> to submit
          </div>
        </div>

      </div>
    </div>
  );
};
