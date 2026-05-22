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

class ErrorBoundary extends Component<{children: ReactNode, fallbackLog: (msg: string) => void}, {hasError: boolean, errorMessage: string}> {
  constructor(props: any) { 
    super(props);
    this.state = { hasError: false, errorMessage: "" }; 
  }
  static getDerivedStateFromError(error: any) { 
    return { hasError: true, errorMessage: error.message };
  }
  componentDidCatch(error: any, errorInfo: any) { 
    this.props.fallbackLog(`❌ 런타임 에러: ${error.message}`);
  }
  render() {
    if (this.state.hasError) return (
      <div className="p-6 text-red-400 font-mono border border-red-500/30 bg-red-900/10 rounded-sm shadow-xl">
        <h3 className="text-lg font-bold mb-2">⚠️ 시스템 치명적 오류</h3>
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
  const [exams, setExams] = useState<any[]>([]);
  const [activeCard, setActiveCard] = useState<any>(null);
  
  const [viewMode, setViewMode] = useState('all');
  const [colCount, setColCount] = useState(3);
  const [useAiRecommend, setUseAiRecommend] = useState(true);
  
  const [lawFile, setLawFile] = useState<File | null>(null);
  const [examFile, setExamFile] = useState<File | null>(null);
  const [systemLogs, setSystemLogs] = useState<string[]>(["[System] 터미널 온라인. 환영합니다, 설계자님."]);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  
  const [isMemoOpen, setIsMemoOpen] = useState(false);

  const [blanks, setBlanks] = useState<{answer: string, correct: boolean}[]>([]);
  const [currentBlankIdx, setCurrentBlankIdx] = useState(0);
  const [answerInput, setAnswerInput] = useState("");
  const [inputStatus, setInputStatus] = useState<'idle'|'correct'|'wrong'>('idle');
  const [startTime, setStartTime] = useState<number>(0);
  const [elapsed, setElapsed] = useState<number>(0);
  const [totalTimeLimit, setTotalTimeLimit] = useState<number>(0);

  const [goalBalance, setGoalBalance] = useState<number>(0);
  const [isListening, setIsListening] = useState(false);
  const statsRef = useRef({ text: "", filled: 0, wrongIndices: new Set<number>() });
  const isClosingRef = useRef(false);

  // 💡 만들기 탭의 확장 상태를 App 단으로 끌어올려 대시보드와 동기화합니다.
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
      }).catch((err: any) => addLog(`❌ 인증 실패: ${err.message}`));
    }
    if (isLoggedIn) loadAllData();
  }, [isLoggedIn, safeAddress, enokiFlow]);

  const loadAllData = async () => {
    try {
      const [catRes, cardRes, examRes, balance] = await Promise.all([
        fetch(`https://api.blankd.top/api/get-categories?wallet_address=${safeAddress}`).then(r=>r.json()),
        fetch(`https://api.blankd.top/api/my-cards?wallet_address=${safeAddress}`).then(r=>r.json()),
        fetch(`https://api.blankd.top/api/get-all-exams?wallet_address=${safeAddress}`).then(r=>r.json()),
        api.getGoalCoinBalance(safeAddress)
      ]);
      setCategories(catRes.categories || []); 
      setSavedCards(cardRes.cards || []); 
      setExams(examRes.exams || []);
      setGoalBalance(balance);
    } catch (e: any) { 
      addLog(`❌ 데이터 동기화 실패: ${e.message}`);
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
        addLog(`🔄 백그라운드 동기화 완료 (M:${q.memos.length}, A:${q.answers.length})`);
        const newBalance = await api.getGoalCoinBalance(safeAddress);
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

  const uploadExam = async () => {
    if (!examFile) return alert("파일을 선택해주세요.");
    addLog("▶️ 모의고사 데이터 주입 시작...");
    const fd = new FormData(); fd.append("file", examFile); fd.append("wallet_address", safeAddress);
    const res = await fetch(`https://api.blankd.top/api/upload-exam`, { method: "POST", body: fd });
    if (res.ok) { 
      setExamFile(null); 
      addLog("✅ 기출문제 분석 및 반영 완료"); 
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
          addLog(`✂️ [${title1}] 분할 완료`); 
          await loadAllData(); 
        }
    } catch (e: any) { 
      addLog(`❌ 분할 처리 통신 에러`);
    }
  };

  const handleMakeBlankCard = async (cat: any, wordsArray: string[], selectedIndices: Set<number>, pageBreaks: Set<number>, memo: string, onComplete: () => void) => {
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
    
    const finalCardContent = `${cat.title}\n\n${bodyContent}\n\n[[ORIG_ID:${cat.id}]]`;
    const initialMemo = stringifyCardStats(memo, 0, []);
    
    const res = await fetch("https://api.blankd.top/api/save-card", { 
      method: "POST", headers: { "Content-Type": "application/json" }, 
      body: JSON.stringify({ wallet_address: safeAddress, card_id: cat.id, card_content: finalCardContent, answer_text: answerText, folder_name: cat.folder_name, memo: initialMemo }) 
    });
    
    if (res.ok) {
      // 💡 진행상황 체크포인트를 위해 카드의 ID와 제목 정보를 정밀 동기화합니다.
      localStorage.setItem('blankd_last_crafted_id', cat.id.toString());
      localStorage.setItem('blankd_last_crafted_title', cat.title);
      addLog("✅ 지식 추출 완료: 다음 조항을 바로 오픈합니다.");
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
      setAnswerInput(""); 
      setInputStatus('idle');
      
      const stats = parseCardStats(activeCard.memo);
      const timePerBlank = Math.max(3.0, 10.0 - (stats.filled * 0.5));
      setTotalTimeLimit(timePerBlank * foundBlanks.length); 
      
      setStartTime(Date.now()); 
      setElapsed(0);
      setIsListening(false); 
      setIsMemoOpen(false); 
      
      let cleanText = stats.text;
      if (cleanText) {
         cleanText = cleanText.replace(/\(\s*\)\s*=>\s*x\(\s*null\s*\)/g, "").trim();
      }
      statsRef.current = { text: cleanText, filled: stats.filled, wrongIndices: new Set(stats.wrongIndices) };
      
      // 💡 진행상황 체크포인트를 위해 학습 카드의 ID와 제목 정보를 연동합니다.
      const cleanTitle = getStrictTitleOnly(cleanContent);
      localStorage.setItem('blankd_last_enhanced_id', activeCard.id.toString());
      localStorage.setItem('blankd_last_enhanced_title', cleanTitle || "이름 없는 카드");
    }
  }, [activeCard]);

  const finishCard = () => {
    if (isClosingRef.current || !activeCard) return;
    isClosingRef.current = true; 
    const currentId = activeCard.id;
    const currentFolder = activeCard.folder_name;
    const finalTime = elapsed;
    const wrongArr = Array.from(statsRef.current.wrongIndices);
    const newMemo = stringifyCardStats(statsRef.current.text, statsRef.current.filled, wrongArr);
    const isCorrect = wrongArr.length === 0;

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
    pushToQueue('ANSWER', { card_id: currentId, is_correct: isCorrect, clear_time: finalTime });
    addLog(`✅ 학습 완료 (ID:${currentId})`);
    flushQueue();
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

  useEffect(() => {
    if (inputStatus === 'idle' && blanks[currentBlankIdx] && answerInput) {
      const expected = blanks[currentBlankIdx].answer.replace(/\s+/g, '').toLowerCase();
      const actual = answerInput.replace(/\s+/g, '').toLowerCase();
      if (expected === actual) handleSequentialInput(actual); 
    }
  }, [answerInput, inputStatus, blanks, currentBlankIdx]);

  const handleSequentialInput = (overrideInput?: string | any) => {
    if (inputStatus === 'correct' || inputStatus === 'wrong' || !blanks[currentBlankIdx]) return;
    const expected = blanks[currentBlankIdx].answer.replace(/\s+/g, '').toLowerCase();
    let actual = typeof overrideInput === 'string' ? overrideInput : answerInput.replace(/\s+/g, '').toLowerCase();
    
    if (expected === actual) {
      const activeEl = document.activeElement as HTMLElement;
      if (activeEl) activeEl.blur(); 

      setInputStatus('correct');
      const nb = [...blanks]; nb[currentBlankIdx].correct = true; setBlanks(nb);
      statsRef.current.wrongIndices.delete(currentBlankIdx);
      statsRef.current.filled += 1;
      
      setTimeout(() => { 
        setAnswerInput(""); 
        setTimeout(() => {
          setInputStatus('idle'); 
          if (currentBlankIdx + 1 < nb.length) {
            setCurrentBlankIdx(currentBlankIdx + 1); 
            localStorage.setItem(`blankd_progress_${activeCard.id}`, (currentBlankIdx + 1).toString());
          } else { 
            localStorage.removeItem(`blankd_progress_${activeCard.id}`);
            finishCard(); 
          }
        }, 130);
      }, 20);
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
    const nb = [...blanks];
    nb[currentBlankIdx].correct = true; 
    setBlanks(nb);
    setTimeout(() => {
      setAnswerInput(""); 
      setInputStatus('idle');
      if (currentBlankIdx + 1 < nb.length) {
        setCurrentBlankIdx(currentBlankIdx + 1);
        localStorage.setItem(`blankd_progress_${activeCard.id}`, (currentBlankIdx + 1).toString());
      } else {
        localStorage.removeItem(`blankd_progress_${activeCard.id}`);
        finishCard();
      }
    }, 1000);
  };

  const startVoiceRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { alert("크롬 브라우저를 권장합니다."); return; }
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR'; 
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => { 
      setIsListening(true); 
      addLog("🎙️ 음성 인식 대기 중...");
    };
    
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      const cleanText = transcript.replace(/\s+/g, '').replace(/[.,!?]/g, '');
      setAnswerInput(cleanText);
      addLog(`🗣️ 인식: "${transcript}"`);
      setTimeout(() => handleSequentialInput(cleanText), 300);
    };
    
    recognition.onerror = (err: any) => { setIsListening(false); };
    recognition.onend = () => { setIsListening(false); };
    recognition.start();
  };

  return (
    <div className="min-h-screen bg-[#0d0d0f] text-[#d1d1d1] p-4 sm:p-6 md:p-8 relative pb-24 font-sans text-pretty overflow-x-hidden transition-colors">
      <header className="max-w-6xl mx-auto border-b border-white/10 pb-4 sm:pb-6 mb-8 sm:mb-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center justify-between w-full sm:w-auto">
          <h1 className="text-xl sm:text-2xl font-bold tracking-widest text-white shrink-0">BlankD</h1>
          {isLoggedIn && (
            <div className="sm:hidden flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-full">
              <span className="text-[12px] font-bold text-amber-400">{goalBalance.toFixed(2)} GOAL</span>
            </div>
          )}
        </div>
        
        {isLoggedIn && (
          <div className="flex items-center w-full sm:w-auto justify-between gap-4">
            <nav className="flex gap-2 sm:gap-6 overflow-x-auto scrollbar-hide">
              {[{ id: 'progress', label: '진행상황' }, { id: 'create', label: '만들기' }, { id: 'enhance', label: '채우기' }, { id: 'exam', label: '모의고사' }, { id: 'settings', label: '설정' }].map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`text-[11px] sm:text-sm font-bold tracking-widest whitespace-nowrap px-2 py-1 transition-all ${activeTab === tab.id ? 'text-white border-b-2 border-white' : 'text-white/40 hover:text-white'}`}>{tab.label}</button>
              ))}
            </nav>
            <div className="hidden sm:flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 px-4 py-1.5 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.1)]">
              <span className="text-sm font-bold text-amber-400">{goalBalance.toFixed(2)} GOAL</span>
            </div>
          </div>
        )}
      </header>

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
              {/* 💡 대시보드 탭에 네비게이션 및 핀셋 체크포인트 제어 상태를 넘깁니다. */}
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
                savedCards={savedCards} 
                colCount={colCount} 
                viewMode={viewMode} 
                setActiveCard={setActiveCard} 
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
                <div key={i} className={`leading-snug break-all ${l.includes('❌') ? 'text-red-400 font-bold' : l.includes('▶️') ? 'text-amber-300' : ''}`}>
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
          answerInput={answerInput}
          setAnswerInput={setAnswerInput}
          inputStatus={inputStatus}
          handleSequentialInput={handleSequentialInput}
          renderContent={() => {
            const cleanContent = activeCard.content.replace(/\n\n\[\[ORIG_ID:\d+\]\]/g, '');
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
                    }
                    else if (isCurrent) {
                      contentToRender.push(
                        <input 
                          key={i}
                          autoFocus
                          value={answerInput}
                          onChange={(e) => setAnswerInput(e.target.value)}
                          onKeyDown={(e) => {
                            if(e.key === 'Enter') handleSequentialInput(e.currentTarget.value);
                          }}
                          placeholder="입력..."
                          style={{ width: `${Math.max(60, answerInput.length * 15 + 40)}px` }}
                          className={`inline-block h-6 bg-indigo-900/30 border-b-2 outline-none text-center font-bold transition-all mx-1 px-1 rounded-t-sm ${
                            inputStatus === 'wrong' 
                              ? 'border-red-500 text-red-400 bg-red-900/40 animate-shake' 
                              : 'border-indigo-400 text-amber-300 focus:border-amber-400'
                          }`}
                        />
                      );
                    }
                    else {
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
                    {isMemoOpen ? '닫기 ✕' : '📝 메모 열기'}
                  </button>
                  
                  <button 
                    onClick={startVoiceRecognition} 
                    className={`flex-1 min-w-[120px] py-1.5 border rounded-sm text-[11px] font-bold transition-all shadow-md ${
                      isListening 
                        ? 'bg-red-600/50 text-white border-red-500 animate-pulse' 
                        : 'bg-blue-900/30 text-blue-400 border-blue-500/50 hover:bg-blue-900/50'
                    }`}
                  >
                    {isListening ? '🎙️ 듣는 중... 말씀하세요' : '🎤 음성으로 입력'}
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
          }} 
          onClose={handleCloseModal} 
        />
      )}
    </div>
  );
}

export default function App() { return <MainApp />; }
