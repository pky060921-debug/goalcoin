import React, { useState, useEffect, Component, ReactNode } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { useEnokiFlow, useZkLogin } from "@mysten/enoki/react";
import { api } from "./services/api";
import { SPLIT_REGEX } from "./utils/constants";
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
    if (this.state.hasError) return <div className="p-6 text-red-400">⚠️ 렌더링 오류 발생: {this.state.errorMessage}</div>;
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
  const [studyMode, setStudyMode] = useState(localStorage.getItem('studyMode') || '법령');
  
  const [lawFile, setLawFile] = useState<File | null>(null);
  const [examFile, setExamFile] = useState<File | null>(null);
  const [systemLogs, setSystemLogs] = useState<string[]>(["[System] 시스템 부팅 완료..."]);

  const [blanks, setBlanks] = useState<{answer: string, correct: boolean}[]>([]);
  const [currentBlankIdx, setCurrentBlankIdx] = useState(0);
  const [answerInput, setAnswerInput] = useState("");
  const [inputStatus, setInputStatus] = useState<'idle'|'correct'|'wrong'>('idle');
  const [startTime, setStartTime] = useState<number>(0);
  const [elapsed, setElapsed] = useState<number>(0);
  const [totalTimeLimit, setTotalTimeLimit] = useState<number>(0);

  const addLog = (msg: string) => setSystemLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`].slice(-10));

  // 💡 [초정밀 진단 1] 구글 인증 후 돌아왔을 때의 해시(Hash) 처리 과정 추적
  useEffect(() => {
    const handleAuthCallback = async () => {
      if (window.location.hash) {
        addLog(`🔄 구글 응답 수신됨 (해시 길이: ${window.location.hash.length})`);
        try {
          await enokiFlow.handleAuthCallback();
          addLog("✅ Enoki 토큰 승인 완료! (지갑 주소 생성 요청 중...)");
          window.history.replaceState(null, '', window.location.pathname);
        } catch (err: any) {
          addLog(`❌ 토큰 승인 에러: ${err.message}`);
          alert(`구글 인증 콜백 처리 중 에러가 발생했습니다:\n${err.message}`);
        }
      }
    };
    handleAuthCallback();
  }, [enokiFlow]);

  // 💡 [초정밀 진단 2] 로그인 멈춤 현상(지갑 주소 미발급) 원인 추적
  useEffect(() => {
    const monitorSession = async () => {
      try {
        const session = await enokiFlow.getSession();
        if (session) {
          if (!zkLogin?.address) {
            addLog("⚠️ 구글 로그인은 성공했으나 Enoki가 지갑 주소를 발급하지 못하고 있습니다.");
            addLog("👉 원인: Enoki 대시보드의 API 키 설정이나 Origin 도메인 거부일 확률이 높습니다.");
          } else {
            addLog(`✅ 지갑 주소 확보 완료: ${zkLogin.address.substring(0, 6)}...`);
            loadAllData();
          }
        }
      } catch (e) {
        // 무시
      }
    };
    monitorSession();
  }, [enokiFlow, zkLogin?.address]);

  useEffect(() => {
    if (isLoggedIn) loadAllData();
  }, [isLoggedIn, safeAddress]);

  const loadAllData = async () => {
    try {
      const [catRes, cardRes, examRes] = await Promise.all([
        fetch(`https://api.blankd.top/api/get-categories?wallet_address=${safeAddress}`).then(r=>r.json()),
        fetch(`https://api.blankd.top/api/my-cards?wallet_address=${safeAddress}`).then(r=>r.json()),
        fetch(`https://api.blankd.top/api/get-all-exams?wallet_address=${safeAddress}`).then(r=>r.json())
      ]);
      setCategories(catRes.categories || []); setSavedCards(cardRes.cards || []); setExams(examRes.exams || []);
    } catch (e: any) { addLog(`❌ 데이터 로딩 에러: ${e.message}`); }
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
    const res = await fetch("https://api.blankd.top/api/save-card", { 
      method: "POST", headers: { "Content-Type": "application/json" }, 
      body: JSON.stringify({ wallet_address: safeAddress, card_content: finalCardContent, answer_text: answerText, folder_name: cat.folder_name, memo }) 
    });
    if (res.ok) {
      await fetch("https://api.blankd.top/api/delete-category", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_address: safeAddress, id: cat.id }) });
      loadAllData(); onComplete(); setActiveTab('enhance');
    }
  };

  const handleUpdateMemo = async (id: number, memo: string) => {
    setSavedCards(prev => prev.map(c => c.id === id ? { ...c, memo } : c));
    await fetch("https://api.blankd.top/api/update-card-memo", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet_address: safeAddress, id, memo })
    });
  };

  const handleSplitCategory = async (cat: any, splitIdx: number, wordsArray: string[]) => {
    if (!confirm("분할하시겠습니까?")) return;
    const text1 = wordsArray.slice(0, splitIdx).join(''); const text2 = wordsArray.slice(splitIdx).join('');
    await fetch("https://api.blankd.top/api/split-category", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: cat.id, text1, text2, wallet_address: safeAddress }) });
    loadAllData();
  };

  const handleDeleteCategory = async (id: number) => { 
    if (confirm("삭제하시겠습니까?")) { await fetch("https://api.blankd.top/api/delete-category", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_address: safeAddress, id }) }); loadAllData(); } 
  };
  const handleDeleteCard = async (id: number) => { 
    if (confirm("삭제하시겠습니까?")) { await fetch("https://api.blankd.top/api/delete-card", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_address: safeAddress, id }) }); setActiveCard(null); loadAllData(); } 
  };

  const submitCombatAnswer = async (isCorrect: boolean, time: number = 999.0) => {
    if (!activeCard) return;
    await fetch("https://api.blankd.top/api/submit-answer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ card_id: activeCard.id, is_correct: isCorrect, clear_time: time }) });
    setActiveCard(null); loadAllData();
  };

  useEffect(() => {
    if (activeCard) {
      const foundBlanks: {answer: string, correct: boolean}[] = [];
      const regex = /\[\s*(.*?)\s*\]/g; let match;
      while((match = regex.exec(activeCard.content || "")) !== null) {
        if (['법', '령', '칙', '규'].includes(match[1].trim())) continue; 
        foundBlanks.push({ answer: match[1].trim(), correct: false });
      }
      setBlanks(foundBlanks); setCurrentBlankIdx(0); setAnswerInput(""); setInputStatus('idle');
      setTotalTimeLimit(5.0 * foundBlanks.length); setStartTime(Date.now()); setElapsed(0);
    }
  }, [activeCard]);

  useEffect(() => {
    if (activeCard && currentBlankIdx < blanks.length) {
      const interval = setInterval(() => {
        const diff = (Date.now() - startTime) / 1000; setElapsed(diff);
        if (diff >= totalTimeLimit) { clearInterval(interval); submitCombatAnswer(false, diff); }
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
      setTimeout(() => { setAnswerInput(""); setInputStatus('idle'); if (currentBlankIdx + 1 < blanks.length) setCurrentBlankIdx(currentBlankIdx + 1); else submitCombatAnswer(true, elapsed); }, 200);
    } else { setInputStatus('wrong'); setTimeout(() => setInputStatus('idle'), 500); }
  };

  // 💡 구글 로그인 실행 함수 (마찬가지로 정밀 에러 로그 출력)
  const handleGoogleLogin = async () => {
    try {
      addLog("🟢 구글 로그인 URL 요청 중...");
      const url = await enokiFlow.createAuthorizationURL({ 
        provider: 'google', 
        clientId: '536814695888-bepe0chce3nq31vuu3th60c7al7vpsv7.apps.googleusercontent.com', 
        redirectUrl: window.location.origin, 
        network: 'testnet', 
        extraParams: { scope: ['openid', 'email', 'profile'] }
      });
      addLog("🟢 구글 이동 성공!");
      window.location.href = url;
    } catch (e: any) {
      addLog(`❌ 로그인 URL 생성 실패: ${e.message}`);
      alert(`로그인 창을 열 수 없습니다:\n${e.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0d0f] text-[#d1d1d1] p-6 relative pb-48">
      <header className="max-w-6xl mx-auto border-b border-white/10 pb-6 mb-12 flex items-center gap-10">
        <h1 className="text-2xl font-light tracking-widest text-white shrink-0">Blank_D</h1>
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
          <h2 className="text-2xl font-serif text-white mb-4">빈칸 기억강화 시스템</h2>
          <p className="text-sm text-white/40 mb-12 text-center">인지 과학 기반의 간격 반복 학습으로<br/>영구 기억을 형성합니다.</p>
          <button onClick={handleGoogleLogin} className="w-full py-4 bg-white text-black font-bold rounded-sm mb-8 transition-transform active:scale-95">Google 계정으로 시작하기</button>
          
          {/* 💡 로그인 멈춤 현상을 시각적으로 보여주는 터미널 화면 */}
          <div className="w-full bg-black border border-white/10 p-4 rounded text-[11px] font-mono text-teal-400/80 leading-relaxed shadow-inner">
            <div className="text-white/30 border-b border-white/10 pb-2 mb-2 uppercase tracking-widest">Auth Terminal Logs</div>
            <div className="space-y-1">
              {systemLogs.map((log, idx) => (
                <div key={idx} className={log.includes('❌') || log.includes('⚠️') ? 'text-red-400 font-bold' : ''}>{log}</div>
              ))}
            </div>
          </div>
        </main>
      ) : (
        <main className="max-w-6xl mx-auto">
          <ErrorBoundary fallbackLog={addLog}>
            {activeTab === 'progress' && <DashboardTab categories={categories} savedCards={savedCards} />}
            {activeTab === 'create' && <CraftTab categories={categories} studyMode={studyMode} lawFile={lawFile} setLawFile={setLawFile} uploadLaw={uploadLaw} handleMakeBlankCard={handleMakeBlankCard} handleSplitCategory={handleSplitCategory} handleDeleteCategory={handleDeleteCategory} />}
            {activeTab === 'enhance' && <EnhanceTab savedCards={savedCards} studyMode={studyMode} setActiveCard={setActiveCard} handleUpdateMemo={handleUpdateMemo} handleDeleteCard={handleDeleteCard} />}
            {activeTab === 'exam' && <ExamTab exams={exams} examFile={examFile} setExamFile={setExamFile} uploadExam={uploadExam} />}
            {activeTab === 'settings' && <MypageTab safeAddress={safeAddress} enokiFlow={enokiFlow} studyMode={studyMode} setStudyMode={setStudyMode} handleDeleteAll={async () => { if(confirm('초기화?')) { await api.deleteAll(safeAddress); loadAllData(); } }} />}
          </ErrorBoundary>
        </main>
      )}

      {activeCard && (
        <CardModal activeCard={activeCard} totalTimeLimit={totalTimeLimit} elapsed={elapsed} answerInput={answerInput} setAnswerInput={setAnswerInput} inputStatus={inputStatus} handleSequentialInput={handleSequentialInput} 
          renderContent={() => {
            const parts = activeCard.content.split(/(\[.*?\])/g); let bIdx = 0;
            return parts.map((part: string, i: number) => {
              if (part.startsWith('[') && part.endsWith(']')) {
                if (/^\[(법|령|칙|규)\]$/.test(part)) return <span key={i} className="text-amber-400 font-bold mr-1">{part}</span>;
                const isCorrect = blanks[bIdx]?.correct; const isCurrent = bIdx === currentBlankIdx; bIdx++;
                if (isCorrect) return <span key={i} className="text-green-400 font-bold mx-1">{part.replace(/\[|\]/g, '')}</span>;
                else if (isCurrent) return <span key={i} className="inline-block min-w-[60px] h-5 bg-indigo-500/30 border-b-2 border-indigo-400 mx-1 animate-pulse align-middle"></span>;
                else return <span key={i} className="inline-block min-w-[60px] h-5 bg-white/10 border-b border-white/50 mx-1 align-middle"></span>;
              } return part;
            });
          }} 
          onClose={() => setActiveCard(null)} 
        />
      )}
    </div>
  );
}

export default function App() { return <MainApp />; }
