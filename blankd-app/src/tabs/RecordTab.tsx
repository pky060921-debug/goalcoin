import React, { useState, useMemo } from "react";
import { parseCardStats, getStrictTitleOnly } from "../utils/constants";

const parseExtendedMemo = (memoStr: string) => {
  try {
    if (memoStr && memoStr.trim().startsWith('{')) {
      const p = JSON.parse(memoStr || '{}');
      return {
        text: (p.text || "").replace(/\(\s*\)\s*=>\s*x\(\s*null\s*\)/g, "").trim(),
        filled: p.filled || 0,
        wrongIndices: Array.isArray(p.wrongIndices) ? p.wrongIndices : [],
        totalCorrect: p.totalCorrect || 0,
        totalWrong: p.totalWrong || 0,
        history: Array.isArray(p.history) ? p.history : []
      };
    }
  } catch (e) {}

  try {
    const old = parseCardStats(memoStr);
    return {
      text: (old.text || "").replace(/\(\s*\)\s*=>\s*x\(\s*null\s*\)/g, "").trim(),
      filled: old.filled || 0,
      wrongIndices: Array.isArray(old.wrongIndices) ? old.wrongIndices : [],
      totalCorrect: 0,
      totalWrong: 0,
      history: []
    };
  } catch (e) {
    return { text: "", filled: 0, wrongIndices: [], totalCorrect: 0, totalWrong: 0, history: [] };
  }
};

