import React, { useState, useEffect, Component, ReactNode, useRef } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { useEnokiFlow, useZkLogin } from "@mysten/enoki/react";
import { api } from "./services/api";
import { SPLIT_REGEX, formatCardText, parseCardStats, stringifyCardStats } from "./utils/constants";
import { CardModal } from "./components/CardModal";
import { DashboardTab } from "./tabs/DashboardTab";
import { CraftTab } from "./tabs/CraftTab";
import { EnhanceTab } from "./tabs/EnhanceTab";
import { ExamTab } from "./tabs/ExamTab";
import { MypageTab } from "./tabs/MypageTab";

class ErrorBoundary extends Component<{children: ReactNode, fallbackLog: (msg: string) => void}, {hasError: boolean, errorMessage: string}> {
  constructor(props: any) { super(props); this.state = { hasError: false, errorMessage: "" }; }
  static getDerivedStateFromError(error: any) { return { hasError: true, errorMessage: error.message }; }
  componentDidCatch(error: any, errorInfo: any) { this.props.fallbackLog(`❌ 에러: ${error.message}`); }
  render() {
    if (this.state.hasError) return <div className="p-4 sm:p-6 text-red-400 font-mono border border-red-500/30 text-xs sm:text-sm">⚠️ 렌더링 에러: {this.state.errorMessage}</div>;
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
  } catch (e) { console.error("큐 저장 에러", e); }
};

