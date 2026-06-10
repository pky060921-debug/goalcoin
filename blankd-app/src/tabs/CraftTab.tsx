import React, { useState, useEffect } from 'react';
import { formatCardText, getStrictTitleOnly, SPLIT_REGEX, parseCardStats } from '../utils/constants';
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

export const CraftTab = ({ categories, savedCards, colCount, viewMode, useAiRecommend, safeAddress, handleMakeBlankCard, addLog, handleDeleteCategory, loadAllData, expandedId, setExpandedId, globalDict, saveGlobalDict, setCategories }: any) => {  
  const safeCategories = Array.isArray(categories) ? categories : [];
  
  const getDisplayTitle = (cat: any) => {
    try {
      const raw = cat.title || cat.content || "";
      const match = raw.match(/(제\s*\d+\s*조(?:\s*의\s*\d+)?)\s*\((.*?)\)/);
      if (match && match[2].trim() !== "내용") {
        return `${match[1].replace(/\s+/g, '')} ${match[2].trim()}`;
      }
      
      if (cat.content) {
        const bodyMatch = cat.content.match(/(제\s*\d+\s*조(?:\s*의\s*\d+)?)\s*\((.*?)\)/);
        if (bodyMatch && bodyMatch[2].trim() !== "내용") {
          return `${bodyMatch[1].replace(/\s+/g, '')} ${bodyMatch[2].trim()}`;
        }
      }

      const fallbackTitle = raw.split('\n')[0].replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').replace(/내용/g, '').trim();
      return fallbackTitle || "제목 없음";
    } catch (error) {
      console.error("[진단 오류] CraftTab 제목 추출 실패:", error, "데이터 원본:", cat);
      return "제목 추출 에러";
    }
  };

  const checkIsCreated = (cat: any) => {
    if (!Array.isArray(savedCards)) return false;
    return savedCards.some((c: any) => {
      if (!c || !c.content) return false;
      if (c.content.includes(`[[ORIG_ID:${cat.id}]]`)) return true;
      
      if (cat.title) {
        const cardFirstLine = c.content.split('\n')[0];
        const removeBrackets = (text: string) => text.replace(/\([^)]*\)|\[[^\]]*\]|<[^>]*>/g, '');
        const onlyChars = (text: string) => text.replace(/[^가-힣a-zA-Z0-9一-龥]/g, '');
        const cleanCardTitle = onlyChars(removeBrackets(cardFirstLine));
        const cleanCatTitle = onlyChars(removeBrackets(cat.title));
        
        if (cleanCardTitle && cleanCatTitle) {
          // 💡 오타 수정 완료: cleanCardTitle === cleanCatTitle 로 정상화
          if (cleanCardTitle === cleanCatTitle || cleanCardTitle.endsWith(cleanCatTitle)) {
             return true;
          }
        }
      }
      return false;
    });
  };
  
  const craftFolders = sortChapters(
    Array.from(new Set(safeCategories.map((c: any) => c.folder_name)))
      .filter(f => f && f !== '기본 폴더') as string[]
  );

  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>(() => {
    try { 
      const saved = localStorage.getItem('blankd_craft_folders'); 
      return saved ? JSON.parse(saved) : {}; 
    } catch(e) { return {}; }
  });

  const [wordArray, setWordArray] = useState<WordItem[]>([]);
  const [selectedWords, setSelectedWords] = useState<Set<number>>(new Set());
  const [pageBreaks, setPageBreaks] = useState<Set<number>>(new Set());
  const [memoInput, setMemoInput] = useState(""); 
  
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [editArticleText, setEditArticleText] = useState('');

  const handleSaveEditedText = async (catId: number) => {
    try {
      print("[Craft 진단] 원본 직접 타이핑 변경사항 디스크 동기화 유닛 진입. ID:", catId);
      
      // 💡 [버그 원인 교정 1] 무조건 괄호를 다 지우면 안 되고, 중복 겹침인 [[ ]] 만 단일 [ ] 로 실시간 완화 변환 처리합니다.
      const sanitizedSubmitText = editArticleText.replace(/\[+/g, '[').replace(/\]+/g, ']');

      const res = await fetch(`https://api.blankd.top/api/update-category-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          wallet_address: safeAddress, 
          id: catId, 
          content: sanitizedSubmitText 
        })
      });
      if (!res.ok) throw new Error("원본 수정 반영 실패");
      
      if (setCategories) {
        setCategories((prev: any[]) => prev.map(c => c.id === catId ? { ...c, content: sanitizedSubmitText } : c));
      }
      setEditingCatId(null);
      applyTextToState(sanitizedSubmitText);
    } catch (err) {
      console.error("[Craft 진단 오류] 저장 실패:", err);
      alert("서버 연결 불안정으로 원본 텍스트 수정에 실패했습니다.");
    }
  };

  useEffect(() => {
    if (expandedId) {
      const existingCard = savedCards.find((c: any) => c.content.includes(`[[ORIG_ID:${expandedId}]]`));
      if (existingCard) {
        const parsed = parseCardStats(existingCard.memo);
        setMemoInput(parsed.text);
      } else {
        const targetCat = safeCategories.find((c: any) => c.id === expandedId);
        setMemoInput(targetCat ? (targetCat.memo || "") : "");
      }
    }
  }, [expandedId, savedCards, safeCategories]);
  
  useEffect(() => {
    if (expandedId) {
      const targetCat = safeCategories.find((c: any) => c.id === expandedId);
      if (targetCat && targetCat.folder_name) {
        setOpenFolders((prev: any) => ({ ...prev, [targetCat.folder_name]: true }));
      }
      setTimeout(() => {
        const targetId = `category-${expandedId}`;
        const targetElement = document.getElementById(targetId);
        if (targetElement) {
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 500); 
    }
  }, [expandedId, safeCategories]);

  const [showStopWordsSettings, setShowStopWordsSettings] = useState(false);
  const [newStopWord, setNewStopWord] = useState("");
  const [newIncludeWord, setNewIncludeWord] = useState("");
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());

  const handleAddStopWord = () => {
    if (!newStopWord.trim()) return;
    const words = newStopWord.split(',').map(w => w.trim()).filter(w => w);
    const currentList = globalDict?.custom_stopwords || globalDict?.stopwords || [];
    const nextList = Array.from(new Set([...currentList, ...words]));
    saveGlobalDict({ ...globalDict, custom_stopwords: nextList, stopwords: nextList });
    setNewStopWord("");
  };

  const handleRemoveStopWord = (wordToRemove: string) => {
    const currentList = globalDict?.custom_stopwords || globalDict?.stopwords || [];
    const nextList = currentList.filter((w: string) => w !== wordToRemove);
    saveGlobalDict({ ...globalDict, custom_stopwords: nextList, stopwords: nextList });
  };

  const handleAddIncludeWord = () => {
    if (!newIncludeWord.trim()) return;
    const words = newIncludeWord.split(',').map(w => w.trim()).filter(w => w);
    const currentList = globalDict?.custom_inclusions || globalDict?.inclusions || [];
    const nextList = Array.from(new Set([...currentList, ...words]));
    saveGlobalDict({ ...globalDict, custom_inclusions: nextList, inclusions: nextList });
    setNewIncludeWord("");
  };

  const handleRemoveIncludeWord = (wordToRemove: string) => {
    const currentList = globalDict?.custom_inclusions || globalDict?.inclusions || [];
    const nextList = currentList.filter((w: string) => w !== wordToRemove);
    saveGlobalDict({ ...globalDict, custom_inclusions: nextList, inclusions: nextList });
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

  const createLongPressHandlers = (catId: number) => {
    let timer: any;
    const start = () => {
      timer = setTimeout(() => {
        if (!isSelectMode) {
          setIsSelectMode(true);
          setCheckedIds(new Set([catId]));
          addLog("📦 일괄 선택 모드가 활성화되었습니다.");
        }
      }, 700);
    };
    const clear = () => { clearTimeout(timer); };
    return {
      onTouchStart: start, onTouchEnd: clear,
      onMouseDown: start, onMouseUp: clear, onMouseLeave: clear,
      onContextMenu: (e: any) => { e.preventDefault(); }
    };
  };

  const handleToggleCheck = (catId: number) => {
    const next = new Set(checkedIds);
    if (next.has(catId)) next.delete(catId); else next.add(catId);
    setCheckedIds(next);
    if (next.size === 0) setIsSelectMode(false);
  };

  const handleBatchDelete = async () => {
    if (checkedIds.size === 0) return;
    if (window.confirm(`선택한 ${checkedIds.size}개의 조항을 일괄 삭제하시겠습니까?`)) {
      addLog(`🗑️ ${checkedIds.size}개 조항 일괄 삭제 시작...`);
      try {
        const deletePromises = Array.from(checkedIds).map(id =>
          fetch("https://api.blankd.top/api/delete-category", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ wallet_address: safeAddress, id })
          })
        );
        await Promise.all(deletePromises);
        addLog("✅ 일괄 삭제 완료 패킷 전송 성공.");
        setIsSelectMode(false);
        setCheckedIds(new Set());
        if (loadAllData) await loadAllData();
        else window.location.reload();
      } catch (e) { alert("일괄 삭제 중 오류가 발생했습니다."); }
    }
  };

  useEffect(() => {
    if (expandedId !== null) {
      localStorage.setItem('blankd_craft_expanded', expandedId.toString());
      const targetCat = safeCategories.find((c: any) => c.id === expandedId);
      if (targetCat) {
        openCategory(targetCat, true); 
      }
    } else {
      localStorage.removeItem('blankd_craft_expanded');
    }
  }, [expandedId, categories]);

  const applyTextToState = (textBody: string) => {
    const currentCustomStopWords = globalDict?.stopwords || globalDict?.custom_stopwords || [];
    const currentCustomIncludeWords = globalDict?.inclusions || globalDict?.custom_inclusions || [];
    
    // 💡 [버그 원인 교정 2] 기존 괄호 소거 로직을 비활성화하고 본문을 토큰 단위 분해 배열 구조로 안전하게 이관합니다.
    let processedText = textBody;
    
    if (currentCustomStopWords.length > 0) {
       const safeStops = currentCustomStopWords
          .map((w: string) => w.trim().replace(/[.*+?^${}()|[\]\\ packs]/g, '\\$&'))
          .filter((w: string) => w !== "");
       if (safeStops.length > 0) {
          const dynamicRegex = new RegExp(`([가-힣]+)(${safeStops.join('|')})([\\s,.)\\]]|$)`, 'g');
          processedText = processedText.replace(dynamicRegex, '$1 $2$3');
          processedText = processedText.replace(dynamicRegex, '$1 $2$3');
       }
    }

    // 💡 토큰 배열 분리 시 본문에 기지정된 대괄호 속 내용물 구조도 무너지지 않도록 동기화합니다.
    const initialWords = processedText.split(SPLIT_REGEX).filter(w => w !== "");
    let currentWordArray = initialWords.map(w => ({ text: w, subWords: [w] }));
    
    currentCustomIncludeWords.forEach((cw: string) => {
       const trimmedCw = cw.trim();
       if (!trimmedCw) return;
       const cwNoSpace = trimmedCw.replace(/\s+/g, ''); 

       let i = 0;
       while (i < currentWordArray.length) {
          let tempStr = "";
          let matchCount = 0;
 
          for (let j = i; j < currentWordArray.length; j++) {
             tempStr += currentWordArray[j].text.replace(/\s+/g, '');
             matchCount++;
             
             if (tempStr === cwNoSpace) {
                if (matchCount > 1) {
                   const mergedText = currentWordArray.slice(i, j + 1).map(w => w.text).join("");
                   const mergedSubWords = currentWordArray.slice(i, j + 1).flatMap(w => w.subWords);
                   currentWordArray.splice(i, matchCount, { text: mergedText, subWords: mergedSubWords });
                }
                break;
             } else if (tempStr.length > cwNoSpace.length) {
                break;
             }
          }
          i++;
       }
    });

    setWordArray(currentWordArray);

    const initialSelected = new Set<number>();
    const protectedIndices = new Set<number>();
    
    // 💡 사용자가 텍스트 수정을 통해 직접 [ ]로 감싸 놓은 토큰 영역을 감지하여 실시간 인터랙션 선택 상태(주황색 채우기)로 보존 복구합니다.
    currentWordArray.forEach((wordObj, idx) => {
        const trimmed = wordObj.text.trim();
        const isUserPreBracketed = trimmed.startsWith('[') && trimmed.endsWith(']');
        
        if (isUserPreBracketed) {
          // 상태 구조물 동기화를 위해 단어 내부 알맹이 텍스트 형태로 수복하고 선택 인덱스로 밀어 넣습니다.
          wordObj.text = trimmed.slice(1, -1);
          initialSelected.add(idx);
          protectedIndices.add(idx);
        } else if (currentCustomIncludeWords.some((cw: string) => trimmed.replace(/\s+/g, '') === cw.replace(/\s+/g, ''))) {
            protectedIndices.add(idx);
            initialSelected.add(idx);
        }
    });
    
    currentWordArray.forEach((wordObj, idx) => {
      if (protectedIndices.has(idx)) return;

      const trimmed = wordObj.text.trim();
      const isSymbolOnly = !/[a-zA-Z0-9가-힣]/.test(trimmed) && trimmed !== "";
      const isArticleOrNum = /^(?:법\s*)?제\s*\d+\s*(?:편|장|절|관|조)(?:의\s*\d+)?/.test(trimmed) || 
                             /^\(?\d+(?:항|호|목)?\)?$/.test(trimmed) || 
                             /^\(?(?:①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩|⑪|⑫|⑬|⑭|⑮)\)?$/.test(trimmed);
                             
      const isStopWord = /^(은|는|이|가|을|를|의|에|에게|에서|로|으로|과|와|도|만|부터|까지|조차|마저|치고|및|등|또는|수|할|이하|이상|초과|미만|관한|대한|관하여|대하여|한다|된다|있다|없다|아니한다|하여야|그|이|저|법|영|규칙|따라|따른|의해|의하여|바|것|자|경우|때|중)$/.test(trimmed);
      const isCustomSingleStopWord = currentCustomStopWords.some((cw: string) => trimmed === cw || trimmed === cw + "." || trimmed === cw + ",");
      
      if (!isSymbolOnly && !isArticleOrNum && !isStopWord && !isCustomSingleStopWord && trimmed.length > 0) {
        initialSelected.add(idx);
      }
    });

    const fullText = currentWordArray.map(w => w.text).join("");
    const wordRanges: {start: number, end: number, wordIdx: number}[] = [];
    let currentPos = 0;
    
    currentWordArray.forEach((w, idx) => {
       wordRanges.push({ start: currentPos, end: currentPos + w.text.length, wordIdx: idx });
       currentPos += w.text.length;
    });
    
    const patternsToExclude: RegExp[] = [
      /(?:법\s*)?제\s*\d+\s*(?:편|장|절|관|조|항|호|목)(?:\s*(?:의\s*\d+)?)( Lifespan)?(?:\s*제\s*\d+\s*(?:편|장|절|관|조|항|호|목)(?:\s*(?:의\s*\d+)?))+/g
    ];
    
    currentCustomStopWords.forEach((cw: string) => {
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

  useEffect(() => {
    if (expandedId !== null && editingCatId === null) {
      const targetCat = safeCategories.find((c: any) => c.id === expandedId);
      if (targetCat) {
        const { body } = formatCardText(targetCat.content || targetCat.title || "");
        applyTextToState(body);
      }
    }
  }, [globalDict, expandedId, safeCategories, editingCatId]);

  const openCategory = (targetCat: any, bypassToggle = false) => {
    if (isSelectMode) { 
        handleToggleCheck(targetCat.id);
        return; 
    }
    if (!bypassToggle) setExpandedId(targetCat.id);
    
    const existingCard = savedCards.find((c: any) => c.content.includes(`[[ORIG_ID:${targetCat.id}]]`));
    
    setPageBreaks(new Set());
    if (existingCard) {
      const parsed = parseCardStats(existingCard.memo);
      setMemoInput(parsed.text);
    } else {
      setMemoInput(targetCat.memo || "");
    }
    
    setEditingCatId(null);
    const { body } = formatCardText(targetCat.content || targetCat.title || "");
    applyTextToState(body);
  };

  const handleWordClick = (idx: number) => {
    const s = new Set(selectedWords);
    if(s.has(idx)) s.delete(idx); else s.add(idx);
    setSelectedWords(s);
  };

  const handleWordSplit = (idx: number, e: any) => {
    e.preventDefault();
    const p = new Set(pageBreaks);
    if (p.has(idx)) p.delete(idx); else if (window.confirm("이 위치에서 페이지를 나누시겠습니까?")) p.add(idx);
    setPageBreaks(p);
  };

  const handleWordMerge = (idx: number) => {
    const current = wordArray[idx];
    if (current.subWords.length > 1) {
      const newArray = [...wordArray];
      const splitItems = current.subWords.map(w => ({ text: w, subWords: [w] }));
      newArray.splice(idx, 1, ...splitItems);
      setWordArray(newArray);
      
      const shiftAmount = splitItems.length - 1;
      const newSelected = new Set<number>();
      selectedWords.forEach(i => { if (i < idx) newSelected.add(i); else if (i > idx) newSelected.add(i + shiftAmount); });
      if (selectedWords.has(idx)) { for(let k = 0; k <= shiftAmount; k++) newSelected.add(idx + k); }
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
    selectedWords.forEach(i => { if (i < idx) newSelected.add(i); else if (i > idx) newSelected.add(i - 1); });
    if (selectedWords.has(idx) || selectedWords.has(idx + 1)) newSelected.add(idx);
    setSelectedWords(newSelected);

    const newPageBreaks = new Set<number>();
    pageBreaks.forEach(i => { if (i < idx) newPageBreaks.add(i); else if (i > idx) newPageBreaks.add(i - 1); });
    setPageBreaks(newPageBreaks);
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in w-full">
      <div className="flex gap-2 mb-2 sm:mb-4 justify-end">
        {isSelectMode && (
          <div className="flex gap-1 animate-in fade-in zoom-in-95">
            <button onClick={handleBatchDelete} className="px-3 sm:px-4 bg-red-600/20 border border-red-500 text-red-400 text-[10px] sm:text-xs font-bold rounded-sm hover:bg-red-600/40 transition-colors">🗑️ 일괄삭제 ({checkedIds.size})</button>
            <button onClick={() => { setIsSelectMode(false); setCheckedIds(new Set()); }} className="px-2 border border-white/10 text-white/40 text-[10px] sm:text-xs rounded-sm hover:bg-white/5">취소</button>
          </div>
        )}
      </div>

      {showStopWordsSettings && (
        <div className="p-4 sm:p-5 bg-[#0a0a0c] border border-amber-500/30 rounded-sm mb-6 flex flex-col sm:flex-row gap-6 animate-in slide-in-from-top-2">
          <div className="flex-1">
            <div className="text-xs sm:text-sm text-amber-400 font-bold mb-3">❌ 제외 단어 (빈칸 X)</div>
            <div className="flex gap-2 mb-3">
              <input type="text" value={newStopWord} onChange={(e) => setNewStopWord(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAddStopWord(); }} placeholder="예: 각 호의 외의 부분 (쉼표로 구분)" className="flex-1 bg-black/50 border border-white/20 p-2 text-xs text-white/80 outline-none rounded-sm focus:border-amber-400/50" />
              <button onClick={handleAddStopWord} className="px-4 bg-amber-600/20 text-amber-400 border border-amber-500/30 text-xs font-bold rounded-sm hover:bg-amber-600/40 transition-colors">추가</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
                {(globalDict?.custom_stopwords || globalDict?.stopwords || []).map((word: string) => (
                  <span key={word} className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[10px] sm:text-[11px] text-white/70 flex items-center gap-1.5">
                    {word} <button onClick={() => handleRemoveStopWord(word)} className="text-white/30 hover:text-red-400">✕</button>
                  </span>
                ))}
            </div>
          </div>
          <div className="hidden sm:block w-px bg-white/10 mx-2"></div>
          <div className="sm:hidden h-px w-full bg-white/10 my-2"></div>
          <div className="flex-1">
            <div className="text-xs sm:text-sm text-teal-400 font-bold mb-3">✅ 필수 포함 단어 (무조건 빈칸 O)</div>
            <div className="flex gap-2 mb-3">
              <input type="text" value={newIncludeWord} onChange={(e) => setNewIncludeWord(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAddIncludeWord(); }} placeholder="예: 또는, 및, 할 수 있다 (쉼표로 구분)" className="flex-1 bg-black/50 border border-white/20 p-2 text-xs text-white/80 outline-none rounded-sm focus:border-teal-400/50" />
              <button onClick={handleAddIncludeWord} className="px-4 bg-teal-600/20 text-teal-400 border border-teal-500/30 text-xs font-bold rounded-sm hover:bg-teal-600/40 transition-colors">추가</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
                {(globalDict?.custom_inclusions || globalDict?.inclusions || []).map((word: string) => (
                  <span key={word} className="px-2 py-1 bg-teal-900/30 border border-teal-500/30 rounded text-[10px] sm:text-[11px] text-teal-300 flex items-center gap-1.5">
                    {word} <button onClick={() => handleRemoveIncludeWord(word)} className="text-teal-500/50 hover:text-teal-300">✕</button>
                  </span>
                ))}
              </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-4 sm:mb-6">
        {craftFolders.map((f: string) => (
          <div key={f} className="relative group flex items-center">
            <button onClick={() => handleToggleFolder(f)} className={`pl-2.5 pr-14 py-1.5 sm:py-2 text-[10px] sm:text-[12px] font-bold border rounded-sm transition-all ${openFolders[f] ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm' : 'bg-indigo-900/40 text-indigo-300 border-indigo-500/30'}`}>
              📁 {f}
            </button>
            <button onClick={async (e) => { e.stopPropagation(); const newName = prompt(`'${f}' 폴더의 새로운 이름을 입력하세요:`, f); if(newName && newName.trim() !== "" && newName !== f) { try { await api.renameFolder(safeAddress, f, newName.trim()); addLog(`✏️ 폴더명 변경 완료.`); window.location.reload(); } catch (err) { alert("변경 실패"); } } }} className="absolute right-6 top-1/2 -translate-y-1/2 text-white/30 hover:text-blue-400 px-1.5 py-1 text-[10px] transition-colors">✏️</button>
            <button onClick={async (e) => { e.stopPropagation(); if(confirm(`'${f}' 폴더를 모두 삭제하시겠습니까?`)) { try { await api.deleteFolder(safeAddress, f); addLog(`🗑️ 삭제 완료`); window.location.reload(); } catch (err) { alert("삭제 실패"); } } }} className="absolute right-1 top-1/2 -translate-y-1/2 text-white/30 hover:text-red-400 px-1.5 py-1 text-[10px] transition-colors">✕</button>
          </div>
        ))}
      </div>
      
      <div className="overflow-y-auto max-h-[60vh] custom-scrollbar pr-2 pb-10">      
        {craftFolders.map((folder: string) => {
          const isChapterFolder = /^제\s*\d+\s*장/.test(folder);
          return openFolders[folder] && (
            <div key={folder} className={`mb-6 sm:mb-8 border-l rounded-l-sm pl-3 sm:pl-4 transition-all ${isChapterFolder ? 'border-blue-500/50' : 'border-white/5'}`}>
              <div className={`text-xs sm:text-sm mb-2 sm:mb-3 border-b pb-1.5 sm:pb-2 font-bold transition-all ${isChapterFolder ? 'text-blue-400 border-blue-500/30' : 'text-white/50 border-white/10'}`}>
                {folder}
              </div>

              <div className={`grid grid-cols-1 ${getGridClass(colCount)} gap-3 sm:gap-4 items-start`}>
                {safeCategories.filter((c:any) => c.folder_name === folder).sort((a:any, b:any) => a.id - b.id).map((cat: any) => {
                    const isExpanded = expandedId === cat.id;
                    const isChecked = checkedIds.has(cat.id);
                    const isCreated = checkIsCreated(cat);
                    const displayTitle = getDisplayTitle(cat);
                    
                    let colClass = ""; 
                    let titleColor = "text-amber-400";
                    const checkText = `${cat.title || ''} ${cat.content || ''}`;
                    if (checkText.includes('[법]')) titleColor = "text-red-500";
                    else if (checkText.includes('[령]')) titleColor = "text-blue-400";
                    else if (checkText.includes('[칙]') || checkText.includes('[규]')) titleColor = "text-green-500";
                    
                    if (isExpanded) colClass = "col-span-full";
                    
                    return (
                      <div 
                        key={cat.id} 
                        id={`category-${cat.id}`}
                        className={`relative transition-all w-full ${colClass}`}
                      >
                        {!isExpanded ? (
                          <div className="relative group/card w-full flex items-center gap-2">
                             {isSelectMode && (
                               <input type="checkbox" checked={isChecked} onChange={() => handleToggleCheck(cat.id)} className="w-4 h-4 rounded border-white/20 bg-black accent-amber-500 cursor-pointer shrink-0 transition-all"/>
                            )}
                            <button 
                              {...createLongPressHandlers(cat.id)}
                              onClick={() => openCategory(cat)} 
                              className={`flex-1 min-h-[60px] p-3 sm:p-4 border rounded-sm transition-colors flex flex-col gap-1.5 sm:gap-2 text-left relative pr-10 ${
                                isChecked ? 'border-amber-500/50 bg-amber-950/10' : 
                                isCreated ? 'border-white/5 bg-black/40 hover:bg-white/5' : 
                                'border-indigo-500/30 bg-indigo-900/20 hover:bg-indigo-900/40'
                              }`}
                            >
                              <div className="flex justify-between items-center w-full">
                                <span className={`${isCreated ? 'text-white/30 font-medium' : `${titleColor} font-bold`} text-[11px] sm:text-[13px] leading-snug break-keep`}>{displayTitle}</span>
                                {isCreated && <span className="text-[9px] bg-white/5 text-white/30 px-1.5 py-0.5 rounded ml-2 whitespace-nowrap border border-white/10">제작됨</span>}
                              </div>
                              {cat.memo && <div className="text-[9px] sm:text-[11px] text-teal-300 bg-teal-900/20 p-1.5 sm:p-2 rounded border border-teal-500/20 w-full truncate">{cat.memo}</div>}
                              
                              {!isSelectMode && (
                                <span onClick={async (e) => { e.stopPropagation(); if (confirm(`'${displayTitle}' 조항을 대기열에서 즉시 삭제하시겠습니까?`)) { await handleDeleteCategory(cat.id); } }} className="absolute top-1/2 -translate-y-1/2 right-3 w-5 h-5 flex items-center justify-center border border-white/10 text-white/30 hover:text-red-400 hover:border-red-500/30 rounded-full text-[10px] bg-black/40 md:opacity-0 group-hover/card:opacity-100 transition-all duration-150 cursor-pointer" title="즉시 삭제">✕</span>
                              )}
                            </button>
                          </div>
                        ) : (
                           <div className="w-full p-4 sm:p-6 bg-[#0a0a0c] border border-indigo-500/50 rounded-sm space-y-3 shadow-xl z-20 relative animate-in zoom-in-95">
                              <div className="flex justify-between items-center mb-1 flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                 <span className={`${titleColor} font-bold text-[12px] sm:text-[14px] cursor-pointer`} onClick={() => setExpandedId(null)}>{displayTitle}</span>
                                 {isCreated && <span className="text-[10px] text-amber-500 font-bold ml-2">⚠️ 저장하면 카드를 덮어씁니다</span>}
                              </div>
                              
                              <div className="flex gap-2">
                                {editingCatId !== cat.id ? (
                                  <button 
                                    onClick={() => { 
                                      setEditingCatId(cat.id); 
                                      // 💡 직접 편집 시 기존의 대괄호 배치 형태를 훼손 없이 유지 공급하여 타이핑 수정을 시작하게 합니다.
                                      const editableRawText = cat.content || cat.title || "";
                                      setEditArticleText(editableRawText); 
                                    }} 
                                    className="px-3 py-1 text-[11px] font-bold rounded-sm border bg-white/5 border-white/20 text-white/50 hover:bg-white/10"
                                  >
                                    ✏️ 원본 텍스트 직접수정
                                  </button>
                                ) : (
                                  <>
                                    <button onClick={() => handleSaveEditedText(cat.id)} className="px-3 py-1 text-[11px] font-bold rounded-sm border bg-teal-900/60 border-teal-500/50 text-teal-300">
                                      💾 저장
                                    </button>
                                    <button onClick={() => setEditingCatId(null)} className="px-3 py-1 text-[11px] font-bold rounded-sm border bg-white/5 border-white/10 text-white/40">
                                      취소
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>

                            <input type="text" value={memoInput} onChange={(e) => setMemoInput(e.target.value)} placeholder="암기 메모 입력..." className="w-full bg-black/50 border border-teal-500/30 p-2 text-xs text-teal-200 outline-none rounded-sm" />
                            
                            {editingCatId === cat.id ? (
                              <div className="w-full relative mt-2 animate-in fade-in zoom-in-95">
                                <textarea value={editArticleText} onChange={(e) => setEditArticleText(e.target.value)} className="w-full h-48 bg-black border border-amber-500/50 p-4 text-amber-100 text-[13px] sm:text-[15px] leading-loose rounded outline-none resize-y custom-scrollbar" placeholder="수정할 원본 텍스트를 자유롭게 편집하세요..." />
                              </div>
                            ) : (
                              <div className="font-serif mt-2 text-[13px] sm:text-[15px] leading-loose text-white/80 p-4 bg-black/40 border border-white/10 max-h-72 overflow-y-auto rounded select-none touch-manipulation whitespace-pre-wrap break-keep custom-scrollbar relative transition-all">
                                {wordArray.map((wordObj, idx) => {
                                  const word = wordObj.text;
                                  const isSymbolOnly = !/[a-zA-Z0-9가-힣]/.test(word) && word.trim() !== "";
                                  const isMerged = wordObj.subWords.length > 1;
                                  const isSelected = selectedWords.has(idx);
                                  
                                  return (
                                    <React.Fragment key={idx}>
                                      {pageBreaks.has(idx) && <div className="w-full border-t border-red-500/50 my-2 relative"><span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-black px-1 text-[8px] text-red-400 font-bold uppercase tracking-tighter">Page Break</span></div>}
                                      <span onClick={() => { if (!isSymbolOnly) handleWordClick(idx); }} onContextMenu={(e) => handleWordSplit(idx, e)} onDoubleClick={() => { if (!isSymbolOnly || isMerged) handleWordMerge(idx); }} className={`px-[1px] rounded transition-colors ${isSelected ? 'bg-amber-500 text-black font-bold cursor-pointer' : isSymbolOnly ? 'text-white/30 cursor-default' : isMerged ? 'bg-indigo-900/30 border-b border-indigo-500/50 hover:bg-indigo-800/40 cursor-pointer' : 'hover:bg-white/10 cursor-pointer'}`} title={isSelected ? "클릭하여 빈칸에서 해제" : "클릭하여 빈칸으로 지정"}>
                                        {word}
                                      </span>
                                    </React.Fragment>
                                  );
                                })}
                              </div>
                            )}
                            
                            <button 
                              disabled={editingCatId === cat.id}
                              onClick={() => {
                                const folderCats = safeCategories.filter((c:any) => c.folder_name === cat.folder_name).sort((a:any, b:any) => a.id - b.id);
                                const currentIdx = folderCats.findIndex(c => c.id === cat.id);
                                const nextCat = folderCats[currentIdx + 1];
                                
                                handleMakeBlankCard(cat, wordArray.map(w => w.text), selectedWords, pageBreaks, memoInput, cat.id, () => {
                                    if (nextCat) {
                                        setExpandedId(nextCat.id);
                                    } else {
                                        setExpandedId(null);
                                    }
                                });
                              }} 
                              className={`w-full py-2.5 text-xs sm:text-sm font-bold rounded-sm mt-2 transition-all ${editingCatId === cat.id ? 'bg-white/5 text-white/30 border border-white/10 cursor-not-allowed' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30'}`}
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
    </div>
  );
};
