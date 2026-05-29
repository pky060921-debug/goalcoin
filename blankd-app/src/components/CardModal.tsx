import React, { useEffect, useRef } from "react";

// =====================================================================
// 💡 1. 인라인 빈칸용 순수 HTML 컴포넌트 (리액트 렌더링 개입 차단)
// =====================================================================
export const FastBlankInput = ({ value, onChange, onEnter }: any) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current && inputRef.current.value !== value) {
      inputRef.current.value = value || "";
    }
  }, [value]);

  return (
    <input
      ref={inputRef}
      type="text"
      defaultValue={value}
      // 🚨 onChange를 완전히 삭제! 타자를 쳐도 앱은 아무것도 모릅니다.
      onBlur={(e) => onChange(e.target.value)} // 커서가 빠질 때 딱 한 번 전달
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return; // 한글 두 번 입력 방지
        if (e.key === 'Enter') {
          onChange(e.currentTarget.value);
          setTimeout(() => {
            if (onEnter) onEnter();
          }, 50);
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
  
  // 💡 순차 입력창을 직접 조종하기 위한 리모컨(useRef)
  const sequentialRef = useRef<HTMLInputElement>(null);

  // 모달이 열리거나 카드가 바뀔 때마다 입력창 포커스 및 텍스트 강제 비우기
  useEffect(() => {
    if (sequentialRef.current) {
      sequentialRef.current.value = "";
      sequentialRef.current.focus();
    }
  }, [activeCard]);

  // 오답/정답 판정 후 입력창을 비워야 할 때
  useEffect(() => {
    if ((inputStatus === 'correct' || inputStatus === 'wrong') && sequentialRef.current) {
      sequentialRef.current.value = "";
    }
  }, [inputStatus]);

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

        {/* 메인 컨텐츠 (조항 및 빈칸) 렌더링 영역 */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar text-white/80 leading-relaxed font-sans text-sm sm:text-base">
          {renderContent ? renderContent() : null}
        </div>

        {/* 💡 하단 순차 입력창 (순수 HTML 방식 적용으로 렉 0%) */}
        <div className="p-4 sm:p-6 border-t border-white/10 bg-white/5">
          <div className={`flex items-center gap-3 bg-black/40 border p-3 rounded transition-colors ${
            inputStatus === 'correct' ? 'border-teal-500/50 shadow-[0_0_15px_rgba(20,184,166,0.2)]' :
            inputStatus === 'wrong' ? 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]' :
            'border-white/10 focus-within:border-teal-500/50'
          }`}>
            <span className="text-sm">✏️</span>
            <div className="flex-1">
              <input
                ref={sequentialRef}
                type="text"
                placeholder="정답 입력 후 엔터"
                autoFocus
                className="w-full text-[13px] sm:text-[14px] bg-transparent text-white outline-none placeholder-white/30"
                // 🚨 핵심: 리액트의 value와 onChange 속성을 완전히 지웠습니다!
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return; // 한글 씹힘 방지
                  
                  if (e.key === 'Enter') {
                    const typedValue = e.currentTarget.value;
                    
                    // 엔터를 칠 때 딱 한 번! 앱 꼭대기로 정답을 올려보냅니다.
                    setAnswerInput(typedValue);
                    
                    // 상태가 반영될 아주 짧은 틈(0.05초)을 주고 채점 함수 실행
                    setTimeout(() => {
                      if (handleSequentialInput) handleSequentialInput(e);
                      
                      // 제출 후 입력창 비우기
                      if (sequentialRef.current) {
                        sequentialRef.current.value = "";
                      }
                    }, 50);
                  }
                }}
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