export const RecordTab = ({
  savedCards = [],
  goalBalance,
  handleUpdateBalance,
  loadAllData,
  safeAddress,
  colCount = 3,
  setActiveCard
}: any) => {
  const [filterMode, setFilterMode] = useState<'wrong_or_note' | 'wrong_only' | 'note_only' | 'all'>('wrong_or_note');
  const [selectedFolder, setSelectedFolder] = useState<string>('전체');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const folders = useMemo(() => {
    const set = new Set<string>();
    savedCards.forEach((c: any) => {
      if (c?.folder_name) set.add(c.folder_name);
    });
    return ['전체', ...Array.from(set)];
  }, [savedCards]);

  const enrichedCards = useMemo(() => {
    return savedCards.map((card: any) => {
      const stats = parseExtendedMemo(card.memo);
      const cleanContent = card.content || "";
      const lines = cleanContent.split('\n');
      const titleLine = lines[0] || "";
      const restContent = lines.length > 1 ? lines.slice(1).join('\n').trim() : cleanContent;

      const foundBlanks: string[] = [];
      const parts = restContent.split(/(\[.*?\])/g);
      parts.forEach((part: string) => {
        if (part.startsWith('[') && part.endsWith(']')) {
          foundBlanks.push(part.replace(/\[|\]/g, '').trim());
        }
      });

      const wrongWords = stats.wrongIndices
        .map((idx: number) => foundBlanks[idx])
        .filter(Boolean);

      return {
        ...card,
        _stats: stats,
        _title: getStrictTitleOnly(titleLine) || titleLine.replace(/\[.*?\]/g, '').trim() || "제목 없음",
        _rawTitle: titleLine,
        _wrongWords: wrongWords,
        _totalBlanks: foundBlanks.length
      };
    });
  }, [savedCards]);

  const filteredCards = useMemo(() => {
    return enrichedCards.filter((c: any) => {
      if (selectedFolder !== '전체' && c.folder_name !== selectedFolder) return false;

      const hasWrong = c._stats.wrongIndices.length > 0;
      const hasNote = c._stats.text.length > 0;
      const hasStudied = c._stats.filled > 0;

      if (filterMode === 'wrong_or_note' && !hasWrong && !hasNote) return false;
      if (filterMode === 'wrong_only' && !hasWrong) return false;
      if (filterMode === 'note_only' && !hasNote) return false;
      if (filterMode === 'all' && !hasStudied && !hasNote && !hasWrong) return false;

      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchTitle = c._title.toLowerCase().includes(q);
        const matchNote = c._stats.text.toLowerCase().includes(q);
        const matchWrong = c._wrongWords.some((w: string) => w.toLowerCase().includes(q));
        if (!matchTitle && !matchNote && !matchWrong) return false;
      }

      return true;
    });
  }, [enrichedCards, selectedFolder, filterMode, searchQuery]);

  const totalWrongCardsCount = useMemo(() => enrichedCards.filter((c: any) => c._stats.wrongIndices.length > 0).length, [enrichedCards]);
  const totalNoteCardsCount = useMemo(() => enrichedCards.filter((c: any) => c._stats.text.length > 0).length, [enrichedCards]);

  return (
    <div className="space-y-6 pb-20">
      {/* 상단 요약 및 필터 컨트롤러 */}
      <div className="bg-[#0a0a0c] border border-white/10 p-4 sm:p-5 rounded-sm shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-teal-400 flex items-center gap-2">
              <span>📊 오답 및 암기 노트 기록실</span>
            </h2>
            <p className="text-xs text-white/50 mt-1">
              카드를 클릭하면 <span className="text-red-400 font-bold">틀린 오답 빈칸만 집중해서 다시 풀기</span> 모드로 진입합니다.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 font-mono text-xs">
            <div className="bg-red-950/40 border border-red-500/30 px-3 py-1.5 rounded-sm text-red-300">
              오답 보유 조항: <span className="font-bold text-red-400">{totalWrongCardsCount}</span>개
            </div>
            <div className="bg-teal-950/40 border border-teal-500/30 px-3 py-1.5 rounded-sm text-teal-300">
              암기 노트 작성: <span className="font-bold text-teal-400">{totalNoteCardsCount}</span>개
            </div>
          </div>
        </div>

        {/* 필터 버튼 및 검색창 */}
        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'wrong_or_note', label: '🔥 오답 또는 노트 있음' },
              { id: 'wrong_only', label: `❌ 오답 조항만 (${totalWrongCardsCount})` },
              { id: 'note_only', label: `📌 암기 노트만 (${totalNoteCardsCount})` },
              { id: 'all', label: '📚 전체 학습 기록' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterMode(tab.id as any)}
                className={`px-3 py-1.5 text-xs font-bold rounded-sm border transition-all ${
                  filterMode === tab.id
                    ? 'bg-teal-900/50 text-teal-300 border-teal-500/60 shadow-md'
                    : 'bg-white/5 text-white/50 border-white/10 hover:text-white/80'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedFolder}
              onChange={(e) => setSelectedFolder(e.target.value)}
              className="bg-black/60 border border-white/20 text-xs text-white/90 px-2.5 py-1.5 rounded-sm outline-none focus:border-teal-400"
            >
              {folders.map((f) => (
                <option key={f} value={f}>📁 {f}</option>
              ))}
            </select>

            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="조항명, 오답단어, 노트 검색..."
              className="bg-black/60 border border-white/20 text-xs text-white/90 px-3 py-1.5 rounded-sm outline-none focus:border-teal-400 w-full sm:w-56"
            />
          </div>
        </div>
      </div>

      {/* 카드 그리드 목록 */}
      {filteredCards.length === 0 ? (
        <div className="text-center py-16 bg-[#0a0a0c] border border-white/5 rounded-sm text-white/30 text-sm">
          해당 조건에 맞는 학습 기록이나 암기 노트가 없습니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCards.map((card: any) => {
            const wrongCount = card._stats.wrongIndices.length;
            const noteText = card._stats.text;
            const lastDate = card._stats.history?.[0]?.date || null;

            let titleColor = "text-red-400";
            if (card._rawTitle.includes('[정관]')) titleColor = "text-yellow-500";
            else if (card._rawTitle.includes('[칙]') || card._rawTitle.includes('[규]') || card._rawTitle.includes('[규정]')) titleColor = "text-green-400";
            else if (card._rawTitle.includes('[령]')) titleColor = "text-blue-400";

            return (
              <div
                key={card.id}
                onClick={() => {
                  // 💡 카드를 클릭하면 무조건 'wrong'(오답만 풀기 타겟 모드)으로 진입!
                  setActiveCard(card, 'wrong');
                }}
                className={`group relative bg-[#0a0a0c] border rounded-sm p-4 flex flex-col justify-between cursor-pointer transition-all hover:-translate-y-0.5 shadow-lg ${
                  wrongCount > 0
                    ? 'border-red-500/40 hover:border-red-400 hover:shadow-[0_0_15px_rgba(239,68,68,0.15)]'
                    : 'border-white/10 hover:border-teal-500/50'
                }`}
              >
                <div>
                  {/* 상단 메타 정보 */}
                  <div className="flex justify-between items-center gap-2 mb-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 bg-white/5 border border-white/10 rounded text-white/50 truncate max-w-[140px]">
                      📁 {card.folder_name || '기본 폴더'}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px]">
                      <span className="px-2 py-0.5 bg-amber-950/40 border border-amber-500/30 text-amber-300 rounded">
                        {card._stats.filled}회독
                      </span>
                      {wrongCount > 0 ? (
                        <span className="px-2 py-0.5 bg-red-950/60 border border-red-500/50 text-red-300 font-bold rounded animate-pulse">
                          오답 {wrongCount}개
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-teal-950/40 border border-teal-500/30 text-teal-300 rounded">
                          완벽 암기
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 조항 제목 */}
                  <h3 className={`font-bold text-sm sm:text-[15px] leading-snug mb-3 ${titleColor} group-hover:underline`}>
                    {card._title}
                  </h3>

                  {/* 오답 단어 태그 표시 */}
                  {card._wrongWords.length > 0 && (
                    <div className="mb-3">
                      <div className="text-[10px] text-red-400/80 font-bold mb-1">❌ 틀린 빈칸 키워드:</div>
                      <div className="flex flex-wrap gap-1">
                        {card._wrongWords.map((word: string, wIdx: number) => (
                          <span
                            key={wIdx}
                            className="text-[11px] bg-red-950/40 text-red-300 border border-red-500/30 px-2 py-0.5 rounded-sm font-bold"
                          >
                            {word}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 💡 암기 노트 내용 표시 박스 */}
                  {noteText && (
                    <div className="mt-2 mb-3 p-3 bg-teal-950/20 border border-teal-500/30 rounded-sm text-teal-200 text-xs whitespace-pre-wrap leading-relaxed font-sans shadow-inner max-h-40 overflow-y-auto custom-scrollbar">
                      <div className="text-[10px] text-teal-400 font-bold mb-1 flex items-center justify-between border-b border-teal-500/20 pb-1">
                        <span>📌 나만의 암기 노트</span>
                      </div>
                      {noteText}
                    </div>
                  )}
                </div>

                {/* 하단 액션 바 */}
                <div className="pt-2.5 mt-2 border-t border-white/10 flex justify-between items-center gap-2">
                  <span className="text-[10px] text-white/30 font-mono">
                    {lastDate ? `최근: ${lastDate.substring(5, 16)}` : '기록 있음'}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {wrongCount > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveCard(card, 'all');
                        }}
                        className="px-2 py-1 bg-white/5 hover:bg-white/15 border border-white/10 text-white/60 hover:text-white text-[10px] rounded transition-colors"
                      >
                        전체 풀기
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveCard(card, 'wrong');
                      }}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded transition-all shadow-sm ${
                        wrongCount > 0
                          ? 'bg-red-600/80 hover:bg-red-500 text-white border border-red-400'
                          : 'bg-teal-900/40 hover:bg-teal-900/60 text-teal-300 border border-teal-500/40'
                      }`}
                    >
                      {wrongCount > 0 ? `🎯 오답만 풀기 (${wrongCount})` : '▶ 다시 풀기'}
                    </button>
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
