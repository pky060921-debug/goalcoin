import React, { useState, useEffect, Component, ReactNode, useRef } from "react";
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
const InlineBlankInput = React.memo(({ inputStatus, onSubmit }: {
  inputStatus: string;
  onSubmit: (val: string) => void;
  expectedAnswer: string; // 💡 정답을 넘겨받음
}) => {
  const [val, setVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { if (inputStatus === 'correct' || inputStatus === 'idle') setVal(''); }, [inputStatus]);

  // 💡 [핵심] 한 글자 입력될 때마다 정답 체크
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setVal(newVal);
    
    // 정답과 완전히 일치하면 엔터 없이 바로 onSubmit 실행
    if (newVal.replace(/\s+/g, '').toLowerCase() === expectedAnswer.replace(/\s+/g, '').toLowerCase()) {
      onSubmit(newVal);
    }
  };
  
  return (
    <input
      ref={inputRef}
      type="text"
      value={val}
      autoComplete="off" autoCorrect="off" spellCheck={false} autoCapitalize="none"
      onChange={handleChange} // 💡 수정된 검사 함수 사용
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter') onSubmit(val);
      }}
      placeholder="입력..."
      style={{ width: `${Math.max(60, val.length * 15 + 40)}px`, transition: 'width 0.15s ease' }}
      className={`inline-block h-7 bg-indigo-900/30 border-b-2 outline-none text-center font-bold transition-colors duration-150 mx-1 px-1 rounded-t-sm ${
        inputStatus === 'wrong'
          ? 'border-red-500 text-red-400 bg-red-900/40'
          : inputStatus === 'correct'
          ? 'border-teal-500 text-teal-300 bg-teal-900/20'
          : 'border-indigo-400 text-amber-300 focus:border-amber-400'
      }`}
    />
  );
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
      const [catRes, cardRes, balance] = await Promise.all([
        fetch(`https://api.blankd.top/api/get-categories?wallet_address=${safeAddress}`).then(r=>r.json()),
        fetch(`https://api.blankd.top/api/my-cards?wallet_address=${safeAddress}`).then(r=>r.json()),
        api.getGoalCoinBalance(safeAddress).catch(()=>0)
      ]);
      setCategories(catRes.categories || []); 
      setSavedCards(cardRes.cards || []); 
      setGoalBalance(balance);
    } catch (e: any) { 
      addLog(`? 데이터 동기화 실패: ${e.message}`);
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
    
    if (expected === actual) {
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

// --- [스마트 추론 알고리즘] ---
  let nextCatToCraft = null;
  let nextStudyCard = null;

  if (isLoggedIn && categories.length > 0) {
    const craftedOrigIds = new Set();
    const craftedTitles: string[] = []; 

    // ?? 괄호(목적 등)와 특수문자를 완전히 날리는 정밀 필터 함수
    const cleanText = (text: string) => {
       if (!text) return "";
       const noBrackets = text.replace(/\([^)]*\)|\[[^\]]*\]|<[^>]*>/g, '');
       return noBrackets.replace(/[^가-힣a-zA-Z0-9一-龥]/g, '');
    };

    savedCards.forEach((c: any) => {
      const match = c.content.match(/\[\[ORIG_ID:(\d+)\]\]/);
      if (match) craftedOrigIds.add(parseInt(match[1], 10));
      
      const firstLine = c.content.split('\n')[0];
      if (firstLine) {
        craftedTitles.push(cleanText(firstLine));
      }
    });

    const sortedCats = [...categories].sort((a: any, b: any) => a.id - b.id);
    
    nextCatToCraft = sortedCats.find((cat: any) => {
      const isIdCrafted = craftedOrigIds.has(cat.id);
      const cleanCatTitle = cleanText(cat.title || "");
      
      const isTitleCrafted = cleanCatTitle 
         ? craftedTitles.some(title => title === cleanCatTitle || title.endsWith(cleanCatTitle))
         : false;
      
      return !isIdCrafted && !isTitleCrafted;
    });
  }
  
  if (isLoggedIn && savedCards.length > 0) {
    const cardsWithStatus = savedCards.map(c => {
       const { body } = formatCardText(c.content);
       const blanksCount = (body.match(/\[\s*(.*?)\s*\]/g) || []).length;
       const stats = parseCardStats(c.memo);
       return { ...c, totalBlanks: blanksCount, filled: stats.filled, wrongCount: stats.wrongIndices.length };
    }).sort((a, b) => a.id - b.id);

    // 1순위: 풀다 만 것, 2순위: 안 푼 것, 3순위: 오답 있는 것
    nextStudyCard = cardsWithStatus.find(c => c.filled > 0 && c.filled < c.totalBlanks) 
                 || cardsWithStatus.find(c => c.filled === 0 && c.totalBlanks > 0)
                 || cardsWithStatus.find(c => c.wrongCount > 0)
                 || cardsWithStatus[0];
  }
  // ▲▲▲▲▲▲▲▲▲ 여기까지 추가 ▲▲▲▲▲▲▲▲▲

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
            {isMemoOpen ? '닫기 ?' : '?? 메모 열기'}
          </button>
          <button 
            onClick={toggleVoiceRecognition} 
            className={`flex-1 min-w-[120px] py-1.5 border rounded-sm text-[11px] font-bold transition-all shadow-md ${
              isListening 
                ? 'bg-red-600/50 text-white border-red-500 animate-pulse' 
                : 'bg-blue-900/30 text-blue-400 border-blue-500/50 hover:bg-blue-900/50'
            }`}
          >
            {isListening ? '??? 음성 인식 끄기 (활성화됨)' : '?? 음성으로 입력 (계속 켜두기)'}
          </button>
          <button onClick={handleShowAnswer} className="px-3 py-1.5 bg-red-900/30 text-red-400 border border-red-500/50 rounded-sm text-[11px] font-bold shrink-0 hover:bg-red-900/50 transition-all shadow-md">
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
            {/* 구분선 */}
            <div className="h-5 sm:h-6 w-px bg-white/10 shrink-0 hidden sm:block"></div>

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
        <main className="max-w-6xl mx-auto w-full">
          <ErrorBoundary fallbackLog={addLog}>
            
            <div className={activeTab === 'progress' ? 'block' : 'hidden'}>
              <DashboardTab 
                categories={categories} 
                savedCards={savedCards} 
                setActiveTab={setActiveTab}
                setExpandedId={setExpandedId}
                setActiveCard={setActiveCard}
              />
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
                handleDeleteCategory={async (id: number) => {
                  if(confirm('삭제하시겠습니까?')){
                    await fetch("https://api.blankd.top/api/delete-category", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ wallet_address: safeAddress, id })
                    });
                    loadAllData();
                  }
                }} 
              />
            </div>
            
            <div className={activeTab === 'enhance' ? 'block' : 'hidden'}>
              <EnhanceTab 
                categories={categories}
                savedCards={savedCards} 
                colCount={colCount} 
                viewMode={viewMode} 
                setActiveCard={setActiveCard} 
                setActiveTab={setActiveTab}
                setExpandedId={setExpandedId}
                handleDeleteCard={async (id: number) => {
                  if(confirm('삭제하시겠습니까?')){
                    await fetch("https://api.blankd.top/api/delete-card", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ wallet_address: safeAddress, id })
                    });
                    setActiveCard(null);
                    loadAllData();
                  }
                }} 
              />
            </div>
            
            <div className={activeTab === 'exam' ? 'block' : 'hidden'}>
              <ExamTab walletAddress={safeAddress} address={safeAddress} />
            </div>
            
            <div className={activeTab === 'settings' ? 'block' : 'hidden'}>
              <MypageTab 
                safeAddress={safeAddress} 
                enokiFlow={enokiFlow} 
                useAiRecommend={useAiRecommend} 
                setUseAiRecommend={setUseAiRecommend} 
                viewMode={viewMode} 
                setViewMode={setViewMode} 
                colCount={colCount} 
                updateColCount={setColCount} 
                handleDeleteAll={async () => { 
                  if(confirm('전체 초기화하시겠습니까?')) { 
                    await api.deleteAll(safeAddress);
                    loadAllData();
                  } 
                }} 
              />
            </div>

          </ErrorBoundary>
        </main>
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
