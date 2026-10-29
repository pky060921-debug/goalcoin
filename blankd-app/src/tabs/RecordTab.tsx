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

// 조항 번호 추출 (예: "제3조의2" -> main: 3, sub: 2)
const extractArticleInfo = (title: string) => {
  const match = title.match(/제\s*(\d+)\s*조(?:\s*의\s*(\d+))?/);
  if (match) {
    return { main: parseInt(match[1], 10), sub: match[2] ? parseInt(match[2], 10) : 0 };
  }
  const byulMatch = title.match(/별표\s*(\d+)(?:\s*의\s*(\d+))?/);
  if (byulMatch) {
    return { main: 10000 + parseInt(byulMatch[1], 10), sub: byulMatch[2] ? parseInt(byulMatch[2], 10) : 0 };
  }
  return { main: 99999, sub: 0 };
};

// 법령 종류 분류 ('law': 법 1열 | 'decree': 영 2열 | 'rule': 칙/규 3열 | 'other': 정관/규정 등)
const getLawColumnType = (rawTitle: string): 'law' | 'decree' | 'rule' | 'other' => {
  if (rawTitle.includes('[령]') || rawTitle.includes('시행령')) return 'decree';
  if (rawTitle.includes('[칙]') || rawTitle.includes('시행규칙')) return 'rule';
  if (rawTitle.includes('[정관]') || rawTitle.includes('[규정]') || rawTitle.includes('[규]')) return 'other';
  if (rawTitle.includes('[법]')) return 'law';
  return 'law';
};

const compareCards = (a: any, b: any) => {
  if (a._artInfo.main !== b._artInfo.main) return a._artInfo.main - b._artInfo.main;
  if (a._artInfo.sub !== b._artInfo.sub) return a._artInfo.sub - b._artInfo.sub;
  return (parseInt(a.id, 10) || 0) - (parseInt(b.id, 10) || 0);
};

