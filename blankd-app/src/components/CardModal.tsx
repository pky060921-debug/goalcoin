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
  }, [activeCard, answerInput]);

  // 💡 [단축키 추가] 모달이 열려 있을 때 엔터(Enter) 키 이벤트를 감지합니다.
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        // 🚨 주의: 빈칸에 정답을 적고 엔터를 칠 때(제출)와 충돌하지 않도록 방어
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT') {
          const inputValue = (target as HTMLInputElement).value.trim();
          // 입력창에 글자가 한 글자라도 적혀있다면 '제출'이므로 정답 보기를 실행하지 않습니다.
          if (inputValue !== '') return; 
        }
        
        // 입력창이 완전히 비어있는 상태에서 엔터를 치면 '정답 보기' 버튼을 강제로 누릅니다.
        const showAnswerBtn = document.getElementById('show-answer-btn');
        if (showAnswerBtn) {
          showAnswerBtn.click();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    
    // 모달이 닫히면 메모리 누수를 막기 위해 감지기를 깨끗하게 삭제합니다.
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []); // 💡 빈 배열을 넣어 한 번만 실행되게 만듭니다.

  if (!activeCard) return null;

  const progressPercent = totalTimeLimit > 0 ? Math.min((elapsed / totalTimeLimit) * 100, 100) : 0;
  const remainingTime = Math.max(0, totalTimeLimit - elapsed).toFixed(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      {/* 💡 수정된 부분: max-w-2xl을 max-w-6xl w-[95vw]로 변경하여 팝업창 너비를 대폭 확장했습니다. */}
      <div className="bg-[#0a0a0c] border border-white/10 rounded-sm shadow-2xl w-[95vw] max-w-6xl max-h-[85vh] flex flex-col relative overflow-hidden">
        <div className="absolute top-0 left-0 h-1 bg-white/10 w-full z-10">
          <div className={`h-full transition-all duration-100 ease-linear ${progressPercent > 80 ? 'bg-red-500' : 'bg-teal-500'}`} style={{ width: `${progressPercent}%` }} />
        </div>
        
        {/* 모달 상단 닫기 버튼 영역 */}
        <div className="flex justify-between items-center border-b border-white/10 p-3 bg-black/40">
            <button onClick={onClose} className="text-white/50 hover:text-white px-2 font-bold transition-colors">✕</button>
        </div>
        
        {/* App.tsx에서 전달받은 실제 카드 콘텐츠(정답 보기 버튼 포함) 렌더링 영역 */}
        <div className="flex-1 overflow-y-auto p-4">
            {renderContent()}
        </div>
      </div>
    </div>
  );
};
