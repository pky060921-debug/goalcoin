import React, { useState, useEffect, Component, ReactNode, useRef, useMemo } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { useEnokiFlow, useZkLogin } from "@mysten/enoki/react";
import { api } from "./services/api";
import { SPLIT_REGEX, formatCardText, parseCardStats, stringifyCardStats, getStrictTitleOnly } from "./utils/constants";
import { CardModal } from "./components/CardModal";
import { DashboardTab } from "./tabs/DashboardTab";
import { CraftTab } from "./tabs/CraftTab";
import { EnhanceTab } from "./tabs/EnhanceTab";
import { ExamTab } from "./tabs/ExamTab";
import { MypageTab } from "./tabs/MypageTab";

// ── 인라인 빈칸 입력 컴포넌트 ─────────────────
const InlineBlankInput = React.memo(({ inputStatus, onSubmit, expected, abbrDict }: {
  inputStatus: string;
  onSubmit: (val: string) => void;
  expected: string; 
  abbrDict: Record<string, string>;
}) => {
  const [val, setVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  
  useEffect(() => { 
    if (inputStatus === 'correct' || inputStatus === 'idle') setVal(''); 
  }, [inputStatus]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setVal(newVal);

    const cleanInput = newVal.replace(/\s+/g, '').toLowerCase();
    const cleanExpected = expected.replace(/\s+/g, '').toLowerCase();
    let isMatch = (cleanInput === cleanExpected);

    if (!isMatch && abbrDict) {
      Object.entries(abbrDict).forEach(([k, v]) => {
        const strK = k.replace(/\s+/g, '').toLowerCase();
        const strV = v.replace(/\s+/g, '').toLowerCase();
        const orig = strK.length >= strV.length ? strK : strV;
        const short = strK.length < strV.length ? strK : strV;
        
        if (cleanExpected === orig && cleanInput === short) {
          isMatch = true;
        }
      });
    }

    if (isMatch) {
      onSubmit(newVal);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSubmit(val);
    }
  };
  
  return (
    <input
      ref={inputRef}
      value={val}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      className={`inline-block mx-1 px-1.5 py-0.5 text-center font-bold border-b-2 outline-none transition-all ${
        inputStatus === 'error' ? 'bg-red-900/40 text-red-300 border-red-500' :
        inputStatus === 'correct' ? 'bg-teal-900/40 text-teal-300 border-teal-500' :
        'bg-black/40 text-amber-300 border-amber-500/50 focus:border-amber-400'
      }`}
      style={{ width: `${Math.max(expected.length * 1.2, 3)}em` }}
      placeholder=""
    />
  );
}, (prevProps, nextProps) => {
  return prevProps.inputStatus === nextProps.inputStatus && prevProps.expected === nextProps.expected && prevProps.abbrDict === nextProps.abbrDict;
});

class ErrorBoundary extends Component<{children: ReactNode, fallbackLog: (msg: string) => void}, {hasError: boolean, errorMessage: string}> {
  constructor(props: any) { 
    super(props); 
    this.state = { hasError: false, errorMessage: "" }; 
  }
  static getDerivedStateFromError(error: any) { 
    return { hasError: true, errorMessage: error.message }; 
  }
  componentDidCatch(error: any, errorInfo: any) { 
    this.props.fallbackLog(`🚨 코어 엔진 가동 예외 핸들링: ${error.message}`); 
  }
  render() {
    if (this.state.hasError) return (
      <div className="p-6 text-red-400 font-mono border border-red-500/30 bg-red-900/10 rounded-sm shadow-xl">
        <h3 className="text-lg font-bold mb-2">🔥 시스템 코어 가동 오류 (자가 복구 활성화)</h3>
        <p className="text-sm opacity-80">{this.state.errorMessage}</p>
      </div>
    );
    return this.props.children;
  }
}

const pushToQueue = (type: 'MEMO' | 'ANSWER', payload: any) => {
  try {
    const qStr = localStorage.getItem('blankd_sync_queue');
    const q = qStr ? JSON.parse(qStr) : { memos: [], answers: [] };
    if (type === 'MEMO') {
      q.memos = q.memos.filter((m: any) => m.id !== payload.id); 
      q.memos.push(payload);
    } else if (type === 'ANSWER') {
      q.answers.push(payload);
    }
    localStorage.setItem('blankd_sync_queue', JSON.stringify(q));
  } catch (e) { 
    console.error("동기화 가상 큐 적재 실패:", e); 
  }
};

function MainApp() {
  const enokiFlow = useEnokiFlow();
  const zkLogin = useZkLogin();
  const suiWalletAccount = useCurrentAccount();
  const safeAddress = suiWalletAccount?.address || zkLogin?.address || "";
  const isLoggedIn = safeAddress.length > 0;

  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('blankd_active_tab') || 'progress';
  });

  useEffect(() => {
    localStorage.setItem('blankd_active_tab', activeTab);
  }, [activeTab]);

  const [categories, setCategories] = useState<any[]>([]);
  const [savedCards, setSavedCards] = useState<any[]>([]);
  const [activeCard, setActiveCard] = useState<any>(null);
  
  const [viewMode, setViewMode] = useState('all');
  const [colCount, setColCount] = useState(3);
  const [useAiRecommend, setUseAiRecommend] = useState(true);
  const [studyMode, setStudyMode] = useState('일반');
  
  const [theme, setTheme] = useState(() => localStorage.getItem('blankd_theme') || 'black');
  useEffect(() => { localStorage.setItem('blankd_theme', theme); }, [theme]);
  
  const [lawFile, setLawFile] = useState<File | null>(null);
  const [systemLogs, setSystemLogs] = useState<string[]>(["[System] 터미널 온라인. 환영합니다, 설계자님."]);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [isMemoOpen, setIsMemoOpen] = useState(false);
  const [blanks, setBlanks] = useState<{answer: string, correct: boolean}[]>([]);
  const [currentBlankIdx, setCurrentBlankIdx] = useState(0);
  const [inputStatus, setInputStatus] = useState<'idle'|'correct'|'wrong'>('idle');
  const [startTime, setStartTime] = useState<number>(0);
  const [elapsed, setElapsed] = useState<number>(0);
  const [totalTimeLimit, setTotalTimeLimit] = useState<number>(0);

  const [goalBalance, setGoalBalance] = useState<number>(0);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const [globalDict, setGlobalDict] = useState<{ stopwords: string[], inclusions: string[], abbrs: Record<string, string> }>({
    stopwords: [], inclusions: [], abbrs: {}
  });

  const [isDictModalOpen, setIsDictModalOpen] = useState(false);
  const [dictTab, setDictTab] = useState<'stop'|'include'|'abbr'>('abbr');
  const [tempKey, setTempKey] = useState("");
  const [tempValue, setTempValue] = useState("");

  const loadAllData = async () => {
    if (!safeAddress) return;
    try {
      const [catRes, cardRes, balance, dictRes] = await Promise.all([
        fetch(`https://api.blankd.top/api/get-categories?wallet_address=${safeAddress}&t=${Date.now()}`).then(r => r.json()),
        fetch(`https://api.blankd.top/api/my-cards?wallet_address=${safeAddress}&t=${Date.now()}`).then(r => r.json()),
        api.getGoalCoinBalance(safeAddress).catch(() => 0),
        api.getGlobalDict(safeAddress).catch((e) => {
          console.error("전역 단어장 로드 실패:", e);
          return { stopwords: [], inclusions: [], abbrs: {} };
        })
      ]);

      setCategories([...(catRes.categories || [])]);
      setSavedCards([...(cardRes.cards || [])]);
      setGoalBalance(balance);

      const serverStopwords = Array.isArray(dictRes.stopwords) ? dictRes.stopwords : [];
      const serverInclusions = Array.isArray(dictRes.inclusions) ? dictRes.inclusions : [];
      let finalAbbrs = (dictRes.abbrs && typeof dictRes.abbrs === 'object' && !Array.isArray(dictRes.abbrs)) ? dictRes.abbrs : {};

      setGlobalDict({
        stopwords: serverStopwords,
        inclusions: serverInclusions,
        abbrs: finalAbbrs
      });
    } catch (e: any) {
      console.error("데이터 동기화 실패:", e);
      addLog(`⚠️ 데이터 동기화 실패: ${e.message}`);
    }
  };

  const saveGlobalDict = async (newDict: any) => {
    setGlobalDict(newDict);
    try {
      await api.updateGlobalDict(safeAddress, newDict);
    } catch (err) {
      console.error("단어장 DB 동기화 실패:", err);
    }
  };

  useEffect(() => {
    if (!globalDict || !globalDict.abbrs) return;
    let currentInclusions = globalDict.inclusions || [];
    let changed = false;

    Object.entries(globalDict.abbrs).forEach(([k, v]) => {
      const strK = k as string;
      const strV = v as string;
      const orig = strK.length >= strV.length ? strK : strV;
      const short = strK.length < strV.length ? strK : strV;

      if (currentInclusions.includes(short)) {
        currentInclusions = currentInclusions.filter(w => w !== short);
        changed = true;
      }
      if (!currentInclusions.includes(orig)) {
        currentInclusions.push(orig);
        changed = true;
      }
    });

    if (changed) {
      saveGlobalDict({
        ...globalDict,
        inclusions: Array.from(new Set(currentInclusions))
      });
    }
  }, [globalDict.abbrs]);

  const statsRef = useRef({ text: "", filled: 0, wrongIndices: new Set<number>() });
  const isClosingRef = useRef(false);

  const [expandedId, setExpandedId] = useState<number | null>(() => {
    const saved = localStorage.getItem('blankd_craft_expanded');
    return saved ? parseInt(saved, 10) : null;
  });

  const addLog = (msg: string) => setSystemLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`].slice(-40));

  useEffect(() => { document.title = "BlankD | 인지 과학 기반 학습"; }, []);

  useEffect(() => {
    if (window.location.hash) {
      enokiFlow.handleAuthCallback().then(() => { 
        window.history.replaceState(null, '', window.location.pathname); 
        addLog("✅ 로그인 콜백 처리 완료"); 
      }).catch((err: any) => addLog(`🚨 인증 실패: ${err.message}`));
    }
    if (isLoggedIn) loadAllData();
  }, [isLoggedIn, safeAddress, enokiFlow]);

  const flushQueue = async () => {
    if (!safeAddress) return;
    try {
      const qStr = localStorage.getItem('blankd_sync_queue');
      if (!qStr) return;
      const q = JSON.parse(qStr);
      if (q.memos.length === 0 && q.answers.length === 0) return;

      const res = await fetch("https://api.blankd.top/api/sync-batch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: safeAddress, memos: q.memos, answers: q.answers })
      });

      if (res.ok) {
        localStorage.setItem('blankd_sync_queue', JSON.stringify({ memos: [], answers: [] }));
        addLog(`✅ 백그라운드 동기화 완료 (M:${q.memos.length}, A:${q.answers.length})`);
        const newBalance = await api.getGoalCoinBalance(safeAddress).catch(()=>goalBalance);
        setGoalBalance(newBalance);
      }
    } catch (e) { 
      addLog("⚠️ 오프라인 감지: 데이터는 로컬에 안전하게 보관 중입니다.");
    }
  };

  useEffect(() => {
    if (!safeAddress) return;
    const interval = setInterval(flushQueue, 30000); 
    const handleVisibility = () => { if(document.visibilityState === 'hidden') flushQueue(); };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', handleVisibility); };
  }, [safeAddress]);

  const uploadLaw = async () => {
    if (!lawFile) return alert("파일을 선택해주세요.");
    addLog("▶️ 법령 텍스트 분석 업로드 시작...");
    const fd = new FormData(); fd.append("file", lawFile); fd.append("wallet_address", safeAddress);
    const res = await fetch(`https://api.blankd.top/api/upload-pdf`, { method: "POST", body: fd });
    if (res.ok) { 
      setLawFile(null);
      addLog("✅ 업로드 완료. AI 아카이빙 중..."); 
      setTimeout(() => loadAllData(), 2500);
    }
  };

  const handleSplitCategory = async (cat: any, text1: string, text2: string, title1: string, title2: string) => {
    try {
        const res = await fetch("https://api.blankd.top/api/split-category", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ wallet_address: safeAddress, id: cat.id, text1, text2, title1, title2, folder_name: cat.folder_name })
        });
        if (res.ok) { 
          addLog(`✅ [${title1}] 분할 완료`); 
          await loadAllData();
        }
    } catch (e: any) { 
      addLog(`🚨 분할 처리 통신 에러`);
    }
  };

  // 💡 [치명적 누락 기능 완벽 복구] 여기서부터 누락되었던 핵심 저장 통신 모듈입니다.
  const handleMakeBlankCard = async (
    cat: any, wordsArray: string[], selectedIndices: Set<number>, pageBreaks: Set<number>, memo: string, cardId: any, onComplete: () => void
  ) => {
    let bodyContent = ""; let answerText = ""; let isBlanking = false;
    wordsArray.forEach((word, index) => {
      if (pageBreaks.has(index)) { bodyContent += " ##PAGE_BREAK## "; }
      if (selectedIndices.has(index)) {
        if (!isBlanking) { bodyContent += "[ "; isBlanking = true; }
        bodyContent += word; answerText += (answerText ? ", " : "") + word;
      } else { 
        if (isBlanking) { bodyContent += " ]"; isBlanking = false; } 
        bodyContent += word; 
      }
    });
    if (isBlanking) bodyContent += " ]";
    
    const existingCard = savedCards.find((c: any) => 
      c && c.content && (c.content.includes(`[[ORIG_ID:${cat.id}]]`) || c.content.trim().startsWith(cat.title.trim()))
    );
    const targetCardId = existingCard ? existingCard.id : null; 

    const rawContent = cat.content || cat.title || "";
    let firstLine = rawContent.split('\n')[0] || "";
    
    // 💡 [핵심 교정] DB 저장 직전, 제목에 [법][령][칙][규] 중 하나도 없다면 강제로 [법]을 주입합니다.
    if (!/^\[(법|령|칙|규)\]/.test(firstLine)) {
        firstLine = `[법] ${firstLine.trim()}`;
    }
    
    const finalCardContent = `${firstLine}\n${bodyContent.trim()}\n\n[[ORIG_ID:${cat.id}]]`;
    const initialMemo = stringifyCardStats(memo, 0, []);
    
    const res = await fetch("https://api.blankd.top/api/save-card", { 
      method: "POST", headers: { "Content-Type": "application/json" }, 
      body: JSON.stringify({ 
          wallet_address: safeAddress, card_id: targetCardId, card_content: finalCardContent, answer_text: answerText, folder_name: cat.folder_name, memo: initialMemo 
      }) 
    });
    
    if (res.ok) {
      localStorage.setItem('blankd_last_crafted_id', cat.id.toString());
      localStorage.setItem('blankd_last_crafted_title', cat.title);
      addLog(targetCardId ? "✅ 덮어쓰기 완료" : "✅ 신규 생성 완료");
      await loadAllData(); onComplete(); 
    }
  };

  const handleUpdateMemoBackground = (id: number, memo: string) => {
    setSavedCards(prev => prev.map(c => c.id === id ? { ...c, memo } : c));
    pushToQueue('MEMO', { id, memo });
  };

  useEffect(() => {
    if (activeCard) {
      isClosingRef.current = false;
      const cleanContent = activeCard.content.replace(/\s*\[\[ORIG_ID:\d+\]\]/g, '');
      const lines = cleanContent.split('\n');
      const restContent = lines.length > 1 ? lines.slice(1).join('\n').trim() : cleanContent;

      const foundBlanks: {answer: string, correct: boolean}[] = [];
      const parts = restContent.split(/(\[.*?\])/g);
      parts.forEach(part => {
        if (part.startsWith('[') && part.endsWith(']')) {
          foundBlanks.push({ answer: part.replace(/\[|\]/g, '').trim(), correct: false });
        }
      });
      
      const savedProgress = localStorage.getItem(`blankd_progress_${activeCard.id}`);
      const lastIdx = savedProgress ? parseInt(savedProgress, 10) : 0;
      const restoredBlanks = foundBlanks.map((b, i) => ({ ...b, correct: i < lastIdx }));

      setBlanks(restoredBlanks); setCurrentBlankIdx(lastIdx < foundBlanks.length ? lastIdx : 0); setInputStatus('idle');

      const stats = parseCardStats(activeCard.memo);
      const timePerBlank = Math.max(3.0, 10.0 - (stats.filled * 0.5));
      setTotalTimeLimit(timePerBlank * foundBlanks.length); 
      setStartTime(Date.now()); setElapsed(0); setIsMemoOpen(false);

      let cleanText = stats.text;
      if (cleanText) { cleanText = cleanText.replace(/\(\s*\)\s*=>\s*x\(\s*null\s*\)/g, "").trim(); }
      statsRef.current = { text: cleanText, filled: stats.filled, wrongIndices: new Set(stats.wrongIndices) };
      const cleanTitle = getStrictTitleOnly(cleanContent);
      localStorage.setItem('blankd_last_enhanced_id', activeCard.id.toString());
      localStorage.setItem('blankd_last_enhanced_title', cleanTitle || "이름 없는 카드");
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null; recognitionRef.current.stop(); recognitionRef.current = null; setIsListening(false);
      }
    }
  }, [activeCard]);

  const finishCard = (customDays?: number) => {
    if (isClosingRef.current || !activeCard) return;
    isClosingRef.current = true;
    const currentId = activeCard.id; const currentFolder = activeCard.folder_name; const finalTime = elapsed;
    const wrongArr = Array.from(statsRef.current.wrongIndices);
    const newMemo = stringifyCardStats(statsRef.current.text, statsRef.current.filled, wrongArr);
    const isCorrect = wrongArr.length === 0;

    let daysInterval = customDays;
    if (daysInterval === undefined) {
      const wrongCount = wrongArr.length; const totalBlanks = blanks.length;
      let quality = 5;
      if (totalBlanks > 0 && wrongCount > 0) {
        const wrongRatio = wrongCount / totalBlanks;
        if (wrongRatio > 0.5) quality = 1; else if (wrongRatio > 0.2) quality = 2; else quality = 3;
      }
      let easiness = parseFloat(localStorage.getItem(`blankd_factor_${currentId}`) || "2.5");
      easiness = easiness + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
      if (easiness < 1.3) easiness = 1.3;
      localStorage.setItem(`blankd_factor_${currentId}`, easiness.toString());

      const currentRepetitions = statsRef.current.filled || 1;
      if (quality < 3) { daysInterval = 1; } 
      else {
        if (currentRepetitions === 1) daysInterval = 1;
        else if (currentRepetitions === 2) daysInterval = 4;
        else daysInterval = Math.ceil((currentRepetitions - 1) * easiness);
      }
    } else {
      let quality = 3;
      if (daysInterval === 1) quality = 1; else if (daysInterval === 4) quality = 2; else if (daysInterval >= 14) quality = 5;
      let easiness = parseFloat(localStorage.getItem(`blankd_factor_${currentId}`) || "2.5");
      easiness = easiness + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
      if (easiness < 1.3) easiness = 1.3;
      localStorage.setItem(`blankd_factor_${currentId}`, easiness.toString());
    }

    const nextReviewDate = new Date(); nextReviewDate.setDate(nextReviewDate.getDate() + daysInterval);

    const folderCards = savedCards.filter(c => c.folder_name === currentFolder).sort((a,b) => {
        const origIdA = parseInt((a.content.match(/\[\[ORIG_ID:(\d+)\]\]/) || [])[1] || a.id, 10);
        const origIdB = parseInt((b.content.match(/\[\[ORIG_ID:(\d+)\]\]/) || [])[1] || b.id, 10);
        return origIdA - origIdB;
    });
    const currentIdx = folderCards.findIndex(c => c.id === currentId);
    const nextCard = folderCards[currentIdx + 1] || null;

    localStorage.removeItem(`blankd_progress_${currentId}`);
    setActiveCard(nextCard);
    setSavedCards(prev => prev.map(c => c.id === currentId ? { ...c, memo: newMemo } : c));
    pushToQueue('MEMO', { id: currentId, memo: newMemo });
    pushToQueue('ANSWER', { card_id: currentId, is_correct: isCorrect, clear_time: finalTime, next_review: nextReviewDate.toISOString() });
    addLog(`✅ 학습 완료 (ID:${currentId}) | 다음 복습: ${daysInterval}일 후`);
    flushQueue();
  };

  const handleReviewSelect = (days: number) => { if (!activeCard) return; statsRef.current.filled += 1; finishCard(days); };

  const handleCloseModal = () => {
    if (isClosingRef.current || !activeCard) return;
    isClosingRef.current = true;
    const currentId = activeCard.id;
    const wrongArr = Array.from(statsRef.current.wrongIndices);
    const newMemo = stringifyCardStats(statsRef.current.text, statsRef.current.filled, wrongArr);
    setActiveCard(null);
    setSavedCards(prev => prev.map(c => c.id === currentId ? { ...c, memo: newMemo } : c));
    pushToQueue('MEMO', { id: currentId, memo: newMemo });
    flushQueue();
  };

  useEffect(() => {
    if (activeCard && currentBlankIdx < blanks.length) {
      const interval = setInterval(() => {
        const diff = (Date.now() - startTime) / 1000; setElapsed(diff);
        if (diff >= totalTimeLimit) { clearInterval(interval); alert("집중 시간 초과! 현재 기록을 저장합니다."); finishCard(); }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [activeCard, currentBlankIdx, blanks.length, startTime, totalTimeLimit]);

  const handleSequentialInput = (overrideInput?: string | any) => {
    if (inputStatus === 'correct' || inputStatus === 'wrong' || !blanks[currentBlankIdx]) return;
    const expected = blanks[currentBlankIdx].answer.replace(/\s+/g, '').toLowerCase();
    let actual = typeof overrideInput === 'string' ? overrideInput.replace(/\s+/g, '').toLowerCase() : '';
    let isCorrect = (expected === actual);

    if (!isCorrect && globalDict.abbrs) {
      Object.entries(globalDict.abbrs).forEach(([k, v]) => {
        const strK = k.replace(/\s+/g, '').toLowerCase();
        const strV = v.replace(/\s+/g, '').toLowerCase();
        const orig = strK.length >= strV.length ? strK : strV;
        const short = strK.length < strV.length ? strK : strV;
        if (expected === orig && actual === short) { isCorrect = true; }
      });
    }

    if (isCorrect) {
      setInputStatus('correct');
      setBlanks(prev => { const nb = [...prev]; if (nb[currentBlankIdx]) nb[currentBlankIdx].correct = true; return nb; });
      statsRef.current.wrongIndices.delete(currentBlankIdx);
      setTimeout(() => {
        setInputStatus('idle'); 
        setBlanks(currentBlanks => {
          if (currentBlankIdx + 1 < currentBlanks.length) {
            setCurrentBlankIdx(prevIdx => {
              const nextIdx = prevIdx + 1; localStorage.setItem(`blankd_progress_${activeCard.id}`, nextIdx.toString()); return nextIdx;
            });
          } else {
            localStorage.removeItem(`blankd_progress_${activeCard.id}`); statsRef.current.filled += 1; finishCard();
          }
          return currentBlanks;
        });
      }, 150);
    } else { 
      setInputStatus('wrong'); statsRef.current.wrongIndices.add(currentBlankIdx); setTimeout(() => setInputStatus('idle'), 500);
    }
  };
  
  const handleShowAnswer = () => {
    if (!blanks[currentBlankIdx]) return;
    setInputStatus('wrong'); statsRef.current.wrongIndices.add(currentBlankIdx);
    setBlanks(prev => { const nb = [...prev]; if (nb[currentBlankIdx]) nb[currentBlankIdx].correct = true; return nb; });
    setTimeout(() => {
      setInputStatus('idle');
      setBlanks(currentBlanks => {
        if (currentBlankIdx + 1 < currentBlanks.length) {
          setCurrentBlankIdx(prevIdx => { const nextIdx = prevIdx + 1; localStorage.setItem(`blankd_progress_${activeCard.id}`, nextIdx.toString()); return nextIdx; });
        } else {
          localStorage.removeItem(`blankd_progress_${activeCard.id}`); statsRef.current.filled += 1; finishCard();
        }
        return currentBlanks;
      });
    }, 800);
  };

  const toggleVoiceRecognition = () => {
    if (isListening) {
      setIsListening(false);
      if (recognitionRef.current) { recognitionRef.current.onend = null; recognitionRef.current.stop(); recognitionRef.current = null; }
      addLog("🎤 음성 인식 종료됨"); return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { alert("크롬 브라우저를 권장합니다."); return; }
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR'; recognition.interimResults = false; recognition.continuous = true; recognition.maxAlternatives = 1;
    recognition.onstart = () => { setIsListening(true); addLog("🎙️ 음성 인식 활성화됨 (계속 듣는 중...)"); };
    recognition.onresult = (event: any) => {
      const last = event.results.length - 1;
      const transcript = event.results[last][0].transcript;
      const cleanText = transcript.replace(/\s+/g, '').replace(/[.,!?]/g, '');
      addLog(`💬 인식: "${transcript}"`); setTimeout(() => handleSequentialInput(cleanText), 300);
    };
    recognition.onerror = (err: any) => { if (err.error !== 'no-speech') { setIsListening(false); recognitionRef.current = null; } };
    recognition.onend = () => { if (recognitionRef.current) { try { recognitionRef.current.start(); } catch(e) {} } else { setIsListening(false); } };
    recognitionRef.current = recognition; recognition.start();
  };

  const minFilledCount = savedCards.length > 0 ? Math.min(...savedCards.map((card: any) => parseCardStats(card.memo || "").filled || 0)) : 0;
  const passProbability = Math.min(minFilledCount * 2, 100);

  const { nextCatToCraft, nextStudyCard } = useMemo(() => {
    let craftTarget = null; let studyTarget = null;
    if (!isLoggedIn) return { nextCatToCraft: null, nextStudyCard: null };

    if (categories && categories.length > 0) {
      const craftedOrigIds = new Set(); const craftedTitles: string[] = [];
      const cleanText = (text: string) => text ? text.replace(/\([^)]*\)|\[[^\]]*\]|<[^>]*>/g, '').replace(/[^가-힣a-zA-Z0-9一-龥]/g, '') : "";
      savedCards.forEach((c: any) => {
        const match = c.content.match(/\[\[ORIG_ID:(\d+)\]\]/);
        if (match) craftedOrigIds.add(parseInt(match[1], 10));
        const firstLine = c.content.split('\n')[0];
        if (firstLine) craftedTitles.push(cleanText(firstLine));
      });
      const sortedCats = [...categories].sort((a: any, b: any) => a.id - b.id);
      craftTarget = sortedCats.find((cat: any) => {
        const cleanTitle = cleanText(cat.title || "");
        return !craftedOrigIds.has(cat.id) && !(cleanTitle && craftedTitles.some(t => t === cleanTitle || t.endsWith(cleanTitle)));
      });
    }

    if (savedCards && savedCards.length > 0) {
      const cardsWithStatus = savedCards.map(c => {
         const stats = parseCardStats(c.memo);
         const origId = parseInt((c.content.match(/\[\[ORIG_ID:(\d+)\]\]/) || [])[1] || c.id, 10);
         return { ...c, repetitions: stats.filled || 0, origId };
      }).sort((a, b) => a.origId - b.origId);
      const minReps = Math.min(...cardsWithStatus.map(c => c.repetitions));
      studyTarget = cardsWithStatus.find(c => c.repetitions === minReps) || cardsWithStatus[0];
    }
    return { nextCatToCraft: craftTarget, nextStudyCard: studyTarget };
  }, [isLoggedIn, categories, savedCards]);

  const renderContent = React.useCallback(() => {
    if (!activeCard) return null;
    const cleanContent = activeCard.content.replace(/\s*\[\[ORIG_ID:\d+\]\]/g, '');
    const lines = cleanContent.split('\n');
    const titleLine = lines[0] || '';
    const restContent = lines.length > 1 ? lines.slice(1).join('\n').trim() : cleanContent;

    // 💡 모의고사 뷰에서도 시각적으로 [법][령][칙] 기호를 감쪽같이 지워줌 (데이터상 정렬은 그대로 유지됨)
    let displayTitle = titleLine
      .replace(/\[법\]|\[령\]|\[칙\]|\[규\]/g, '')
      .replace(/\(\s*내용\s*\)/g, '')
      .replace(/내용/g, '')
      .trim();
    if (!displayTitle) displayTitle = "제목 없음";

    const parts = restContent.split(/(\[.*?\]|##PAGE_BREAK##)/g).filter(p => p !== '');
    let displayPage = 0; let tempGlobalBlank = 0; let tempPage = 0;
    for (let part of parts) {
        if (part === '##PAGE_BREAK##') tempPage++;
        else if (part.startsWith('[') && part.endsWith(']')) {
            if (tempGlobalBlank === currentBlankIdx) { displayPage = tempPage; break; }
            tempGlobalBlank++;
        }
    }

    let renderPage = 0; let bIdx = 0; const contentToRender: any[] = [];
    parts.forEach((part: string, i: number) => {
      if (part === '##PAGE_BREAK##') { renderPage++; return; }
      if (renderPage === displayPage) {
          if (part.startsWith('[') && part.endsWith(']')) {
            const isCorrect = blanks[bIdx]?.correct; 
            const isCurrent = bIdx === currentBlankIdx; 
            const isWrong = statsRef.current.wrongIndices.has(bIdx); 
            if (isCorrect) {
              contentToRender.push(
                <span key={i} className={`font-bold mx-1 px-1 rounded ${isWrong ? 'text-red-400 bg-red-900/20' : 'text-teal-400 bg-teal-900/20'}`}>{part.replace(/\[|\]/g, '')}</span>
              );
            } else if (isCurrent) {
              contentToRender.push(
                <InlineBlankInput key={`blank-${currentBlankIdx}`} inputStatus={inputStatus} expected={blanks[currentBlankIdx]?.answer || ""} abbrDict={globalDict.abbrs} onSubmit={handleSequentialInput}/>
              );
            } else {
              contentToRender.push(<span key={i} className="inline-block min-w-[50px] h-5 bg-white/5 border-b border-white/20 mx-1 align-middle rounded-sm"></span>);
            }
            bIdx++;
          } else { contentToRender.push(<span key={i}>{part}</span>); }
      } else if (part.startsWith('[') && part.endsWith(']')) { bIdx++; }
    });
    
    return (
      <div className="flex flex-col gap-6 w-full">
        <div className="flex justify-between items-center border-b border-white/10 pb-2">
            <span className="text-amber-400 font-bold text-[14px] leading-tight">{displayTitle}</span>
            <span className="text-[12px] text-white/40 font-mono bg-white/5 px-2 py-1 rounded shadow-sm">Page {displayPage + 1}</span>
        </div>
        <div className="whitespace-pre-wrap leading-relaxed text-[15px] font-serif break-keep min-h-[160px]">{contentToRender}</div>
        <div className="flex justify-between items-center w-full mb-2 gap-2 flex-wrap">
          <button onClick={() => setIsMemoOpen(!isMemoOpen)} className="px-3 py-1.5 bg-teal-900/30 text-teal-400 border border-teal-500/50 rounded-sm text-[11px] font-bold shrink-0 hover:bg-teal-900/50 transition-all shadow-md">
            {isMemoOpen ? '닫기 ✕' : '메모 열기'}
          </button>
          <button onClick={toggleVoiceRecognition} className={`flex-1 min-w-[120px] py-1.5 border rounded-sm text-[11px] font-bold transition-all shadow-md ${isListening ? 'bg-red-600/50 text-white border-red-500 animate-pulse' : 'bg-blue-900/30 text-blue-400 border-blue-500/50 hover:bg-blue-900/50'}`}>
            {isListening ? '음성 인식 끄기 (활성화됨)' : '음성으로 입력 (계속 켜두기)'}
          </button>
            <button id="show-answer-btn" onClick={handleShowAnswer} className="px-3 py-1.5 bg-red-900/30 text-red-400 border border-red-500/50 rounded-sm text-[11px] font-bold shrink-0 hover:bg-red-900/50 transition-all shadow-md">
              정답 보기 (오답 처리)
            </button>
        </div>
        {isMemoOpen && (
          <div className="pt-4 border-t border-white/10 w-full animate-in slide-in-from-top-2">
             <input defaultValue={statsRef.current.text || ""} placeholder="학습 인사이트 기록..." onBlur={(e) => { statsRef.current.text = e.target.value; handleUpdateMemoBackground(activeCard.id, stringifyCardStats(statsRef.current.text, statsRef.current.filled, Array.from(statsRef.current.wrongIndices))); }} className="text-[13px] text-teal-300 bg-teal-950/20 p-3 rounded border border-teal-500/30 w-full outline-none focus:border-teal-400 transition-all" autoFocus/>
          </div>
        )}
      </div>
    );
  }, [activeCard, blanks, currentBlankIdx, inputStatus, isMemoOpen, isListening, globalDict.abbrs]);

  const handleAddDictItem = () => {
    if (dictTab === 'abbr' && tempKey && tempValue) {
      const k = tempKey.trim(); const v = tempValue.trim();
      const orig = k.length >= v.length ? k : v; const short = k.length < v.length ? k : v;
      const currentInclusions = globalDict.inclusions || [];
      const nextInclusions = Array.from(new Set([...currentInclusions, orig]));
      const cleanedInclusions = nextInclusions.filter(w => w !== short);
      saveGlobalDict({ ...globalDict, abbrs: { ...globalDict.abbrs, [short]: orig }, inclusions: cleanedInclusions });
      setTempKey(""); setTempValue("");
    } else if (dictTab !== 'abbr' && tempKey) {
      const words = tempKey.split(',').map(w => w.trim()).filter(Boolean);
      const targetArray = dictTab === 'stop' ? globalDict.stopwords : globalDict.inclusions;
      saveGlobalDict({ ...globalDict, [dictTab === 'stop' ? 'stopwords' : 'inclusions']: Array.from(new Set([...targetArray, ...words])) });
      setTempKey("");
    }
  };

  const memoizedTabs = useMemo(() => {
    return (
      <>
        <div className={activeTab === 'progress' ? 'block' : 'hidden'}><DashboardTab categories={categories} savedCards={savedCards} setActiveTab={setActiveTab} setExpandedId={setExpandedId} setActiveCard={setActiveCard} /></div>
        <div className={activeTab === 'create' ? 'block' : 'hidden'}>
          <CraftTab categories={categories} savedCards={savedCards} colCount={colCount} viewMode={viewMode} useAiRecommend={useAiRecommend} safeAddress={safeAddress} lawFile={lawFile} setLawFile={setLawFile} uploadLaw={uploadLaw} handleMakeBlankCard={handleMakeBlankCard} handleSplitCategory={handleSplitCategory} addLog={addLog} expandedId={expandedId} setExpandedId={setExpandedId} handleDeleteCategory={async (id: number) => { if(confirm('삭제하시겠습니까?')){ await fetch("https://api.blankd.top/api/delete-category", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_address: safeAddress, id }) }); loadAllData(); } }} globalDict={globalDict} saveGlobalDict={saveGlobalDict} />
        </div>
        <div className={activeTab === 'enhance' ? 'block' : 'hidden'}>
          <EnhanceTab safeAddress={safeAddress} loadAllData={loadAllData} categories={categories} savedCards={savedCards} colCount={colCount} viewMode={viewMode} setActiveCard={setActiveCard} setActiveTab={setActiveTab} setExpandedId={setExpandedId} globalDict={globalDict} />
        </div>
        <div className={activeTab === 'exam' ? 'block' : 'hidden'}><ExamTab walletAddress={safeAddress} address={safeAddress} /></div>
        <div className={activeTab === 'settings' ? 'block' : 'hidden'}>
          <MypageTab safeAddress={safeAddress} enokiFlow={enokiFlow} zkLogin={zkLogin} useAiRecommend={useAiRecommend} setUseAiRecommend={setUseAiRecommend} studyMode={studyMode} setStudyMode={setStudyMode} globalDict={globalDict} saveGlobalDict={saveGlobalDict} loadAllData={loadAllData} theme={theme} setTheme={setTheme}/>
        </div>
      </>
    );
  }, [activeTab, categories, savedCards, colCount, viewMode, useAiRecommend, safeAddress, lawFile, expandedId, enokiFlow, zkLogin, studyMode, setStudyMode, globalDict, theme]);

  const renderDictionaryUI = (isMobile: boolean) => (
    <div className={`flex flex-col w-full h-full ${isMobile ? 'bg-[#0a0a0c] border border-white/10 p-5 sm:p-6 rounded-sm' : 'bg-[#08080a]/80 border border-white/10 p-5 rounded-sm shadow-xl backdrop-blur-sm'}`}>
      <div className="flex justify-between items-start mb-6">
        <div className="flex gap-4 border-b border-white/10 w-full pt-1">
          <button onClick={() => setDictTab('abbr')} className={`text-[11px] sm:text-[13px] font-bold tracking-wide transition-all px-1 pb-2 -mb-[1px] ${dictTab === 'abbr' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-white/40 hover:text-white/70'}`}>⚡ 스마트 약어</button>
          <button onClick={() => setDictTab('include')} className={`text-[11px] sm:text-[13px] font-bold tracking-wide transition-all px-1 pb-2 -mb-[1px] ${dictTab === 'include' ? 'text-teal-400 border-b-2 border-teal-400' : 'text-white/40 hover:text-white/70'}`}>✅ 필수 포함</button>
          <button onClick={() => setDictTab('stop')} className={`text-[11px] sm:text-[13px] font-bold tracking-wide transition-all px-1 pb-2 -mb-[1px] ${dictTab === 'stop' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-white/40 hover:text-white/70'}`}>❌ 제외 단어</button>
        </div>
        {isMobile && <button onClick={() => setIsDictModalOpen(false)} className="text-white/40 hover:text-white ml-6 text-lg font-bold">✕</button>}
      </div>
      
      <div className="flex gap-2 mb-5 shrink-0">
        <input type="text" value={tempKey} onChange={(e) => setTempKey(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAddDictItem(); }} placeholder={dictTab === 'abbr' ? "원래 정답 (예: 행정안전부장관)" : "단어 입력 (쉼표 구분)"} className="flex-1 bg-black/50 border border-white/30 transition-colors w-full min-w-0" />
        {dictTab === 'abbr' && (
          <input type="text" value={tempValue} onChange={(e) => setTempValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAddDictItem(); }} placeholder="약어 (예: 행안부장관)" className="flex-1 bg-black/50 border border-white/10 p-2 text-xs sm:text-sm text-white/80 outline-none rounded-sm focus:border-indigo-500/50 transition-colors w-full min-w-0" />
        )}
        <button onClick={handleAddDictItem} className="px-3 sm:px-4 bg-white/5 text-white/80 border border-white/10 text-xs font-bold rounded-sm hover:bg-white/10 transition-colors shrink-0">등록</button>
      </div>
      
      <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-2 min-h-[160px]">
        {dictTab === 'abbr' && Object.entries(globalDict.abbrs)
          .sort((a, b) => a[1].localeCompare(b[1], 'ko'))
          .map(([k, v]) => {
            const strK = k as string; const strV = v as string;
            const orig = strK.length >= strV.length ? strK : strV; const short = strK.length < strV.length ? strK : strV;
            return (
              <div key={k} className="flex justify-between items-center text-xs sm:text-sm border-b border-white/5 pb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="opacity-60">{orig}</span> <span className="text-white/30 text-[10px]">→</span> <span className="text-indigo-400 font-bold px-2 py-0.5 bg-indigo-900/20 rounded-sm border border-indigo-500/20">{short}</span> 
                </div>
                <button onClick={() => { const nw = {...globalDict.abbrs}; delete nw[k]; saveGlobalDict({...globalDict, abbrs: nw}); }} className="text-white/20 hover:text-red-400 text-xs px-2 transition-colors shrink-0">✕</button>
              </div>
            )
        })}
        {dictTab !== 'abbr' && (dictTab === 'stop' ? globalDict.stopwords : globalDict.inclusions)
          .sort((a, b) => a.localeCompare(b, 'ko'))
          .map((word: string) => (
            <div key={word} className="flex justify-between items-center text-xs sm:text-sm border-b border-white/5 pb-2">
              <span className={`px-2 py-0.5 rounded-sm border ${dictTab === 'stop' ? 'text-amber-400 bg-amber-900/10 border-amber-500/20' : 'text-teal-400 bg-teal-900/10 border-teal-500/20'}`}>{word}</span>
              <button onClick={() => {
                const targetArray = (dictTab === 'stop' ? globalDict.stopwords : globalDict.inclusions).filter((w: string) => w !== word);
                saveGlobalDict({ ...globalDict, [dictTab === 'stop' ? 'stopwords' : 'inclusions']: targetArray });
              }} className="text-white/20 hover:text-red-400 text-xs px-2 transition-colors">✕</button>
            </div>
        ))}
        {((dictTab === 'abbr' && Object.keys(globalDict.abbrs).length === 0) || (dictTab === 'stop' && globalDict.stopwords.length === 0) || (dictTab === 'include' && globalDict.inclusions.length === 0)) && (
          <div className="text-center py-8 text-white/20 text-[11px] sm:text-xs">등록된 단어가 없습니다.</div>
        )}
      </div>
    </div>
  );

  const getThemeCSS = () => {
    if (theme === 'white') {
      return `
        /* 1. 기본 배경 및 텍스트 베이스 */
        body { background-color: #f3f4f6; color: #111827; }
        .text-white { color: #111827 !important; }
        .text-white\\/20, .text-white\\/30 { color: #6b7280 !important; font-weight: 600; }
        .text-white\\/40, .text-white\\/50 { color: #4b5563 !important; font-weight: 600; }
        .text-white\\/60, .text-white\\/70 { color: #374151 !important; font-weight: 700; }
        .text-white\\/80 { color: #1f2937 !important; font-weight: 700; }
        .text-\\[\\#d1d1d1\\] { color: #111827 !important; font-weight: 700; }
        
        /* 2. 레이아웃 구조 박스 (모달, 카드 등) */
        .bg-\\[\\#08080a\\] { background-color: #ffffff !important; border-color: #d1d5db !important; }
        .bg-\\[\\#08080a\\]\\/80 { background-color: rgba(255, 255, 255, 0.95) !important; backdrop-filter: blur(8px); }
        .bg-\\[\\#0a0a0c\\] { background-color: #ffffff !important; box-shadow: 0 1px 4px rgba(0,0,0,0.05); border-color: #e5e7eb !important; }
        .bg-\\[\\#0d0d0f\\] { background-color: #f3f4f6 !important; }
        
        /* 3. 인풋 및 범용 반투명 배경 */
        .bg-black\\/30, .bg-black\\/40, .bg-black\\/50, .bg-black\\/60 { 
          background-color: #f9fafb !important; color: #111827 !important; border-color: #d1d5db !important; 
        }
        .bg-white\\/5, .bg-white\\/10 { 
          background-color: #f3f4f6 !important; border-color: #d1d5db !important; color: #111827 !important; 
        }
        
        /* 4. 범용 테두리 선명화 */
        .border-white\\/5, .border-white\\/10, .border-white\\/20, .border-white\\/30 { 
          border-color: #d1d5db !important; 
        }

        /* 🎨 5. 브랜드 컬러 강제 교정 (라이트 모드 맞춤형) 🎨 */
        .text-teal-300, .text-teal-400, .text-teal-500 { color: #0f766e !important; font-weight: 800 !important; }
        .bg-teal-900\\/20, .bg-teal-900\\/30, .bg-teal-900\\/40, .bg-teal-950\\/20, .bg-teal-500\\/10, .bg-teal-500\\/20 { 
          background-color: #ccfbf1 !important; border-color: #5eead4 !important; 
        }
        .border-teal-500\\/30, .border-teal-500\\/40, .border-teal-500\\/50 { border-color: #5eead4 !important; }

        .text-amber-300, .text-amber-400, .text-amber-500 { color: #b45309 !important; font-weight: 800 !important; }
        .bg-amber-900\\/20, .bg-amber-900\\/30, .bg-amber-900\\/40, .bg-amber-950\\/20, .bg-amber-500\\/10, .bg-amber-500\\/20 { 
          background-color: #fef3c7 !important; border-color: #fcd34d !important; 
        }
        .border-amber-500\\/30, .border-amber-500\\/40, .border-amber-500\\/50, .border-amber-900\\/30 { border-color: #fcd34d !important; }

        .text-indigo-300, .text-indigo-400, .text-indigo-500 { color: #4338ca !important; font-weight: 800 !important; }
        .bg-indigo-900\\/20, .bg-indigo-900\\/30, .bg-indigo-900\\/40 { 
          background-color: #e0e7ff !important; border-color: #c7d2fe !important; 
        }
        .border-indigo-500\\/30, .border-indigo-500\\/40, .border-indigo-500\\/50 { border-color: #c7d2fe !important; }

        .text-blue-300, .text-blue-400, .text-blue-500 { color: #1d4ed8 !important; font-weight: 800 !important; }
        .bg-blue-900\\/20, .bg-blue-900\\/30, .bg-blue-900\\/40, .bg-blue-500\\/10, .bg-blue-500\\/20 { 
          background-color: #dbeafe !important; border-color: #bfdbfe !important; 
        }
        .border-blue-500\\/30, .border-blue-500\\/40, .border-blue-500\\/50 { border-color: #bfdbfe !important; }

        .text-red-300, .text-red-400, .text-red-500 { color: #b91c1c !important; font-weight: 800 !important; }
        .bg-red-900\\/20, .bg-red-900\\/30, .bg-red-900\\/40, .bg-red-950\\/20, .bg-red-500\\/10, .bg-red-500\\/20 { 
          background-color: #fee2e2 !important; border-color: #fecaca !important; 
        }
        .border-red-500\\/30, .border-red-500\\/40, .border-red-500\\/50, .border-red-900\\/30 { border-color: #fecaca !important; }

        .text-green-300, .text-green-400, .text-green-500 { color: #15803d !important; font-weight: 800 !important; }
        .bg-green-900\\/20, .bg-green-900\\/30, .bg-green-900\\/40, .bg-green-500\\/10, .bg-green-500\\/20 { 
          background-color: #dcfce7 !important; border-color: #a7f3d0 !important; 
        }
        .border-green-500\\/30, .border-green-500\\/40, .border-green-500\\/50 { border-color: #a7f3d0 !important; }
      `;
    } else if (theme === 'green') {
      return `
        body { background-color: #163322; }
        .bg-\\[\\#08080a\\] { background-color: #0f2418 !important; }
        .bg-\\[\\#08080a\\]\\/80 { background-color: rgba(15, 36, 24, 0.9) !important; }
        .bg-\\[\\#0a0a0c\\] { background-color: #122b1c !important; }
        .bg-\\[\\#0d0d0f\\] { background-color: #163322 !important; }
      `;
    }
    return `body { background-color: #0d0d0f; }`; // Black Default
  };

  return (
    <div className="min-h-screen bg-[#0d0d0f] text-[#d1d1d1] p-4 sm:p-6 md:p-8 relative pb-24 font-sans text-pretty overflow-x-hidden transition-colors">
      <style>{getThemeCSS()}</style>
      <header className="border-b border-white/10 bg-[#08080a] px-4 py-2.5 sticky top-0 z-40 backdrop-blur-md w-full">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center justify-between w-full md:w-auto">
            <button onClick={() => { const lastTab = localStorage.getItem('blankd_active_tab') || 'progress'; setActiveTab(lastTab); }} className="text-xl sm:text-2xl font-bold tracking-widest text-current shrink-0 hover:text-teal-400 transition-colors">
              BlankD
            </button>
          </div>

          <div className="flex items-center justify-start md:justify-end gap-3 sm:gap-4 shrink-0 overflow-x-auto custom-scrollbar pb-1 md:pb-0 w-full md:w-auto">
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] sm:text-xs font-mono font-bold tracking-widest text-white/40 mr-1 uppercase hidden sm:inline">이어하기:</span>
              {nextCatToCraft ? (
                <button onClick={() => { setActiveTab('create'); setExpandedId(nextCatToCraft.id); }} className="bg-amber-900/30 border border-amber-500/40 px-2 sm:px-3 py-1 sm:py-1.5 rounded-sm flex items-center gap-1.5 hover:bg-amber-900/50 transition-all text-left max-w-[140px] sm:max-w-[200px]">
                  <span className="text-[9px] sm:text-[10px] text-amber-400 font-bold whitespace-nowrap">▶ 만들기</span><span className="text-[10px] sm:text-[11px] font-medium text-amber-100 truncate">{getStrictTitleOnly(nextCatToCraft.title) || "다음 조항"}</span>
                </button>
              ) : (<div className="text-[10px] sm:text-[11px] text-white/20 border border-white/5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-sm">만들기 완료</div>)}

              {nextStudyCard ? (
                <button onClick={() => { setActiveCard(nextStudyCard); }} className="bg-teal-900/30 border border-teal-500/40 px-2 sm:px-3 py-1 sm:py-1.5 rounded-sm flex items-center gap-1.5 hover:bg-teal-900/50 transition-all text-left max-w-[140px] sm:max-w-[200px]">
                  <span className="text-[9px] sm:text-[10px] text-teal-400 font-bold whitespace-nowrap">▶ 채우기</span><span className="text-[10px] sm:text-[11px] font-medium text-teal-100 truncate">{nextStudyCard.content.split('\n')[0].replace(/\(\s*내용\s*\)/g, '').replace(/내용/g, '').trim()}</span>
                </button>
              ) : (<div className="text-[10px] sm:text-[11px] text-white/20 border border-white/5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-sm">채우기 완료</div>)}
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-1 sm:ml-2 border-l border-white/10 pl-2 sm:pl-3">
              <span className="text-[10px] sm:text-xs font-mono font-bold tracking-widest text-white/40 mr-1 hidden sm:inline">사전:</span>
              <button onClick={() => { setDictTab('stop'); setIsDictModalOpen(true); }} className="text-[10px] bg-amber-900/30 text-amber-400 border border-amber-500/40 px-2 py-1 rounded-sm hover:bg-amber-900/50 transition-colors">제외/포함</button>
              <button onClick={() => { setDictTab('abbr'); setIsDictModalOpen(true); }} className="text-[10px] bg-indigo-900/30 text-indigo-400 border border-indigo-500/40 px-2 py-1 rounded-sm hover:bg-indigo-900/50 transition-colors">약어 채점</button>
            </div>

            <div className="h-5 sm:h-6 w-px bg-white/10 shrink-0 hidden sm:block ml-1 sm:ml-2"></div>

            {isLoggedIn && (
              <div className="flex items-center gap-3 sm:gap-4 shrink-0 font-mono">
                <div className="text-right"><span className="text-[8px] sm:text-[9px] text-white/40 block tracking-widest">누적 회독수</span><span className="text-[10px] sm:text-xs font-bold text-amber-400">{minFilledCount} 회독</span></div>
                <div className="h-5 sm:h-6 w-px bg-white/10"></div>
                <div className="text-right"><span className="text-[8px] sm:text-[9px] text-white/40 block tracking-widest">예상 합격률</span><span className="text-[10px] sm:text-xs font-bold text-indigo-400">{passProbability}%</span></div>
                <div className="h-5 sm:h-6 w-px bg-white/10 hidden sm:block"></div>
                <button onClick={async () => { await enokiFlow.logout(); localStorage.clear(); window.location.reload(); }} className="border border-white/20 px-2 py-1 text-[9px] sm:text-[10px] hover:bg-white/10 tracking-wider font-mono rounded-sm text-white/70 whitespace-nowrap shrink-0">로그아웃</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {isLoggedIn && (
        <nav className="border-b border-white/5 bg-black/40 py-1.5 px-4 overflow-x-auto whitespace-nowrap custom-scrollbar w-full mb-6">
          <div className="max-w-6xl mx-auto flex items-center justify-start gap-1 sm:gap-2">
            {[{ id: 'progress', label: '진행상황' }, { id: 'create', label: '만들기' }, { id: 'enhance', label: '채우기' }, { id: 'exam', label: '모의고사' }, { id: 'settings', label: '설정' }].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-3 sm:px-4 py-1.5 text-[11px] sm:text-xs font-bold tracking-widest rounded-sm transition-all ${activeTab === tab.id ? 'bg-white/10 text-current' : 'text-white/40 hover:text-white/70'}`}>{tab.label}</button>
            ))}
          </div>
        </nav>
      )}

      {!isLoggedIn ? (
        <main className="max-w-md mx-auto mt-20 sm:mt-24 flex flex-col items-center px-4">
          <h2 className="text-xl sm:text-2xl font-serif text-current mb-4 tracking-tight">빈칸개발 (BlankD)</h2>
          <p className="text-xs sm:text-sm text-white/40 mb-10 sm:mb-12 text-center leading-relaxed">인지 부하 이론 기반의 학습 플랫폼<br/>압도적인 영구 기억을 형성합니다.</p>
          <button onClick={async () => { window.location.href = await enokiFlow.createAuthorizationURL({ provider: 'google', clientId: '536814695888-bepe0chce3nq31vuu3th60c7al7vpsv7.apps.googleusercontent.com', redirectUrl: window.location.origin, network: 'testnet', extraParams: { scope: ['openid', 'email', 'profile'] }}); }} className="w-full py-4 bg-[#111827] text-white text-sm font-bold rounded-sm mb-6 transition-transform active:scale-95 shadow-lg">Google 계정으로 시작하기</button>
        </main>
      ) : (
        <div className="max-w-[1500px] mx-auto w-full flex gap-4 sm:gap-6 px-4 lg:px-6 items-start pb-10">
          <main className="flex-1 w-full min-w-0">
            <ErrorBoundary fallbackLog={addLog}>
              {memoizedTabs}
            </ErrorBoundary>
          </main>
          <aside className="hidden lg:flex flex-col w-[320px] xl:w-[360px] shrink-0 sticky top-[100px] h-[calc(100vh-140px)]">
            {renderDictionaryUI(false)}
          </aside>
        </div>
      )}

      <div className="fixed bottom-4 right-4 z-[999] flex flex-col items-end gap-2">
        {isTerminalOpen && (
          <div className="w-[85vw] max-w-lg h-64 bg-black/95 border border-teal-500/30 p-4 font-mono text-[11px] text-teal-400 overflow-y-auto rounded shadow-2xl flex flex-col custom-scrollbar animate-in slide-in-from-bottom-5 fade-in">
            <div className="flex justify-between items-center mb-2 border-b border-teal-500/10 pb-2 sticky top-0 bg-black/95">
              <span className="uppercase tracking-widest text-teal-500/50 font-bold">시스템 진단 터미널</span>
              <button onClick={() => setSystemLogs([])} className="text-white/40 hover:text-white px-2 py-0.5 bg-white/5 rounded transition-colors">기록 지우기</button>
            </div>
            <div className="space-y-1 flex-1 overflow-y-auto custom-scrollbar pr-1">
              {systemLogs.map((l, i) => (
                <div key={i} className={`leading-snug break-all ${l.includes('?') ? 'text-red-400 font-bold' : l.includes('▶?') ? 'text-amber-300' : ''}`}>{l}</div>
              ))}
            </div>
          </div>
        )}
        <button onClick={() => setIsTerminalOpen(!isTerminalOpen)} className={`px-4 py-2 rounded-full font-bold text-[11px] uppercase tracking-wider shadow-lg transition-all border ${isTerminalOpen ? 'bg-red-900/50 border-red-500/50 text-red-400 hover:bg-red-900/80' : 'bg-teal-900/50 border-teal-500/50 text-teal-400 hover:bg-teal-900/80'}`}>
          {isTerminalOpen ? '터미널 닫기' : '터미널 열기'}
        </button>
      </div>

      {isDictModalOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]">
            {renderDictionaryUI(true)}
          </div>
        </div>
      )}

      {activeCard && (
        <CardModal activeCard={activeCard} totalTimeLimit={totalTimeLimit} elapsed={elapsed} inputStatus={inputStatus} handleSequentialInput={handleSequentialInput} handleReviewSelect={handleReviewSelect} renderContent={renderContent} onClose={handleCloseModal} />
      )}
    </div>
  );
}

export default function App() { return <MainApp />; }