export const RecordTab = ({
  savedCards = [],
  setActiveCard
}: any) => {
  const [filterMode, setFilterMode] = useState<'all' | 'wrong_only' | 'note_only'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 💡 1단계: 폴더명을 누르면 조항 목록이 밑으로 펼쳐지도록 관리 (초기값은 첫 번째 폴더 열림)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
  const [hasInitializedFolder, setHasInitializedFolder] = useState(false);

  // 💡 2단계: 조항을 누르면 전체 내용(본문 + 오답 표시)이 밑으로 펼쳐지도록 관리
  const [expandedCardIds, setExpandedCardIds] = useState<Set<number>>(new Set());

  // 💡 3단계: 펼쳐진 조항 내부에서 암기 노트 버튼을 누르면 노트가 밑으로 펼쳐지도록 관리
  const [openNoteIds, setOpenNoteIds] = useState<Set<number>>(new Set());

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

      const cleanTitle = getStrictTitleOnly(titleLine) || titleLine.replace(/\[.*?\]/g, '').trim() || "제목 없음";
      const artInfo = extractArticleInfo(cleanTitle);
      const colType = getLawColumnType(titleLine);

      return {
        ...card,
        _stats: stats,
        _title: cleanTitle,
        _rawTitle: titleLine,
        _artInfo: artInfo,
        _colType: colType,
        _parts: parts,
        _wrongSet: wrongSet,
        _wrongWords: wrongWords,
        _totalBlanks: foundBlanks.length,
        _plainBody: bodyWithoutPageBreaks.replace(/\[|\]/g, '')
      };
    });
  }, [savedCards]);

  // 폴더 목록 추출 (제1장, 제2장 등 자연스러운 순서 정렬)
  const folders = useMemo(() => {
    const set = new Set<string>();
    enrichedCards.forEach((c: any) => {
      set.add(c.folder_name || '기본 폴더');
    });
    return Array.from(set).sort((a, b) => {
      const chapA = a.match(/제\s*(\d+)\s*장/);
      const chapB = b.match(/제\s*(\d+)\s*장/);
      if (chapA && chapB) return parseInt(chapA[1], 10) - parseInt(chapB[1], 10);
      if ( !chapA && chapB ) return -1;
      if ( chapA && !chapB ) return 1;
      return a.localeCompare(b, 'ko', { numeric: true });
    });
  }, [enrichedCards]);

  // 최초 로드 시 첫 번째 폴더 자동 펼침
  React.useEffect(() => {
    if (!hasInitializedFolder && folders.length > 0) {
      setExpandedFolders(new Set([folders[0]]));
      setHasInitializedFolder(true);
    }
  }, [folders, hasInitializedFolder]);

  const toggleFolder = (folderName: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderName)) next.delete(folderName);
      else next.add(folderName);
      return next;
    });
  };

  const toggleCardExpand = (cardId: number) => {
    setExpandedCardIds(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const toggleNoteOpen = (cardId: number) => {
    setOpenNoteIds(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const filteredCards = useMemo(() => {
    return enrichedCards.filter((c: any) => {
      const hasWrong = c._stats.wrongIndices.length > 0;
      const hasNote = c._stats.text.length > 0;

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
  }, [enrichedCards, filterMode, searchQuery]);

  const totalWrongCardsCount = useMemo(() => enrichedCards.filter((c: any) => c._stats.wrongIndices.length > 0).length, [enrichedCards]);
  const totalNoteCardsCount = useMemo(() => enrichedCards.filter((c: any) => c._stats.text.length > 0).length, [enrichedCards]);

  // 💡 개별 조항 바(Bar) + 클릭 시 밑으로 펼쳐지는 전체 본문 렌더링 컴포넌트
  const renderArticleItem = (card: any) => {
    const isExpanded = expandedCardIds.has(card.id);
    const isNoteOpen = openNoteIds.has(card.id);
    const wrongCount = card._stats.wrongIndices.length;
    const noteText = card._stats.text;

    let titleColor = "text-red-500";
    if (card._rawTitle.includes('[정관]')) titleColor = "text-amber-500";
    else if (card._rawTitle.includes('[칙]') || card._rawTitle.includes('[규]') || card._rawTitle.includes('[규정]')) titleColor = "text-emerald-500";
    else if (card._rawTitle.includes('[령]') || card._rawTitle.includes('시행령')) titleColor = "text-blue-400";

    // 빈칸이 모두 채워진 전체 조항 본문 (틀린 오답만 빨간색으로 강조 표시)
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
            >
              ❌ {cleanWord}
            </span>
          );
        } else {
          return (
            <span key={pIdx} className="font-bold underline decoration-white/20 underline-offset-4">
              {cleanWord}
            </span>
          );
        }
      }
      return <span key={pIdx}>{part}</span>;
    });

    return (
      <div key={card.id} className="w-full transition-all">
        {/* 1. 채우기 탭과 동일한 슬림 조항 바 (클릭 시 밑으로 전체 내용 펼침) */}
        <div
          onClick={() => toggleCardExpand(card.id)}
          className={`w-full px-3 py-2.5 bg-[#0a0a0c] border rounded-sm flex items-center justify-between gap-2 cursor-pointer select-none transition-all shadow-sm ${
            isExpanded
              ? 'border-teal-500 ring-1 ring-teal-500/40'
              : wrongCount > 0
                ? 'border-red-500/50 hover:border-red-400'
                : 'border-white/15 hover:border-white/40'
          }`}
        >
          {/* 좌측: 조항 제목 */}
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="text-[10px] text-white/40 shrink-0">{isExpanded ? '▼' : '▶'}</span>
            <span className={`font-bold text-xs sm:text-[13px] truncate ${titleColor}`}>
              {card._title}
            </span>
            {noteText && (
              <span className="text-[10px] px-1 py-0.2 bg-teal-950/60 border border-teal-500/40 text-teal-300 rounded shrink-0" title="암기 노트 있음">
                📌
              </span>
            )}
          </div>

          {/* 우측: 채우기 탭 스타일 통계 (빈칸 / 반복 / 틀림) + 빠른 풀기 버튼 */}
          <div className="flex items-center gap-2 shrink-0 font-mono text-[10px] sm:text-[11px]">
            <span className="text-blue-400 font-bold">빈칸:{card._totalBlanks}</span>
            <span className="text-teal-400 font-bold">반복:{card._stats.filled}</span>
            <span className={`font-bold ${wrongCount > 0 ? 'text-red-400 animate-pulse' : 'text-white/40'}`}>
              틀림:{wrongCount}
            </span>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveCard(card, 'wrong');
              }}
              title={wrongCount > 0 ? "오답 빈칸만 다시 풀기" : "다시 풀기"}
              className={`ml-1 px-2 py-0.5 rounded text-[10px] font-bold border transition-all ${
                wrongCount > 0
                  ? 'bg-red-600/80 hover:bg-red-500 text-white border-red-400'
                  : 'bg-white/5 hover:bg-white/15 text-white/70 border-white/15'
              }`}
            >
              {wrongCount > 0 ? '오답풀기' : '풀기'}
            </button>
          </div>
        </div>

        {/* 2. 조항 클릭 시 바로 밑으로 펼쳐지는 전체 조문 내용 & 암기 노트 버튼 */}
        {isExpanded && (
          <div className="mt-1 mb-2 p-3.5 sm:p-4 bg-[#08080a] border border-teal-500/40 rounded-sm shadow-xl space-y-3 animate-in slide-in-from-top-1 duration-150">
            {/* 전체 조항 본문 (빈칸 채워짐 + 오답만 빨간색 표시) */}
            <div className="text-xs sm:text-[13.5px] leading-relaxed whitespace-pre-wrap font-serif text-white/90 bg-black/30 p-3 rounded border border-white/5 max-h-80 overflow-y-auto custom-scrollbar">
              {fullBodyRendered}
            </div>

            {/* 하단 컨트롤 바: 암기 노트 펼치기 버튼 & 오답/전체 풀기 버튼 */}
            <div className="flex flex-wrap justify-between items-center gap-2 pt-2 border-t border-white/10">
              <div>
                {noteText ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleNoteOpen(card.id);
                    }}
                    className={`px-3 py-1 text-[11px] font-bold rounded-sm border transition-all flex items-center gap-1 ${
                      isNoteOpen
                        ? 'bg-teal-600 text-white border-teal-400'
                        : 'bg-teal-950/50 hover:bg-teal-900/70 text-teal-300 border-teal-500/40'
                    }`}
                  >
                    <span>📌 암기 노트 {isNoteOpen ? '접기 ▲' : '보기 ▼'}</span>
                  </button>
                ) : (
                  <span className="text-[10px] text-white/30 font-mono">작성된 암기 노트가 없습니다.</span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {wrongCount > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveCard(card, 'all');
                    }}
                    className="px-2.5 py-1 bg-white/5 hover:bg-white/15 border border-white/10 text-white/70 text-[11px] font-bold rounded-sm transition-colors"
                  >
                    전체 빈칸 풀기
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveCard(card, 'wrong');
                  }}
                  className={`px-3 py-1 text-[11px] font-bold rounded-sm transition-all shadow-sm ${
                    wrongCount > 0
                      ? 'bg-red-600 hover:bg-red-500 text-white border border-red-400'
                      : 'bg-teal-900/40 hover:bg-teal-900/60 text-teal-300 border border-teal-500/40'
                  }`}
                >
                  {wrongCount > 0 ? `🎯 오답만 풀기 (${wrongCount}개)` : '▶ 전체 다시 풀기'}
                </button>
              </div>
            </div>

            {/* 3. 암기 노트 보기 버튼을 누르면 밑으로 나오는 노트 영역 */}
            {noteText && isNoteOpen && (
              <div className="p-3 bg-teal-950/30 border border-teal-500/40 rounded-sm text-teal-200 text-xs sm:text-[13px] whitespace-pre-wrap leading-relaxed font-sans shadow-inner animate-in slide-in-from-top-1">
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
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5 pb-20">
      {/* 1. 채우기 탭과 동일한 상단 폴더 버튼 바 + 필터/검색 */}
      <div className="space-y-3">
        {/* 폴더 버튼 리스트 (클릭 시 해당 폴더가 밑으로 펼쳐짐/접힘) */}
        <div className="flex flex-wrap items-center gap-2 pb-2">
          {folders.map(folderName => {
            const isFolderOpen = expandedFolders.has(folderName);
            const folderCards = filteredCards.filter(c => (c.folder_name || '기본 폴더') === folderName);
            const folderWrongCnt = folderCards.filter(c => c._stats.wrongIndices.length > 0).length;

            return (
              <button
                key={folderName}
                onClick={() => toggleFolder(folderName)}
                className={`px-3.5 py-2 rounded-sm text-xs font-bold transition-all flex items-center gap-1.5 border shadow-sm ${
                  isFolderOpen
                    ? 'bg-[#0d9488] text-white border-teal-400 shadow-[0_2px_10px_rgba(13,148,136,0.3)]'
                    : 'bg-teal-950/30 text-teal-400/70 border-teal-500/30 hover:bg-teal-900/40 hover:text-teal-200'
                }`}
              >
                <span>📁 {folderName}</span>
                {folderWrongCnt > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.2 bg-red-600 text-white text-[9px] rounded-full font-mono">
                    {folderWrongCnt}
                  </span>
                )}
              </button>
            );
          })}

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => setExpandedFolders(new Set(folders))}
              className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-bold text-white/60 rounded-sm"
            >
              폴더 모두 펼치기
            </button>
            <button
              onClick={() => {
                setExpandedFolders(new Set());
                setExpandedCardIds(new Set());
              }}
              className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-bold text-white/60 rounded-sm"
            >
              모두 접기
            </button>
          </div>
        </div>

        {/* 보조 필터(오답만/노트만) 및 검색바 */}
        <div className="flex flex-wrap justify-between items-center gap-2 bg-[#0a0a0c] border border-white/10 px-3 py-2 rounded-sm">
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { id: 'all', label: `전체 조항 (${enrichedCards.length})` },
              { id: 'wrong_only', label: `❌ 오답 있는 조항만 (${totalWrongCardsCount})` },
              { id: 'note_only', label: `📌 암기 노트 있는 조항만 (${totalNoteCardsCount})` }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilterMode(tab.id as any)}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-sm border transition-all ${
                  filterMode === tab.id
                    ? 'bg-indigo-900/50 text-indigo-300 border-indigo-500/50'
                    : 'bg-white/5 text-white/40 border-white/10 hover:text-white/70'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="조항명, 본문, 오답 검색..."
              className="bg-black/60 border border-white/20 text-xs text-white/90 px-3 py-1 rounded-sm outline-none focus:border-teal-400 w-full sm:w-52"
            />
          </div>
        </div>
      </div>

      {/* 2. 펼쳐진 폴더별 조항 리스트 (채우기 탭과 동일한 법/령/칙 3단 정렬) */}
      {expandedFolders.size === 0 ? (
        <div className="text-center py-16 bg-[#0a0a0c] border border-white/5 rounded-sm text-white/40 text-sm">
          상단의 <span className="text-teal-400 font-bold">📁 폴더 버튼</span>을 누르면 해당 장의 조항 목록이 아래로 펼쳐집니다.
        </div>
      ) : (
        <div className="space-y-10">
          {folders
            .filter(folderName => expandedFolders.has(folderName))
            .map(folderName => {
              const folderCards = filteredCards
                .filter(c => (c.folder_name || '기본 폴더') === folderName)
                .sort(compareCards);

              // 법/령/칙 3단 매칭 가능 여부 확인 (시행령이나 시행규칙이 포함된 폴더는 채우기 탭처럼 3단 행 정렬)
              const hasDecreeOrRule = folderCards.some(c => c._colType === 'decree' || c._colType === 'rule');

              // 조항 주번호(제1조, 제2조...) 단위로 가로 행(Row) 묶기
              const articleGroupsMap = new Map<number, { law: any[], decree: any[], rule: any[] }>();
              if (hasDecreeOrRule) {
                folderCards.forEach(card => {
                  const mainNum = card._artInfo.main;
                  if (!articleGroupsMap.has(mainNum)) {
                    articleGroupsMap.set(mainNum, { law: [], decree: [], rule: [] });
                  }
                  const grp = articleGroupsMap.get(mainNum)!;
                  if (card._colType === 'decree') grp.decree.push(card);
                  else if (card._colType === 'rule') grp.rule.push(card);
                  else grp.law.push(card);
                });
              }

              const sortedMainNums = Array.from(articleGroupsMap.keys()).sort((a, b) => a - b);

              return (
                <div key={folderName} className="space-y-3 animate-in fade-in duration-150">
                  {/* 채우기 탭과 동일한 파란색 폴더 타이틀 헤더 */}
                  <div
                    onClick={() => toggleFolder(folderName)}
                    className="flex justify-between items-center border-b-2 border-blue-500/30 pb-2 px-1 cursor-pointer select-none group"
                  >
                    <h3 className="font-bold text-blue-400 text-sm sm:text-base flex items-center gap-2 group-hover:text-blue-300">
                      <span>{folderName}</span>
                      <span className="text-xs font-mono text-white/40">({folderCards.length}개 조항)</span>
                    </h3>
                    <span className="text-xs text-white/40 group-hover:text-white">접기 ▲</span>
                  </div>

                  {folderCards.length === 0 ? (
                    <div className="py-6 text-center text-white/30 text-xs">
                      조건에 해당하는 조항이 없습니다.
                    </div>
                  ) : hasDecreeOrRule ? (
                    /* 💡 채우기 탭과 동일한 3단(법 / 령 / 칙) 가로 행 정렬 레이아웃 */
                    <div className="space-y-4">
                      {sortedMainNums.map(mainNum => {
                        const grp = articleGroupsMap.get(mainNum)!;
                        return (
                          <div
                            key={mainNum}
                            className="grid grid-cols-1 lg:grid-cols-3 gap-2.5 items-start border-b border-white/5 pb-3 last:border-b-0"
                          >
                            {/* 1열: 법률 [법] */}
                            <div className="space-y-2 min-w-0">
                              {grp.law.map(card => renderArticleItem(card))}
                            </div>
                            {/* 2열: 시행령 [령] */}
                            <div className="space-y-2 min-w-0">
                              {grp.decree.map(card => renderArticleItem(card))}
                            </div>
                            {/* 3열: 시행규칙 [칙] */}
                            <div className="space-y-2 min-w-0">
                              {grp.rule.map(card => renderArticleItem(card))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* 단일 종류(정관/규정 등) 폴더일 때는 3열 순차 그리드 배치 */
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 items-start">
                      {folderCards.map(card => renderArticleItem(card))}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
};
