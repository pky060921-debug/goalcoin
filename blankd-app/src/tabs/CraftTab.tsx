import React, { useState, useEffect } from 'react';
import { formatCardText, getStrictTitleOnly, SPLIT_REGEX } from '../utils/constants';
import { api } from '../services/api';

const getGridClass = (cols: number) => {
  if (cols === 1) return "md:grid-cols-1";
  if (cols === 2) return "md:grid-cols-2";
  if (cols === 3) return "md:grid-cols-3";
  if (cols === 4) return "md:grid-cols-4";
  if (cols === 5) return "md:grid-cols-5";
  return "md:grid-cols-3";
};

const sortChapters = (folders: string[]): string[] => {
  return folders.sort((a, b) => {
    const matchA = a.match(/^제\s*(\d+)\s*장/);
    const matchB = b.match(/^제\s*(\d+)\s*장/);
    
    if (matchA && matchB) {
      return parseInt(matchA[1]) - parseInt(matchB[1]);
    }
    if (matchA) return -1;
    if (matchB) return 1;
    return a.localeCompare(b, 'ko');
  });
};

type WordItem = { text: string; subWords: string[]; };

export const CraftTab = ({ categories, savedCards, colCount, viewMode, useAiRecommend, safeAddress, lawFile, setLawFile, uploadLaw, handleMakeBlankCard, addLog, handleDeleteCategory, loadAllData, expandedId, setExpandedId }: any) => {
  const safeCategories = Array.isArray(categories) ? categories : [];
  const safeSavedCards = Array.isArray(savedCards) ? savedCards : [];

  const [localCategories, setLocalCategories] = useState<any[]>(safeCategories);
  const folders = sortChapters(Array.from(new Set(localCategories.map((c:any) => c.folder_name))).filter(f => f && f !== '기본 폴더') as string[]);

  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>(() => {
    try { const saved = localStorage.getItem('blankd_craft_folders'); return saved ? JSON.parse(saved) : {}; } 
    catch(e) { return {}; }
  });

  const [isEditingText, setIsEditingText] = useState(false);
  const [editingText, setEditingText] = useState("");
  const [selectedWords, setSelectedWords] = useState<Set<number>>(new Set());
  const [pageBreaks, setPageBreaks] = useState<Set<number>>(new Set());
  const [memoInput, setMemoInput] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  
  const [dragStartIdx, setDragStartIdx] = useState<number | null>(null);

  useEffect(() => {
    setLocalCategories(safeCategories);
  }, [safeCategories]);

  useEffect(() => {
    setOpenFolders(prev => {
      const next = { ...prev };
      let changed = false;
      folders.forEach(f => {
        if (next[f] === undefined) { next[f] = true; changed = true; }
      });
      if (changed) localStorage.setItem('blankd_craft_folders', JSON.stringify(next));
      return next;
    });
  }, [localCategories]);

  const handleToggleFolder = (f: string) => {
    setOpenFolders(prev => {
      const next = { ...prev, [f]: !prev[f] };
      localStorage.setItem('blankd_craft_folders', JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    if (expandedId) {
      const cat = localCategories.find(c => c.id === expandedId);
      if (cat) {
        setIsEditingText(false);
        setEditingText(cat.content);
        setMemoInput("");
        setPageBreaks(new Set());

        const existingCard = safeSavedCards.find((c: any) => {
          const match = c.content.match(/\[\[ORIG_ID:(\d+)\]\]/);
          return match && parseInt(match[1]) === cat.id;
        });

        if (existingCard) {
          const contentWithoutOrigId = existingCard.content.replace(/\n\n\[\[ORIG_ID:\d+\]\]/g, '');
          const parts = contentWithoutOrigId.split(/(\[.*?\]|##PAGE_BREAK##)/g).filter((p:string) => p !== '');
          const loadedWords = new Set<number>();
          const loadedBreaks = new Set<number>();
          let wordIdx = 0;
          let plainText = "";

          parts.forEach((p:string) => {
            if (p === '##PAGE_BREAK##') {
               loadedBreaks.add(wordIdx);
            } else if (p.startsWith('[') && p.endsWith(']')) {
               const innerText = p.slice(1, -1);
               const subTokens = innerText.split(SPLIT_REGEX).filter(s => s);
               subTokens.forEach(t => {
                 plainText += t;
                 loadedWords.add(wordIdx++);
               });
            } else {
               const subTokens = p.split(SPLIT_REGEX).filter(s => s);
               subTokens.forEach(t => {
                 plainText += t;
                 wordIdx++;
               });
            }
          });

          setEditingText(plainText);
          setSelectedWords(loadedWords);
          setPageBreaks(loadedBreaks);
          setIsEditingText(false);
        } else {
          setSelectedWords(new Set());
          if (useAiRecommend) handleAiRecommend(cat.id, cat.content);
        }
        
        setTimeout(() => {
          const el = document.getElementById(`cat-${cat.id}`);
          if (el) {
            const y = el.getBoundingClientRect().top + window.scrollY - 100;
            window.scrollTo({top: y, behavior: 'smooth'});
          }
        }, 100);
      }
    }
  }, [expandedId, useAiRecommend]);

  const handleWordClick = (index: number) => {
    if (isEditingText) return;
    setSelectedWords(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleWordDragEnter = (index: number) => {
    if (isEditingText || dragStartIdx === null) return;
    
    const start = Math.min(dragStartIdx, index);
    const end = Math.max(dragStartIdx, index);
    
    setSelectedWords(prev => {
      const next = new Set(prev);
      const isStartSelected = prev.has(dragStartIdx);
      
      for (let i = start; i <= end; i++) {
        if (isStartSelected) next.add(i);
        else next.delete(i);
      }
      return next;
    });
  };

  const handleAiRecommend = async (catId: number, content: string) => {
    if (!safeAddress) return;
    setIsAiLoading(true);
    addLog("🤖 AI가 빈칸을 분석 중입니다...");
    try {
      const res = await api.analyzeText(safeAddress, content);
      if (res && res.recommended_blanks && Array.isArray(res.recommended_blanks)) {
        const tokens = content.split(SPLIT_REGEX).filter(s => s);
        const newSelected = new Set<number>();
        
        tokens.forEach((token, idx) => {
           const cleanToken = token.replace(/[\s\n.,!?]/g, '');
           const isRecommended = res.recommended_blanks.some((r:string) => {
              const cleanR = r.replace(/[\s\n.,!?]/g, '');
              return cleanR.length > 1 && cleanToken.includes(cleanR);
           });
           if (isRecommended) newSelected.add(idx);
        });
        
        setSelectedWords(newSelected);
        addLog("✅ AI 빈칸 추천 완료!");
      }
    } catch(e:any) {
      addLog("⚠️ AI 분석 실패: " + e.message);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleUpdateContent = async (catId: number) => {
    try {
      await fetch("https://api.blankd.top/api/update-category-content", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: safeAddress, id: catId, content: editingText })
      });
      addLog("✅ 본문 수정 완료.");
      const nextCats = localCategories.map(c => c.id === catId ? { ...c, content: editingText } : c);
      setLocalCategories(nextCats);
      setSelectedWords(new Set());
      setPageBreaks(new Set());
      setIsEditingText(false);
    } catch(e) {
      addLog("❌ 본문 수정 실패");
    }
  };

  const handleBulkMakeBlankCards = async (selectedCatIds: number[]) => {
    if (selectedCatIds.length === 0) return alert("일괄 생성할 카드를 하나 이상 선택하세요.");
    if (!window.confirm(`선택한 ${selectedCatIds.length}개의 카드를 일괄 생성하시겠습니까?\n(기존 카드가 있다면 덮어쓰기 됩니다.)`)) return;

    let successCount = 0;
    addLog(`🚀 ${selectedCatIds.length}개 카드 일괄 생성 시작...`);

    for (const catId of selectedCatIds) {
      const cat = localCategories.find(c => c.id === catId);
      if (!cat) continue;

      try {
        let contentToProcess = cat.content;
        let selectedWordsForCat = new Set<number>();

        const existingCard = safeSavedCards.find((c: any) => {
            const match = c.content.match(/\[\[ORIG_ID:(\d+)\]\]/);
            return match && parseInt(match[1]) === cat.id;
        });

        if (existingCard) {
            const contentWithoutOrigId = existingCard.content.replace(/\n\n\[\[ORIG_ID:\d+\]\]/g, '');
            const parts = contentWithoutOrigId.split(/(\[.*?\]|##PAGE_BREAK##)/g).filter((p:string) => p !== '');
            let wordIdx = 0;
            let plainText = "";

            parts.forEach((p:string) => {
                if (p === '##PAGE_BREAK##') {
                    // skip
                } else if (p.startsWith('[') && p.endsWith(']')) {
                    const innerText = p.slice(1, -1);
                    const subTokens = innerText.split(SPLIT_REGEX).filter(s => s);
                    subTokens.forEach(t => {
                        plainText += t;
                        selectedWordsForCat.add(wordIdx++);
                    });
                } else {
                    const subTokens = p.split(SPLIT_REGEX).filter(s => s);
                    subTokens.forEach(t => {
                        plainText += t;
                        wordIdx++;
                    });
                }
            });
            contentToProcess = plainText;
        } else if (useAiRecommend) {
             const res = await api.analyzeText(safeAddress, cat.content);
             if (res && res.recommended_blanks && Array.isArray(res.recommended_blanks)) {
                const tokens = cat.content.split(SPLIT_REGEX).filter(s => s);
                tokens.forEach((token, idx) => {
                   const cleanToken = token.replace(/[\s\n.,!?]/g, '');
                   const isRecommended = res.recommended_blanks.some((r:string) => {
                      const cleanR = r.replace(/[\s\n.,!?]/g, '');
                      return cleanR.length > 1 && cleanToken.includes(cleanR);
                   });
                   if (isRecommended) selectedWordsForCat.add(idx);
                });
             }
        }
        
        if (selectedWordsForCat.size > 0) {
           const wordArray = contentToProcess.split(SPLIT_REGEX).filter(s => s).map(w => ({ text: w, subWords: [] }));
           const titleToSave = cat.title || cat.category_name || "조항명 없음"; // 💡 일괄 생성시에도 타이틀 강제 지정
           
           await handleMakeBlankCard(cat, wordArray.map(w => w.text), selectedWordsForCat, new Set(), "", titleToSave);
           successCount++;
        }
        
      } catch (e: any) {
         addLog(`⚠️ [${getStrictTitleOnly(cat.title)}] 생성 실패: ${e.message}`);
      }
    }
    
    addLog(`🎉 일괄 생성 완료! (${successCount}/${selectedCatIds.length} 성공)`);
    await loadAllData();
  };

  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedForBulk, setSelectedForBulk] = useState<Set<number>>(new Set());

  const toggleBulkSelect = (id: number) => {
    setSelectedForBulk(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllInFolder = (folder: string) => {
    const catsInFolder = localCategories.filter(c => c.folder_name === folder);
    const allSelected = catsInFolder.every(c => selectedForBulk.has(c.id));
    
    setSelectedForBulk(prev => {
      const next = new Set(prev);
      catsInFolder.forEach(c => {
        if (allSelected) next.delete(c.id);
        else next.add(c.id);
      });
      return next;
    });
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in w-full">
      <div className="bg-black/40 border border-white/10 p-4 sm:p-6 rounded shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <svg className="w-24 h-24 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative z-10">
          <div>
            <h2 className="text-xl sm:text-2xl font-black mb-1 sm:mb-2 text-white drop-shadow-md flex items-center gap-2">
              법령 자동 분리 엔진
              {isAiLoading && <span className="animate-spin text-amber-500">⚙️</span>}
            </h2>
            <p className="text-xs sm:text-sm text-white/50 leading-relaxed max-w-xl">
              PDF/TXT/DOCX 법령 파일을 업로드하면 <strong>"제 O장", "제 O조"</strong> 단위로 완벽하게 쪼개어 자동 저장합니다.
            </p>
          </div>
          
          <div className="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
             <input type="file" id="law-upload" className="hidden" accept=".txt,.pdf,.docx" onChange={(e) => setLawFile(e.target.files?.[0] || null)} />
             <label htmlFor="law-upload" className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-indigo-900/30 text-indigo-300 border border-indigo-500/50 rounded text-xs sm:text-sm font-bold cursor-pointer hover:bg-indigo-900/50 transition-all text-center">
               {lawFile ? lawFile.name : '파일 선택'}
             </label>
             <button onClick={uploadLaw} disabled={!lawFile} className={`flex-1 sm:flex-none px-4 sm:px-6 py-2 rounded text-xs sm:text-sm font-bold transition-all ${lawFile ? 'bg-amber-500 text-black shadow-[0_0_15px_rgba(245,158,11,0.4)]' : 'bg-white/5 text-white/30 cursor-not-allowed'}`}>
               분석 시작
             </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 sm:mb-6">
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {folders.map((f: string) => (
            <button 
              key={f}
              onClick={() => handleToggleFolder(f)} 
              className={`px-3 py-1.5 sm:py-2 text-[10px] sm:text-[12px] font-bold border rounded-sm transition-all ${openFolders[f] ? 'bg-teal-600 border-teal-500 text-white shadow-sm' : 'bg-teal-900/40 text-teal-300 border-teal-500/30'}`}
            >
              📁 {f}
            </button>
          ))}
        </div>
        
        <div className="flex gap-2 w-full sm:w-auto">
          <button 
            onClick={() => setBulkSelectMode(!bulkSelectMode)}
            className={`flex-1 sm:flex-none px-3 py-1.5 text-[11px] font-bold border rounded transition-all ${bulkSelectMode ? 'bg-amber-600 text-white border-amber-500' : 'bg-white/10 text-white/70 border-white/20'}`}
          >
            {bulkSelectMode ? '선택 취소' : '일괄 생성 모드'}
          </button>
          
          {bulkSelectMode && (
            <button 
              onClick={() => handleBulkMakeBlankCards(Array.from(selectedForBulk))}
              disabled={selectedForBulk.size === 0}
              className={`flex-1 sm:flex-none px-4 py-1.5 text-[11px] font-bold border rounded transition-all ${selectedForBulk.size > 0 ? 'bg-blue-600 text-white border-blue-500 shadow-md animate-pulse' : 'bg-white/5 text-white/30 border-white/10'}`}
            >
              선택항목 생성 ({selectedForBulk.size})
            </button>
          )}
        </div>
      </div>
      
      {folders.map((folder: string) => {
        if (!openFolders[folder]) return null;
        
        const isAllSelected = localCategories.filter(c => c.folder_name === folder).every(c => selectedForBulk.has(c.id));

        return (
          <div key={folder} className="mb-6 sm:mb-8 border-l border-white/5 pl-3 sm:pl-4 relative">
            <div className="flex justify-between items-center mb-2 sm:mb-3 border-b border-white/10 pb-1.5 sm:pb-2">
               <div className="text-xs sm:text-sm text-white/50 font-bold">{folder}</div>
               {bulkSelectMode && (
                 <button onClick={() => toggleSelectAllInFolder(folder)} className="text-[10px] text-amber-400 hover:text-amber-300">
                   {isAllSelected ? '전체 해제' : '전체 선택'}
                 </button>
               )}
            </div>
            
            <div className={`grid grid-cols-1 ${getGridClass(colCount)} gap-3 sm:gap-4 items-start`}>
              {localCategories.filter((c:any) => c.folder_name === folder).sort((a:any, b:any) => a.id - b.id).map((cat: any) => {
                  const isExpanded = expandedId === cat.id;
                  const existingCard = safeSavedCards.find((c: any) => {
                    const match = c.content.match(/\[\[ORIG_ID:(\d+)\]\]/);
                    return match && parseInt(match[1]) === cat.id;
                  });
                  const isCrafted = !!existingCard;

                  let colClass = "";
                  let titleColor = "text-white";
                  
                  if (viewMode === 'all' && colCount >= 3) {
                    if (cat.content.includes('[법]')) { colClass = "md:col-start-1"; titleColor = "text-red-500"; }
                    else if (cat.content.includes('[령]')) { colClass = "md:col-start-2"; titleColor = "text-blue-400"; }
                    else if (cat.content.includes('[칙]') || cat.content.includes('[규]')) { colClass = "md:col-start-3"; titleColor = "text-green-500"; }
                  } else {
                    if (cat.content.includes('[법]')) titleColor = "text-red-500";
                    else if (cat.content.includes('[령]')) titleColor = "text-blue-400";
                    else if (cat.content.includes('[칙]') || cat.content.includes('[규]')) titleColor = "text-green-500";
                  }

                  let currentContent = isExpanded ? editingText : cat.content;
                  const wordArray: WordItem[] = currentContent.split(SPLIT_REGEX).filter((s: string) => s).map((w: string) => ({ text: w, subWords: [] }));
                  
                  const renderPreview = () => {
                     const { body } = formatCardText(cat.content.substring(0, 100));
                     return <div className="text-[11px] sm:text-[12px] text-white/40 mt-1.5 sm:mt-2 line-clamp-2 leading-relaxed">{body}...</div>;
                  };

                  return (
                    <div id={`cat-${cat.id}`} key={cat.id} className={`relative transition-all w-full ${isExpanded ? "md:col-span-full z-20" : colClass}`}>
                      
                      <div className={`absolute -inset-1 rounded-sm blur-md transition-all duration-500 ${isExpanded ? 'bg-amber-500/20 opacity-100' : 'opacity-0'}`}></div>
                      
                      <div className="flex gap-2">
                        {bulkSelectMode && (
                          <div className="flex items-center justify-center shrink-0">
                            <input 
                              type="checkbox" 
                              checked={selectedForBulk.has(cat.id)}
                              onChange={() => toggleSelectAllInFolder(folder)}
                              onClick={(e) => { e.stopPropagation(); toggleBulkSelect(cat.id); }}
                              className="w-4 h-4 accent-amber-500 cursor-pointer"
                            />
                          </div>
                        )}
                        <button 
                          onClick={() => {
                            if (bulkSelectMode) toggleBulkSelect(cat.id);
                            else setExpandedId(isExpanded ? null : cat.id);
                          }} 
                          className={`w-full p-3 sm:p-4 rounded-sm border transition-all flex flex-col justify-center relative bg-black ${
                            isExpanded ? 'border-amber-500/50 shadow-2xl scale-[1.02]' : 
                            isCrafted ? 'border-teal-500/30 hover:border-teal-400/50' : 'border-white/10 hover:border-white/30'
                          } cursor-pointer min-h-[70px] sm:min-h-[80px] text-left group`}
                        >
                          <div className="flex flex-row justify-between items-start w-full gap-2">
                            <div className={`${titleColor} font-bold text-[12px] sm:text-[14px] leading-snug flex-1`}>
                              {getStrictTitleOnly(cat.title)}
                            </div>
                            <div className="flex items-center gap-2">
                              {isCrafted && <span className="text-[9px] px-1.5 py-0.5 bg-teal-900/40 text-teal-300 border border-teal-500/30 rounded whitespace-nowrap">보유</span>}
                              {!isExpanded && (
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id); }} 
                                  className="opacity-0 group-hover:opacity-100 px-2 py-1 text-[10px] bg-red-900/50 text-red-300 rounded hover:bg-red-600 hover:text-white transition-all shrink-0"
                                >
                                  삭제
                                </button>
                              )}
                            </div>
                          </div>
                          {!isExpanded && renderPreview()}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="mt-3 sm:mt-4 p-4 sm:p-6 bg-black border border-amber-500/30 rounded shadow-2xl relative animate-in zoom-in-95 duration-200 w-full">
                          <div className="flex justify-between items-center mb-4 sm:mb-6">
                            <span className="text-amber-400 font-bold text-sm sm:text-base border-b border-amber-500/30 pb-1">카드 제작소</span>
                            <div className="flex gap-2">
                              <button onClick={() => { setIsEditingText(!isEditingText); if(isEditingText) handleUpdateContent(cat.id); }} className={`px-2 sm:px-3 py-1 text-[10px] sm:text-[11px] font-bold rounded transition-all ${isEditingText ? 'bg-amber-600 text-white' : 'bg-white/10 text-white/50 hover:bg-white/20'}`}>
                                {isEditingText ? '저장하기' : '본문 수정'}
                              </button>
                              <button onClick={() => setExpandedId(null)} className="px-2 sm:px-3 py-1 bg-white/5 hover:bg-white/10 text-white/40 rounded text-[10px] sm:text-[11px] transition-all">
                                닫기 ✕
                              </button>
                            </div>
                          </div>
                          
                          {isEditingText ? (
                            <textarea 
                              value={editingText} 
                              onChange={(e) => setEditingText(e.target.value)} 
                              className="w-full h-[250px] sm:h-[350px] bg-black/50 text-white/80 p-3 sm:p-4 rounded border border-white/20 focus:border-amber-500/50 outline-none text-[12px] sm:text-[14px] leading-relaxed font-serif break-keep resize-none"
                            />
                          ) : (
                            <div 
                              className="leading-relaxed text-[13px] sm:text-[15px] font-serif break-keep bg-black/30 p-3 sm:p-5 rounded border border-white/5 select-none touch-pan-y"
                              onMouseLeave={() => setDragStartIdx(null)}
                              onMouseUp={() => setDragStartIdx(null)}
                              onTouchEnd={() => setDragStartIdx(null)}
                            >
                              {wordArray.map((item, index) => {
                                const isSelected = selectedWords.has(index);
                                const isBreak = pageBreaks.has(index);
                                return (
                                  <React.Fragment key={index}>
                                    {isBreak && <div className="w-full h-px bg-amber-500/30 my-4 sm:my-6 relative"><span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black px-2 text-[8px] sm:text-[10px] text-amber-500/50">PAGE BREAK</span></div>}
                                    <span 
                                      className={`inline-block py-0.5 sm:py-1 cursor-pointer transition-all border-b-2 font-medium ${isSelected ? 'text-amber-300 border-amber-400 bg-amber-900/30 font-bold scale-105 px-1 rounded shadow-sm' : 'text-white/80 border-transparent hover:bg-white/10 hover:border-white/20'}`}
                                      onMouseDown={(e) => {
                                        if (e.shiftKey) { setPageBreaks(p => { const n = new Set(p); if (n.has(index)) n.delete(index); else n.add(index); return n; }); }
                                        else { setDragStartIdx(index); handleWordClick(index); }
                                      }}
                                      onMouseEnter={() => handleWordDragEnter(index)}
                                      onTouchStart={(e) => {
                                        setDragStartIdx(index); handleWordClick(index);
                                      }}
                                      onTouchMove={(e) => {
                                        const touch = e.touches[0];
                                        const target = document.elementFromPoint(touch.clientX, touch.clientY);
                                        if (target && target.hasAttribute('data-index')) {
                                          const idx = parseInt(target.getAttribute('data-index') || '-1');
                                          if (idx !== -1 && idx !== index) handleWordDragEnter(idx);
                                        }
                                      }}
                                      data-index={index}
                                    >
                                      {item.text}
                                    </span>
                                  </React.Fragment>
                                );
                              })}
                            </div>
                          )}

                          <div className="mt-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                             <div className="flex flex-wrap items-center gap-2 text-[10px] sm:text-[12px] text-white/40">
                               <span><strong className="text-amber-400">{selectedWords.size}</strong> 단어 선택됨</span>
                               <span className="hidden sm:inline-block">|</span>
                               <span>클릭/드래그: 빈칸 지정</span>
                               <span className="hidden sm:inline-block">|</span>
                               <span>Shift+클릭: 페이지 나누기</span>
                             </div>
                             
                             <div className="flex gap-2 w-full sm:w-auto">
                                <button onClick={() => setSelectedWords(new Set())} className="flex-1 sm:flex-none px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded text-[10px] sm:text-[11px] transition-all">초기화</button>
                                <button onClick={() => handleAiRecommend(cat.id, cat.content)} disabled={isAiLoading || isEditingText} className={`flex-1 sm:flex-none px-3 py-1.5 rounded text-[10px] sm:text-[11px] font-bold transition-all ${isAiLoading ? 'bg-indigo-900/50 text-indigo-300' : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-[0_0_10px_rgba(79,70,229,0.3)]'}`}>
                                  {isAiLoading ? '분석 중...' : '✨ AI 자동 추천'}
                                </button>
                             </div>
                          </div>
                          
                          <button 
                            disabled={isEditingText}
                            onClick={() => {
                              const titleToSave = cat.title || cat.category_name || "조항명 없음";
                              
                              const folderCats = safeCategories.filter((c:any) => c.folder_name === cat.folder_name).sort((a:any, b:any) => a.id - b.id);
                              const currentIdx = folderCats.findIndex(c => c.id === cat.id);
                              const nextCat = folderCats[currentIdx + 1];
                              
                              handleMakeBlankCard(cat, wordArray.map(w => w.text), selectedWords, pageBreaks, memoInput, titleToSave, () => {
                                  if (nextCat) {
                                      setExpandedId(nextCat.id);
                                  } else {
                                      setExpandedId(null);
                                  }
                              });
                            }} 
                            className={`w-full py-2.5 text-xs sm:text-sm font-bold rounded-sm mt-2 transition-all ${isEditingText ? 'bg-white/5 text-white/30 border border-white/10 cursor-not-allowed' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30'}`}
                          >
                            만들기
                          </button>
                        </div>
                      )}
                    </div>
                  );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
