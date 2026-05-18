import React, { useState, useEffect } from 'react';
import { formatCardText, getStrictTitleOnly, SPLIT_REGEX } from '../utils/constants';
import { api } from '../services/api';

const getGridClass = (cols: number) => {
  if(cols === 1) return "md:grid-cols-1";
  if(cols === 2) return "md:grid-cols-2";
  if(cols === 3) return "md:grid-cols-3";
  if(cols === 4) return "md:grid-cols-4";
  if(cols === 5) return "md:grid-cols-5";
  return "md:grid-cols-3";
};

type WordItem = { text: string; subWords: string[]; };

export const CraftTab = ({ categories, colCount, viewMode, useAiRecommend, safeAddress, lawFile, setLawFile, uploadLaw, handleMakeBlankCard, addLog, handleDeleteCategory }: any) => {
  const safeCategories = Array.isArray(categories) ? categories : [];
  const craftFolders = Array.from(new Set(safeCategories.map((c:any) => c.folder_name))).filter(f => f && f !== '기본 폴더').sort() as string[];
  
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>(() => {
    try { const saved = localStorage.getItem('blankd_craft_folders'); return saved ? JSON.parse(saved) : {}; } 
    catch(e) { return {}; }
  });

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [wordArray, setWordArray] = useState<WordItem[]>([]);
  const [selectedWords, setSelectedWords] = useState<Set<number>>(new Set());
  const [pageBreaks, setPageBreaks] = useState<Set<number>>(new Set());
  const [memoInput, setMemoInput] = useState(""); 
  const [isEraserMode, setIsEraserMode] = useState(false);

  useEffect(() => {
    setOpenFolders(prev => {
      const next = { ...prev };
      let changed = false;
      craftFolders.forEach(f => {
        if (next[f] === undefined) { next[f] = true; changed = true; }
      });
      if (changed) localStorage.setItem('blankd_craft_folders', JSON.stringify(next));
      return next;
    });
  }, [categories]);

  const handleToggleFolder = (f: string) => {
    setOpenFolders(prev => {
      const next = { ...prev, [f]: !prev[f] };
      localStorage.setItem('blankd_craft_folders', JSON.stringify(next));
      return next;
    });
  };

  const createLongPressHandlers = (callback: () => void, ms = 800) => {
    let timer: any;
    const start = () => { timer = setTimeout(callback, ms); };
    const clear = () => { clearTimeout(timer); };
    return { onTouchStart: start, onTouchEnd: clear, onMouseDown: start, onMouseUp: clear, onMouseLeave: clear, onContextMenu: (e:any) => { e.preventDefault(); callback(); } };
  };

  const openCategory = (targetCat: any) => {
    setExpandedId(targetCat.id);
    setPageBreaks(new Set());
    setMemoInput(targetCat.memo || "");
    setIsEraserMode(false);
    
    const { body } = formatCardText(targetCat.content || targetCat.title || "");
    const initialWords = body.split(SPLIT_REGEX).filter(w => w !== "");
    setWordArray(initialWords.map(w => ({ text: w, subWords: [w] })));

    // 💡 [핵심 진화] 조항을 열 때 기본적으로 "모든 단어"를 빈칸(선택)으로 만듭니다.
    const initialSelected = new Set<number>();
    initialWords.forEach((word, idx) => {
      const trimmed = word.trim();
      // 제외 조건 1: 특수기호
      const isSymbolOnly = !/[a-zA-Z0-9가-힣]/.test(trimmed) && trimmed !== "";
      // 제외 조건 2: 법 제1조, 제1항, 제2호, ① 등 목차 및 조항명
      const isArticleOrNum = /^(?:법\s*)?제\s*\d+\s*(?:조|장|절|관)(?:의\s*\d+)?/.test(trimmed) || 
                             /^\(?\d+(?:항|호|목)?\)?$/.test(trimmed) || 
                             /^\(?(?:①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩|⑪|⑫|⑬|⑭|⑮)\)?$/.test(trimmed);
      // 제외 조건 3: 흔히 쓰이는 조사, 의존명사, 접속사 등
      const isStopWord = /^(및|등|또는|과|와|수|할|이하|이상|초과|미만|부터|까지|관한|대한|관하여|대하여|한다|된다|있다|없다|아니한다|하여야|그|이|저|법|영|규칙|따라|따른|의해|의하여)$/.test(trimmed);
      
      // 위 3가지 예외 조건에 해당하지 않는 '의미 있는 핵심 단어'는 전부 기본 빈칸으로 자동 지정!
      if (!isSymbolOnly && !isArticleOrNum && !isStopWord && trimmed.length > 0) {
        initialSelected.add(idx);
      }
    });
    setSelectedWords(initialSelected);
  };

  const handleWordClick = (idx: number) => {
    if (isEraserMode) {
      const newArray = [...wordArray];
      newArray.splice(idx, 1); 
      setWordArray(newArray);
      const newSelected = new Set<number>();
      selectedWords.forEach(i => { if (i < idx) newSelected.add(i); else if (i > idx) newSelected.add(i - 1); });
      setSelectedWords(newSelected);
      const newPageBreaks = new Set<number>();
      pageBreaks.forEach(i => { if (i < idx) newPageBreaks.add(i); else if (i > idx) newPageBreaks.add(i - 1); });
      setPageBreaks(newPageBreaks);
      return; 
    }
    
    // 💡 이제 터치 시 "추가"가 아니라 "제외(해제)"하는 용도로 더 많이 쓰입니다.
    const s = new Set(selectedWords);
    if(s.has(idx)) s.delete(idx); else s.add(idx);
    setSelectedWords(s);
  };

  const handleWordSplit = (idx: number, e: any) => {
    e.preventDefault(); 
    if (isEraserMode) return; 
    const p = new Set(pageBreaks);
    if (p.has(idx)) p.delete(idx); else if (window.confirm("이 위치에서 페이지를 나누시겠습니까?")) p.add(idx);
    setPageBreaks(p);
  };

  const handleWordMerge = (idx: number) => {
    if (isEraserMode) return; 
    const current = wordArray[idx];

    // 💡 되돌리기 로직 (합쳐졌던 단어 쪼개기)
    if (current.subWords.length > 1) {
      const newArray = [...wordArray];
      const splitItems = current.subWords.map(w => ({ text: w, subWords: [w] }));
      newArray.splice(idx, 1, ...splitItems);
      setWordArray(newArray);
      
      const shiftAmount = splitItems.length - 1;
      const newSelected = new Set<number>();
      selectedWords.forEach(i => { 
        if (i < idx) newSelected.add(i); 
        else if (i > idx) newSelected.add(i + shiftAmount); 
      });
      // 합쳐져 있던 블록이 빈칸이었다면, 쪼개진 조각들도 모두 빈칸으로 유지합니다.
      if (selectedWords.has(idx)) {
        for(let k = 0; k <= shiftAmount; k++) newSelected.add(idx + k);
      }
      setSelectedWords(newSelected);

      const newPageBreaks = new Set<number>();
      pageBreaks.forEach(i => { if (i < idx) newPageBreaks.add(i); else if (i > idx) newPageBreaks.add(i + shiftAmount); });
      setPageBreaks(newPageBreaks);
      return;
    }

    if (idx >= wordArray.length - 1) return;
    const next = wordArray[idx + 1];

    const isSymbol1 = !/[a-zA-Z0-9가-힣]/.test(current.text) && current.text.trim() !== "";
    const isSymbol2 = !/[a-zA-Z0-9가-힣]/.test(next.text) && next.text.trim() !== "";
    if (isSymbol1 || isSymbol2) return; 

    const newArray = [...wordArray];
    newArray[idx] = { text: current.text + next.text, subWords: [...current.subWords, ...next.subWords] };
    newArray.splice(idx + 1, 1);
    setWordArray(newArray);

    const newSelected = new Set<number>();
    selectedWords.forEach(i => { 
      if (i < idx) newSelected.add(i); 
      else if (i > idx) newSelected.add(i - 1); 
    });
    // 💡 합치려는 대상 중 하나라도 빈칸이었다면, 합쳐진 거대한 블록도 빈칸으로 지정
    if (selectedWords.has(idx) || selectedWords.has(idx + 1)) {
      newSelected.add(idx);
    }
    setSelectedWords(newSelected);

    const newPageBreaks = new Set<number>();
    pageBreaks.forEach(i => { if (i < idx) newPageBreaks.add(i); else if (i > idx) newPageBreaks.add(i - 1); });
    setPageBreaks(newPageBreaks);
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in w-full">
      <div className="flex gap-2 mb-2 sm:mb-4">
        <label className="flex-1 border border-white/20 p-2 sm:p-2.5 text-center text-[10px] sm:text-xs hover:bg-white/10 cursor-pointer text-white/80 rounded-sm transition-colors">
          <input type="file" accept=".pdf,.txt,.html" onChange={e => setLawFile(e.target.files?.[0] || null)} className="hidden"/> {lawFile ? `✅ ${lawFile.name}` : '+ 학습자료 업로드'}
        </label>
        <button onClick={uploadLaw} className="px-3 sm:px-4 border border-white/20 text-[10px] sm:text-xs hover:bg-white/10 transition-colors rounded-sm">전송</button>
      </div>

      <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-4 sm:mb-6">
        {craftFolders.map((f: string) => (
          <div key={f} className="relative group flex items-center">
            <button 
              onClick={() => handleToggleFolder(f)} 
              className={`pl-2.5 pr-14 py-1.5 sm:py-2 text-[10px] sm:text-[12px] font-bold border rounded-sm transition-all ${openFolders[f] ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm' : 'bg-indigo-900/40 text-indigo-300 border-indigo-500/30'}`}
            >
              📁 {f}
            </button>
            <button 
              onClick={async (e) => {
                e.stopPropagation();
                const newName = prompt(`'${f}' 폴더의 새로운 이름을 입력하세요:`, f);
                if(newName && newName.trim() !== "" && newName !== f) {
                  try { await api.renameFolder(safeAddress, f, newName.trim()); addLog(`✏️ 폴더명 변경 완료.`); window.location.reload(); } catch (err) { alert("변경 실패"); }
                }
              }}
              className="absolute right-6 top-1/2 -translate-y-1/2 text-white/30 hover:text-blue-400 px-1.5 py-1 text-[10px] transition-colors"
            >✏️</button>
            <button 
              onClick={async (e) => {
                e.stopPropagation();
                if(confirm(`'${f}' 폴더를 모두 삭제하시겠습니까?`)) {
                  try { await api.deleteFolder(safeAddress, f); addLog(`🗑️ 삭제 완료`); window.location.reload(); } catch (err) { alert("삭제 실패"); }
                }
              }}
              className="absolute right-1 top-1/2 -translate-y-1/2 text-white/30 hover:text-red-400 px-1.5 py-1 text-[10px] transition-colors"
            >✕</button>
          </div>
        ))}
      </div>
      
      {craftFolders.map((folder: string) => openFolders[folder] && (
        <div key={folder} className="mb-6 sm:mb-8 border-l border-white/5 pl-3 sm:pl-4">
          <div className="text-xs sm:text-sm text-white/50 mb-2 sm:mb-3 border-b border-white/10 pb-1.5 sm:pb-2 font-bold">{folder}</div>

          <div className={`grid grid-cols-1 ${getGridClass(colCount)} gap-3 sm:gap-4 items-start`}>
            {safeCategories.filter((c:any) => c.folder_name === folder).sort((a:any, b:any) => a.id - b.id).map((cat: any) => {
                const isExpanded = expandedId === cat.id;
                const contentToUse = cat.content || cat.title || "";
                
                let colClass = ""; let titleColor = "text-amber-400";
                const checkText = `${cat.title || ''} ${cat.content || ''}`;
                if (checkText.includes('[법]')) titleColor = "text-red-500";
                else if (checkText.includes('[령]')) titleColor = "text-blue-400";
                else if (checkText.includes('[칙]') || checkText.includes('[규]')) titleColor = "text-green-500";
                
                if (isExpanded) colClass = "col-span-full";
                const cleanTitle = getStrictTitleOnly(contentToUse);

                return (
                  <div key={cat.id} className={`relative transition-all w-full ${colClass}`}>
                    {!isExpanded ? (
                      <button {...createLongPressHandlers(() => handleDeleteCategory(cat.id))} 
                        onClick={() => openCategory(cat)} 
                        className="w-full min-h-[60px] p-3 sm:p-4 bg-indigo-900/20 border border-indigo-500/30 rounded-sm transition-colors hover:bg-indigo-900/40 flex flex-col gap-1.5 sm:gap-2 text-left">
                        <span className={`${titleColor} font-bold text-[11px] sm:text-[13px] leading-snug break-keep`}>{cleanTitle}</span>
                        {cat.memo && <div className="text-[9px] sm:text-[11px] text-teal-300 bg-teal-900/20 p-1.5 sm:p-2 rounded border border-teal-500/20 w-full truncate">{cat.memo}</div>}
                      </button>
                    ) : (
                      <div className="w-full p-4 sm:p-6 bg-[#0a0a0c] border border-indigo-500/50 rounded-sm space-y-3 shadow-xl z-20 relative animate-in zoom-in-95">
                        <div className="flex justify-between items-center mb-1 flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className={`${titleColor} font-bold text-[12px] sm:text-[14px] cursor-pointer`} onClick={() => setExpandedId(null)}>{cleanTitle}</span>
                            <button 
                              onClick={async (e) => {
                                e.stopPropagation();
                                const newFolder = prompt("이동시킬 폴더명:", cat.folder_name);
                                if (newFolder && newFolder.trim() !== "" && newFolder !== cat.folder_name) {
                                  try { await api.updateCategoryFolder(safeAddress, cat.id, newFolder.trim()); window.location.reload(); } catch (err) {}
                                }
                              }}
                              className="px-2 py-0.5 bg-white/5 border border-white/20 rounded-sm text-[9px] text-white/50 hover:bg-white/10 transition-colors"
                            >📂 폴더 이동</button>
                          </div>
                          <button onClick={() => setIsEraserMode(!isEraserMode)} className={`px-3 py-1 text-[11px] font-bold rounded-sm border transition-all ${isEraserMode ? 'bg-red-600 border-red-500 text-white animate-pulse' : 'bg-white/5 border-white/20 text-white/50 hover:bg-white/10'}`}>
                            {isEraserMode ? '🗑️ 지우개 켜짐' : '✏️ 지우개 모드'}
                          </button>
                        </div>
                        <input type="text" value={memoInput} onChange={(e) => setMemoInput(e.target.value)} placeholder="암기 메모 입력..." className="w-full bg-black/50 border border-teal-500/30 p-2 text-xs text-teal-200 outline-none rounded-sm" />
                        
                        <div className={`font-serif text-[13px] sm:text-[15px] leading-loose text-white/80 p-4 bg-black/40 border max-h-72 overflow-y-auto rounded select-none touch-manipulation whitespace-pre-wrap break-keep custom-scrollbar relative transition-all ${isEraserMode ? 'border-red-500/50 ring-1 ring-red-500/30' : 'border-white/10'}`}>
                          {wordArray.map((wordObj, idx) => {
                            const word = wordObj.text;
                            const isSymbolOnly = !/[a-zA-Z0-9가-힣]/.test(word) && word.trim() !== "";
                            const isMerged = wordObj.subWords.length > 1;
                            const isSelected = selectedWords.has(idx);

                            return (
                              <React.Fragment key={idx}>
                                {pageBreaks.has(idx) && <div className="w-full border-t border-red-500/50 my-2 relative"><span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-black px-1 text-[8px] text-red-400 font-bold uppercase tracking-tighter">Page Break</span></div>}
                                <span 
                                  onClick={() => { if (isEraserMode || !isSymbolOnly) handleWordClick(idx); }} 
                                  onContextMenu={(e) => handleWordSplit(idx, e)} 
                                  onDoubleClick={() => { if (!isSymbolOnly || isMerged) handleWordMerge(idx); }} 
                                  className={`px-[1px] rounded transition-colors ${
                                    isSelected ? 'bg-amber-500 text-black font-bold cursor-pointer' : 
                                    isEraserMode ? 'hover:bg-red-500/50 hover:text-white text-red-100 cursor-pointer' : 
                                    isSymbolOnly ? 'text-white/30 cursor-default' : 
                                    isMerged ? 'bg-indigo-900/30 border-b border-indigo-500/50 hover:bg-indigo-800/40 cursor-pointer' : 
                                    'hover:bg-white/10 cursor-pointer'
                                  }`}
                                  title={isSelected ? "클릭하여 빈칸에서 해제" : "클릭하여 빈칸으로 지정"}
                                >
                                  {word}
                                </span>
                              </React.Fragment>
                            );
                          })}
                        </div>
                        
                        <button 
                          onClick={() => {
                            const folderCats = safeCategories.filter((c:any) => c.folder_name === cat.folder_name).sort((a:any, b:any) => a.id - b.id);
                            const currentIdx = folderCats.findIndex(c => c.id === cat.id);
                            const nextCat = folderCats[currentIdx + 1];
                            
                            handleMakeBlankCard(cat, wordArray.map(w => w.text), selectedWords, pageBreaks, memoInput, () => {
                                if (nextCat) openCategory(nextCat);
                                else setExpandedId(null);
                            });
                          }} 
                          className="w-full py-2.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs sm:text-sm font-bold rounded-sm mt-2 hover:bg-amber-500/30 transition-all"
                        >
                          지식 추출 저장 및 다음 조항 이어서 만들기
                        </button>
                      </div>
                    )}
                  </div>
                );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
