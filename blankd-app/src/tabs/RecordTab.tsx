import React, { useState, useEffect } from "react";
import { parseCardStats } from "../utils/constants";

// EnhanceTab과 동일한 그리드 컬럼 클래스 생성 함수
const getGridClass = (cols: number) => {
  if (cols === 1) return "md:grid-cols-1";
  if (cols === 2) return "md:grid-cols-2";
  if (cols === 3) return "md:grid-cols-3";
  if (cols === 4) return "md:grid-cols-4";
  if (cols === 5) return "md:grid-cols-5";
  return "md:grid-cols-3";
};

// 안전한 JSON 메모 파서 (암기노트 text, 회독수 filled, 오답 wrongIndices 추출)
const safeParseStats = (memoStr: string) => {
  try {
    if (memoStr && memoStr.trim().startsWith('{')) {
      const p = JSON.parse(memoStr);
      return {
        text: (p.text || "").replace(/\(\s*\)\s*=>\s*x\(\s*null\s*\)/g, "").trim(),
        filled: p.filled || 0,
        wrongIndices: Array.isArray(p.wrongIndices) ? p.wrongIndices : []
      };
    }
  } catch (e) {}
  try {
    const old = parseCardStats(memoStr);
    return {
      text: (old.text || "").replace(/\(\s*\)\s*=>\s*x\(\s*null\s*\)/g, "").trim(),
      filled: old.filled || 0,
      wrongIndices: Array.isArray(old.wrongIndices) ? old.wrongIndices : []
    };
  } catch (e) {
    return { text: "", filled: 0, wrongIndices: [] };
  }
};

