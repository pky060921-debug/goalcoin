import React from 'react';

export const MypageTab = ({ safeAddress, enokiFlow, useAiRecommend, setUseAiRecommend, viewMode, setViewMode, colCount, updateColCount, handleDeleteAll }: any) => {
  return (
    <div className="max-w-md mx-auto space-y-8 py-16 animate-in fade-in">
      <div className="border border-white/10 p-6 rounded-sm">
        <div className="text-xs text-white/60 mb-2">계정 정보</div>
        <div className="text-sm font-mono text-teal-400 bg-black/50 p-3 rounded mb-4 break-all">
          {safeAddress}
        </div>
        <button onClick={() => { enokiFlow.logout(); window.location.reload(); }} className="px-3 py-1 text-[10px] border border-white/20 text-white/60 hover:text-white rounded-sm mb-6 transition-colors">
          로그아웃
        </button>

        <div className="border-t border-white/10 my-6"></div>

        <div className="text-xs text-white/60 mb-2">AI 기능 설정</div>
        <button onClick={() => { const val = !useAiRecommend; setUseAiRecommend(val); localStorage.setItem('useAiRecommend', String(val)); }} className={`px-3 py-1 text-[10px] rounded-sm mb-6 transition-colors ${useAiRecommend ? 'bg-teal-600 text-white' : 'border border-white/10 text-white/40'}`}>
          AI 추천 기능 {useAiRecommend ? 'ON' : 'OFF'}
        </button>

        <div className="text-xs text-white/60 mb-4">공통 레이아웃 뷰어 설정</div>
        <div className="flex gap-2 mb-4">
          {['all', '법', '령', '칙'].map(mode => (
            <button key={mode} onClick={() => setViewMode(mode)} className={`px-3 py-1 text-[10px] rounded-sm transition-colors ${viewMode === mode ? 'bg-white/20 text-white' : 'border border-white/10 text-white/40 hover:bg-white/5'}`}>{mode === 'all' ? '전체' : mode}</button>
          ))}
        </div>
        
        <div className="text-xs text-white/60 mb-4">레이아웃 단수 설정</div>
        <div className="flex gap-2">
          {[1, 2, 3, 4].map(num => (
            <button key={num} onClick={() => updateColCount(num)} className={`px-3 py-1 text-[10px] rounded-sm transition-colors ${colCount === num ? 'bg-white/20 text-white' : 'border border-white/10 text-white/40 hover:bg-white/5'}`}>{num}단</button>
          ))}
        </div>
      </div>
      
      <button onClick={handleDeleteAll} className="w-full py-4 border border-rose-900/30 text-rose-500/70 text-xs transition-all hover:bg-rose-900/20 rounded-sm">
        데이터 완전 초기화 (전체 삭제)
      </button>
    </div>
  );
};
