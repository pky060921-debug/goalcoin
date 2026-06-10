import React, { useEffect, useState } from 'react';
import { parseCardStats, formatCardText } from '../utils/constants';

export const DashboardTab = ({ categories, savedCards, setActiveTab, setExpandedId, setActiveCard }: any) => {
  const safeCards = Array.isArray(savedCards) ? savedCards : [];
  const safeCategories = Array.isArray(categories) ? categories : [];
  
  let totalBlanks = 0;
  let totalFilled = 0;
  let totalWrong = 0;

  const folderStats: Record<string, { total: number; filled: number; wrong: number }> = {};
  
  safeCards.forEach((card: any) => {
    try {
      const folder = card.folder_name || '기본 폴더';
      if (!folderStats[folder]) folderStats[folder] = { total: 0, filled: 0, wrong: 0 };

      const blanks = card.content.match(/\[\s*(.*?)\s*\]/g) || [];
      const blankCount = blanks.length;
      
      const stats = parseCardStats(card.memo);
      totalBlanks += blankCount;
      totalFilled += stats.filled;
      totalWrong += stats.wrongIndices.length;

      folderStats[folder].total += blankCount;
      folderStats[folder].filled += stats.filled;
      folderStats[folder].wrong += stats.wrongIndices.length;
    } catch (err) {
      console.error("[Dashboard 진단 오류] 카드 데이터 파싱 실패:", err, card);
    }
  });

  const fillProgress = totalBlanks > 0 ? Math.round((totalFilled / totalBlanks) * 100) : 0;
  const craftProgress = safeCategories.length > 0 ? Math.round((safeCards.length / safeCategories.length) * 100) : 0;

  const sortedFolders = Object.keys(folderStats).sort((a, b) => {
    const matchA = a.match(/^제\s*(\d+)\s*장/);
    const matchB = b.match(/^제\s*(\d+)\s*장/);
    if (matchA && matchB) return parseInt(matchA[1]) - parseInt(matchB[1]);
    if (matchA) return -1;
    if (matchB) return 1;
    return a.localeCompare(b, 'ko');
  });

  const recentWrongCards = safeCards.filter((c: any) => {
    const stats = parseCardStats(c.memo);
    return stats.wrongIndices && stats.wrongIndices.length > 0;
  }).slice(0, 3);

  const recentEnhanceCard = safeCards.length > 0 ? safeCards[safeCards.length - 1] : null;
  const recentEnhanceTitle = recentEnhanceCard ? getStrictTitleOnly(recentEnhanceCard.content) : "";

  function getStrictTitleOnly(content: string) {
    if (!content) return "";
    const firstLine = content.split('\n')[0] || "";
    return firstLine.replace(/▶/g, '').trim();
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 py-6 px-4 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* 만들기 진척도 (제작 수 / 전체 조항 수) */}
        <div className="bg-[#0a0a0c] border border-white/10 p-5 rounded-sm flex flex-col justify-between">
          <div>
            <div className="text-xs text-white/40 font-mono tracking-wider">제작 진척도</div>
            <div className="text-2xl font-serif text-amber-400 mt-2 font-bold">
              {safeCards.length} <span className="text-lg text-amber-400/60">/ {safeCategories.length}</span>
            </div>
            <div className="text-[11px] text-white/50 mt-1">전체 조항 중 제작 완료된 카드 수 ({craftProgress}%)</div>
          </div>
          <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden mt-4">
            <div className="bg-amber-500 h-full transition-all duration-500" style={{ width: `${craftProgress}%` }}></div>
          </div>
        </div>

        {/* 채우기 진척도 */}
        <div className="bg-[#0a0a0c] border border-white/10 p-5 rounded-sm flex flex-col justify-between">
          <div>
            <div className="text-xs text-white/40 font-mono tracking-wider">학습 진척도 (빈칸 기준)</div>
            <div className="text-2xl font-serif text-indigo-400 mt-2 font-bold">{fillProgress}%</div>
            <div className="text-[11px] text-white/50 mt-1">전체 빈칸 개수 기준 암기 진척도 ({totalFilled} / {totalBlanks})</div>
          </div>
          <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden mt-4">
            <div className="bg-indigo-500 h-full transition-all duration-500" style={{ width: `${fillProgress > 100 ? 100 : fillProgress}%` }}></div>
          </div>
        </div>

        {/* 오답 빈칸 수 (오답 수 / 전체 빈칸 수) */}
        <div className="bg-[#0a0a0c] border border-white/10 p-5 rounded-sm flex flex-col justify-between">
          <div>
            <div className="text-xs text-white/40 font-mono tracking-wider">오답 빈칸 수</div>
            <div className="text-2xl font-serif text-red-400 mt-2 font-bold">
              {totalWrong} <span className="text-lg text-red-400/60">/ {totalBlanks}</span>
            </div>
            <div className="text-[11px] text-white/50 mt-1">전체 빈칸 중 오답이 발생한 빈칸 수</div>
          </div>
          <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden mt-4">
            <div className="bg-red-500 h-full transition-all duration-300" style={{ width: `${totalBlanks > 0 ? (totalWrong / totalBlanks) * 100 : 0}%` }}></div>
          </div>
        </div>
      </div>

      {(recentWrongCards.length > 0 || recentEnhanceCard) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {recentWrongCards.length > 0 && (
            <div className="border border-white/10 p-4 rounded-sm bg-[#08080a]">
              <div className="text-xs text-red-400 font-bold mb-3 tracking-wider font-mono">⚠️ 취약 조항 리스트</div>
              <div className="space-y-2">
                {recentWrongCards.map((card: any) => (
                  <button
                    key={card.id}
                    onClick={() => {
                      setActiveCard(card);
                    }}
                    className="w-full text-left p-2.5 bg-red-950/20 border border-red-900/30 rounded-sm hover:bg-red-950/40 transition-all flex justify-between items-center group"
                  >
                    <span className="text-xs text-white/80 font-bold truncate max-w-[80%] group-hover:text-white">{getStrictTitleOnly(card.content)}</span>
                    <span className="text-[10px] font-mono text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded bg-red-950/50">틀림</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {recentEnhanceCard && (
            <button
              onClick={() => {
                setActiveTab('enhance');
              }}
              className="border border-white/10 p-5 rounded-sm bg-[#08080a] flex flex-col justify-center items-center hover:border-teal-500/40 transition-all text-center group cursor-pointer"
            >
              <span className="text-[10px] text-teal-500 mb-1 font-bold tracking-widest">▶️ 이어서 채우기</span>
              <span className="text-xs font-bold text-teal-100 truncate w-full group-hover:text-white">{recentEnhanceTitle || "최근 학습 카드"}</span>
            </button>
          )}
        </div>
      )}
      
      <div className="text-white/50 font-bold text-sm mb-2 mt-6">폴더별 학습(채우기) 진척도</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 pt-2 border-t border-white/5 w-full">
        {sortedFolders.map(folder => {
          const fs = folderStats[folder];
          const fp = fs.total > 0 ? Math.round((fs.filled / fs.total) * 100) : 0;
          return (
            <div key={folder} className="bg-white/5 border border-white/5 p-2 sm:p-3 rounded-sm hover:bg-white/10 transition-colors flex flex-col gap-1.5 sm:gap-2">
              <div className="flex justify-between items-start">
                <span className="text-[10px] sm:text-[11px] font-bold text-amber-500/80 truncate pr-1 flex-1 leading-tight">{folder}</span>
                <span className="text-[9px] sm:text-[10px] text-white/60 font-mono font-bold">{fp}%</span>
              </div>
              <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
                <div className="bg-indigo-500 h-full" style={{ width: `${fp}%` }}></div>
              </div>
              <div className="flex justify-between items-center text-[9px] sm:text-[10px] font-mono text-white/30 pt-0.5 border-t border-white/5 mt-0.5">
                <span>완료:{fs.filled}/{fs.total}</span>
                {fs.wrong > 0 && <span className="text-red-400 font-bold">오답:{fs.wrong}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
