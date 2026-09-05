import React, { useState, useEffect } from 'react';

const getExtendedStats = (memoStr: string) => {
  try {
    if (memoStr && memoStr.trim().startsWith('{')) {
      const p = JSON.parse(memoStr || '{}');
      return {
        text: p.text || "", filled: p.filled || 0, wrongIndices: p.wrongIndices || [],
        upgrade: p.upgrade || 0, bestTime: p.bestTime || 0, totalCorrect: p.totalCorrect || 0, totalWrong: p.totalWrong || 0,
        history: p.history || [] 
      };
    }
  } catch(e) {}
  return { text: "", filled: 0, wrongIndices: [], upgrade: 0, bestTime: 0, totalCorrect: 0, totalWrong: 0, history: [] };
};

export const RecordTab = ({ savedCards, goalBalance, handleUpdateBalance, loadAllData, safeAddress }: any) => {
  const [expandedId, setExpandedId] = useState<string | number | null>(null);
  const [localCards, setLocalCards] = useState<any[]>([]);

  useEffect(() => { setLocalCards(Array.isArray(savedCards) ? savedCards : []); }, [savedCards]);

  const renderExpandableWrongCard = (card: any, wrongWords: string[]) => {
    const isExpanded = expandedId === card.id;
    const title = card.content.split('\n')[0].replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim() || '제목 없음';

    return (
      <div key={card.id} className="relative w-full perspective-1000 mb-2">
        <div 
          onClick={() => setExpandedId(isExpanded ? null : card.id)}
          className="w-full text-left p-3 sm:p-4 rounded-sm transition-all duration-300 shadow-md border cursor-pointer flex flex-col justify-between items-start gap-2 bg-red-950/20 border-red-500/30 hover:bg-red-900/30"
        >
          <div className="flex justify-between items-center w-full gap-2">
             <div className="font-bold text-[11px] sm:text-[13px] tracking-tight leading-snug line-clamp-2 text-red-100">
                {title}
             </div>
             <span className="shrink-0 bg-red-600 text-white text-[9px] sm:text-[10px] px-2 py-1 rounded-sm font-bold shadow-[0_0_10px_rgba(220,38,38,0.5)]">🚨 오답 발견</span>
          </div>
          
          <div className="flex flex-wrap gap-1 mt-2 w-full">
             <span className="text-[10px] text-red-400 font-bold w-full mb-0.5">내가 틀렸던 빈칸 단어:</span>
             {wrongWords.map(w => (
                <span key={w} className="bg-red-900/50 text-red-200 border border-red-500/40 px-2 py-0.5 rounded-sm text-[10px] font-bold">
                   {w}
                </span>
             ))}
          </div>
        </div>

        {isExpanded && (
          <div className="w-full bg-[#0a0a0c] border border-red-500/30 p-4 mt-1 rounded-sm text-[11px] sm:text-[12px] text-white/80 leading-relaxed font-serif animate-in slide-in-from-top-2 shadow-inner">
             {card.content.split('\n').slice(1).join('\n')}
          </div>
        )}
      </div>
    );
  };

  const getFoldersWithMistakes = () => {
    const wrongFolders = new Set<string>();
    localCards.forEach(c => {
      const stats = getExtendedStats(c.memo);
      const allWrongWords = new Set(stats.history.flatMap((h: any) => h.wrongWords || []));
      if (allWrongWords.size > 0 && c.folder_name) {
        wrongFolders.add(c.folder_name);
      }
    });
    return Array.from(wrongFolders).sort();
  };

  const enhanceFolders = getFoldersWithMistakes();

  return (
    <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in pb-24 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-red-500/30 pb-4 gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif text-red-400 tracking-tight mb-2">나의 취약점 (오답노트)</h1>
          <p className="text-[11px] sm:text-xs text-red-200/60 leading-relaxed">
            한 번이라도 <span className="text-red-400 font-bold">오답을 입력했거나 스킵한 빈칸</span>이 포함된 조항들만 모아 보여줍니다.
          </p>
        </div>
      </div>

      {enhanceFolders.length === 0 ? (
        <div className="text-center py-20 text-teal-400/50 text-sm font-serif flex flex-col items-center gap-2">
           <span className="text-3xl mb-2">🎉</span>
           <span>현재 틀린 문제가 하나도 없습니다! 완벽합니다.</span>
        </div>
      ) : (
        <div className="space-y-6 sm:space-y-8 w-full">
          {enhanceFolders.map((folder: string) => {
            const folderCards = localCards.filter(c => {
               if (c.folder_name !== folder) return false;
               const stats = getExtendedStats(c.memo);
               const allWrongWords = new Set(stats.history.flatMap((h: any) => h.wrongWords || []));
               return allWrongWords.size > 0;
            }).sort((a,b) => parseInt(a.id, 10) - parseInt(b.id, 10));
            
            if (folderCards.length === 0) return null;
            
            const col1Cards = folderCards.filter((c:any) => { const f = c.content.split('\n')[0]||""; return !f.includes('[령]') && !f.includes('[칙]') && !f.includes('[규]') && !f.includes('[규정]'); });
            const col2Cards = folderCards.filter((c:any) => { const f = c.content.split('\n')[0]||""; return f.includes('[령]'); });
            const col3Cards = folderCards.filter((c:any) => { const f = c.content.split('\n')[0]||""; return f.includes('[칙]') || f.includes('[규]') || f.includes('[규정]'); });

            return (
              <div key={folder} className="mb-10 sm:mb-12 border-l-2 border-red-500/30 pl-2 sm:pl-4 bg-red-950/5 p-4 rounded-r-md">
                <div className="text-sm sm:text-base text-red-300 mb-4 border-b border-red-500/20 pb-2 font-bold tracking-widest">{folder}</div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 items-start w-full">
                  <div className="flex flex-col gap-2.5 w-full">
                    <div className="text-xs text-white/50 font-bold mb-1 text-center tracking-widest border-b border-white/5 pb-2">법 / 정관</div>
                    {col1Cards.map(c => {
                       const stats = getExtendedStats(c.memo);
                       const wWords = Array.from(new Set(stats.history.flatMap((h: any) => h.wrongWords || [])));
                       return renderExpandableWrongCard(c, wWords as string[]);
                    })}
                  </div>
                  <div className="flex flex-col gap-2.5 w-full">
                    <div className="text-xs text-white/50 font-bold mb-1 text-center tracking-widest border-b border-white/5 pb-2">시행령</div>
                    {col2Cards.map(c => {
                       const stats = getExtendedStats(c.memo);
                       const wWords = Array.from(new Set(stats.history.flatMap((h: any) => h.wrongWords || [])));
                       return renderExpandableWrongCard(c, wWords as string[]);
                    })}
                  </div>
                  <div className="flex flex-col gap-2.5 w-full">
                    <div className="text-xs text-white/50 font-bold mb-1 text-center tracking-widest border-b border-white/5 pb-2">시행규칙</div>
                    {col3Cards.map(c => {
                       const stats = getExtendedStats(c.memo);
                       const wWords = Array.from(new Set(stats.history.flatMap((h: any) => h.wrongWords || [])));
                       return renderExpandableWrongCard(c, wWords as string[]);
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
