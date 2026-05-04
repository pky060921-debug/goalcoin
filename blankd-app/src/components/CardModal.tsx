import React from 'react';

interface CardModalProps {
  activeCard: any;
  totalTimeLimit: number;
  elapsed: number;
  answerInput: string;
  setAnswerInput: (val: string) => void;
  inputStatus: string;
  handleSequentialInput: () => void;
  renderContent: () => React.ReactNode;
  onClose: () => void;
}

export const CardModal: React.FC<CardModalProps> = ({
  activeCard, totalTimeLimit, elapsed, answerInput, setAnswerInput, 
  inputStatus, handleSequentialInput, renderContent, onClose
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0d0d0f]/95 backdrop-blur-sm animate-in fade-in">
      <div className="border border-white/10 bg-[#121214] w-full max-w-2xl p-10 shadow-2xl rounded-sm">
        <div className="flex justify-between items-baseline border-b border-white/5 pb-6 mb-8">
          <div>
            <span className="font-bold text-amber-400 mr-4">LV.{activeCard.level}</span>
            <span className="text-xs text-teal-400 mr-4">⏳ {Number(totalTimeLimit - elapsed || 0).toFixed(1)}초 남음</span>
            {activeCard.best_time && <span className="text-xs text-amber-300 font-bold">🏆 BEST: {Number(activeCard.best_time).toFixed(1)}초</span>}
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white text-sm"> 닫기 </button>
        </div>
        <div className="p-8 border border-white/5 bg-[#0a0a0c] text-[15px] leading-loose font-serif text-white/90 mb-8 rounded-sm">
          {renderContent()}
        </div>
        <input 
          autoFocus
          value={answerInput} 
          onChange={(e) => setAnswerInput(e.target.value)} 
          onKeyDown={(e) => e.key === 'Enter' && handleSequentialInput()}
          placeholder="정답 입력 후 엔터"
          className={`w-full bg-black/50 border p-4 text-white text-sm outline-none transition-all ${inputStatus === 'correct' ? 'border-green-500' : inputStatus === 'wrong' ? 'border-red-500 animate-shake' : 'border-white/20 focus:border-indigo-500'}`}
        />
      </div>
    </div>
  );
};
