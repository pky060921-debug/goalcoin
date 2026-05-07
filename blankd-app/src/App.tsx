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
    if (this.state.hasError) return <div className="p-6 text-red-400 font-mono border border-red-500/30">⚠️ 렌더링 에러: {this.state.errorMessage}</div>;
    return this.props.children;
  }
}

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

  const [blanks, setBlanks] = useState<{answer: string, correct: boolean}[]>([]);
  const [currentBlankIdx, setCurrentBlankIdx] = useState(0);
  const [answerInput, setAnswerInput] = useState("");
  const [inputStatus, setInputStatus] = useState<'idle'|'correct'|'wrong'>('idle');
  const [startTime, setStartTime] = useState<number>(0);
  const [elapsed, setElapsed] = useState<number>(0);
  const [totalTimeLimit, setTotalTimeLimit] = useState<number>(0);

  const statsRef = useRef({ text: "", filled: 0, wrongIndices: new Set<number>() });

  const addLog = (msg: string) => setSystemLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`].slice(-30));

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
      addLog(`🟢 데이터 로드 완료 (카테고리: ${catRes.categories?.length || 0}개)`);
    } catch (e: any) { addLog(`❌ 데이터 로드 실패: ${e.message}`); }
  };

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

  const handleUpdateMemo = async (id: number, memo: string) => {
    setSavedCards(prev => prev.map(c => c.id === id ? { ...c, memo } : c));
    await fetch("https://api.blankd.top/api/update-card-memo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_address: safeAddress, id, memo }) });
  };

  const submitCombatAnswer = async (isCorrect: boolean, time: number = 999.0) => {
    if (!activeCard) return;
    await fetch("https://api.blankd.top/api/submit-answer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ card_id: activeCard.id, is_correct: isCorrect, clear_time: time }) });
    setActiveCard(null); loadAllData();
  };

  // 💡 [핵심 버그 수정] 비동기 함수로 변경하여, DB 저장이 완벽히 끝난 후 데이터를 다시 불러오게 수정
  const finishCard = async () => {
    const wrongArr = Array.from(statsRef.current.wrongIndices);
    const newMemo = stringifyCardStats(statsRef.current.text, statsRef.current.filled, wrongArr);
    await handleUpdateMemo(activeCard.id, newMemo); // 통계 저장이 끝날 때까지 대기!
    submitCombatAnswer(wrongArr.length === 0, elapsed);
  };

  useEffect(() => {
    if (activeCard) {
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

  useEffect(() => {
    if (activeCard && currentBlankIdx < blanks.length) {
      const interval = setInterval(() => {
        const diff = (Date.now() - startTime) / 1000; setElapsed(diff);
        if (diff >= totalTimeLimit) { clearInterval(interval); finishCard(); }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [activeCard, currentBlankIdx, blanks.length, startTime, totalTimeLimit]);

  const handleSequentialInput = () => {
    if (inputStatus === 'correct' || inputStatus === 'wrong' || !blanks[currentBlankIdx]) return;
    const expected = blanks[currentBlankIdx].answer.replace(/\s+/g, '').toLowerCase();
    const actual = answerInput.replace(/\s+/g, '').toLowerCase();
    
    if (expected === actual) {
      setInputStatus('correct');
      const nb = [...blanks]; nb[currentBlankIdx].correct = true; setBlanks(nb);
      
      // 💡 [수정] 정답 맞히면 오답에서 제거 & 채운 갯수 한계 없이 계속 증가하도록 변경!
      statsRef.current.wrongIndices.delete(currentBlankIdx);
      statsRef.current.filled += 1; 

      setTimeout(() => { 
        setAnswerInput(""); setInputStatus('idle'); 
        if (currentBlankIdx + 1 < blanks.length) setCurrentBlankIdx(currentBlankIdx + 1); 
        else finishCard(); 
      }, 200);
    } else { 
      setInputStatus('wrong'); 
      statsRef.current.wrongIndices.add(currentBlankIdx); 
      setTimeout(() => setInputStatus('idle'), 500); 
    }
  };

  const handleShowAnswer = () => {
    if (!blanks[currentBlankIdx]) return;
    const expected = blanks[currentBlankIdx].answer.replace(/\[|\]/g, '');
    setAnswerInput(expected);
    setInputStatus('wrong');
    statsRef.current.wrongIndices.add(currentBlankIdx); 

    setTimeout(() => {
      setAnswerInput(""); setInputStatus('idle');
      if (currentBlankIdx + 1 < blanks.length) setCurrentBlankIdx(currentBlankIdx + 1);
      else finishCard();
    }, 1000); 
  };

  // 💡 [수정] 모달을 끄기만 해도 현재까지 풀었던 내용이 저장되도록 방어 로직 추가
  const handleCloseModal = async () => {
    const wrongArr = Array.from(statsRef.current.wrongIndices);
    const newMemo = stringifyCardStats(statsRef.current.text, statsRef.current.filled, wrongArr);
    await handleUpdateMemo(activeCard.id, newMemo);
    setActiveCard(null);
  };

  return (
    <div className="min-h-screen bg-[#0d0d0f] text-[#d1d1d1] p-6 relative pb-56 font-sans">
      <header className="max-w-6xl mx-auto border-b border-white/10 pb-6 mb-12 flex items-center gap-10">
        {/* 💡 앱 이름 변경: 빈칸개발 (Blank Develop) */}
        <h1 className="text-xl font-bold tracking-widest text-white shrink-0">
          빈칸개발 <span className="text-sm font-light text-white/50 ml-1">Blank Develop</span>
        </h1>
        {isLoggedIn && (
          <nav className="flex gap-6 overflow-x-auto w-full">
            {[{ id: 'progress', label: '진행상황' }, { id: 'create', label: '만들기' }, { id: 'enhance', label: '강화' }, { id: 'exam', label: '모의고사' }, { id: 'settings', label: '설정' }].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`text-sm font-bold tracking-widest whitespace-nowrap px-2 py-1 ${activeTab === tab.id ? 'text-white border-b-2 border-white' : 'text-white/40 hover:text-white'}`}>{tab.label}</button>
            ))}
          </nav>
        )}
      </header>

      {!isLoggedIn ? (
        <main className="max-w-md mx-auto mt-24 flex flex-col items-center">
          {/* 💡 로그인 화면 앱 이름 변경 */}
          <h2 className="text-2xl font-serif text-white mb-4">빈칸개발 (Blank Develop)</h2>
          <p className="text-sm text-white/40 mb-12 text-center text-pretty">인지 과학 기반의 간격 반복 학습으로<br/>영구 기억을 형성합니다.</p>
          <button onClick={async () => { window.location.href = await enokiFlow.createAuthorizationURL({ provider: 'google', clientId: '536814695888-bepe0chce3nq31vuu3th60c7al7vpsv7.apps.googleusercontent.com', redirectUrl: window.location.origin, network: 'testnet', extraParams: { scope: ['openid', 'email', 'profile'] }}); }} className="w-full py-4 bg-white text-black font-bold rounded-sm mb-6 transition-transform active:scale-95">Google 계정으로 시작하기</button>
        </main>
      ) : (
        <main className="max-w-6xl mx-auto">
          <ErrorBoundary fallbackLog={addLog}>
            {activeTab === 'progress' && <DashboardTab categories={categories} savedCards={savedCards} />}
            {activeTab === 'create' && <CraftTab categories={categories} colCount={colCount} viewMode={viewMode} useAiRecommend={useAiRecommend} lawFile={lawFile} setLawFile={setLawFile} uploadLaw={uploadLaw} handleMakeBlankCard={handleMakeBlankCard} addLog={addLog} handleDeleteCategory={async (id:number)=>{if(confirm('삭제하시겠습니까?')){await fetch("https://api.blankd.top/api/delete-category",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({wallet_address:safeAddress,id})});loadAllData();}}} />}
            {activeTab === 'enhance' && <EnhanceTab savedCards={savedCards} colCount={colCount} viewMode={viewMode} setActiveCard={setActiveCard} handleDeleteCard={async (id:number)=>{if(confirm('삭제하시겠습니까?')){await fetch("https://api.blankd.top/api/delete-card",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({wallet_address:safeAddress,id})});setActiveCard(null);loadAllData();}}} />}
            {activeTab === 'exam' && <ExamTab exams={exams} examFile={examFile} setExamFile={setExamFile} uploadExam={uploadExam} />}
            {activeTab === 'settings' && <MypageTab safeAddress={safeAddress} enokiFlow={enokiFlow} useAiRecommend={useAiRecommend} setUseAiRecommend={setUseAiRecommend} viewMode={viewMode} setViewMode={setViewMode} colCount={colCount} updateColCount={setColCount} handleDeleteAll={async () => { if(confirm('전체 초기화하시겠습니까?')) { await api.deleteAll(safeAddress); loadAllData(); } }} />}
          </ErrorBoundary>
        </main>
      )}

      <div className="fixed bottom-0 left-0 w-full h-40 bg-black/90 border-t border-teal-500/30 p-4 font-mono text-[11px] text-teal-400 overflow-y-auto z-[999]">
        <div className="flex justify-between items-center mb-2 border-b border-teal-500/30 pb-1 sticky top-0 bg-black/90">
          <span className="uppercase tracking-widest text-teal-500/50">Diagnostic Terminal</span>
          <button onClick={() => setSystemLogs([])} className="text-white/40 hover:text-white px-2">Clear</button>
        </div>
        <div className="space-y-1">
          {systemLogs.map((l, i) => (
            <div key={i} className={l.includes('❌') ? 'text-red-400 font-bold' : l.includes('▶️') ? 'text-amber-300' : ''}>{l}</div>
          ))}
        </div>
      </div>

      {activeCard && (
        <CardModal activeCard={activeCard} totalTimeLimit={totalTimeLimit} elapsed={elapsed} answerInput={answerInput} setAnswerInput={setAnswerInput} inputStatus={inputStatus} handleSequentialInput={handleSequentialInput} 
          renderContent={() => {
            const { body } = formatCardText(activeCard.content);
            const parts = body.split(/(\[.*?\])/g); let bIdx = 0;
            return (
              <div className="flex flex-col gap-6 w-full">
                <div className="whitespace-pre-wrap leading-relaxed text-[15px] font-serif">
                  {parts.map((part: string, i: number) => {
                    if (part.startsWith('[') && part.endsWith(']')) {
                      const isCorrect = blanks[bIdx]?.correct; const isCurrent = bIdx === currentBlankIdx; bIdx++;
                      if (isCorrect) return <span key={i} className="text-green-400 font-bold mx-1">{part.replace(/\[|\]/g, '')}</span>;
                      else if (isCurrent) return <span key={i} className="inline-block min-w-[60px] h-5 bg-indigo-500/30 border-b-2 border-indigo-400 mx-1 animate-pulse align-middle"></span>;
                      else return <span key={i} className="inline-block min-w-[60px] h-5 bg-white/10 border-b border-white/50 mx-1 align-middle"></span>;
                    } return <span key={i}>{part}</span>;
                  })}
                </div>
                
                <div className="flex justify-end w-full mb-2">
                  <button onClick={handleShowAnswer} className="px-3 py-1.5 bg-red-900/30 text-red-400 border border-red-500/50 rounded-sm text-[11px] font-bold shrink-0 hover:bg-red-900/50 transition-colors shadow">정답 보기 (오답 처리)</button>
                </div>

                <div className="pt-4 border-t border-white/10 w-full animate-in fade-in">
                  <div className="text-[11px] text-teal-500/50 mb-2 font-bold uppercase tracking-widest">📝 Memo</div>
                  <input 
                    defaultValue={statsRef.current.text || ""} 
                    placeholder="여기에 암기 메모를 입력하세요 (저장: 바깥 클릭)..." 
                    onBlur={(e) => {
                      statsRef.current.text = e.target.value;
                      const newMemo = stringifyCardStats(statsRef.current.text, statsRef.current.filled, Array.from(statsRef.current.wrongIndices));
                      handleUpdateMemo(activeCard.id, newMemo);
                    }} 
                    className="text-[13px] text-teal-300 bg-teal-950/20 p-3 rounded border border-teal-500/30 w-full outline-none focus:border-teal-400 focus:bg-teal-950/40 transition-colors"
                  />
                </div>
              </div>
            );
          }} 
          onClose={handleCloseModal} // 💡 닫을 때도 무조건 현재 상태를 DB에 저장
        />
      )}
    </div>
  );
}

export default function App() { return <MainApp />; }