function MainApp() {
  const enokiFlow = useEnokiFlow();
  const zkLogin = useZkLogin();
  const suiWalletAccount = useCurrentAccount();
  const safeAddress = suiWalletAccount?.address || zkLogin?.address || "";
  const isLoggedIn = safeAddress.length > 0;
  
  const [activeTab, setActiveTab] = useState('progress');
  const [categories, setCategories] = useState<any[]>([]);
  const [savedCards, setSavedCards] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [activeCard, setActiveCard] = useState<any>(null);
  
  const [viewMode, setViewMode] = useState('all');
  const [colCount, setColCount] = useState(3);
  const [useAiRecommend, setUseAiRecommend] = useState(true);
  
  const [lawFile, setLawFile] = useState<File | null>(null);
  const [examFile, setExamFile] = useState<File | null>(null);
  const [systemLogs, setSystemLogs] = useState<string[]>(["[System] 터미널 온라인..."]);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);

  const [blanks, setBlanks] = useState<{answer: string, correct: boolean}[]>([]);
  const [currentBlankIdx, setCurrentBlankIdx] = useState(0);
  const [answerInput, setAnswerInput] = useState("");
  const [inputStatus, setInputStatus] = useState<'idle'|'correct'|'wrong'>('idle');
  const [startTime, setStartTime] = useState<number>(0);
  const [elapsed, setElapsed] = useState<number>(0);
  const [totalTimeLimit, setTotalTimeLimit] = useState<number>(0);

  const statsRef = useRef({ text: "", filled: 0, wrongIndices: new Set<number>() });
  const isClosingRef = useRef(false);

  const addLog = (msg: string) => setSystemLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`].slice(-40));

  useEffect(() => { document.title = "빈칸개발(BlankD)"; }, []);

  useEffect(() => {
    if (window.location.hash) {
      enokiFlow.handleAuthCallback().then(() => { window.history.replaceState(null, '', window.location.pathname); addLog("✅ 로그인 콜백 완료"); }).catch((err: any) => addLog(`❌ 인증 실패: ${err.message}`));
    }
    if (isLoggedIn) loadAllData();
  }, [isLoggedIn, safeAddress, enokiFlow]);

  const loadAllData = async () => {
    try {
      const [catRes, cardRes, examRes] = await Promise.all([
        fetch(`https://api.blankd.top/api/get-categories?wallet_address=${safeAddress}`).then(r=>r.json()),
        fetch(`https://api.blankd.top/api/my-cards?wallet_address=${safeAddress}`).then(r=>r.json()),
        fetch(`https://api.blankd.top/api/get-all-exams?wallet_address=${safeAddress}`).then(r=>r.json())
      ]);
      setCategories(catRes.categories || []); setSavedCards(cardRes.cards || []); setExams(examRes.exams || []);
    } catch (e: any) { addLog(`❌ 데이터 로드 실패: ${e.message}`); }
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
        addLog(`🔄 백그라운드 일괄 동기화 (메모 ${q.memos.length}건, 결과 ${q.answers.length}건)`);
      }
    } catch (e) {
      addLog("⚠️ 오프라인 상태: 동기화 대기 중..."); 
    }
  };

  useEffect(() => {
    if (!safeAddress) return;
    const interval = setInterval(flushQueue, 30000); 
    const handleVisibility = () => { if(document.visibilityState === 'hidden') flushQueue(); };
    document.addEventListener('visibilitychange', handleVisibility);
    
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [safeAddress]);

  const uploadLaw = async () => {
    if (!lawFile) return alert("파일을 선택해주세요.");
    const fd = new FormData(); fd.append("file", lawFile); fd.append("wallet_address", safeAddress);
    const res = await fetch(`https://api.blankd.top/api/upload-pdf`, { method: "POST", body: fd });
    if (res.ok) { setLawFile(null); setTimeout(() => loadAllData(), 2000); }
  };

  const uploadExam = async () => {
    if (!examFile) return alert("파일을 선택해주세요.");
    const fd = new FormData(); fd.append("file", examFile); fd.append("wallet_address", safeAddress);
    const res = await fetch(`https://api.blankd.top/api/upload-exam`, { method: "POST", body: fd });
    if (res.ok) { setExamFile(null); setTimeout(() => loadAllData(), 2000); }
  };

  const handleMakeBlankCard = async (cat: any, content: string, selectedIndices: Set<number>, memo: string, onComplete: () => void) => {
    const words = content ? content.split(SPLIT_REGEX) : [];
    let bodyContent = ""; let answerText = ""; let isBlanking = false;
    words.forEach((word, index) => {
      if (selectedIndices.has(index)) {
        if (!isBlanking) { bodyContent += "[ "; isBlanking = true; }
        bodyContent += word; answerText += (answerText ? ", " : "") + word;
      } else { if (isBlanking) { bodyContent += " ]"; isBlanking = false; } bodyContent += word; }
    });
    if (isBlanking) bodyContent += " ]";
    
    const finalCardContent = `${cat.title}\n\n${bodyContent}`;
    const initialMemo = stringifyCardStats(memo, 0, []);

    const res = await fetch("https://api.blankd.top/api/save-card", { 
      method: "POST", headers: { "Content-Type": "application/json" }, 
      body: JSON.stringify({ wallet_address: safeAddress, card_content: finalCardContent, answer_text: answerText, folder_name: cat.folder_name, memo: initialMemo }) 
    });
    if (res.ok) {
      await fetch("https://api.blankd.top/api/delete-category", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_address: safeAddress, id: cat.id }) });
      loadAllData(); onComplete(); setActiveTab('enhance');
    }
  };

  const handleUpdateMemoBackground = (id: number, memo: string) => {
    setSavedCards(prev => prev.map(c => c.id === id ? { ...c, memo } : c));
    pushToQueue('MEMO', { id, memo });
  };

  useEffect(() => {
    if (activeCard) {
      isClosingRef.current = false;
      const { body } = formatCardText(activeCard.content);
      const foundBlanks: {answer: string, correct: boolean}[] = [];
      const regex = /\[\s*(.*?)\s*\]/g; let match;
      while((match = regex.exec(body)) !== null) {
        foundBlanks.push({ answer: match[1].trim(), correct: false });
      }
      setBlanks(foundBlanks); setCurrentBlankIdx(0); setAnswerInput(""); setInputStatus('idle');
      setTotalTimeLimit(5.0 * foundBlanks.length); setStartTime(Date.now()); setElapsed(0);
      
      const stats = parseCardStats(activeCard.memo);
      statsRef.current = { text: stats.text, filled: stats.filled, wrongIndices: new Set(stats.wrongIndices) };
    }
  }, [activeCard]);

  const finishCard = () => {
    if (isClosingRef.current || !activeCard) return;
    isClosingRef.current = true; 

    const currentId = activeCard.id;
    const finalTime = elapsed;
    const wrongArr = Array.from(statsRef.current.wrongIndices);
    const newMemo = stringifyCardStats(statsRef.current.text, statsRef.current.filled, wrongArr);
    const isCorrect = wrongArr.length === 0;

    setActiveCard(null); 
    setSavedCards(prev => prev.map(c => c.id === currentId ? { ...c, memo: newMemo } : c));

    pushToQueue('MEMO', { id: currentId, memo: newMemo });
    pushToQueue('ANSWER', { card_id: currentId, is_correct: isCorrect, clear_time: finalTime });

    addLog(`✅ 로컬 기기에 임시 저장 (ID:${currentId})`);
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
        if (diff >= totalTimeLimit) { 
          clearInterval(interval); 
          alert("시간 초과! 지금까지의 기록이 자동 저장됩니다.");
          finishCard(); 
        }
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
    
    let actual = answerInput;
    if (typeof overrideInput === 'string') actual = overrideInput;
    actual = actual.replace(/\s+/g, '').toLowerCase();
    
    if (expected === actual) {
      // 💡 [핵심 해결] 한글 IME 조합 잔여물 방지를 위해 포커스를 강제로 잠깐 뺍니다.
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      setInputStatus('correct');
      const nb = [...blanks]; nb[currentBlankIdx].correct = true; setBlanks(nb);
      
      statsRef.current.wrongIndices.delete(currentBlankIdx);
      statsRef.current.filled += 1; 

      setTimeout(() => { 
        setAnswerInput(""); setInputStatus('idle'); 
        if (currentBlankIdx + 1 < nb.length) setCurrentBlankIdx(currentBlankIdx + 1); 
        else finishCard(); 
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
    
    const nb = [...blanks];
    nb[currentBlankIdx].correct = true; 
    setBlanks(nb);

    setTimeout(() => {
      setAnswerInput(""); setInputStatus('idle');
      if (currentBlankIdx + 1 < nb.length) setCurrentBlankIdx(currentBlankIdx + 1);
      else finishCard();
    }, 1000); 
  };

  return (
    <div className="min-h-screen bg-[#0d0d0f] text-[#d1d1d1] p-4 sm:p-6 md:p-8 relative pb-24 font-sans text-pretty overflow-x-hidden">
      <header className="max-w-6xl mx-auto border-b border-white/10 pb-4 sm:pb-6 mb-8 sm:mb-12 flex items-center justify-between gap-4">
        <h1 className="text-xl sm:text-2xl font-bold tracking-widest text-white shrink-0">
          BlankD
        </h1>
        {isLoggedIn && (
          <nav className="flex gap-2 sm:gap-6 overflow-x-auto w-full scrollbar-hide justify-end sm:justify-start">
            {[{ id: 'progress', label: '진행상황' }, { id: 'create', label: '만들기' }, { id: 'enhance', label: '강화' }, { id: 'exam', label: '모의고사' }, { id: 'settings', label: '설정' }].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`text-[11px] sm:text-sm font-bold tracking-widest whitespace-nowrap px-2 py-1 transition-all ${activeTab === tab.id ? 'text-white border-b-2 border-white' : 'text-white/40 hover:text-white'}`}>{tab.label}</button>
            ))}
          </nav>
        )}
      </header>

      {!isLoggedIn ? (
        <main className="max-w-md mx-auto mt-20 sm:mt-24 flex flex-col items-center px-4">
          <h2 className="text-xl sm:text-2xl font-serif text-white mb-4">빈칸개발(BlankD)</h2>
          <p className="text-xs sm:text-sm text-white/40 mb-10 sm:mb-12 text-center leading-relaxed">인지 과학 기반의 간격 반복 학습으로<br/>영구 기억을 형성합니다.</p>
          <button onClick={async () => { window.location.href = await enokiFlow.createAuthorizationURL({ provider: 'google', clientId: '536814695888-bepe0chce3nq31vuu3th60c7al7vpsv7.apps.googleusercontent.com', redirectUrl: window.location.origin, network: 'testnet', extraParams: { scope: ['openid', 'email', 'profile'] }}); }} className="w-full py-3 sm:py-4 bg-white text-black text-sm sm:text-base font-bold rounded-sm mb-6 transition-transform active:scale-95 shadow-lg">Google 계정으로 시작하기</button>
        </main>
      ) : (
        <main className="max-w-6xl mx-auto w-full">
          <ErrorBoundary fallbackLog={addLog}>
            {activeTab === 'progress' && <DashboardTab categories={categories} savedCards={savedCards} />}
            {activeTab === 'create' && <CraftTab categories={categories} colCount={colCount} viewMode={viewMode} useAiRecommend={useAiRecommend} safeAddress={safeAddress} lawFile={lawFile} setLawFile={setLawFile} uploadLaw={uploadLaw} handleMakeBlankCard={handleMakeBlankCard} addLog={addLog} handleDeleteCategory={async (id:number)=>{if(confirm('삭제하시겠습니까?')){await fetch("https://api.blankd.top/api/delete-category",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({wallet_address:safeAddress,id})});loadAllData();}}} />}
            {activeTab === 'enhance' && <EnhanceTab savedCards={savedCards} colCount={colCount} viewMode={viewMode} setActiveCard={setActiveCard} handleDeleteCard={async (id:number)=>{if(confirm('삭제하시겠습니까?')){await fetch("https://api.blankd.top/api/delete-card",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({wallet_address:safeAddress,id})});setActiveCard(null);loadAllData();}}} />}
            {activeTab === 'exam' && <ExamTab exams={exams} examFile={examFile} setExamFile={setExamFile} uploadExam={uploadExam} />}
            {activeTab === 'settings' && <MypageTab safeAddress={safeAddress} enokiFlow={enokiFlow} useAiRecommend={useAiRecommend} setUseAiRecommend={setUseAiRecommend} viewMode={viewMode} setViewMode={setViewMode} colCount={colCount} updateColCount={setColCount} handleDeleteAll={async () => { if(confirm('전체 초기화하시겠습니까?')) { await api.deleteAll(safeAddress); loadAllData(); } }} />}
          </ErrorBoundary>
        </main>
      )}

      <div className="fixed bottom-4 right-4 z-[999] flex flex-col items-end gap-2">
        {isTerminalOpen && (
          <div className="w-[85vw] max-w-lg h-56 sm:h-64 bg-black/95 border border-teal-500/30 p-3 sm:p-4 font-mono text-[9px] sm:text-[11px] text-teal-400 overflow-y-auto rounded shadow-2xl flex flex-col custom-scrollbar animate-in slide-in-from-bottom-5 fade-in">
            <div className="flex justify-between items-center mb-2 border-b border-teal-500/10 pb-2 sticky top-0 bg-black/95">
              <span className="uppercase tracking-widest text-teal-500/50 font-bold">Diagnostic Terminal</span>
              <button onClick={() => setSystemLogs([])} className="text-white/40 hover:text-white px-2 py-0.5 bg-white/5 rounded transition-colors">Clear</button>
            </div>
            <div className="space-y-1 flex-1 overflow-y-auto custom-scrollbar pr-1">
              {systemLogs.map((l, i) => (
                <div key={i} className={`leading-snug break-all ${l.includes('❌') ? 'text-red-400 font-bold' : l.includes('▶️') ? 'text-amber-300' : ''}`}>{l}</div>
              ))}
            </div>
          </div>
        )}
        <button 
          onClick={() => setIsTerminalOpen(!isTerminalOpen)} 
          className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full font-bold text-[10px] sm:text-[11px] uppercase tracking-wider shadow-lg transition-all border ${isTerminalOpen ? 'bg-red-900/50 border-red-500/50 text-red-400 hover:bg-red-900/80' : 'bg-teal-900/50 border-teal-500/50 text-teal-400 hover:bg-teal-900/80'}`}
        >
          {isTerminalOpen ? 'Close Terminal' : 'Open Terminal'}
        </button>
      </div>

      {activeCard && (
        <CardModal activeCard={activeCard} totalTimeLimit={totalTimeLimit} elapsed={elapsed} answerInput={answerInput} setAnswerInput={setAnswerInput} inputStatus={inputStatus} handleSequentialInput={handleSequentialInput} 
          renderContent={() => {
            const { body } = formatCardText(activeCard.content);
            const parts = body.split(/(\[.*?\])/g); let bIdx = 0;
            return (
              <div className="flex flex-col gap-4 sm:gap-6 w-full">
                <div className="whitespace-pre-wrap leading-relaxed text-[13px] sm:text-[14px] md:text-[15px] font-serif break-keep">
                  {parts.map((part: string, i: number) => {
                    if (part.startsWith('[') && part.endsWith(']')) {
                      const isCorrect = blanks[bIdx]?.correct; 
                      const isCurrent = bIdx === currentBlankIdx; 
                      const isWrong = statsRef.current.wrongIndices.has(bIdx); 
                      bIdx++;
                      if (isCorrect) return <span key={i} className={`font-bold mx-1 ${isWrong ? 'text-red-400' : 'text-green-400'}`}>{part.replace(/\[|\]/g, '')}</span>;
                      else if (isCurrent) return <span key={i} className="inline-block min-w-[50px] sm:min-w-[60px] h-4 sm:h-5 bg-indigo-500/30 border-b-2 border-indigo-400 mx-1 animate-pulse align-middle"></span>;
                      else return <span key={i} className="inline-block min-w-[50px] sm:min-w-[60px] h-4 sm:h-5 bg-white/10 border-b border-white/50 mx-1 align-middle"></span>;
                    } return <span key={i}>{part}</span>;
                  })}
                </div>
                
                <div className="flex justify-end w-full mb-1 sm:mb-2">
                  <button onClick={handleShowAnswer} className="px-2 sm:px-3 py-1 sm:py-1.5 bg-red-900/30 text-red-400 border border-red-500/50 rounded-sm text-[10px] sm:text-[11px] font-bold shrink-0 hover:bg-red-900/50 transition-colors shadow-sm">정답 보기 (오답 처리)</button>
                </div>

                <div className="pt-3 sm:pt-4 border-t border-white/10 w-full animate-in fade-in">
                  <div className="text-[10px] sm:text-[11px] text-teal-500/50 mb-1.5 sm:mb-2 font-bold uppercase tracking-widest">📝 Memo</div>
                  <input defaultValue={statsRef.current.text || ""} placeholder="메모 입력..." onBlur={(e) => { statsRef.current.text = e.target.value; handleUpdateMemoBackground(activeCard.id, stringifyCardStats(statsRef.current.text, statsRef.current.filled, Array.from(statsRef.current.wrongIndices))); }} className="text-[12px] sm:text-[13px] text-teal-300 bg-teal-950/20 p-2.5 sm:p-3 rounded border border-teal-500/30 w-full outline-none focus:border-teal-400 transition-colors" />
                </div>
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
