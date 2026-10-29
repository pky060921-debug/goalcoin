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
        history: Array.isArray(p.history) ? p.history : [],
        highlights: p.highlights || {}
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
      history: [],
      highlights: {}
    };
  } catch (e) {
    return { text: "", filled: 0, wrongIndices: [], totalCorrect: 0, totalWrong: 0, history: [], highlights: {} };
  }
};

// 💡 조항 번호(예: 제41조의2, 별표 1 등) 및 법령 위계([법]->[령]->[칙]->[정관]->[규정]) 기준 정렬 헬퍼
const compareCardsByArticle = (a: any, b: any) => {
  const getLawOrder = (raw: string) => {
    if (raw.includes('[법]')) return 1;
    if (raw.includes('[령]')) return 2;
    if (raw.includes('[칙]') || raw.includes('[규]')) return 3;
    if (raw.includes('[정관]')) return 4;
    if (raw.includes('[규정]')) return 5;
    return 6;
  };

  const extractArticleNum = (title: string) => {
    const match = title.match(/제\s*(\d+)\s*조(?:\s*의\s*(\d+))?/);
    if (match) {
      return [parseInt(match[1], 10), match[2] ? parseInt(match[2], 10) : 0];
    }
    const byulMatch = title.match(/별표\s*(\d+)(?:\s*의\s*(\d+))?/);
    if (byulMatch) {
      return [10000 + parseInt(byulMatch[1], 10), byulMatch[2] ? parseInt(byulMatch[2], 10) : 0];
    }
    return null;
  };

  const orderA = getLawOrder(a._rawTitle || "");
  const orderB = getLawOrder(b._rawTitle || "");
  if (orderA !== orderB) return orderA - orderB;

  const numA = extractArticleNum(a._title || "");
  const numB = extractArticleNum(b._title || "");

  if (numA && numB) {
    if (numA[0] !== numB[0]) return numA[0] - numB[0];
    if (numA[1] !== numB[1]) return numA[1] - numB[1];
  } else if (numA && !numB) {
    return -1;
  } else if (!numA && numB) {
    return 1;
  }

  // 조항 번호가 같거나 없는 경우 원본 생성 ID(채우기 탭 기본 순서) 순으로 정렬
  const idA = parseInt(a.id, 10);
  const idB = parseInt(b.id, 10);
  if (!isNaN(idA) && !isNaN(idB) && idA !== idB) return idA - idB;

  return (a._title || "").localeCompare(b._title || "", 'ko', { numeric: true });
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
  const [filterMode, setFilterMode] = useState<'wrong_or_note' | 'wrong_only' | 'note_only' | 'all'>('all');
  const [selectedFolder, setSelectedFolder] = useState<string>('전체');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'article' | 'id' | 'wrong_desc'>('article');

  // 💡 개별 카드의 암기 노트 펼침 상태 관리
  const [openNoteIds, setOpenNoteIds] = useState<Set<number>>(new Set());

  const toggleNoteOpen = (id: number) => {
    setOpenNoteIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

      const bodyWithoutPageBreaks = restContent.replace(/##PAGE_BREAK##/g, '');
      const parts = bodyWithoutPageBreaks.split(/(\[.*?\])/g).filter(p => p !== '');
      
      const foundBlanks: string[] = [];
      parts.forEach((part: string) => {
        if (part.startsWith('[') && part.endsWith(']')) {
          foundBlanks.push(part.replace(/\[|\]/g, '').trim());
        }
      });

      const wrongSet = new Set<number>(stats.wrongIndices);
      const wrongWords = stats.wrongIndices
        .map((idx: number) => foundBlanks[idx])
        .filter(Boolean);

      return {
        ...card,
        _stats: stats,
        _title: getStrictTitleOnly(titleLine) || titleLine.replace(/\[.*?\]/g, '').trim() || "제목 없음",
        _rawTitle: titleLine,
        _parts: parts,
        _wrongSet: wrongSet,
        _wrongWords: wrongWords,
        _totalBlanks: foundBlanks.length,
        _plainBody: bodyWithoutPageBreaks.replace(/\[|\]/g, '')
      };
    });
  }, [savedCards]);

  const filteredAndSortedCards = useMemo(() => {
    const filtered = enrichedCards.filter((c: any) => {
      if (selectedFolder !== '전체' && c.folder_name !== selectedFolder) return false;

      const hasWrong = c._stats.wrongIndices.length > 0;
      const hasNote = c._stats.text.length > 0;

      if (filterMode === 'wrong_or_note' && !hasWrong && !hasNote) return false;
      if (filterMode === 'wrong_only' && !hasWrong) return false;
      if (filterMode === 'note_only' && !hasNote) return false;

      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchTitle = c._title.toLowerCase().includes(q);
        const matchBody = c._plainBody.toLowerCase().includes(q);
        const matchNote = c._stats.text.toLowerCase().includes(q);
        const matchWrong = c._wrongWords.some((w: string) => w.toLowerCase().includes(q));
        if (!matchTitle && !matchBody && !matchNote && !matchWrong) return false;
      }

      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === 'article') {
        return compareCardsByArticle(a, b);
      } else if (sortBy === 'wrong_desc') {
        const diff = b._stats.wrongIndices.length - a._stats.wrongIndices.length;
        if (diff !== 0) return diff;
        return compareCardsByArticle(a, b);
      } else {
        return (parseInt(a.id, 10) || 0) - (parseInt(b.id, 10) || 0);
      }
    });
  }, [enrichedCards, selectedFolder, filterMode, searchQuery, sortBy]);

  // 💡 채우기 탭과 동일하게 폴더별로 그룹화하여 조항 순으로 표시
  const groupedByFolder = useMemo(() => {
    const groups: Record<string, any[]> = {};
    filteredAndSortedCards.forEach((c: any) => {
      const folder = c.folder_name || '기본 폴더';
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(c);
    });
    return groups;
  }, [filteredAndSortedCards]);

  const totalWrongCardsCount = useMemo(() => enrichedCards.filter((c: any) => c._stats.wrongIndices.length > 0).length, [enrichedCards]);
  const totalNoteCardsCount = useMemo(() => enrichedCards.filter((c: any) => c._stats.text.length > 0).length, [enrichedCards]);

  const handleToggleAllNotes = () => {
    const cardsWithNotes = filteredAndSortedCards.filter(c => c._stats.text.length > 0).map(c => c.id);
    const allOpened = cardsWithNotes.length > 0 && cardsWithNotes.every(id => openNoteIds.has(id));
    if (allOpened) {
      setOpenNoteIds(new Set());
    } else {
      setOpenNoteIds(new Set(cardsWithNotes));
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* 상단 요약 및 필터 컨트롤러 */}
      <div className="bg-[#0a0a0c] border border-white/10 p-4 sm:p-5 rounded-sm shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-teal-400 flex items-center gap-2">
              <span>📊 조항별 오답 및 암기 노트 기록실</span>
            </h2>
            <p className="text-xs text-white/50 mt-1">
              채우기 탭과 동일하게 <span className="text-teal-300 font-bold">폴더 및 조항 순서대로 정렬</span>됩니다. 카드를 누르면 <span className="text-red-400 font-bold">오답만 다시 풀기</span>가 실행됩니다.
            </p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0 font-mono text-xs flex-wrap">
            <div className="bg-red-950/40 border border-red-500/30 px-3 py-1.5 rounded-sm text-red-300">
              오답 보유: <span className="font-bold text-red-400">{totalWrongCardsCount}</span>개
            </div>
            <div className="bg-teal-950/40 border border-teal-500/30 px-3 py-1.5 rounded-sm text-teal-300">
              암기 노트: <span className="font-bold text-teal-400">{totalNoteCardsCount}</span>개
            </div>
            {totalNoteCardsCount > 0 && (
              <button
                onClick={handleToggleAllNotes}
                className="px-3 py-1.5 bg-teal-900/40 hover:bg-teal-800/60 border border-teal-500/50 text-teal-200 font-bold rounded-sm transition-all shadow-sm"
              >
                📌 모든 노트 펼치기/접기
              </button>
            )}
          </div>
        </div>

        {/* 필터 버튼 및 정렬·검색창 */}
        <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'all', label: `📚 전체 조항 보기 (${enrichedCards.length})` },
              { id: 'wrong_or_note', label: '🔥 오답 또는 노트 있음' },
              { id: 'wrong_only', label: `❌ 오답 조항만 (${totalWrongCardsCount})` },
              { id: 'note_only', label: `📌 암기 노트만 (${totalNoteCardsCount})` }
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

          <div className="flex flex-wrap items-center gap-2">
            {/* 정렬 기준 선택 */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-black/60 border border-white/20 text-xs text-teal-300 font-bold px-2.5 py-1.5 rounded-sm outline-none focus:border-teal-400"
            >
              <option value="article">🔢 조항 번호순 (제1조~)</option>
              <option value="id">🗂️ 채우기 등록순</option>
              <option value="wrong_desc">🚨 오답 많은 순</option>
            </select>

            {/* 폴더 선택 */}
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
              placeholder="조항명, 본문, 오답단어, 노트 검색..."
              className="bg-black/60 border border-white/20 text-xs text-white/90 px-3 py-1.5 rounded-sm outline-none focus:border-teal-400 flex-1 sm:w-56"
            />
          </div>
        </div>
      </div>

      {/* 폴더별 그룹 + 조항별 카드 목록 */}
      {Object.keys(groupedByFolder).length === 0 ? (
        <div className="text-center py-16 bg-[#0a0a0c] border border-white/5 rounded-sm text-white/30 text-sm">
          해당 조건에 맞는 조항이나 학습 기록이 없습니다.
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedByFolder).map(([folderName, folderCards]) => (
            <div key={folderName} className="space-y-3">
              {/* 폴더 헤더 */}
              <div className="flex items-center justify-between border-b border-white/10 pb-2 px-1">
                <h3 className="font-bold text-amber-400 text-sm sm:text-base flex items-center gap-2">
                  <span>📁 {folderName}</span>
                  <span className="text-xs font-mono text-white/40">({folderCards.length}개 조항)</span>
                </h3>
              </div>

              {/* 해당 폴더 내 조항 카드 그리드 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {folderCards.map((card: any) => {
                  const wrongCount = card._stats.wrongIndices.length;
                  const noteText = card._stats.text;
                  const isNoteOpen = openNoteIds.has(card.id);
                  const lastDate = card._stats.history?.[0]?.date || null;

                  let titleColor = "text-red-400";
                  let badgeLabel = "법";
                  if (card._rawTitle.includes('[정관]')) { titleColor = "text-yellow-500"; badgeLabel = "정관"; }
                  else if (card._rawTitle.includes('[칙]') || card._rawTitle.includes('[규]')) { titleColor = "text-green-400"; badgeLabel = "규칙"; }
                  else if (card._rawTitle.includes('[규정]')) { titleColor = "text-green-400"; badgeLabel = "규정"; }
                  else if (card._rawTitle.includes('[령]')) { titleColor = "text-blue-400"; badgeLabel = "시행령"; }

                  // 빈칸이 모두 채워진 전체 조항 렌더링 (오답인 빈칸만 빨간색으로 강조)
                  let bIdx = 0;
                  const fullBodyRendered = card._parts.map((part: string, pIdx: number) => {
                    if (part.startsWith('[') && part.endsWith(']')) {
                      const currentBlankIdx = bIdx++;
                      const cleanWord = part.replace(/\[|\]/g, '').trim();
                      const isWrong = card._wrongSet.has(currentBlankIdx);

                      if (isWrong) {
                        return (
                          <span
                            key={pIdx}
                            className="inline-block mx-0.5 px-1.5 py-0.5 bg-red-950/80 text-red-300 border border-red-500 rounded-sm font-bold shadow-[0_0_8px_rgba(239,68,68,0.35)]"
                            title="틀린 빈칸 (클릭 시 오답만 다시 풀기)"
                          >
                            ❌ {cleanWord}
                          </span>
                        );
                      } else {
                        return (
                          <span key={pIdx} className="text-white/95 font-semibold">
                            {cleanWord}
                          </span>
                        );
                      }
                    }
                    return <span key={pIdx}>{part}</span>;
                  });

                  return (
                    <div
                      key={card.id}
                      onClick={() => {
                        // 💡 카드를 클릭하면 무조건 'wrong'(오답만 풀기 타겟 모드)으로 진입!
                        setActiveCard(card, 'wrong');
                      }}
                      className={`group relative bg-[#0a0a0c] border rounded-sm p-4 sm:p-5 flex flex-col justify-between cursor-pointer transition-all hover:-translate-y-0.5 shadow-lg ${
                        wrongCount > 0
                          ? 'border-red-500/40 hover:border-red-400 hover:shadow-[0_0_15px_rgba(239,68,68,0.15)]'
                          : 'border-white/10 hover:border-teal-500/50'
                      }`}
                    >
                      <div>
                        {/* 상단 조항 제목 및 회독/오답 배지 */}
                        <div className="flex justify-between items-start gap-2 mb-3 pb-2 border-b border-white/10">
                          <h4 className={`font-bold text-sm sm:text-base leading-snug ${titleColor} group-hover:underline flex items-center gap-1.5`}>
                            <span className="text-[10px] px-1.5 py-0.5 bg-white/5 border border-white/10 rounded font-mono text-white/70 shrink-0">
                              {badgeLabel}
                            </span>
                            <span>{card._title}</span>
                          </h4>

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
                                완벽
                              </span>
                            )}
                          </div>
                        </div>

                        {/* 빈칸이 모두 채워진 전체 조항 본문 (오답만 붉은색 표시) */}
                        <div className="mb-3 p-3.5 bg-black/40 border border-white/5 rounded-sm text-xs sm:text-[13.5px] leading-relaxed whitespace-pre-wrap font-serif text-white/85 max-h-60 overflow-y-auto custom-scrollbar">
                          {fullBodyRendered}
                        </div>
                      </div>

                      {/* 하단 액션 바 (암기노트 토글 버튼 + 풀기 버튼) */}
                      <div className="pt-2.5 mt-1 border-t border-white/10 flex flex-wrap justify-between items-center gap-2">
                        <div className="flex items-center gap-2">
                          {noteText ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation(); // 💡 카드가 열리는 것을 막고 아래로 노트만 펼침
                                toggleNoteOpen(card.id);
                              }}
                              className={`px-2.5 py-1 text-[11px] font-bold rounded-sm border transition-all flex items-center gap-1 shadow-sm ${
                                isNoteOpen
                                  ? 'bg-teal-600 text-white border-teal-400'
                                  : 'bg-teal-950/50 hover:bg-teal-900/70 text-teal-300 border-teal-500/40'
                              }`}
                            >
                              <span>📌 암기 노트 {isNoteOpen ? '접기 ▲' : '보기 ▼'}</span>
                            </button>
                          ) : (
                            <span className="text-[10px] text-white/25 font-mono">
                              {lastDate ? `최근: ${lastDate.substring(5, 16)}` : '작성된 노트 없음'}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {wrongCount > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveCard(card, 'all');
                              }}
                              className="px-2.5 py-1 bg-white/5 hover:bg-white/15 border border-white/10 text-white/60 hover:text-white text-[10px] rounded transition-colors"
                            >
                              전체 빈칸 풀기
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveCard(card, 'wrong');
                            }}
                            className={`px-3 py-1 text-[11px] font-bold rounded transition-all shadow-sm ${
                              wrongCount > 0
                                ? 'bg-red-600/80 hover:bg-red-500 text-white border border-red-400'
                                : 'bg-teal-900/40 hover:bg-teal-900/60 text-teal-300 border border-teal-500/40'
                            }`}
                          >
                            {wrongCount > 0 ? `🎯 오답만 풀기 (${wrongCount})` : '▶ 전체 다시 풀기'}
                          </button>
                        </div>
                      </div>

                      {/* 💡 버튼 클릭 시 아래로 펼쳐지는 암기 노트 아코디언 영역 */}
                      {noteText && isNoteOpen && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="mt-3 p-3.5 bg-teal-950/30 border border-teal-500/40 rounded-sm text-teal-200 text-xs sm:text-[13px] whitespace-pre-wrap leading-relaxed font-sans shadow-inner animate-in slide-in-from-top-2 duration-200 cursor-auto"
                        >
                          <div className="text-[10px] text-teal-400 font-bold mb-1.5 flex items-center justify-between border-b border-teal-500/20 pb-1">
                            <span>📌 나만의 암기 노트</span>
                            <button
                              onClick={() => toggleNoteOpen(card.id)}
                              className="text-teal-400/70 hover:text-teal-200 text-[10px]"
                            >
                              닫기 ✕
                            </button>
                          </div>
                          {noteText}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
