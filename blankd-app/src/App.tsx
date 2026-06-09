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

// ── 인라인 빈칸 입력 컴포넌트 (부모 리렌더링 완전 격리) ─────────────────
const InlineBlankInput = React.memo(({ inputStatus, onSubmit, expected, abbrDict }: {
  inputStatus: string;
  onSubmit: (val: string) => void;
  expected: string; 
  abbrDict: Record<string, string>; // 💡 [추가] 약어 사전
}) => {
  const [val, setVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  
  // 상태가 초기화되어야 할 때만 값을 비움
  useEffect(() => { 
    if (inputStatus === 'correct' || inputStatus === 'idle') setVal(''); 
  }, [inputStatus]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setVal(newVal);

    // 💡 [핵심 수정] 사용자가 친 글자와 정답에서 모든 띄어쓰기를 완전히 제거합니다.
    const cleanInput = newVal.replace(/\s+/g, '').toLowerCase();
    const cleanExpected = expected.replace(/\s+/g, '').toLowerCase();

    let isMatch = (cleanInput === cleanExpected);

    // 💡 [추가] 입력값이 약어 사전에 있고, 그 원래 뜻이 정답과 같으면 정답 처리
    if (!isMatch && abbrDict && abbrDict[cleanInput]) {
      if (abbrDict[cleanInput].replace(/\s+/g, '').toLowerCase() === cleanExpected) {
        isMatch = true;
      }
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
    this.props.fallbackLog(`? 런타임 에러: ${error.message}`);
  }
  render() {
    if (this.state.hasError) return (
      <div className="p-6 text-red-400 font-mono border border-red-500/30 bg-red-900/10 rounded-sm shadow-xl">
        <h3 className="text-lg font-bold mb-2">?? 시스템 치명적 오류</h3>
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
    console.error("큐 저장 실패", e); 
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

  // 💡 [통합] 글로벌 단어장 (제외/포함/약어) 상태 및 통합 모달 제어
  const [globalDict, setGlobalDict] = useState<{ stopwords: string[], inclusions: string[], abbrs: Record<string, string> }>({
    stopwords: [], inclusions: [], abbrs: {}
  });
  const [isDictModalOpen, setIsDictModalOpen] = useState(false);
  const [dictTab, setDictTab] = useState<'stop'|'include'|'abbr'>('abbr');
  const [tempKey, setTempKey] = useState("");
  const [tempValue, setTempValue] = useState("");

  const saveGlobalDict = async (newDict: typeof globalDict) => {
  setGlobalDict(newDict); // 낙관적 업데이트
  if (!safeAddress) return; // 로그인 안 된 상태면 저장 시도 자체를 안 함

  try {
    await api.updateGlobalDict(safeAddress, newDict);
  } catch (e: any) {
    // ✅ 콘솔과 터미널 양쪽에 에러 기록
    console.error("글로벌 단어장 저장 실패:", e);
    addLog(`⚠️ 단어장 저장 실패: ${e?.message || '알 수 없는 오류'}`);
    // ✅ 사용자에게 실패 알림 (롤백 옵션)
    alert("단어 저장에 실패했습니다. 네트워크 상태를 확인해주세요.\n(터미널에서 자세한 오류를 확인하실 수 있습니다.)");
    setGlobalDict(globalDict); // 롤백
  }
};
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
        addLog("? 로그인 콜백 처리 완료"); 
      }).catch((err: any) => addLog(`? 인증 실패: ${err.message}`));
    }
    if (isLoggedIn) loadAllData();
  }, [isLoggedIn, safeAddress, enokiFlow]);

  const loadAllData = async () => {
  try {
    const [catRes, cardRes, balance, dictRes] = await Promise.all([
      fetch(`https://api.blankd.top/api/get-categories?wallet_address=${safeAddress}`).then(r=>r.json()),
      fetch(`https://api.blankd.top/api/my-cards?wallet_address=${safeAddress}`).then(r=>r.json()),
      api.getGoalCoinBalance(safeAddress).catch(()=>0),
      api.getGlobalDict(safeAddress).catch((e) => {
        console.error("글로벌 단어장 로드 실패:", e); // ✅ 추가
        addLog(`⚠️ 단어장 로드 실패: ${e?.message || '서버 오류'}`);
        return { stopwords: [], inclusions: [], abbrs: {} };
      })
    ]);
    
    setCategories(catRes.categories || []); 
    setSavedCards(cardRes.cards || []); 
    setGoalBalance(balance);

   // 기존의 복잡한 구형 복구 코드를 삭제하고 단순화
   // (백엔드가 이미 force_repair_list로 처리해서 항상 배열로 옴)
   const serverStopwords:  string[]             = Array.isArray(dictRes.stopwords)  ? dictRes.stopwords  : [];
   const serverInclusions: string[]             = Array.isArray(dictRes.inclusions) ? dictRes.inclusions : [];
   let   finalAbbrs:       Record<string,string>= (dictRes.abbrs && typeof dictRes.abbrs === 'object' && !Array.isArray(dictRes.abbrs))
                                                  ? dictRes.abbrs : {};

    // 로컬 약어 마이그레이션 (기존 코드 유지)
    try {
      const localAbbrStr = localStorage.getItem('blankd_abbr_dict');
      if (localAbbrStr) {
        const localAbbrs = JSON.parse(localAbbrStr);
        if (Object.keys(finalAbbrs).length === 0 && Object.keys(localAbbrs).length > 0) {
          finalAbbrs = localAbbrs;
          api.updateGlobalDict(safeAddress, {
            stopwords: serverStopwords,
            inclusions: serverInclusions,
            abbrs: finalAbbrs
          }).then(() => {
            localStorage.removeItem('blankd_abbr_dict');
            addLog("📦 로컬 약어 데이터를 DB로 안전하게 이전했습니다.");
          }).catch(() => {});
        }
      }
    } catch (e) { console.error("약어 마이그레이션 에러", e); }

    setGlobalDict({
      stopwords: serverStopwords,
      inclusions: serverInclusions,
      abbrs: finalAbbrs
    });

  } catch (e: any) { 
    addLog(`⚠️ 데이터 동기화 실패: ${e.message}`);
  }
};

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
        addLog(`?? 백그라운드 동기화 완료 (M:${q.memos.length}, A:${q.answers.length})`);
        const newBalance = await api.getGoalCoinBalance(safeAddress).catch(()=>goalBalance);
        setGoalBalance(newBalance);
      }
    } catch (e) { 
      addLog("?? 오프라인 감지: 데이터는 로컬에 안전하게 보관 중입니다.");
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
    addLog("▶? 법령 텍스트 분석 업로드 시작...");
    const fd = new FormData(); fd.append("file", lawFile); fd.append("wallet_address", safeAddress);
    const res = await fetch(`https://api.blankd.top/api/upload-pdf`, { method: "POST", body: fd });
    if (res.ok) { 
      setLawFile(null);
      addLog("? 업로드 완료. AI 아카이빙 중..."); 
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
          addLog(`?? [${title1}] 분할 완료`); 
          await loadAllData();
        }
    } catch (e: any) { 
      addLog(`? 분할 처리 통신 에러`);
    }
  };

