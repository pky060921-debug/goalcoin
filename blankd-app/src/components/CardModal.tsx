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
        setLocalValue(e.target.value); // 나 혼자만 변경 (렉 0%)
      }}
      onBlur={() => onChange(localValue)}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return; // 한글 중복 입력 방지
        if (e.key === 'Enter') {
          onChange(localValue);
          setTimeout(() => {
            if (onEnter) onEnter();
          }, 10);
        }
      }}
      className="bg-transparent border-b-2 border-teal-500/50 text-teal-300 w-16 text-center focus:outline-none focus:border-teal-300 font-bold"
    />
  );
};

// =====================================================================
// 💡 2. 하단 순차 입력창용 초고속 컴포넌트 (🚨 렉의 진짜 주범 해결 완료)
// =====================================================================
export const FastSequentialInput = ({ value, onChange, onKeyDown }: any) => {
  const [localValue, setLocalValue] = useState(value || "");

  useEffect(() => {
    setLocalValue(value || "");
  }, [value]);

  return (
    <input
      type="text"
      value={localValue}
      onChange={(e) => {
        setLocalValue(e.target.value); 
        // 🚨 아뿔싸! 예전 코드에 있던 onChange(e.target.value)를 삭제했습니다!
        // 부모(App.tsx)를 업데이트하는 코드가 지워졌기 때문에 이제 타자가 즉각적으로 쳐집니다.
      }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return; // 한글 입력 시 엔터 두 번 실행되는 버그 차단
        
        if (e.key === 'Enter') {
          onChange(localValue); // 엔터를 칠 때 딱 한 번만 부모에게 정답 전달!
          setTimeout(() => {
            if (onKeyDown) onKeyDown(e);
          }, 10); // 부모 상태가 갱신될 시간을 아주 살짝(0.01초) 줍니다.
        } else {
          if (onKeyDown) onKeyDown(e);
        }
      }}
      onBlur={() => onChange(localValue)}
      placeholder="정답 입력 후 엔터"
      className="w-full text-[13px] sm:text-[14px] bg-transparent text-white outline-none placeholder-white/30"
      autoFocus
    />
  );
};

// =====================================================================
// 💡 3. 메인 CardModal 컴포넌트
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
  
  if (!activeCard) return null;

  const progressPercent = totalTimeLimit > 0 ? Math.min((elapsed / totalTimeLimit) * 100, 100) : 0;
  const remainingTime = Math.max(0, totalTimeLimit - elapsed).toFixed(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0a0a0c] border border-white/10 rounded-sm shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col relative overflow-hidden">
        
        {/* 상단 타임오버 진행률 바 */}
        <div className="absolute top-0 left-0 h-1 bg-white/10 w-full z-10">
          <div className={`h-full transition-all duration-100 ease-linear ${progressPercent > 80 ? 'bg-red-500' : 'bg-teal-500'}`} style={{ width: `${progressPercent}%` }} />
        </div>
        
        {/* 닫기 버튼 및 상단 컨트롤 */}
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

        {/* 💡 메인 컨텐츠 렌더링 영역 */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar text-white/80 leading-relaxed font-sans text-sm sm:text-base">
          {renderContent ? renderContent() : null}
        </div>

        {/* 💡 하단 순차 입력창 */}
        <div className="p-4 sm:p-6 border-t border-white/10 bg-white/5">
          <div className={`flex items-center gap-3 bg-black/40 border p-3 rounded transition-colors ${
            inputStatus === 'correct' ? 'border-teal-500/50 shadow-[0_0_15px_rgba(20,184,166,0.2)]' :
            inputStatus === 'wrong' ? 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]' :
            'border-white/10 focus-within:border-teal-500/50'
          }`}>
            <span className="text-sm">✏️</span>
            <div className="flex-1">
              <FastSequentialInput 
                value={answerInput} 
                onChange={(val: string) => setAnswerInput(val)}
                onKeyDown={handleSequentialInput}
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