export const RecordTab = ({
  savedCards = [],
  colCount = 3,
  safeAddress,
  setActiveCard
}: any) => {
  const [localCards, setLocalCards] = useState<any[]>([]);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  
  // 조항 클릭 시 전체 내용이 밑으로 펼쳐지는 상태
  const [expandedCardIds, setExpandedCardIds] = useState<Set<number | string>>(new Set());
  
  // 암기 노트 버튼 클릭 시 노트가 밑으로 펼쳐지는 상태
  const [openNoteIds, setOpenNoteIds] = useState<Set<number | string>>(new Set());

  // 보조 필터 (전체 / 오답만 / 암기노트만)
  const [filterMode, setFilterMode] = useState<'all' | 'wrong_only' | 'note_only'>('all');

  useEffect(() => {
    setLocalCards(Array.isArray(savedCards) ? savedCards : []);
  }, [savedCards]);

  // 💡 EnhanceTab과 100% 동일한 폴더 목록 추출 및 정렬 방식
  const recordFolders = Array.from(new Set(localCards.map((c: any) => c.folder_name)))
    .filter(f => f && f !== '기본 폴더')
    .sort() as string[];

  useEffect(() => {
    if (!safeAddress) return;
    try {
      const saved = localStorage.getItem(`blankd_record_folders_${safeAddress}`);
      if (saved) setOpenFolders(JSON.parse(saved));
    } catch (e) {}
  }, [safeAddress]);

  useEffect(() => {
    if (!safeAddress) return;
    setOpenFolders(prev => {
      const next = { ...prev };
      let changed = false;
      recordFolders.forEach(f => {
        if (next[f] === undefined) {
          next[f] = true;
          changed = true;
        }
      });
      if (changed) localStorage.setItem(`blankd_record_folders_${safeAddress}`, JSON.stringify(next));
      return next;
    });
  }, [localCards, recordFolders, safeAddress]);

  // 폴더명을 누르면 해당 폴더의 조항 목록이 밑으로 펼쳐지거나 접힘
  const handleToggleFolder = (f: string) => {
    setOpenFolders(prev => {
      const next = { ...prev, [f]: !prev[f] };
      if (safeAddress) {
        localStorage.setItem(`blankd_record_folders_${safeAddress}`, JSON.stringify(next));
      }
      return next;
    });
  };

  // 조항을 누르면 전체 내용이 밑으로 펼쳐지거나 접힘
  const toggleCardExpand = (id: number | string) => {
    setExpandedCardIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 암기 노트 버튼을 누르면 노트가 밑으로 펼쳐지거나 접힘
  const toggleNoteOpen = (id: number | string) => {
    setOpenNoteIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in w-full">
      {/* 1. 상단 폴더 버튼 바 + 필터 컨트롤 */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* EnhanceTab과 동일한 폴더 토글 버튼 */}
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {recordFolders.map((f: string) => (
              <button
                key={f}
                onClick={() => handleToggleFolder(f)}
                className={`px-3 py-1.5 sm:py-2 text-[10px] sm:text-[12px] font-bold border rounded-sm transition-all ${
                  openFolders[f]
                    ? 'bg-teal-600 border-teal-500 text-white shadow-sm'
                    : 'bg-teal-900/40 text-teal-300 border-teal-500/30'
                }`}
              >
                📁 {f}
              </button>
            ))}
          </div>

          {/* 우측 보조 필터 (전체 / 오답 조항만 / 노트 있는 조항만) */}
          <div className="flex items-center gap-1.5 shrink-0">
            {[
              { id: 'all', label: '전체 표시' },
              { id: 'wrong_only', label: '❌ 오답 조항만' },
              { id: 'note_only', label: '📌 노트 조항만' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilterMode(tab.id as any)}
                className={`px-2.5 py-1 text-[10px] sm:text-[11px] font-bold rounded-sm border transition-all ${
                  filterMode === tab.id
                    ? 'bg-indigo-900/60 text-indigo-200 border-indigo-400'
                    : 'bg-white/5 text-white/40 border-white/10 hover:text-white/70'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. 폴더별 조항 그리드 (EnhanceTab.tsx와 100% 동일한 법·령·칙 정렬 구조) */}
      <div className="overflow-y-auto max-h-[65vh] custom-scrollbar pr-2 pb-10">
        {recordFolders.map((folder: string) => {
          const isChapterFolder = /^제\s*\d+\s*장/.test(folder);
          const folderCards = localCards.filter((c: any) => {
            if (!c || !c.content || c.folder_name !== folder) return false;
            if (filterMode !== 'all') {
              const st = safeParseStats(c.memo);
              if (filterMode === 'wrong_only' && st.wrongIndices.length === 0) return false;
              if (filterMode === 'note_only' && !st.text) return false;
            }
            return true;
          });

          return openFolders[folder] && (
            <div
              key={folder}
              className={`mb-6 sm:mb-8 border-l rounded-l-sm pl-3 sm:pl-4 transition-all ${
                isChapterFolder ? 'border-blue-500/50' : 'border-white/5'
              }`}
            >
              {/* 폴더 제목 헤더 (클릭 시에도 접기/펼치기 가능) */}
              <div
                onClick={() => handleToggleFolder(folder)}
                className={`text-xs sm:text-sm mb-2 sm:mb-3 border-b pb-1.5 sm:pb-2 font-bold transition-all cursor-pointer select-none flex justify-between items-center ${
                  isChapterFolder ? 'text-blue-400 border-blue-500/30' : 'text-white/50 border-white/10'
                }`}
              >
                <span>{folder}</span>
                <span className="text-[10px] text-white/30 font-mono">접기 ▲</span>
              </div>

              <div className={`grid grid-cols-1 ${getGridClass(colCount)} gap-3 sm:gap-4 items-start`}>
                {folderCards.map((card: any) => {
                  try {
                    const cleanContent = card.content.replace(/\s*\[\[?ORIG_ID:\d+\]?\]?/g, '');
                    const lines = cleanContent.split('\n');
                    const firstLine = lines[0] || "";

                    let displayTitle = firstLine
                      .replace(/\[(법|령|칙|규|정관|규정)\]/g, '')
                      .replace(/\(\s*내용\s*\)/g, '')
                      .replace(/내용/g, '')
                      .trim();
                    if (!displayTitle) displayTitle = "제목 없음";

                    // 💡 EnhanceTab.tsx와 100% 동일한 법(1열) / 령(2열) / 칙·규·규정(3열) 배치 로직!
                    let colClass = "md:col-start-1 md:col-span-1";
                    let titleColor = "text-red-500";

                    if (firstLine.includes('[정관]')) {
                      colClass = "md:col-start-1 md:col-span-1";
                      titleColor = "text-yellow-500";
                    } else if (firstLine.includes('[칙]') || firstLine.includes('[규]') || firstLine.includes('[규정]')) {
                      colClass = "md:col-start-3 md:col-span-1";
                      titleColor = "text-green-500";
                    } else if (firstLine.includes('[령]')) {
                      colClass = "md:col-start-2 md:col-span-1";
                      titleColor = "text-blue-400";
                    } else {
                      colClass = "md:col-start-1 md:col-span-1";
                      titleColor = "text-red-500";
                    }

                    const bodyOnly = lines.slice(1).join('\n').trim();
                    const totalBlanks = (bodyOnly.match(/\[\s*(.*?)\s*\]/g) || []).length;
                    const stats = safeParseStats(card.memo);
                    const hasWrong = stats.wrongIndices.length > 0;
                    const wrongSet = new Set<number>(stats.wrongIndices);
                    const noteText = stats.text;

                    const isExpanded = expandedCardIds.has(card.id);
                    const isNoteOpen = openNoteIds.has(card.id);

                    const titleLen = displayTitle.length;
                    const titleSizing =
                      titleLen > 25
                        ? 'text-[10px] sm:text-[11px] tracking-[calc(-0.06em)]'
                        : titleLen > 15
                          ? 'text-[11px] sm:text-[12px] tracking-tighter'
                          : 'text-[12px] sm:text-[13px] tracking-tight';

                    // 💡 빈칸이 모두 채워진 전체 조항 본문 (틀린 오답만 빨간색으로 표시)
                    const bodyWithoutPageBreaks = bodyOnly.replace(/##PAGE_BREAK##/g, '');
                    const parts = bodyWithoutPageBreaks.split(/(\[.*?\])/g).filter((p: string) => p !== '');
                    let bIdx = 0;

                    const renderedFullText = parts.map((part: string, pIdx: number) => {
                      if (part.startsWith('[') && part.endsWith(']')) {
                        const curBlankIdx = bIdx++;
                        const word = part.replace(/\[|\]/g, '').trim();
                        const isWrongBlank = wrongSet.has(curBlankIdx);

                        if (isWrongBlank) {
                          return (
                            <span
                              key={pIdx}
                              className="inline-block mx-0.5 px-1.5 py-0.5 bg-red-950/80 text-red-300 border border-red-500 rounded-sm font-bold shadow-[0_0_8px_rgba(239,68,68,0.4)]"
                            >
                              ❌ {word}
                            </span>
                          );
                        } else {
                          return (
                            <span key={pIdx} className="font-semibold text-white/95">
                              {word}
                            </span>
                          );
                        }
                      }
                      return <span key={pIdx}>{part}</span>;
                    });

                    return (
                      <div key={card.id} className={`relative transition-all w-full ${colClass}`}>
                        {/* 1. EnhanceTab과 동일한 1줄 조항 바 (클릭 시 밑으로 전체 내용이 펼쳐짐) */}
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCardExpand(card.id);
                          }}
                          className={`w-full p-2 sm:p-2.5 rounded-sm border flex flex-col justify-center cursor-pointer text-left ${
                            isExpanded
                              ? "border-teal-400 bg-teal-950/30 ring-1 ring-teal-500/40"
                              : hasWrong
                                ? "border-red-500/40 bg-red-900/20 hover:bg-red-900/30"
                                : "border-indigo-500/30 bg-indigo-900/20 hover:bg-indigo-900/40"
                          } shadow-sm transition-all duration-200`}
                        >
                          <div className="flex flex-row items-center justify-between w-full gap-2 overflow-hidden">
                            <div
                              className={`${titleColor} font-bold ${titleSizing} text-left truncate leading-tight flex-1 flex items-center gap-1`}
                              title={displayTitle}
                            >
                              <span className="text-[9px] text-white/40 shrink-0">{isExpanded ? '▼' : '▶'}</span>
                              <span className="truncate">{displayTitle}</span>
                              {noteText && (
                                <span className="text-[9px] text-teal-300 shrink-0 ml-0.5" title="암기노트 있음">📌</span>
                              )}
                            </div>

                            <div className="flex flex-row items-center gap-1.5 shrink-0">
                              <div className="flex flex-nowrap gap-0.5">
                                <span className="text-[7px] sm:text-[8px] text-indigo-300 px-1 py-[1px] rounded font-mono whitespace-nowrap leading-none flex items-center">
                                  빈칸:{totalBlanks}
                                </span>
                                <span className="text-[7px] sm:text-[8px] text-teal-300 px-1 py-[1px] rounded font-mono whitespace-nowrap leading-none flex items-center">
                                  반복:{stats.filled}
                                </span>
                                <span
                                  className={`text-[7px] sm:text-[8px] px-1 py-[1px] rounded font-mono whitespace-nowrap leading-none flex items-center ${
                                    hasWrong
                                      ? 'text-white bg-red-600 font-bold animate-pulse shadow-sm'
                                      : 'text-white/30 bg-black/20'
                                  }`}
                                >
                                  틀림:{stats.wrongIndices.length}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 2. 조항을 눌렀을 때 바로 밑으로 펼쳐지는 전체 내용 + 암기 노트 버튼 + 오답풀기 버튼 */}
                        {isExpanded && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1.5 p-3 sm:p-4 rounded-sm border border-teal-500/40 bg-[#0a0a0c] shadow-xl space-y-3 animate-in slide-in-from-top-1 duration-150"
                          >
                            {/* 빈칸이 채워진 전체 조항 본문 (오답만 빨간색으로 표시) */}
                            <div className="text-xs sm:text-[13px] leading-relaxed whitespace-pre-wrap font-serif text-white/90 bg-black/40 p-3 rounded border border-white/5 max-h-72 overflow-y-auto custom-scrollbar">
                              {renderedFullText}
                            </div>

                            {/* 하단 버튼 바: 암기 노트 보기 버튼 & 오답만 풀기 / 전체 풀기 */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
                              <div>
                                {noteText ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleNoteOpen(card.id);
                                    }}
                                    className={`px-2.5 py-1 text-[10px] sm:text-[11px] font-bold rounded-sm border transition-all flex items-center gap-1 ${
                                      isNoteOpen
                                        ? 'bg-teal-600 text-white border-teal-400'
                                        : 'bg-teal-950/60 hover:bg-teal-900/80 text-teal-300 border-teal-500/40'
                                    }`}
                                  >
                                    <span>📌 암기 노트 {isNoteOpen ? '접기 ▲' : '보기 ▼'}</span>
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-white/30 font-mono">작성된 암기노트 없음</span>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5">
                                {hasWrong && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (typeof setActiveCard === 'function') setActiveCard(card, 'all');
                                    }}
                                    className="px-2 py-1 bg-white/5 hover:bg-white/15 border border-white/10 text-white/70 text-[10px] font-bold rounded-sm transition-colors"
                                  >
                                    전체 풀기
                                  </button>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (typeof setActiveCard === 'function') setActiveCard(card, 'wrong');
                                  }}
                                  className={`px-2.5 py-1 text-[10px] sm:text-[11px] font-bold rounded-sm transition-all shadow-sm ${
                                    hasWrong
                                      ? 'bg-red-600 hover:bg-red-500 text-white border border-red-400'
                                      : 'bg-teal-900/50 hover:bg-teal-800 text-teal-200 border border-teal-500/40'
                                  }`}
                                >
                                  {hasWrong ? `🎯 오답만 풀기 (${stats.wrongIndices.length})` : '▶ 다시 풀기'}
                                </button>
                              </div>
                            </div>

                            {/* 3. 암기 노트 보기 버튼을 눌렀을 때 밑으로 나오는 노트 내용 */}
                            {noteText && isNoteOpen && (
                              <div className="p-3 bg-teal-950/30 border border-teal-500/40 rounded-sm text-teal-200 text-xs whitespace-pre-wrap leading-relaxed font-sans shadow-inner animate-in slide-in-from-top-1 duration-150">
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
                  } catch (err: any) {
                    return null;
                  }
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
