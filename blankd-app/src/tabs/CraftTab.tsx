import React, { useState, useEffect, useRef } from 'react';
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

export const CraftTab = ({ categories, colCount, viewMode, useAiRecommend, safeAddress, lawFile, setLawFile, uploadLaw, handleMakeBlankCard, addLog, handleDeleteCategory, loadAllData }: any) => {
  const safeCategories = Array.isArray(categories) ? categories : [];
  
  // 💡 정렬: 폴더 이름 기준 숫자 추출 오름차순 (제1장, 제2장...)
  const sortFolders = (folders: string[]) => {
    return folders.sort((a, b) => {
      const matchA = a.match(/\d+/);
      const matchB = b.match(/\d+/);
      if (matchA && matchB) return parseInt(matchA[0]) - parseInt(matchB[0]);
      return a.localeCompare(b);
    });
  };

  const rawFolders = Array.from(new Set(safeCategories.map((c:any) => c.folder_name))).filter(f => f && f !== '기본 폴더') as string[];
  // '[완료]' 태그가 붙은 폴더와 안 붙은 폴더를 병합하여 순수 장(Chapter) 이름만 추출
  const baseFolders = Array.from(new Set(rawFolders.map(f => f.replace(' [완료]', ''))));
  const craftFolders = sortFolders(baseFolders);
  
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
  
  const [isEditingText, setIsEditingText] = useState(false);
  const [editingContent, setEditingContent] = useState("");
  const [showStopWordsSettings, setShowStopWordsSettings] = useState(false);
  
  const [customStopWords, setCustomStopWords] = useState<string[]>([]);
  const [customIncludeWords, setCustomIncludeWords] = useState<string[]>([]);
  const [newStopWord, setNewStopWord] = useState("");
  const [newIncludeWord, setNewIncludeWord] = useState("");

  const [isSelectMode, setIsSelectMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());

  // 💡 체크포인트 추적용 Ref
  const itemRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    if (safeAddress) {
      api.getStopwords(safeAddress).then(data => {
        if (data && data.stopwords) {
          if (Array.isArray(data.stopwords)) {
            setCustomStopWords(data.stopwords);
            setCustomIncludeWords([]);
          } else {
            setCustomStopWords(data.stopwords.stop || []);
            setCustomIncludeWords(data.stopwords.include || []);
          }
        }
      }).catch(err => addLog("⚠️ 단어 설정 DB 동기화 실패"));

      // 💡 마지막 체크포인트 로드 및 스크롤 이동
      fetch(`https://api.blankd.top/api/get-checkpoint?wallet_address=${safeAddress}&tab=craft`)
        .then(res => res.json())
        .then(data => {
            if(data.last_id) {
                const targetCat = safeCategories.find((c:any) => c.id === data.last_id);
                if(targetCat) {
                    const baseFolder = targetCat.folder_name.replace(' [완료]', '');
                    setOpenFolders(prev => ({...prev, [baseFolder]: true}));
                    setTimeout(() => {
                        itemRefs.current[data.last_id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 500);
                }
            }
        });
    }
  }, [safeAddress]);

  const saveWordsToDB = async (stops: string[], includes: string[]) => {
    try {
      await api.updateStopwords(safeAddress, { stop: stops, include: includes });
      addLog(`✅ 단어 설정 DB 동기화 완료`);
    } catch(e) { alert("DB 저장 실패"); }
  };

  const handleAddStopWord = () => {
    if (!newStopWord.trim()) return;
    const words = newStopWord.split(',').map(w => w.trim()).filter(w => w);
    const nextList = Array.from(new Set([...customStopWords, ...words]));
    setCustomStopWords(nextList);
    setNewStopWord("");
    saveWordsToDB(nextList, customIncludeWords);
  };

  const handleRemoveStopWord = (wordToRemove: string) => {
    const nextList = customStopWords.filter(w => w !== wordToRemove);
    setCustomStopWords(nextList);
    saveWordsToDB(nextList, customIncludeWords);
  };

  const handleAddIncludeWord = () => {
    if (!newIncludeWord.trim()) return;
    const words = newIncludeWord.split(',').map(w => w.trim()).filter(w => w);
    const nextList = Array.from(new Set([...customIncludeWords, ...words]));
    setCustomIncludeWords(nextList);
    setNewIncludeWord("");
    saveWordsToDB(customStopWords, nextList);
  };

  const handleRemoveIncludeWord = (wordToRemove: string) => {
    const nextList = customIncludeWords.filter(w => w !== wordToRemove);
    setCustomIncludeWords(nextList);
    saveWordsToDB(customStopWords, nextList);
  };

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

  const applyTextToState = (textBody: string) => {
    const initialWords = textBody.split(SPLIT_REGEX).filter(w => w !== "");
    setWordArray(initialWords.map(w => ({ text: w, subWords: [w] })));

    const initialSelected = new Set<number>();
    const currentCustomStopWords = customStopWords;
    const currentCustomIncludeWords = customIncludeWords;

    const wordRanges: {start: number, end: number, wordIdx: number}[] = [];
    let currentPos = 0;
    initialWords.forEach((w, idx) => {
       wordRanges.push({ start: currentPos, end: currentPos + w.length, wordIdx: idx });
       currentPos += w.length;
    });

    const fullText = initialWords.join("");
    const protectedIndices = new Set<number>();

    currentCustomIncludeWords.forEach(cw => {
       const trimmedCw = cw.trim();
       if (!trimmedCw) return;
       const regexStr = trimmedCw.split(/\s+/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
       const regex = new RegExp(regexStr, 'gi');
       
       let match;
       while ((match = regex.exec(fullText)) !== null) {
          const matchStart = match.index;
          const matchEnd = matchStart + match[0].length;
          wordRanges.forEach(wr => {
             if (wr.start < matchEnd && wr.end > matchStart) {
                protectedIndices.add(wr.wordIdx);
             }
          });
       }
    });

    initialWords.forEach((word, idx) => {
      const trimmed = word.trim();
      if (protectedIndices.has(idx)) {
         if (trimmed.length > 0) initialSelected.add(idx);
         return;
      }

      const isSymbolOnly = !/[a-zA-Z0-9가-힣]/.test(trimmed) && trimmed !== "";
      const isArticleOrNum = /^(?:법\s*)?제\s*\d+\s*(?:편|장|절|관|조)(?:의\s*\d+)?/.test(trimmed) || 
                             /^\(?\d+(?:항|호|목)?\)?$/.test(trimmed) || 
                             /^\(?(?:①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩|⑪|⑫|⑬|⑭|⑮)\)?$/.test(trimmed);
                             
      const isStopWord = /^(은|는|이|가|을|를|의|에|에게|에서|로|으로|과|와|도|만|부터|까지|조차|마저|치고|및|등|또는|수|할|이하|이상|초과|미만|관한|대한|관하여|대하여|한다|된다|있다|없다|아니한다|하여야|그|이|저|법|영|규칙|따라|따른|의해|의하여|바|것|자|경우|때|중)$/.test(trimmed);
      
      const isCustomSingleStopWord = currentCustomStopWords.some(cw => trimmed === cw || trimmed === cw + "." || trimmed === cw + ",");
      
      if (!isSymbolOnly && !isArticleOrNum && !isStopWord && !isCustomSingleStopWord && trimmed.length > 0) {
        initialSelected.add(idx);
      }
    });

    const patternsToExclude: RegExp[] = [
      /(?:법\s*)?제\s*\d+\s*(?:편|장|절|관|조|항|호|목)(?:\s*(?:의\s*\d+)?)(?:\s*제\s*\d+\s*(?:편|장|절|관|조|항|호|목)(?:\s*(?:의\s*\d+)?))+/g
    ];

    currentCustomStopWords.forEach(cw => {
       const trimmedCw = cw.trim();
       if (!trimmedCw) return;
       const regexStr = trimmedCw.split(/\s+/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
       patternsToExclude.push(new RegExp(regexStr, 'g'));
    });

    patternsToExclude.forEach(regex => {
       let match;
       while ((match = regex.exec(fullText)) !== null) {
          const matchStart = match.index;
          const matchEnd = matchStart + match[0].length;
          wordRanges.forEach(wr => {
             if (wr.start < matchEnd && wr.end > matchStart) {
                if (!protectedIndices.has(wr.wordIdx)) {
                    initialSelected.delete(wr.wordIdx);
                }
             }
          });
       }
    });
    setSelectedWords(initialSelected);
  };

  const openCategory = (targetCat: any) => {
    if (isSelectMode) { 
        const next = new Set(checkedIds);
        if (next.has(targetCat.id)) next.delete(targetCat.id); else next.add(targetCat.id);
        setCheckedIds(next);
        if (next.size === 0) setIsSelectMode(false);
        return; 
    }
    setExpandedId(targetCat.id);
    setPageBreaks(new Set());
    setMemoInput(targetCat.memo || "");
    setIsEraserMode(false);
    
    const { body } = formatCardText(targetCat.content || targetCat.title || "");
    setIsEditingText(false);
    setEditingContent(body);
    applyTextToState(body);

    // 💡 열람 시 체크포인트 저장
    fetch(`https://api.blankd.top/api/save-checkpoint`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({wallet_address: safeAddress, tab: 'craft', last_id: targetCat.id})
    });
  };

  // 💡 폴더의 모든 조항이 완료 상태인지 확인하는 함수
  const isFolderFullyCompleted = (folderName: string) => {
    const catsInFolder = safeCategories.filter((c:any) => c.folder_name === folderName || c.folder_name === `${folderName} [완료]`);
    if(catsInFolder.length === 0) return false;
    return catsInFolder.every((c:any) => c.folder_name.endsWith('[완료]'));
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in w-full">
      {/* 상단 컨트롤 바 생략 (기존과 동일) */}
      
      <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-4 sm:mb-6">
        {craftFolders.map((f: string) => {
          const isCompleted = isFolderFullyCompleted(f);
          return (
            <div key={f} className="relative group flex items-center">
              <button 
                onClick={() => handleToggleFolder(f)} 
                disabled={isCompleted} // 폴더 전체 완료 시 비활성화
                className={`pl-2.5 pr-14 py-1.5 sm:py-2 text-[10px] sm:text-[12px] font-bold border rounded-sm transition-all 
                  ${isCompleted ? 'bg-gray-800 text-gray-500 border-gray-700 opacity-50 cursor-not-allowed' :
                    openFolders[f] ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm' : 'bg-indigo-900/40 text-indigo-300 border-indigo-500/30'}`}
              >
                📁 {f} {isCompleted && "✓"}
              </button>
            </div>
          );
        })}
      </div>
      
      {craftFolders.map((baseFolder: string) => openFolders[baseFolder] && !isFolderFullyCompleted(baseFolder) && (
        <div key={baseFolder} className="mb-6 sm:mb-8 border-l border-white/5 pl-3 sm:pl-4">
          <div className="text-xs sm:text-sm text-white/50 mb-2 sm:mb-3 border-b border-white/10 pb-1.5 sm:pb-2 font-bold">{baseFolder}</div>

          <div className={`grid grid-cols-1 ${getGridClass(colCount)} gap-3 sm:gap-4 items-start`}>
            {/* 정렬 로직 적용: id 또는 조문 번호 순으로 정렬 가능 */}
            {safeCategories.filter((c:any) => c.folder_name === baseFolder || c.folder_name === `${baseFolder} [완료]`).sort((a:any, b:any) => a.id - b.id).map((cat: any) => {
                const isExpanded = expandedId === cat.id;
                const isChecked = checkedIds.has(cat.id);
                const isCompletedCat = cat.folder_name.endsWith('[완료]');
                const contentToUse = cat.content || cat.title || "";
                
                let colClass = ""; 
                // 💡 완료된 카드는 무조건 회색 처리
                let titleColor = isCompletedCat ? "text-gray-500" : "text-amber-400"; 
                if (!isCompletedCat) {
                    const checkText = `${cat.title || ''} ${cat.content || ''}`;
                    if (checkText.includes('[법]')) titleColor = "text-red-500";
                    else if (checkText.includes('[령]')) titleColor = "text-blue-400";
                    else if (checkText.includes('[칙]') || checkText.includes('[규]')) titleColor = "text-green-500";
                }
                
                if (isExpanded) colClass = "col-span-full";
                const cleanTitle = getStrictTitleOnly(contentToUse);

                return (
                  <div key={cat.id} ref={el => itemRefs.current[cat.id] = el} className={`relative transition-all w-full ${colClass}`}>
                    {!isExpanded ? (
                      <div className="relative group/card w-full flex items-center gap-2">
                        <button 
                          onClick={() => { if(!isCompletedCat) openCategory(cat); }} 
                          disabled={isCompletedCat}
                          className={`flex-1 min-h-[60px] p-3 sm:p-4 border rounded-sm transition-colors flex flex-col gap-1.5 sm:gap-2 text-left relative pr-10 
                            ${isCompletedCat ? 'bg-gray-900/40 border-gray-800 opacity-50 cursor-not-allowed' : 'bg-indigo-900/20 hover:bg-indigo-900/40 border-indigo-500/30'}`}
                        >
                          <span className={`${titleColor} font-bold text-[11px] sm:text-[13px] leading-snug break-keep`}>{cleanTitle} {isCompletedCat && "(완료됨)"}</span>
                        </button>
                      </div>
                    ) : (
                      // 확장된 뷰 (기존 코드와 동일)
                      <div className="w-full p-4 sm:p-6 bg-[#0a0a0c] border border-indigo-500/50 rounded-sm space-y-3 shadow-xl z-20 relative">
                         {/* ... 텍스트 편집기 및 빈칸 지정 UI (이전 제공 코드와 동일) ... */}
                         <button 
                          onClick={() => {
                            const currentCats = safeCategories.filter((c:any) => c.folder_name === baseFolder || c.folder_name === `${baseFolder} [완료]`).sort((a:any, b:any) => a.id - b.id);
                            const currentIdx = currentCats.findIndex(c => c.id === cat.id);
                            
                            // 다음 '완료되지 않은' 조항 찾기
                            let nextCat = null;
                            for(let i = currentIdx + 1; i < currentCats.length; i++) {
                                if(!currentCats[i].folder_name.endsWith('[완료]')) {
                                    nextCat = currentCats[i];
                                    break;
                                }
                            }
                            
                            handleMakeBlankCard(cat, wordArray.map(w => w.text), selectedWords, pageBreaks, memoInput, () => {
                                if (nextCat) openCategory(nextCat);
                                else setExpandedId(null);
                            });
                          }} 
                          className="w-full py-2.5 text-xs sm:text-sm font-bold rounded-sm mt-2 bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 transition-all"
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
