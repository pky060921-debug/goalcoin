import React from 'react';

export const MypageTab = ({ safeAddress, enokiFlow, useAiRecommend, setUseAiRecommend, studyMode, setStudyMode, handleDeleteAll }: any) => {
  return (
    <div className="max-w-md mx-auto space-y-8 py-16 animate-in fade-in">
      <div className="border border-white/10 p-6 rounded-sm">
        
        <div className="text-xs text-white/60 mb-2">계정 및 지갑 정보</div>
        <div className="text-[11px] font-mono text-teal-400 bg-black/50 p-3 rounded mb-4 break-all">
          {safeAddress || "연결된 계정 없음"}
        </div>
        <button onClick={() => { enokiFlow.logout(); window.location.reload(); }} className="px-4 py-2 text-xs border border-white/20 text-white/60 hover:text-white hover:bg-white/10 rounded-sm mb-6 transition-all">
          로그아웃
        </button>

        <div className="border-t border-white/10 my-6"></div>

        <div className="text-xs text-white/60 mb-2">AI 지식 추출 엔진</div>
        <button onClick={() => { const val = !useAiRecommend; setUseAiRecommend(val); localStorage.setItem('useAiRecommend', String(val)); }} className={`px-3 py-1 text-[10px] rounded-sm mb-6 transition-colors ${useAiRecommend ? 'bg-teal-600 text-white' : 'border border-white/10 text-white/40'}`}>
          AI 추천 기능 {useAiRecommend ? 'ON' : 'OFF'}
        </button>

        {/* 💡 복잡했던 뷰어/단수 설정을 모두 지우고 '레이아웃 모드'로 통합 */}
        <div className="text-xs text-white/60 mb-4">학습 콘텐츠 레이아웃 설정</div>
        <div className="flex gap-2 mb-4">
          {['법령', '일반'].map(mode => (
            <button 
              key={mode} 
              onClick={() => { setStudyMode(mode); localStorage.setItem('studyMode', mode); }} 
              className={`px-4 py-2 text-xs font-bold rounded-sm transition-colors ${studyMode === mode ? 'bg-indigo-600 text-white' : 'border border-white/10 text-white/40 hover:bg-white/5'}`}
            >
              {mode} 모드
            </button>
          ))}
        </div>
        <p className="text-[10px] text-white/40 leading-relaxed">
          * 법령 모드: [법] [령] [규칙] 3단 테이블 강제 정렬.<br/>
          * 일반 모드: 공간 효율 중심의 자유로운 그리드 배치.
        </p>

      </div>
      
      <button onClick={handleDeleteAll} className="w-full py-4 border border-rose-900/30 text-rose-500/70 text-xs transition-all hover:bg-rose-900/20 rounded-sm">
        데이터 완전 초기화 (전체 삭제)
      </button>
    </div>
  );
};
