import React, { useState, useEffect } from 'react';
import { formatCardText, parseCardStats, SPLIT_REGEX } from '../utils/constants';
import { api } from '../services/api';

const getGridClass = (cols: number) => {
  if(cols === 1) return "md:grid-cols-1";
  if(cols === 2) return "md:grid-cols-2";
  if(cols === 3) return "md:grid-cols-3";
  if(cols === 4) return "md:grid-cols-4";
  if(cols === 5) return "md:grid-cols-5";
  return "md:grid-cols-3";
};

export const EnhanceTab = React.memo({ savedCards, colCount, viewMode, setActiveCard, setActiveTab, setExpandedId, handleDeleteCard }: any) => {
  const safeCards = Array.isArray(savedCards) ? savedCards : [];
  const enhanceFolders = Array.from(new Set(safeCards.map((c:any) => c.folder_name))).filter(f => f && f !== '기본 폴더').sort() as string[];
  
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>(() => {
    try { const saved = localStorage.getItem('blankd_enhance_folders'); return saved ? JSON.parse(saved) : {}; } 
    catch(e) { return {}; }
  });

  useEffect(() => {
    setOpenFolders(prev => {
      const next = { ...prev };
      let changed = false;
      enhanceFolders.forEach(f => {
        if (next[f] === undefined) { next[f] = true; changed = true; }
      });
      if (changed) localStorage.setItem('blankd_enhance_folders', JSON.stringify(next));
      return next;
    });
  }, [savedCards]);

  const handleToggleFolder = (f: string) => {
    setOpenFolders(prev => {
      const next = { ...prev, [f]: !prev[f] };
      localStorage.setItem('blankd_enhance_folders', JSON.stringify(next));
      return next;
    });
  };

  const createLongPressHandlers = (callback: () => void, ms = 800) => {
    let timer: any;
    const start = () => { timer = setTimeout(callback, ms); };
    const clear = () => { clearTimeout(timer); };
    return { onTouchStart: start, onTouchEnd: clear, onMouseDown: start, onMouseUp: clear, onMouseLeave: clear, onContextMenu: (e:any) => { e.preventDefault(); callback(); } };
  };

  // --- 💡 새로 추가된 직접 수정(Edit) 모드 상태 ---
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // 💡 도구 상태: 'editor'(텍스트), 'include'(포함), 'exclude'(제외), null(비활성화/뷰어)
  const [activeTool, setActiveTool] = useState<'editor' | 'include' | 'exclude' | null>('include');

    // --- 💡 저장 함수 (api.put 대신 올바른 save-card 엔드포인트 사용) ---
  const handleSaveEdit = async (card: any) => {
    setIsSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch("https://api.blankd.top/api/save-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet_address: card.wallet_address || "ENOKI_USER", 
          card_id: card.id, // 💡 기존 ID를 보내면 서버가 자동으로 덮어쓰기(UPDATE)를 수행합니다.
          card_content: editContent,
          answer_text: card.answer_text || "",
          folder_name: card.folder_name,
          memo: card.memo // 💡 학습 통계 데이터 그대로 유지!
        })
      });

      if (!res.ok) throw new Error("서버 통신에 실패했습니다.");
      
      card.content = editContent; // API 전체 재호출 없이 로컬에 즉시 반영 (API 절약)
      setEditingId(null);
    } catch (error: any) {
      console.error("수정 저장 실패:", error);
      setErrorMsg(error.message || "서버 통신에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const renderInteractiveText = () => {
    const tokens = editContent.split(/(\s+|\n|---|\[\[ORIG_ID:\d+\]\]|\[[^\]]+\])/g).filter(Boolean);
    
    return (
      <div className={`w-full bg-black/40 p-4 rounded border border-white/10 leading-loose font-sans ${activeTool ? 'select-none' : ''} min-h-[160px] max-h-[400px] overflow-y-auto custom-scrollbar`}>
        {tokens.map((token, idx) => {
          const isOrigId = token.startsWith('[[ORIG_ID:');
          const isBracketed = token.startsWith('[') && token.endsWith(']') && !isOrigId;
          const isPageBreak = token === '---';
          const isNewline = token === '\n';
          const isWhitespace = /^\s+$/.test(token);
          
          if (isOrigId) {
            return <div key={idx} className="inline-block text-[10px] text-white/20 font-mono bg-white/5 px-2 py-0.5 rounded mr-2 mb-2 select-none cursor-default">🔗 시스템 태그: {token}</div>;
          }
          if (isPageBreak) {
            return (
              <div key={idx} className="my-6 border-b-2 border-dashed border-white/20 relative flex justify-center cursor-default">
                <span className="absolute -top-3 bg-[#0a0a0c] px-3 py-0.5 rounded-full text-[10px] text-white/40 font-bold tracking-widest border border-white/10">
                  ✂️ PAGE BREAK (---)
                </span>
              </div>
            );
          }
          if (isNewline) return <br key={idx} />;
          if (isWhitespace) return <span key={idx}>{token}</span>;

          let btnClass = "inline-block rounded px-1.5 py-0.5 mx-0.5 transition-all ";
          
          if (activeTool === 'include') {
            if (isBracketed) {
              btnClass += "bg-teal-900/20 text-teal-500/50 border border-teal-500/10 cursor-not-allowed"; 
            } else {
              btnClass += "text-white/80 cursor-pointer bg-white/5 hover:bg-teal-500/40 hover:text-white hover:scale-105 active:scale-95 border border-transparent hover:border-teal-400/50 shadow-sm";
            }
          } else if (activeTool === 'exclude') {
            if (isBracketed) {
              btnClass += "bg-teal-900/60 text-teal-200 border border-teal-500/60 cursor-pointer hover:bg-red-600/80 hover:text-white hover:border-red-400 hover:scale-105 active:scale-95 hover:line-through shadow-md";
            } else {
              btnClass += "text-white/30 cursor-default";
            }
          } else {
            if (isBracketed) {
              btnClass += "bg-teal-900/30 text-teal-400 border border-teal-500/30 cursor-default";
            } else {
              btnClass += "text-white/70 cursor-default";
            }
          }

          return (
            <span 
              key={idx} 
              onClick={() => {
                if (activeTool === 'include' && !isBracketed) {
                  const newTokens = [...tokens];
                  newTokens[idx] = `[${token}]`;
                  setEditContent(newTokens.join(''));
                } else if (activeTool === 'exclude' && isBracketed) {
                  const newTokens = [...tokens];
                  newTokens[idx] = token.slice(1, -1);
                  setEditContent(newTokens.join(''));
                }
              }}
              className={btnClass}
            >
              {isBracketed ? token.slice(1, -1) : token}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in w-full">
      <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-4 sm:mb-6">
        {enhanceFolders.map((f: string) => (
          <button 
            key={f}
            onClick={() => handleToggleFolder(f)} 
            className={`px-3 py-1.5 sm:py-2 text-[10px] sm:text-[12px] font-bold border rounded-sm transition-all ${openFolders[f] ? 'bg-teal-600 border-teal-500 text-white shadow-sm' : 'bg-teal-900/40 text-teal-300 border-teal-500/30'}`}
          >
            📁 {f}
          </button>
        ))}
      </div>
      
      {enhanceFolders.map((folder: string) => openFolders[folder] && (
        <div key={folder} className="mb-6 sm:mb-8 border-l border-white/5 pl-3 sm:pl-4">
          <div className="text-xs sm:text-sm text-white/50 mb-2 sm:mb-3 border-b border-white/10 pb-1.5 sm:pb-2 font-bold">{folder}</div>
          <div className={`grid grid-cols-1 ${getGridClass(colCount)} gap-3 sm:gap-4 items-start`}>
            {safeCards
              .filter((c:any) => c && c.content && c.folder_name === folder)
              .sort((a:any, b:any) => a.id - b.id)
              .map((card: any) => {
                
                const cleanContent = card.content.replace(/\n\n\[\[ORIG_ID:\d+\]\]/g, '');
                
                let displayTitle = (cleanContent.split('\n')[0] || "")
                    .replace(/\[.*?\]/g, '')
                    .replace(/\(\s*내용\s*\)/g, '')
                    .replace(/내용/g, '')
                    .trim();
                
                if (!displayTitle) displayTitle = "제목 없음";

                const { body } = formatCardText(cleanContent);
                const totalBlanks = (body.match(/\[\s*(.*?)\s*\]/g) || []).length;
                const stats = parseCardStats(card.memo);
                const hasWrong = stats.wrongIndices.length > 0;
                
                let colClass = "";
                let titleColor = "text-teal-400";
                
                if (viewMode === 'all' && colCount >= 3) {
                  if (cleanContent.includes('[법]')) { colClass = "md:col-start-1"; titleColor = "text-red-500"; }
                  else if (cleanContent.includes('[령]')) { colClass = "md:col-start-2"; titleColor = "text-blue-400"; }
                  else if (cleanContent.includes('[칙]') || cleanContent.includes('[규]')) { colClass = "md:col-start-3"; titleColor = "text-green-500"; }
                } else {
                  if (cleanContent.includes('[법]')) titleColor = "text-red-500";
                  else if (cleanContent.includes('[령]')) titleColor = "text-blue-400";
                  else if (cleanContent.includes('[칙]') || cleanContent.includes('[규]')) titleColor = "text-green-500";
                }

                if (editingId === card.id) {
                  colClass = "col-span-full";
                }

                return (
                  <div key={card.id} className={`relative transition-all w-full ${colClass}`}>
                    {editingId === card.id ? (
                      <div className="relative flex flex-col p-4 rounded-sm border border-amber-500/50 bg-[#0a0a0c] transition-all duration-300 w-full shadow-[0_0_15px_rgba(245,158,11,0.15)]">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
                          <span className="text-[12px] text-amber-400 font-bold flex items-center gap-2">
                            <span className="animate-pulse">🛠️</span> 빈칸 직접 수정 모드
                          </span>
                          
                          <div className="flex items-center gap-1.5 bg-black/50 p-1 rounded-md border border-white/10">
                            <button 
                              onClick={() => setActiveTool(activeTool === 'editor' ? null : 'editor')}
                              className={`px-2.5 py-1.5 rounded text-[10px] font-bold transition-all flex items-center gap-1.5 ${activeTool === 'editor' ? 'bg-amber-600/90 text-white shadow-md' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80'}`}
                            >
                              📝 직접 타이핑
                            </button>
                            <div className="w-px h-4 bg-white/10 mx-0.5"></div>
                            <button 
                              onClick={() => setActiveTool(activeTool === 'include' ? null : 'include')}
                              className={`px-2.5 py-1.5 rounded text-[10px] font-bold transition-all flex items-center gap-1.5 ${activeTool === 'include' ? 'bg-teal-600/90 text-white shadow-md' : 'bg-white/5 text-white/50 hover:bg-teal-500/20 hover:text-teal-200'}`}
                            >
                              ➕ 클릭 포함
                            </button>
                            <button 
                              onClick={() => setActiveTool(activeTool === 'exclude' ? null : 'exclude')}
                              className={`px-2.5 py-1.5 rounded text-[10px] font-bold transition-all flex items-center gap-1.5 ${activeTool === 'exclude' ? 'bg-red-600/90 text-white shadow-md' : 'bg-white/5 text-white/50 hover:bg-red-500/20 hover:text-red-200'}`}
                            >
                              ➖ 클릭 제외
                            </button>
                          </div>
                        </div>
                        
                        {activeTool === 'editor' ? (
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="w-full min-h-[160px] max-h-[400px] bg-black/60 text-amber-50 text-[12px] sm:text-[13px] p-4 rounded border border-white/10 focus:border-amber-500/70 outline-none resize-none custom-scrollbar leading-relaxed font-sans"
                            placeholder="여기에 텍스트를 직접 입력하거나 [ ] 기호로 감싸세요."
                          />
                        ) : (
                          renderInteractiveText()
                        )}
                        
                        {errorMsg && <div className="text-red-400 text-[10px] mt-3 font-bold">{errorMsg}</div>}
                        
                        <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-white/10">
                          <button 
                            onClick={(e) => { e.stopPropagation(); setEditingId(null); }}
                            className="px-4 py-2 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 rounded-sm text-[11px] font-bold transition-all"
                            disabled={isSaving}
                          >
                            취소
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleSaveEdit(card); }}
                            className="px-5 py-2 bg-amber-600 border border-amber-500/50 text-white hover:bg-amber-500 rounded-sm text-[11px] font-bold transition-all flex items-center gap-1.5 shadow-lg shadow-amber-900/20"
                            disabled={isSaving}
                          >
                            {isSaving ? '저장 중...' : '💾 내용 저장'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button {...createLongPressHandlers(() => handleDeleteCard(card.id))} onClick={(e) => { e.stopPropagation(); if (typeof setActiveCard === 'function') setActiveCard(card); }} className={`w-full p-3 sm:p-4 rounded-sm border transition-all flex flex-col justify-center ${hasWrong ? "border-red-500/40 bg-red-900/20" : "border-indigo-500/30 bg-indigo-900/20 hover:bg-indigo-900/40"} cursor-pointer shadow-sm hover:shadow-md`}>
                        <div className="flex flex-row justify-between items-center w-full gap-2">
                          <div className={`${titleColor} font-bold text-[11px] sm:text-[13px] text-left leading-snug truncate flex-1`}>{displayTitle}</div>
                          <div className="flex flex-nowrap gap-1 justify-end shrink-0 items-center overflow-visible">
                            <span className="text-[8px] sm:text-[9px] text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded bg-indigo-900/40 font-mono whitespace-nowrap">빈칸:{totalBlanks}</span>
                            <span className="text-[8px] sm:text-[9px] text-teal-300 border border-teal-500/30 px-1.5 py-0.5 rounded bg-teal-900/40 font-mono whitespace-nowrap">반복:{stats.filled}</span>
                            <span className={`text-[8px] sm:text-[9px] px-1.5 py-0.5 rounded font-mono border whitespace-nowrap ${hasWrong ? 'text-white border-red-500/60 bg-red-600 font-bold animate-pulse shadow-sm' : 'text-white/30 border-white/5 bg-black/20'}`}>틀림:{stats.wrongIndices.length}</span>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingId(card.id);
                                setEditContent(card.content);
                                setActiveTool('include');
                              }}
                              className="ml-1 px-1.5 py-0.5 bg-amber-900/40 text-amber-400 border border-amber-500/50 rounded font-mono text-[9px] hover:bg-amber-900/60 transition-colors cursor-pointer"
                            >
                              ✏️수정
                            </button>
                          </div>
                        </div>
                      </button>
                    )}
                  </div>
                );
            })}
            </div>
          </div>
        ))}
    </div>
  );
// 🚨 기존의 '};' 를 지우고 아래처럼 방어막 조건을 덧붙여서 닫아줍니다!
}, (prevProps: any, nextProps: any) => {
  // 💡 마법의 방어막: 타자를 치는 동안에는 뒤에 있는 카드들이 절대 새로고침되지 않도록 막아줍니다.
  // 오직 카드가 새로 저장되거나, 배열(단수) 모드가 바뀌었을 때만 화면을 다시 그립니다.
  return prevProps.savedCards === nextProps.savedCards && 
         prevProps.colCount === nextProps.colCount &&
         prevProps.viewMode === nextProps.viewMode;
});
