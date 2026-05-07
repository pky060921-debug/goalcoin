import React from 'react';
import { parseCardStats, formatCardText } from '../utils/constants';

export const DashboardTab = ({ categories, savedCards }: any) => {
  let totalBlanks = 0;
  let totalFilled = 0;
  let totalWrong = 0;

  const safeCards = Array.isArray(savedCards) ? savedCards : [];
  
  // 💡 장(폴더)별 통계를 저장할 객체
  const folderStats: Record<string, { total: number; filled: number; wrong: number }> = {};
  
  safeCards.forEach((card: any) => {
    const folder = card.folder_name || '분류 안 됨';
    if (!folderStats[folder]) {
      folderStats[folder] = { total: 0, filled: 0, wrong: 0 };
    }

    const { body } = formatCardText(card.content);
    const blanks = body.match(/\[\s*(.*?)\s*\]/g) || [];
    const blankCount = blanks.length;
    
    const stats = parseCardStats(card.memo);
    const filledCount = stats.filled;
    const wrongCount = stats.wrongIndices.length;

    // 전체 통계 누적
    totalBlanks += blankCount;
    totalFilled += filledCount;
    totalWrong += wrongCount;

    // 장별 통계 누적
    folderStats[folder].total += blankCount;
    folderStats[folder].filled += filledCount;
    folderStats[folder].wrong += wrongCount;
  });

  const progressPercent = totalBlanks > 0 ? Math.round((totalFilled / totalBlanks) * 100) : 0;
  const sortedFolders = Object.keys(folderStats).sort();

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* 상단: 전체 요약 수치 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#0a0a0c] border border-indigo-500/30 p-6 rounded-sm shadow-lg flex flex-col gap-2">
          <span className="text-teal-500/50 font-bold text-xs uppercase tracking-widest">전체 생성 빈칸</span>
          <span className="text-3xl font-light text-white">{totalBlanks} <span className="text-sm text-white/40">개</span></span>
        </div>
        <div className="bg-[#0a0a0c] border border-indigo-500/30 p-6 rounded-sm shadow-lg flex flex-col gap-2">
          <span className="text-teal-500/50 font-bold text-xs uppercase tracking-widest">누적 정답 (채운 빈칸)</span>
          <span className="text-3xl font-light text-teal-400">{totalFilled} <span className="text-sm text-white/40">개</span></span>
        </div>
        <div className="bg-[#0a0a0c] border border-indigo-500/30 p-6 rounded-sm shadow-lg flex flex-col gap-2">
          <span className="text-red-500/50 font-bold text-xs uppercase tracking-widest">현재 오답 누적</span>
          <span className="text-3xl font-light text-red-400">{totalWrong} <span className="text-sm text-white/40">개</span></span>
        </div>
      </div>

      {/* 중단: 전체 지식 동기화율 프로그레스 바 */}
      <div className="bg-[#0a0a0c] border border-white/10 p-8 rounded-sm shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
          <svg className="w-32 h-32 text-indigo-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zm0 7.5l-10-5v10l10 5 10-5v-10l-10 5z"/></svg>
        </div>
        <h3 className="text-lg font-serif text-white mb-4 relative z-10">전체 지식 동기화율 (Total Progress)</h3>
        <div className="w-full bg-white/5 h-4 rounded-full overflow-hidden mb-2 relative z-10">
          <div className="bg-indigo-500 h-full transition-all duration-1000 ease-out" style={{ width: `${progressPercent}%` }}></div>
        </div>
        <p className="text-right text-sm text-indigo-400 font-bold relative z-10">{progressPercent}% 완료</p>
      </div>

      {/* 💡 하단: 장별(폴더별) 상세 진행상황 시각화 */}
      {sortedFolders.length > 0 && (
        <div className="bg-[#0a0a0c] border border-white/10 p-6 rounded-sm shadow-xl">
          <h3 className="text-md font-serif text-white/80 mb-6 border-b border-white/10 pb-2">장별 상세 진행상황</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedFolders.map(folder => {
              const fStats = folderStats[folder];
              const fPercent = fStats.total > 0 ? Math.round((fStats.filled / fStats.total) * 100) : 0;
              
              return (
                <div key={folder} className="flex flex-col gap-2 p-4 border border-white/5 bg-white/5 rounded-sm hover:bg-white/10 transition-colors">
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] font-bold text-amber-400 truncate pr-2">{folder}</span>
                    <span className="text-xs text-white/60 font-bold">{fPercent}%</span>
                  </div>
                  {/* 작은 프로그레스 바 */}
                  <div className="w-full bg-black/50 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-amber-500 h-full transition-all duration-700 ease-out" style={{ width: `${fPercent}%` }}></div>
                  </div>
                  {/* 세부 수치 */}
                  <div className="flex gap-3 text-[10px] mt-1 font-mono">
                    <span className="text-white/40">빈칸 {fStats.total}</span>
                    <span className="text-teal-400">채움 {fStats.filled}</span>
                    {fStats.wrong > 0 && <span className="text-red-400 animate-pulse">틀림 {fStats.wrong}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