// ?? [수정] 옛날에 만든 카드도 완벽하게 찾아서 덮어쓰기!
  const handleMakeBlankCard = async (
    cat: any, 
    wordsArray: string[], 
    selectedIndices: Set<number>, 
    pageBreaks: Set<number>, 
    memo: string, 
    cardId: any, 
    onComplete: () => void
  ) => {
    let bodyContent = "";
    let answerText = ""; 
    let isBlanking = false;
    
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
    
    // ?? [핵심 원인 해결] 꼬리표(ORIG_ID)가 없어도, 카드의 첫 시작이 '조항 제목'과 똑같으면 같은 카드로 인식합니다!
    const existingCard = savedCards.find((c: any) => 
      c && c.content && (
        c.content.includes(`[[ORIG_ID:${cat.id}]]`) || 
        c.content.trim().startsWith(cat.title.trim())
      )
    );
    
    // 찾아낸 기존 카드의 ID를 타겟으로 설정합니다.
    const targetCardId = existingCard ? existingCard.id : null; 

    const finalCardContent = `${cat.title}\n\n${bodyContent}\n\n[[ORIG_ID:${cat.id}]]`;
    const initialMemo = stringifyCardStats(memo, 0, []);
    
    const res = await fetch("https://api.blankd.top/api/save-card", { 
      method: "POST", headers: { "Content-Type": "application/json" }, 
      body: JSON.stringify({ 
          wallet_address: safeAddress, 
          card_id: targetCardId, // ?? 이제 진짜 카드 ID가 전달되어 완벽한 덮어쓰기(UPDATE)가 실행됩니다!
          card_content: finalCardContent, 
          answer_text: answerText, 
          folder_name: cat.folder_name, 
          memo: initialMemo 
      }) 
    });
    
    if (res.ok) {
      localStorage.setItem('blankd_last_crafted_id', cat.id.toString());
      localStorage.setItem('blankd_last_crafted_title', cat.title);
      addLog(targetCardId ? "? 덮어쓰기 완료" : "? 신규 생성 완료");
      await loadAllData(); 
      onComplete(); 
    }
  };
  const handleUpdateMemoBackground = (id: number, memo: string) => {
    setSavedCards(prev => prev.map(c => c.id === id ? { ...c, memo } : c));
    pushToQueue('MEMO', { id, memo });
  };

  useEffect(() => {
    if (activeCard) {
      isClosingRef.current = false;
      const cleanContent = activeCard.content.replace(/\n\n\[\[ORIG_ID:\d+\]\]/g, '');
      const { body } = formatCardText(cleanContent);
      const foundBlanks: {answer: string, correct: boolean}[] = [];
      const parts = body.split(/(\[.*?\])/g);
      parts.forEach(part => {
        if (part.startsWith('[') && part.endsWith(']')) {
          foundBlanks.push({ answer: part.replace(/\[|\]/g, '').trim(), correct: false });
        }
      });
      
      const savedProgress = localStorage.getItem(`blankd_progress_${activeCard.id}`);
      const lastIdx = savedProgress ? parseInt(savedProgress, 10) : 0;
      
      const restoredBlanks = foundBlanks.map((b, i) => ({
          ...b,
          correct: i < lastIdx 
      }));

      setBlanks(restoredBlanks); 
      setCurrentBlankIdx(lastIdx < foundBlanks.length ? lastIdx : 0); 
      setInputStatus('idle');

      const stats = parseCardStats(activeCard.memo);
      const timePerBlank = Math.max(3.0, 10.0 - (stats.filled * 0.5));
      setTotalTimeLimit(timePerBlank * foundBlanks.length); 
      
      setStartTime(Date.now()); 
      setElapsed(0);
      setIsMemoOpen(false);

      let cleanText = stats.text;
      if (cleanText) {
         cleanText = cleanText.replace(/\(\s*\)\s*=>\s*x\(\s*null\s*\)/g, "").trim();
      }
      statsRef.current = { text: cleanText, filled: stats.filled, wrongIndices: new Set(stats.wrongIndices) };
      const cleanTitle = getStrictTitleOnly(cleanContent);
      localStorage.setItem('blankd_last_enhanced_id', activeCard.id.toString());
      localStorage.setItem('blankd_last_enhanced_title', cleanTitle || "이름 없는 카드");
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
        recognitionRef.current = null;
        setIsListening(false);
      }
    }
  }, [activeCard]);

  // ?? [수정] 복습 주기 자율 선택 기능을 위해 customDays 매개변수를 추가했습니다.
  const finishCard = (customDays?: number) => {
    if (isClosingRef.current || !activeCard) return;
    isClosingRef.current = true;
    const currentId = activeCard.id;
    const currentFolder = activeCard.folder_name;
    const finalTime = elapsed;
    const wrongArr = Array.from(statsRef.current.wrongIndices);
    const newMemo = stringifyCardStats(statsRef.current.text, statsRef.current.filled, wrongArr);
    const isCorrect = wrongArr.length === 0;

    let daysInterval = customDays;
    
    // 자동 계산 (직접 선택하지 않은 경우)
    if (daysInterval === undefined) {
      const wrongCount = wrongArr.length;
      const totalBlanks = blanks.length;
      let quality = 5;
      if (totalBlanks > 0 && wrongCount > 0) {
        const wrongRatio = wrongCount / totalBlanks;
        if (wrongRatio > 0.5) quality = 1;
        else if (wrongRatio > 0.2) quality = 2;
        else quality = 3;
      }
      let easiness = parseFloat(localStorage.getItem(`blankd_factor_${currentId}`) || "2.5");
      easiness = easiness + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
      if (easiness < 1.3) easiness = 1.3;
      localStorage.setItem(`blankd_factor_${currentId}`, easiness.toString());

      const currentRepetitions = statsRef.current.filled || 1;
      if (quality < 3) {
        daysInterval = 1;
      } else {
        if (currentRepetitions === 1) daysInterval = 1;
        else if (currentRepetitions === 2) daysInterval = 4;
        else daysInterval = Math.ceil((currentRepetitions - 1) * easiness);
      }
    } else {
      // ?? [추가] 사용자가 복습 주기를 강제 지정한 경우에도 알고리즘 난이도는 내부적으로 보정
      let quality = 3;
      if (daysInterval === 1) quality = 1;
      else if (daysInterval === 4) quality = 2;
      else if (daysInterval >= 14) quality = 5;
      
      let easiness = parseFloat(localStorage.getItem(`blankd_factor_${currentId}`) || "2.5");
      easiness = easiness + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
      if (easiness < 1.3) easiness = 1.3;
      localStorage.setItem(`blankd_factor_${currentId}`, easiness.toString());
    }

    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + daysInterval);

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
    
    // 로그 문구 추가 수정
    addLog(`? 학습 완료 (ID:${currentId}) | 다음 복습: ${daysInterval}일 후`);
    flushQueue();
  };

  // ?? [추가] 카드 모달에서 복습 주기 버튼(1일, 4일, 7일, 14일)을 눌렀을 때 실행되는 함수
  const handleReviewSelect = (days: number) => {
    if (!activeCard) return;
    statsRef.current.filled += 1;
    finishCard(days);
  };

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
    
    // 💡 [추가된 부분] 1차 검사: 원본 그대로 일치하는지 확인
    let isCorrect = (expected === actual);

    // 💡 [추가된 부분] 2차 검사: 오답일 경우, 입력한 단어가 약어 사전에 등록되어 있는지 확인
    if (!isCorrect && globalDict.abbrs && globalDict.abbrs[actual]) {
      const mappedValue = globalDict.abbrs[actual].replace(/\s+/g, '').toLowerCase();
      console.log(`[진단-약어] 입력:'${actual}' -> 매핑:'${mappedValue}' | 실제:'${expected}'`);
      if (mappedValue === expected) {
        isCorrect = true; // 약어의 원래 뜻이 정답과 같으면 정답 처리!
      }
    }

    // 💡 [수정된 부분] expected === actual 대신 isCorrect 변수를 사용합니다.
    if (isCorrect) {
      setInputStatus('correct');
      setBlanks(prev => {
        const nb = [...prev]; 
        if (nb[currentBlankIdx]) nb[currentBlankIdx].correct = true; 
        return nb;
      });
      statsRef.current.wrongIndices.delete(currentBlankIdx);
      setTimeout(() => {
        setInputStatus('idle'); 
        setBlanks(currentBlanks => {
          if (currentBlankIdx + 1 < currentBlanks.length) {
            setCurrentBlankIdx(prevIdx => {
              const nextIdx = prevIdx + 1;
              localStorage.setItem(`blankd_progress_${activeCard.id}`, nextIdx.toString());
              return nextIdx;
            });
          } else { 
            localStorage.removeItem(`blankd_progress_${activeCard.id}`);
            statsRef.current.filled += 1; 
            finishCard(); 
          }
          return currentBlanks;
        });
      }, 150);
    } else { 
      setInputStatus('wrong'); 
      statsRef.current.wrongIndices.add(currentBlankIdx); 
      setTimeout(() => setInputStatus('idle'), 500); 
    }
  };
  
  const handleShowAnswer = () => {
    if (!blanks[currentBlankIdx]) return;
    setInputStatus('wrong'); 
    statsRef.current.wrongIndices.add(currentBlankIdx); 
    setBlanks(prev => {
      const nb = [...prev];
      if (nb[currentBlankIdx]) nb[currentBlankIdx].correct = true; 
      return nb;
    });
    setTimeout(() => {
      setInputStatus('idle');
      setBlanks(currentBlanks => {
        if (currentBlankIdx + 1 < currentBlanks.length) {
          setCurrentBlankIdx(prevIdx => {
            const nextIdx = prevIdx + 1;
            localStorage.setItem(`blankd_progress_${activeCard.id}`, nextIdx.toString());
            return nextIdx;
          });
        } else {
          localStorage.removeItem(`blankd_progress_${activeCard.id}`);
          statsRef.current.filled += 1;
          finishCard();
        }
        return currentBlanks;
      });
    }, 800);
  };

  const toggleVoiceRecognition = () => {
    if (isListening) {
      setIsListening(false);
      if (recognitionRef.current) {
        recognitionRef.current.onend = null; 
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      addLog("??? 음성 인식 종료됨");
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { alert("크롬 브라우저를 권장합니다.");
      return; 
    }
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR'; 
    recognition.interimResults = false;
    recognition.continuous = true; 
    recognition.maxAlternatives = 1;

    recognition.onstart = () => { 
      setIsListening(true);
      addLog("??? 음성 인식 활성화됨 (계속 듣는 중...)");
    };
    
    recognition.onresult = (event: any) => {
      const last = event.results.length - 1;
      const transcript = event.results[last][0].transcript;
      const cleanText = transcript.replace(/\s+/g, '').replace(/[.,!?]/g, '');
      addLog(`??? 인식: "${transcript}"`);
      setTimeout(() => handleSequentialInput(cleanText), 300);
    };
    recognition.onerror = (err: any) => { 
      if (err.error !== 'no-speech') {
        setIsListening(false);
        recognitionRef.current = null;
      }
    };
    
    recognition.onend = () => { 
      if (recognitionRef.current) {
         try { recognitionRef.current.start();
         } catch(e) {}
      } else {
         setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

// ?? [추가] 전체 카드의 최소 회독수 (모두 1이상이면 1, 모두 2이상이면 2) 계산
  const minFilledCount = savedCards.length > 0 
    ? Math.min(...savedCards.map((card: any) => {
        const stats = parseCardStats(card.memo || "");
        return stats.filled || 0;
      }))
    : 0;

  // ?? [추가] 합격률 로직: 최소 회독수 1회당 2%씩 상승 (최대 100%)
  const passProbability = Math.min(minFilledCount * 2, 100);

    // 💡 [렉 완전 박멸] 1초마다 돌아가는 타이머나 키보드 입력에 의해 무거운 연산이 반복되지 않도록 완벽히 가둡니다.
  const { nextCatToCraft, nextStudyCard } = useMemo(() => {
    let craftTarget = null;
    let studyTarget = null;

    if (!isLoggedIn) return { nextCatToCraft: null, nextStudyCard: null };

    // 1. 만들기 상단 버튼 로직 (괄호 날리기 및 필터링)
    if (categories && categories.length > 0) {
      const craftedOrigIds = new Set();
      const craftedTitles: string[] = [];
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

    // 2. 채우기 상단 버튼 로직 (순서대로 1조부터 + 최소 반복 횟수)
    if (savedCards && savedCards.length > 0) {
      const cardsWithStatus = savedCards.map(c => {
         const stats = parseCardStats(c.memo);
         const origId = parseInt((c.content.match(/\[\[ORIG_ID:(\d+)\]\]/) || [])[1] || c.id, 10);
         return { ...c, repetitions: stats.filled || 0, origId };
      }).sort((a, b) => a.origId - b.origId);

      const minReps = Math.min(...cardsWithStatus.map(c => c.repetitions));
      studyTarget = cardsWithStatus.find(c => c.repetitions === minReps) || cardsWithStatus[0];
    }

    // 계산이 완료된 결과만 내보냅니다.
    return { nextCatToCraft: craftTarget, nextStudyCard: studyTarget };
  }, [isLoggedIn, categories, savedCards]); 
  // 💡 [핵심] 오직 '카드 목록'이 업데이트될 때만 단 1번 연산됩니다. 타자를 칠 때는 절대 실행되지 않습니다!

  // renderContent를 useCallback으로 메모이제이션 (Hook 규칙: return 전에 선언)
  const renderContent = React.useCallback(() => {
    if (!activeCard) return null;
    const cleanContent = activeCard.content.replace(/\n\n\[\[ORIG_ID:\d+\]\]/g, '');
    let displayTitle = (cleanContent.split('\n')[0] || "")
        .replace(/\[.*?\]/g, '')
        .replace(/\(\s*내용\s*\)/g, '')
        .replace(/내용/g, '')
        .trim();
    if (!displayTitle) displayTitle = "제목 없음";

    const { body } = formatCardText(cleanContent);
    const parts = body.split(/(\[.*?\]|##PAGE_BREAK##)/g).filter(p => p !== '');
    let displayPage = 0; 
    let tempGlobalBlank = 0; 
    let tempPage = 0;
    for (let part of parts) {
        if (part === '##PAGE_BREAK##') tempPage++;
        else if (part.startsWith('[') && part.endsWith(']')) {
            if (tempGlobalBlank === currentBlankIdx) { 
              displayPage = tempPage;
              break; 
            }
            tempGlobalBlank++;
        }
    }

    let renderPage = 0;
    let bIdx = 0;
    const contentToRender: any[] = [];
    parts.forEach((part: string, i: number) => {
      if (part === '##PAGE_BREAK##') { renderPage++; return; }
      if (renderPage === displayPage) {
          if (part.startsWith('[') && part.endsWith(']')) {
            const isCorrect = blanks[bIdx]?.correct; 
            const isCurrent = bIdx === currentBlankIdx; 
            const isWrong = statsRef.current.wrongIndices.has(bIdx); 
            if (isCorrect) {
              contentToRender.push(
                <span key={i} className={`font-bold mx-1 px-1 rounded ${isWrong ? 'text-red-400 bg-red-900/20' : 'text-teal-400 bg-teal-900/20'}`}>
                  {part.replace(/\[|\]/g, '')}
                </span>
              );
            } else if (isCurrent) {
              contentToRender.push(
                <InlineBlankInput                  
                  key={`blank-${currentBlankIdx}`}
                  inputStatus={inputStatus}
                  expected={blanks[currentBlankIdx]?.answer || ""} // 💡 현재 빈칸의 정답을 전달
                  abbrDict={globalDict.abbrs} // 💡 [추가] 약어 사전 전달
                  onSubmit={handleSequentialInput}
                />
              );
            } else {
              contentToRender.push(
                <span key={i} className="inline-block min-w-[50px] h-5 bg-white/5 border-b border-white/20 mx-1 align-middle rounded-sm"></span>
              );
            }
            bIdx++;
          } else {
            contentToRender.push(<span key={i}>{part}</span>);
          }
      } else if (part.startsWith('[') && part.endsWith(']')) {
        bIdx++;
      }
    });
    
    return (
      <div className="flex flex-col gap-6 w-full">
        <div className="flex justify-between items-center border-b border-white/10 pb-2">
            <span className="text-amber-400 font-bold text-[14px] leading-tight">{cleanContent.split('\n')[0]}</span>
            <span className="text-[12px] text-white/40 font-mono bg-white/5 px-2 py-1 rounded shadow-sm">Page {displayPage + 1}</span>
        </div>
        <div className="whitespace-pre-wrap leading-relaxed text-[15px] font-serif break-keep min-h-[160px]">{contentToRender}</div>
        <div className="flex justify-between items-center w-full mb-2 gap-2 flex-wrap">
          <button onClick={() => setIsMemoOpen(!isMemoOpen)} className="px-3 py-1.5 bg-teal-900/30 text-teal-400 border border-teal-500/50 rounded-sm text-[11px] font-bold shrink-0 hover:bg-teal-900/50 transition-all shadow-md">
            {isMemoOpen ? '닫기 ?' : '메모 열기'}
          </button>
          <button 
            onClick={toggleVoiceRecognition} 
            className={`flex-1 min-w-[120px] py-1.5 border rounded-sm text-[11px] font-bold transition-all shadow-md ${
              isListening 
                ? 'bg-red-600/50 text-white border-red-500 animate-pulse' 
                : 'bg-blue-900/30 text-blue-400 border-blue-500/50 hover:bg-blue-900/50'
            }`}
          >
            {isListening ? '음성 인식 끄기 (활성화됨)' : '음성으로 입력 (계속 켜두기)'}
          </button>
          
            <button 
              id="show-answer-btn" // 💡 이 이름표가 있어야 엔터키 단축키가 작동합니다!
              onClick={handleShowAnswer} 
              className="px-3 py-1.5 bg-red-900/30 text-red-400 border ..."
            >
              정답 보기 (오답 처리)
            </button>

        </div>
        {isMemoOpen && (
          <div className="pt-4 border-t border-white/10 w-full animate-in slide-in-from-top-2">
            <input 
              defaultValue={statsRef.current.text || ""} 
              placeholder="학습 인사이트 기록..." 
              onBlur={(e) => { 
                statsRef.current.text = e.target.value; 
                handleUpdateMemoBackground(activeCard.id, stringifyCardStats(statsRef.current.text, statsRef.current.filled, Array.from(statsRef.current.wrongIndices))); 
              }} 
              className="text-[13px] text-teal-300 bg-teal-950/20 p-3 rounded border border-teal-500/30 w-full outline-none focus:border-teal-400 transition-all" 
              autoFocus
            />
          </div>
        )}
      </div>
    );
  }, [activeCard, blanks, currentBlankIdx, inputStatus, isMemoOpen, isListening]);
    // 💡 [궁극의 최적화] 1초 타이머와 상관없이 탭을 한 번 만들어 캐싱(기억)합니다.
  const memoizedTabs = useMemo(() => {
    return (
      <>
        <div className={activeTab === 'progress' ? 'block' : 'hidden'}>
          <DashboardTab categories={categories} savedCards={savedCards} setActiveTab={setActiveTab} setExpandedId={setExpandedId} setActiveCard={setActiveCard} />
        </div>
        
        <div className={activeTab === 'create' ? 'block' : 'hidden'}>
          <CraftTab 
            categories={categories} 
            savedCards={savedCards} 
            colCount={colCount} 
            viewMode={viewMode} 
            useAiRecommend={useAiRecommend} 
            safeAddress={safeAddress} 
            lawFile={lawFile} 
            setLawFile={setLawFile} 
            uploadLaw={uploadLaw} 
            handleMakeBlankCard={handleMakeBlankCard} 
            handleSplitCategory={handleSplitCategory} 
            addLog={addLog} 
            expandedId={expandedId} 
            setExpandedId={setExpandedId} 
            handleDeleteCategory={async (id: number) => { if(confirm('삭제하시겠습니까?')){ await fetch("https://api.blankd.top/api/delete-category", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_address: safeAddress, id }) }); loadAllData(); } }} 
            globalDict={globalDict}
            saveGlobalDict={saveGlobalDict}
          />
        </div>
        
        <div className={activeTab === 'enhance' ? 'block' : 'hidden'}>
          <EnhanceTab categories={categories} savedCards={savedCards} colCount={colCount} viewMode={viewMode} setActiveCard={setActiveCard} setActiveTab={setActiveTab} setExpandedId={setExpandedId} handleDeleteCard={async (id: number) => { if(confirm('삭제하시겠습니까?')){ await fetch("https://api.blankd.top/api/delete-card", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_address: safeAddress, id }) }); setActiveCard(null); loadAllData(); } }} />
        </div>
        
        <div className={activeTab === 'exam' ? 'block' : 'hidden'}>
          <ExamTab walletAddress={safeAddress} address={safeAddress} />
        </div>
        
        <div className={activeTab === 'mypage' ? 'block' : 'hidden'}>
          <MypageTab 
            safeAddress={safeAddress} 
            enokiFlow={enokiFlow} 
            useAiRecommend={useAiRecommend} 
            setUseAiRecommend={setUseAiRecommend} 
            studyMode={studyMode} 
            setStudyMode={setStudyMode} 
            handleDeleteAll={handleDeleteAll} 
            globalDict={globalDict} 
            saveGlobalDict={saveGlobalDict} 
          />
        </div>
      </>
    );
  }, [activeTab, categories, savedCards, colCount, viewMode, useAiRecommend, safeAddress, lawFile, expandedId, enokiFlow, studyMode, setStudyMode]);
  // 💡 [단어장 UI 분리] PC 사이드바와 모바일 모달에서 똑같은 코드를 재사용하기 위한 함수입니다.
  const renderDictionaryUI = (isMobile: boolean) => (
    <div className={`flex flex-col w-full h-full ${isMobile ? 'bg-[#0a0a0c] border border-white/10 p-5 sm:p-6 rounded-sm' : 'bg-[#08080a]/80 border border-white/10 p-5 rounded-sm shadow-xl backdrop-blur-sm'}`}>
      <div className="flex justify-between items-start mb-6">
        <div className="flex gap-4 border-b border-white/10 w-full pt-1">
          <button onClick={() => setDictTab('abbr')} className={`text-[11px] sm:text-[13px] font-bold tracking-wide transition-all px-1 pb-2 -mb-[1px] ${dictTab === 'abbr' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-white/40 hover:text-white/70'}`}>⚡ 스마트 약어</button>
          <button onClick={() => setDictTab('include')} className={`text-[11px] sm:text-[13px] font-bold tracking-wide transition-all px-1 pb-2 -mb-[1px] ${dictTab === 'include' ? 'text-teal-400 border-b-2 border-teal-400' : 'text-white/40 hover:text-white/70'}`}>✅ 필수 포함</button>
          <button onClick={() => setDictTab('stop')} className={`text-[11px] sm:text-[13px] font-bold tracking-wide transition-all px-1 pb-2 -mb-[1px] ${dictTab === 'stop' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-white/40 hover:text-white/70'}`}>❌ 제외 단어</button>
        </div>
        {/* 모바일에서만 닫기 버튼 표시 */}
        {isMobile && <button onClick={() => setIsDictModalOpen(false)} className="text-white/40 hover:text-white ml-6 text-lg font-bold">✕</button>}
      </div>
      
      <div className="flex gap-2 mb-5 shrink-0">
        <input type="text" value={tempKey} 
          onChange={(e) => setTempKey(e.target.value)} onKeyDown={(e) => {
          if (e.key === 'Enter') {
             if (dictTab === 'abbr' && tempKey && tempValue) {
               saveGlobalDict({ ...globalDict, abbrs: { ...globalDict.abbrs, [tempKey.trim()]: tempValue.trim() } });
               setTempKey(""); setTempValue("");
             } else if (dictTab !== 'abbr' && tempKey) {
               const words = tempKey.split(',').map(w => w.trim()).filter(Boolean);
               const targetArray = dictTab === 'stop' ? globalDict.stopwords : globalDict.inclusions;
               saveGlobalDict({ ...globalDict, [dictTab === 'stop' ? 'stopwords' : 'inclusions']: Array.from(new Set([...targetArray, ...words])) });
               setTempKey("");
             }
          }
        }} placeholder={dictTab === 'abbr' ? "약어 (예: 복정고)" : "단어 입력 (쉼표 구분)"} className="flex-1 bg-black/50 border border-white/10 p-2 text-xs sm:text-sm text-white/80 outline-none rounded-sm focus:border-white/30 transition-colors w-full min-w-0" />
        
        {dictTab === 'abbr' && (
          <input type="text" value={tempValue} onChange={(e) => setTempValue(e.target.value)} onKeyDown={(e) => {
             if (e.key === 'Enter' && tempKey && tempValue) {
               saveGlobalDict({ ...globalDict, abbrs: { ...globalDict.abbrs, [tempKey.trim()]: tempValue.trim() } });
               setTempKey(""); setTempValue("");
             }
          }} placeholder="원래 정답" className="flex-1 bg-black/50 border border-white/10 p-2 text-xs sm:text-sm text-white/80 outline-none rounded-sm focus:border-indigo-500/50 transition-colors w-full min-w-0" />
        )}
        
        <button onClick={() => {
          if (dictTab === 'abbr' && tempKey && tempValue) {
            saveGlobalDict({ ...globalDict, abbrs: { ...globalDict.abbrs, [tempKey.trim()]: tempValue.trim() } });
            setTempKey(""); setTempValue("");
          } else if (dictTab !== 'abbr' && tempKey) {
            const words = tempKey.split(',').map(w => w.trim()).filter(Boolean);
            const targetArray = dictTab === 'stop' ? globalDict.stopwords : globalDict.inclusions;
            saveGlobalDict({ ...globalDict, [dictTab === 'stop' ? 'stopwords' : 'inclusions']: Array.from(new Set([...targetArray, ...words])) });
            setTempKey("");
          }
        }} className="px-3 sm:px-4 bg-white/5 text-white/80 border border-white/10 text-xs font-bold rounded-sm hover:bg-white/10 transition-colors shrink-0">등록</button>
      </div>
      
      {/* 💡 개별 스크롤 영역 적용 */}
      <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-2 min-h-[160px]">
        {dictTab === 'abbr' && Object.entries(globalDict.abbrs).map(([abbr, full]) => (
          <div key={abbr} className="flex justify-between items-center text-xs sm:text-sm border-b border-white/5 pb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-indigo-400 font-bold px-2 py-0.5 bg-indigo-900/20 rounded-sm border border-indigo-500/20">{abbr}</span> 
              <span className="text-white/30 text-[10px]">→</span> 
              <span className="text-white/70 break-all">{full as string}</span>
            </div>
            <button onClick={() => { const nw = {...globalDict.abbrs}; delete nw[abbr]; saveGlobalDict({...globalDict, abbrs: nw}); }} className="text-white/20 hover:text-red-400 text-xs px-2 transition-colors shrink-0">✕</button>
          </div>
        ))}
        {dictTab !== 'abbr' && (dictTab === 'stop' ? globalDict.stopwords : globalDict.inclusions).map((word: string) => (
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
  
  return (
    <div className="min-h-screen bg-[#0d0d0f] text-[#d1d1d1] p-4 sm:p-6 md:p-8 relative pb-24 font-sans text-pretty overflow-x-hidden transition-colors">
{/* ?? 여기서부터 복사해서 기존 <header>...</header>가 있던 자리에 붙여넣으세요 */}
      <header className="border-b border-white/10 bg-[#08080a] px-4 py-2.5 sticky top-0 z-40 backdrop-blur-md w-full">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          
          {/* 왼쪽 영역: BlankD 로고 (클릭 시 최근 진행했던 탭으로 즉시 복귀) */}
          <div className="flex items-center justify-between w-full md:w-auto">
            <button 
              onClick={() => {
                const lastTab = localStorage.getItem('blankd_active_tab') || 'progress';
                setActiveTab(lastTab);
              }} 
              className="text-xl sm:text-2xl font-bold tracking-widest text-white shrink-0 hover:text-teal-400 transition-colors"
            >
              BlankD
            </button>
          </div>

          {/* 오른쪽 영역: 이어서 하기 버튼들 + 통계 지표 + 로그아웃 */}
          <div className="flex items-center justify-start md:justify-end gap-3 sm:gap-4 shrink-0 overflow-x-auto custom-scrollbar pb-1 md:pb-0 w-full md:w-auto">
            
            {/* 이어서 하기 (만들기 / 채우기) */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] sm:text-xs font-mono font-bold tracking-widest text-white/40 mr-1 uppercase hidden sm:inline">이어하기:</span>
              
              {nextCatToCraft ? (
                <button 
                  onClick={() => { 
                    setActiveTab('create'); 
                    setExpandedId(nextCatToCraft.id); 
                  }}
                  className="bg-amber-900/30 border border-amber-500/40 px-2 sm:px-3 py-1 sm:py-1.5 rounded-sm flex items-center gap-1.5 hover:bg-amber-900/50 transition-all text-left max-w-[140px] sm:max-w-[200px]"
                >
                  <span className="text-[9px] sm:text-[10px] text-amber-400 font-bold whitespace-nowrap">▶ 만들기</span>
                  <span className="text-[10px] sm:text-[11px] font-medium text-amber-100 truncate">
                    {getStrictTitleOnly(nextCatToCraft.title) || "다음 조항"}
                  </span>
                </button>
              ) : (
                <div className="text-[10px] sm:text-[11px] text-white/20 border border-white/5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-sm">만들기 완료</div>
              )}

              {nextStudyCard ? (
                <button 
                  onClick={() => { setActiveCard(nextStudyCard); }}
                  className="bg-teal-900/30 border border-teal-500/40 px-2 sm:px-3 py-1 sm:py-1.5 rounded-sm flex items-center gap-1.5 hover:bg-teal-900/50 transition-all text-left max-w-[140px] sm:max-w-[200px]"
                >
                  <span className="text-[9px] sm:text-[10px] text-teal-400 font-bold whitespace-nowrap">▶ 채우기</span>
                  <span className="text-[10px] sm:text-[11px] font-medium text-teal-100 truncate">
                    {nextStudyCard.content.split('\n')[0].replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim()}
                  </span>
                </button>
              ) : (
                <div className="text-[10px] sm:text-[11px] text-white/20 border border-white/5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-sm">채우기 완료</div>
              )}
            </div>

            {/* 💡 [통합] 상단 글로벌 사전 메뉴 UI */}
            <div className="flex items-center gap-2 shrink-0 ml-1 sm:ml-2 border-l border-white/10 pl-2 sm:pl-3">
              <span className="text-[10px] sm:text-xs font-mono font-bold tracking-widest text-white/40 mr-1 hidden sm:inline">사전:</span>
              <button onClick={() => { setDictTab('stop'); setIsDictModalOpen(true); }} className="text-[10px] bg-amber-900/30 text-amber-400 border border-amber-500/40 px-2 py-1 rounded-sm hover:bg-amber-900/50 transition-colors">제외/포함</button>
              <button onClick={() => { setDictTab('abbr'); setIsDictModalOpen(true); }} className="text-[10px] bg-indigo-900/30 text-indigo-400 border border-indigo-500/40 px-2 py-1 rounded-sm hover:bg-indigo-900/50 transition-colors">약어 채점</button>
            </div>

            {/* 구분선 */}
            <div className="h-5 sm:h-6 w-px bg-white/10 shrink-0 hidden sm:block ml-1 sm:ml-2"></div>

            {/* 통계 지표 및 로그아웃 */}
            {isLoggedIn && (
              <div className="flex items-center gap-3 sm:gap-4 shrink-0 font-mono">
                <div className="text-right">
                  <span className="text-[8px] sm:text-[9px] text-white/40 block tracking-widest uppercase">Rotation</span>
                  <span className="text-[10px] sm:text-xs font-bold text-amber-400">{minFilledCount} 회독</span>
                </div>
                <div className="h-5 sm:h-6 w-px bg-white/10"></div>
                <div className="text-right">
                  <span className="text-[8px] sm:text-[9px] text-white/40 block tracking-widest uppercase">Pass Rate</span>
                  <span className="text-[10px] sm:text-xs font-bold text-indigo-400">{passProbability}%</span>
                </div>
                <div className="h-5 sm:h-6 w-px bg-white/10 hidden sm:block"></div>
                <button onClick={async () => { await enokiFlow.logout(); localStorage.clear(); window.location.reload(); }} className="border border-white/20 px-2 py-1 text-[9px] sm:text-[10px] hover:bg-white/10 tracking-wider font-mono rounded-sm text-white/70 whitespace-nowrap shrink-0">LOGOUT</button>
              </div>
            )}

          </div>
        </div>
      </header>
      {/* ?? 여기까지 복사! (이 아래의 <nav> 부분은 그대로 두시면 됩니다.) */}

      {/* ?? 한 줄 아래로 독립적으로 분리된 탭 네비게이션 바 */}
      {isLoggedIn && (
        <nav className="border-b border-white/5 bg-black/40 py-1.5 px-4 overflow-x-auto whitespace-nowrap custom-scrollbar w-full mb-6">
          <div className="max-w-6xl mx-auto flex items-center justify-start gap-1 sm:gap-2">
            {[{ id: 'progress', label: '진행상황' }, { id: 'create', label: '만들기' }, { id: 'enhance', label: '채우기' }, { id: 'exam', label: '모의고사' }, { id: 'settings', label: '설정' }].map(tab => (
              <button 
                key={tab.id} 
                onClick={() => setActiveTab(tab.id)} 
                className={`px-3 sm:px-4 py-1.5 text-[11px] sm:text-xs font-bold tracking-widest rounded-sm transition-all ${activeTab === tab.id ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </nav>
      )}
      {!isLoggedIn ? (
        <main className="max-w-md mx-auto mt-20 sm:mt-24 flex flex-col items-center px-4">
          <h2 className="text-xl sm:text-2xl font-serif text-white mb-4 tracking-tight">빈칸개발 (BlankD)</h2>
          <p className="text-xs sm:text-sm text-white/40 mb-10 sm:mb-12 text-center leading-relaxed">인지 부하 이론 기반의 학습 플랫폼<br/>압도적인 영구 기억을 형성합니다.</p>
          <button onClick={async () => { window.location.href = await enokiFlow.createAuthorizationURL({ provider: 'google', clientId: '536814695888-bepe0chce3nq31vuu3th60c7al7vpsv7.apps.googleusercontent.com', redirectUrl: window.location.origin, network: 'testnet', extraParams: { scope: ['openid', 'email', 'profile'] }}); }} className="w-full py-4 bg-white text-black text-sm font-bold rounded-sm mb-6 transition-transform active:scale-95 shadow-lg">Google 계정으로 시작하기</button>
        </main>
      ) : (
        // 💡 [레이아웃 분할] 전체 너비를 키우고, 화면을 메인과 우측 패널로 나눕니다.
        <div className="max-w-[1500px] mx-auto w-full flex gap-4 sm:gap-6 px-4 lg:px-6 items-start pb-10">
          {/* 왼쪽 메인 탭 컨텐츠 영역 */}
          <main className="flex-1 w-full min-w-0">
            <ErrorBoundary fallbackLog={addLog}>
              {memoizedTabs}
            </ErrorBoundary>
          </main>

          {/* 💡 오른쪽 플로팅(Sticky) 단어장 - PC/태블릿(lg) 환경에서만 렌더링되며, 스크롤을 따라다닙니다. */}
          <aside className="hidden lg:flex flex-col w-[320px] xl:w-[360px] shrink-0 sticky top-[100px] h-[calc(100vh-140px)]">
            {renderDictionaryUI(false)}
          </aside>
        </div>
      )}

      <div className="fixed bottom-4 right-4 z-[999] flex flex-col items-end gap-2">
        {isTerminalOpen && (
          <div className="w-[85vw] max-w-lg h-64 bg-black/95 border border-teal-500/30 p-4 font-mono text-[11px] text-teal-400 overflow-y-auto rounded shadow-2xl flex flex-col custom-scrollbar animate-in slide-in-from-bottom-5 fade-in">
            <div className="flex justify-between items-center mb-2 border-b border-teal-500/10 pb-2 sticky top-0 bg-black/95">
              <span className="uppercase tracking-widest text-teal-500/50 font-bold">Diagnostic Terminal</span>
              <button onClick={() => setSystemLogs([])} className="text-white/40 hover:text-white px-2 py-0.5 bg-white/5 rounded transition-colors">Clear</button>
            </div>
            <div className="space-y-1 flex-1 overflow-y-auto custom-scrollbar pr-1">
              {systemLogs.map((l, i) => (
                <div key={i} className={`leading-snug break-all ${l.includes('?') ? 'text-red-400 font-bold' : l.includes('▶?') ? 'text-amber-300' : ''}`}>
                  {l}
                </div>
              ))}
            </div>
          </div>
        )}
        <button onClick={() => setIsTerminalOpen(!isTerminalOpen)} className={`px-4 py-2 rounded-full font-bold text-[11px] uppercase tracking-wider shadow-lg transition-all border ${isTerminalOpen ? 'bg-red-900/50 border-red-500/50 text-red-400 hover:bg-red-900/80' : 'bg-teal-900/50 border-teal-500/50 text-teal-400 hover:bg-teal-900/80'}`}>
          {isTerminalOpen ? 'Close Terminal' : 'Open Terminal'}
        </button>
      </div>

      {/* 💡 [모바일 전용 단어장 모달] 데스크탑(lg)에서는 숨김 처리하고 모바일에서만 팝업으로 띄웁니다. */}
      {isDictModalOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]">
            {renderDictionaryUI(true)}
          </div>
        </div>
      )}

      {activeCard && (
        <CardModal
          activeCard={activeCard} 
          totalTimeLimit={totalTimeLimit} 
          elapsed={elapsed} 
          inputStatus={inputStatus}
          handleSequentialInput={handleSequentialInput}
          handleReviewSelect={handleReviewSelect}
          renderContent={renderContent}
          onClose={handleCloseModal} 
        />
      )}
    </div>
  );
}

export default function App() { return <MainApp />; }
