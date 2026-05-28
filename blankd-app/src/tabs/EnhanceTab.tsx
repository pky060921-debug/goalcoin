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

export const EnhanceTab = ({ savedCards, colCount, viewMode, setActiveCard, setActiveTab, setExpandedId, handleDeleteCard }: any) => {
  const safeCards = Array.isArray(savedCards) ? savedCards : [];
  const enhanceFolders = Array.from(new Set(safeCards.map((c:any) => c.folder_name))).filter(f => f && f !== '기본 폴더').sort() as string[];
  
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>(() => {
    try { const saved = localStorage.getItem('blankd_enhance_folders'); return saved ? JSON.parse(saved) : {}; } 
    catch(e) { return {}; }
  });

  // --- 💡 수정 모드 상태 관리 ---
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // 💡 도구 상태: 'editor'(텍스트), 'include'(포함), 'exclude'(제외), null(비활성화/뷰어)
  const [activeTool, setActiveTool] = useState<'editor' | 'include' | 'exclude' | null>('include');

  // --- 💡 저장 함수 ---
  const handleSaveEdit = async (card: any) => {
    setIsSaving(true);
    setErrorMsg(null);
    try {
      // API 호출: 반복 통계(memo)는 살려둔 채 content만 덮어씁니다!
      await api.put(`/api/cards/${card.id}`, { content: editContent, memo: card.memo });
      card.content = editContent; // 로컬 즉시 반영
      setEditingId(null);
    } catch (error: any) {
      console.error("수정 실패:", error);
      setErrorMsg(error.message || "서버 통신에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  // --- 💡 인터랙티브 토큰 렌더러 (클릭 모드) ---
  const renderInteractiveText = () => {
    // 텍스트를 공백, 줄바꿈, 페이지 나눔(---), 고유ID 태그, 이미 씌워진 빈칸([ ]) 단위로 쪼갭니다.
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

          // 도구에 따른 버튼 스타일링
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
              btnClass += "text-white/30 cursor-default"; // 일반 텍스트는 흐리게
            }
          } else {
            // 도구가 꺼진 뷰어 상태
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

  useEffect(() => {
    setOpenFolders(prev => {
      const next = { ...prev };
      let changed = false;
      enhanceFolders.forEach(f => {
        if (next[f] === undefined) { next[f] = true; changed = true; }
      });
      if (changed) localStorage.setItem('blankd_enhance_folders', JSON.stringify(next));
      return changed ? next : prev;
    });
  }, [enhanceFolders]);

  const toggleFolder = (folder: string) => {
    setOpenFolders(prev => {
      const next = { ...prev, [folder]: !prev[folder] };
      localStorage.setItem('blankd_enhance_folders', JSON.stringify(next));
      return next;
    });
  };

  if (safeCards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-white/30">
        <div className="text-4xl mb-4 opacity-50">📭</div>
        <p className="font-bold tracking-widest">저장된 카드가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {enhanceFolders.map(folder => {
        const folderCards = safeCards.filter((c:any) => c.folder_name === folder).sort((a:any, b:any) => a.id - b.id);
        if (folderCards.length === 0) return null;
        
        const isOpen = openFolders[folder];
        const completedCount = folderCards.filter((c:any) => {
          const { body } = formatCardText(c.content);
          const blanksCount = (body.match(/\[\s*(.*?)\s*\]/g) || []).length;
          const stats = parseCardStats(c.memo);
          return stats.filled >= blanksCount && blanksCount > 0;
        }).length;
        const isAllCompleted = completedCount === folderCards.length;

        return (
          <div key={folder} className={`border rounded-lg transition-all duration-300 ${isAllCompleted ? 'border-indigo-500/20 bg-indigo-950/5' : 'border-white/10 bg-black/20'}`}>
            <button onClick={() => toggleFolder(folder)} className="w-full flex items-center justify-between p-3 sm:p-4 hover:bg-white/5 transition-colors">
              <div className="flex items-center gap-3">
                <span className={`transform transition-transform duration-300 text-xs ${isOpen ? 'rotate-90 text-teal-400' : 'text-white/40'}`}>▶</span>
                <h3 className={`text-sm sm:text-base font-bold tracking-widest ${isAllCompleted ? 'text-indigo-300' : 'text-white'}`}>{folder}</h3>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] sm:text-xs font-mono text-white/40">{completedCount} / {folderCards.length}</span>
                <div className="w-16 sm:w-24 h-1.5 bg-black/50 rounded-full overflow-hidden border border-white/5">
                  <div className={`h-full transition-all duration-500 ${isAllCompleted ? 'bg-indigo-500' : 'bg-teal-500'}`} style={{ width: `${(completedCount / folderCards.length) * 100}%` }}></div>
                </div>
              </div>
            </button>

            <div className={`grid gap-3 sm:gap-4 p-3 sm:p-4 border-t transition-all duration-500 ${isOpen ? 'grid-rows-[1fr] opacity-100 border-white/10' : 'grid-rows-[0fr] opacity-0 border-transparent p-0 m-0 overflow-hidden'} ${getGridClass(colCount)}`}>
              {isOpen && folderCards.map((card: any) => {
                const { title, body } = formatCardText(card.content);
                const blanksCount = (body.match(/\[\s*(.*?)\s*\]/g) || []).length;
                const stats = parseCardStats(card.memo);
                const hasWrong = stats.wrongIndices.length > 0;
                const isCompleted = stats.filled >= blanksCount && blanksCount > 0;

                // 💡 편집(Edit) 모드 화면
                if (editingId === card.id) {
                  return (
                    <div key={`edit-${card.id}`} className="group relative flex flex-col p-3 sm:p-4 rounded-md border border-amber-500/50 bg-[#0a0a0c] transition-all duration-300 w-full h-full shadow-[0_0_20px_rgba(245,158,11,0.15)] col-span-full md:col-span-2 lg:col-span-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
                        <span className="text-[12px] text-amber-400 font-bold flex items-center gap-2">
                          <span className="animate-pulse">🛠️</span> 빈칸 직접 수정 모드
                        </span>
                        
                        {/* 💡 도구 모음 토글 버튼 */}
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
                      
                      {/* 💡 선택된 도구에 따른 렌더링 */}
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
                  );
                }

                // 기존(뷰어) 모드 화면
                return (
                  <button 
                    key={card.id} 
                    onClick={() => setActiveCard(card)} 
                    className={`group relative text-left p-3 sm:p-4 rounded-md border transition-all duration-300 w-full overflow-hidden flex flex-col
                      ${isCompleted ? 'bg-indigo-900/10 border-indigo-500/20 hover:border-indigo-500/40' : 'bg-[#121214] border-white/5 hover:bg-[#161618] hover:border-teal-500/30'}
                    `}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h4 className={`text-[12px] sm:text-[13px] font-bold tracking-widest pr-2 leading-tight ${isCompleted ? 'text-indigo-300' : 'text-teal-400'}`}>
                        {title || "제목 없음"}
                      </h4>
                    </div>
                    
                    <div className="text-[11px] sm:text-xs text-white/50 leading-relaxed font-sans line-clamp-3 mb-3 group-hover:text-white/60 transition-colors flex-grow">
                      {body.split(SPLIT_REGEX).map((part, i) => {
                        if (part.startsWith('[') && part.endsWith(']')) {
                          return <span key={i} className="inline-block px-1 mx-0.5 bg-white/5 border border-white/10 rounded text-transparent group-hover:bg-white/10 transition-colors">{part.slice(1, -1)}</span>;
                        }
                        return <span key={i}>{part}</span>;
                      })}
                    </div>

                    <div className="flex items-center justify-between border-t border-white/5 pt-2 mt-auto">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] sm:text-[11px] font-mono font-bold tracking-widest text-white/30">BLANKS</span>
                        <span className="text-[10px] sm:text-[11px] font-mono font-bold text-teal-400">{blanksCount}</span>
                      </div>
                      
                      <div className="flex items-center gap-1.5">
                        <span className="text-[8px] sm:text-[9px] text-teal-300 border border-teal-500/30 px-1.5 py-0.5 rounded bg-teal-900/40 font-mono whitespace-nowrap">반복:{stats.filled}</span>
                        <span className={`text-[8px] sm:text-[9px] px-1.5 py-0.5 rounded font-mono border whitespace-nowrap ${hasWrong ? 'text-white border-red-500/60 bg-red-600 font-bold animate-pulse shadow-sm' : 'text-white/30 border-white/5 bg-black/20'}`}>틀림:{stats.wrongIndices.length}</span>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation(); 
                            setEditingId(card.id);
                            setEditContent(card.content);
                            setActiveTool('include'); // 기본 도구를 포함(Include)으로 설정
                          }}
                          className="ml-1 px-1.5 py-0.5 bg-amber-900/40 text-amber-400 border border-amber-500/50 rounded font-mono text-[9px] hover:bg-amber-900/60 transition-colors cursor-pointer z-10"
                        >
                          ✏️수정
                        </button>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
