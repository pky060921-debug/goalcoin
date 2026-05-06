import React, { useState, useEffect, Component, ReactNode } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { useEnokiFlow, useZkLogin } from "@mysten/enoki/react";
import { api } from "./services/api";
import { SPLIT_REGEX, formatCardText } from "./utils/constants";
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
    if (this.state.hasError) return <div className="p-6 text-red-400 font-mono">⚠️ 렌더링 오류 발생: {this.state.errorMessage}</div>;
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
  
  // 원본 상태값 유지
  const [viewMode, setViewMode] = useState('all');
  const [colCount, setColCount] = useState(3);
  const [useAiRecommend, setUseAiRecommend] = useState(true);
  
  const [lawFile, setLawFile] = useState<File | null>(null);
  const [examFile, setExamFile] = useState<File | null>(null);
  const [systemLogs, setSystemLogs] = useState<string[]>(["[System] 부팅 완료..."]);

  const [blanks, setBlanks] = useState<{answer: string, correct: boolean}[]>([]);
  const [currentBlankIdx, setCurrentBlankIdx] = useState(0);
  const [answerInput, setAnswerInput] = useState("");
  const [inputStatus, setInputStatus] = useState<'idle'|'correct'|'wrong'>('idle');
  const [startTime, setStartTime] = useState<number>(0);
  const [elapsed, setElapsed] = useState<number>(0);
  const [totalTimeLimit, setTotalTimeLimit] = useState<number>(0);

  const addLog = (msg: string) => setSystemLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`].slice(-10));

  // 💡 로그인 과정 정밀 진단기
  useEffect(() => {
    const handleAuthCallback = async () => {
      if (window.location.hash) {
        addLog(`🔄 구글 응답 수신 (Hash 감지)`);
        try {
          await enokiFlow.handleAuthCallback();
          addLog("✅ Enoki 인증 완료");
          window.history.replaceState(null, '', window.location.pathname);
        } catch (err: any) {
          addLog(`❌ 인증 콜백 에러: ${err.message}`);
          alert(`로그인 처리 중 오류 발생: ${err.message}`);
        }
      }
    };
    handleAuthCallback();
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
      addLog("🟢 데이터 동기화 완료");
    } catch (e: any) { addLog(`❌ 로딩 실패: ${e.message}`); }
  };

  const uploadLaw = async () => {
    if (!lawFile) return alert("파일을 선택해주세요.");
    addLog(`📤 법령 파일 업로드 시작: ${lawFile.name}`);
    const fd = new FormData(); fd.append("file", lawFile); fd.append("wallet_address", safeAddress);
    const res = await fetch(`https://api.blankd.top/api/upload-pdf`, { method: "POST", body: fd });
    if (res.ok) { setLawFile(null); addLog("✅ 업로드 성공"); setTimeout(() => loadAllData(), 2000); }
  };

  const uploadExam = async () => {
    if (!examFile) return alert("파일을 선택해주세요.");
    addLog(`📤 모의고사 업로드 시작: ${examFile.name}`);
    const fd = new FormData(); fd.append("file", examFile); fd.append("wallet_address", safeAddress);
    const res = await fetch(`https://api.blankd.top/api/upload-exam`, { method: "POST", body: fd });
    if (res.ok) { setExamFile(null); addLog("✅ 업로드 성공"); setTimeout(() => loadAllData(), 2000); }
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

  const submitCombatAnswer = async (isCorrect: boolean, time: number = 999.0) => {
    if (!activeCard) return;
    await fetch("https://api.blankd.top/api/submit-answer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ card_id: activeCard.id, is_correct: isCorrect, clear_time: time }) });
    setActiveCard(null); loadAllData();
  };

  // 💡 [버그수정] 문제 풀기 시 제목은 제외하고 본문에서만 빈칸 추출
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

  // 💡 [버그수정] '법' 입력 시 정답 처리 안 되던 비교 로직 강화
  const handleSequentialInput = () => {
    if (inputStatus === 'correct' || inputStatus === 'wrong' || !blanks[currentBlankIdx]) return;
    const expected = blanks[currentBlankIdx].answer.replace(/\s+/g, '').toLowerCase();
    const actual = answerInput.replace(/\s+/g, '').toLowerCase();
    if (expected === actual) {
      setInputStatus('correct');
      const nb = [...blanks]; nb[currentBlankIdx].correct = true; setBlanks(nb);
      setTimeout(() => { 
        setAnswerInput(""); setInputStatus('idle'); 
        if (currentBlankIdx + 1 < blanks.length) setCurrentBlankIdx(currentBlankIdx + 1); 
        else submitCombatAnswer(true, elapsed); 
      }, 200);
    } else { setInputStatus('wrong'); setTimeout(() => setInputStatus('idle'), 500); }
  };

  return (
    <div className="min-h-screen bg-[#0d0d0f] text-[#d1d1d1] p-6 relative pb-48 font-sans">
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
          <button onClick={async () => { window.location.href = await enokiFlow.createAuthorizationURL({ provider: 'google', clientId: '536814695888-bepe0chce3nq31vuu3th60c7al7vpsv7.apps.googleusercontent.com', redirectUrl: window.location.origin, network: 'testnet', extraParams: { scope: ['openid', 'email', 'profile'] }}); }} className="w-full py-4 bg-white text-black font-bold rounded-sm mb-6 active:scale-95 transition-transform">Google 계정으로 시작하기</button>
          
          <div className="w-full bg-black/50 p-4 border border-white/10 text-[10px] text-teal-500/60 font-mono h-32 overflow-y-auto rounded shadow-inner">
            <div className="border-b border-white/5 pb-1 mb-2 uppercase tracking-tighter">Diagnostic Terminal</div>
            {systemLogs.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </main>
      ) : (
        <main className="max-w-6xl mx-auto">
          <ErrorBoundary fallbackLog={addLog}>
            {activeTab === 'progress' && <DashboardTab categories={categories} savedCards={savedCards} />}
            {activeTab === 'create' && <CraftTab categories={categories} colCount={colCount} viewMode={viewMode} useAiRecommend={useAiRecommend} lawFile={lawFile} setLawFile={setLawFile} uploadLaw={uploadLaw} handleMakeBlankCard={handleMakeBlankCard} handleDeleteCategory={async (id:number)=>{if(confirm('삭제?')){await fetch("https://api.blankd.top/api/delete-category",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({wallet_address:safeAddress,id})});loadAllData();}}} />}
            {activeTab === 'enhance' && <EnhanceTab savedCards={savedCards} colCount={colCount} viewMode={viewMode} setActiveCard={setActiveCard} handleUpdateMemo={handleUpdateMemo} handleDeleteCard={async (id:number)=>{if(confirm('삭제?')){await fetch("https://api.blankd.top/api/delete-card",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({wallet_address:safeAddress,id})});setActiveCard(null);loadAllData();}}} />}
            {activeTab === 'exam' && <ExamTab exams={exams} examFile={examFile} setExamFile={setExamFile} uploadExam={uploadExam} />}
            {activeTab === 'settings' && <MypageTab safeAddress={safeAddress} enokiFlow={enokiFlow} useAiRecommend={useAiRecommend} setUseAiRecommend={setUseAiRecommend} viewMode={viewMode} setViewMode={setViewMode} colCount={colCount} updateColCount={setColCount} handleDeleteAll={async () => { if(confirm('전체 초기화하시겠습니까?')) { await api.deleteAll(safeAddress); loadAllData(); } }} />}
          </ErrorBoundary>
        </main>
      )}

      {/* 💡 [버그수정] 사진 2번 빨간색 네모 중복 텍스트 제거 -> 본문만 출력 */}
      {activeCard && (
        <CardModal activeCard={activeCard} totalTimeLimit={totalTimeLimit} elapsed={elapsed} answerInput={answerInput} setAnswerInput={setAnswerInput} inputStatus={inputStatus} handleSequentialInput={handleSequentialInput} 
          renderContent={() => {
            const { body } = formatCardText(activeCard.content);
            const parts = body.split(/(\[.*?\])/g); let bIdx = 0;
            return parts.map((part: string, i: number) => {
              if (part.startsWith('[') && part.endsWith(']')) {
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
