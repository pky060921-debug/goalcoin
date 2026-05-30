import React from 'react';
import { parseCardStats, formatCardText } from '../utils/constants';

export const DashboardTab = ({ categories, savedCards, setActiveTab, setExpandedId, setActiveCard }: any) => {
  const safeCards = Array.isArray(savedCards) ? savedCards : [];
  
  // 💡 [핵심 수정] 실시간으로 가장 최근에 학습/클릭한 카드의 ID와 제목을 가져옵니다.
  const recentEnhanceId = localStorage.getItem('recent_enhance_id');
  const recentEnhanceTitle = localStorage.getItem('recent_enhance_title');
  
  // 저장된 ID와 일치하는 실제 카드 객체를 찾습니다.
  const recentCard = safeCards.find((c: any) => c.id === recentEnhanceId);

  let totalBlanks = 0;
  let totalFilled = 0;
  let totalWrong = 0;

  const folderStats: Record<string, { total: number; filled: number; wrong: number }> = {};
  
  safeCards.forEach((card: any) => {
    const folder = card.folder_name || '기본 폴더';
    if (!folderStats[folder]) folderStats[folder] = { total: 0, filled: 0, wrong: 0 };

    const { body } = formatCardText(card.content);
    const blanks = body.match(/\[\s*(.*?)\s*\]/g) || [];
    const blankCount = blanks.length;
    
    const stats = parseCardStats(card.memo);
    totalBlanks += blankCount;
    totalFilled += stats.filled;
    totalWrong += stats.wrongIndices.length;

    folderStats[folder].total += blankCount;
    folderStats[folder].filled += stats.filled;
    folderStats[folder].wrong += stats.wrongIndices.length;
  });

  const sortedFolders = Object.keys(folderStats).sort();

  return (
    <div className="p-4 space-y-6">
      {/* 💡 상단 통합 이어서 하기 영역 */}
      <div className="bg-gradient-to-r from-teal-900/40 to-black p-4 rounded-sm border border-teal-500/30">
        <div className="text-[10px] text-teal-400 font-bold mb-2 uppercase tracking-widest">▶ 최근 학습 이어가기</div>
        {recentCard ? (
          <button 
            onClick={() => setActiveCard(recentCard)}
            className="flex flex-col items-start bg-white/5 p-3 rounded hover:bg-white/10 w-full transition-all border border-white/5"
          >
            <span className="text-[10px] text-teal-500 mb-1 font-bold tracking-widest">▶️ 이어서 채우기</span>
            <span className="text-xs font-bold text-amber-300 truncate w-full">
              {recentEnhanceTitle || "학습 중인 카드"}
            </span>
          </button>
        ) : (
          <div className="text-xs text-white/30 italic py-2">최근 학습한 기록이 없습니다.</div>
        )}
      </div>

      <div className="text-white/50 font-bold text-sm mb-2 mt-6">폴더별 학습(채우기) 진척도</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 pt-2 border-t border-white/5 w-full">
        {sortedFolders.map(folder => {
          const fs = folderStats[folder];
          const fp = fs.total > 0 ? Math.round((fs.filled / fs.total) * 100) : 0;
          return (
            <div key={folder} className="bg-white/5 border border-white/5 p-2 sm:p-3 rounded-sm hover:bg-white/10 transition-colors flex flex-col gap-1.5 sm:gap-2">
              <div className="flex justify-between items-start">
                <span className="text-[10px] sm:text-[11px] font-bold text-amber-500/80 truncate pr-1 flex-1 leading-tight">{folder}</span>
                <span className="text-[9px] sm:text-[10px] text-white/40 font-mono">{fp}%</span>
              </div>
              <div className="w-full bg-black/40 h-1 rounded-full overflow-hidden">
                <div className="bg-teal-500 h-full transition-all duration-300" style={{ width: `${fp}%` }} />
              </div>
              <div className="flex justify-between items-center text-[9px] text-white/30 font-mono mt-0.5">
                <span>{fs.filled}/{fs.total} 완료</span>
                {fs.wrong > 0 && <span className="text-red-400/70">오답 {fs.wrong}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
