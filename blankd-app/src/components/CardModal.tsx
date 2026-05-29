import React, { useState, useEffect, useRef } from "react";
import { formatCardText } from "../utils/constants";

export const FastBlankInput = ({ value, onChange, onEnter }: any) => {
  const [localValue, setLocalValue] = useState(value || "");
  useEffect(() => { setLocalValue(value || ""); }, [value]);
  return (
    <input
      type="text"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
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
  const remainingTime = Math.max(0, totalTimeLimit - elapsed).toFixed(0); // 소수점 제거

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md transition-all duration-300">
      <div className="bg-[#0a0a0c] border border-white/10 rounded-lg shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col relative overflow-hidden transition-all duration-300">

        {/* 타이머 바 */}
        <div className="absolute top-0 left-0 h-1 bg-white/10 w-full z-10">
          <div
            className={`h-full ease-linear transition-none ${progressPercent > 80 ? 'bg-red-500' : 'bg-teal-500'}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* 헤더 */}
        <div className="flex justify-between items-center px-5 py-3 border-b border-white/10 mt-1">
          <div className="text-white/50 text-xs font-mono tracking-widest">
            TIME <span className={`ml-1 font-bold ${progressPercent > 80 ? 'text-red-400 animate-pulse' : 'text-white/80'}`}>{remainingTime}s</span>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors duration-150">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-5 py-5 text-white/80 leading-relaxed font-sans text-sm sm:text-base scroll-smooth">
          {renderContent ? renderContent() : null}
        </div>

      </div>
    </div>
  );
};
