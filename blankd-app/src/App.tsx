import React, { useState, useEffect, Component, ReactNode } from "react";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { useEnokiFlow, useZkLogin } from "@mysten/enoki/react";
import { api } from "./services/api";
import { CardModal } from "./components/CardModal";
import { DashboardTab } from "./tabs/DashboardTab";
import { CraftTab } from "./tabs/CraftTab";
import { EnhanceTab } from "./tabs/EnhanceTab";
import { ExamTab } from "./tabs/ExamTab";
import { MypageTab } from "./tabs/MypageTab";

class ErrorBoundary extends Component<{children: ReactNode, fallbackLog: (msg: string) => void}, {hasError: boolean, errorMessage: string}> {
  constructor(props: any) { super(props); this.state = { hasError: false, errorMessage: "" }; }
  static getDerivedStateFromError(error: any) { return { hasError: true, errorMessage: error.message }; }
  componentDidCatch(error: any, errorInfo: any) { this.props.fallbackLog(`❌ 화면 렌더링 붕괴: ${error.message}`); }
  render() {
    if (this.state.hasError) return (
      <div className="p-6 bg-red-900/20 border border-red-500/50 rounded-md text-red-400 font-mono mt-8">
        <h3 className="font-bold mb-2">⚠️ 컴포넌트 렌더링 오류 발생</h3><p className="text-sm">{this.state.errorMessage}</p>
      </div>
    );
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
  const [selectedCraftIds, setSelectedCraftIds] = useState<Set<number>>(new Set());
  const [selectedEnhanceIds, setSelectedEnhanceIds] = useState<Set<number>>(new Set());
  const [targetFolderName, setTargetFolderName] = useState('');
  
  const [systemLogs, setSystemLogs] = useState<string[]>(["[System] 모듈화 시스템 부팅 완료..."]);
  const [panelState, setPanelState] = useState({ progress: 0, message: "대기 중..." });

  const [blanks, setBlanks] = useState<{answer: string, correct: boolean}[]>([]);
  const [currentBlankIdx, setCurrentBlankIdx] = useState(0);
  const [answerInput, setAnswerInput] = useState("");
  const [inputStatus, setInputStatus] = useState<'idle'|'correct'|'wrong'>('idle');
  const [startTime, setStartTime] = useState<number>(0);
  const [elapsed, setElapsed] = useState<number>(0);
  const [totalTimeLimit, setTotalTimeLimit] = useState<number>(0);

  const addLog = (msg: string) => { setSystemLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`].slice(-10)); };
  const updatePanel = (status: string, title: string, msg: string, progress: number = 0) => { setPanelState({ progress, message: msg }); addLog(msg); };

  useEffect(() => {
    if (window.location.hash) {
      enokiFlow.handleAuthCallback().then(() => { window.history.replaceState(null, '', window.location.pathname); }).catch((err: any) => addLog(`❌ 인증 콜백 에러: ${err.message}`));
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
      addLog(`✅ 데이터 로드 완료 (문헌:${catRes.categories?.length||0}, 카드:${cardRes.cards?.length||0}, 문제:${examRes.exams?.length||0})`);
    } catch (e: any) { addLog(`❌ 로딩 실패: ${e.message}`); }
  };

  const pollTaskProgress = (taskId: string, onSuccess: () => void) => {
    const intv = setInterval(async () => {
      try {
        const data = await fetch(`https://api.blankd.top/api/task-status?task_id=${taskId}`).then(r=>r.json());
        if (data.status === 'completed') { clearInterval(intv); updatePanel('success', '완료', data.message, 100); onSuccess(); }
        else if (data.status === 'error') { clearInterval(intv); updatePanel('error', '오류', data.message, 0); }
        else updatePanel('loading', '처리 중', data.message, data.progress);
      } catch(e) {}
    }, 1500);
  };

  const uploadLaw = async () => {
    if (!lawFile) return alert("법령 파일을 선택해주세요.");
    updatePanel('loading', '전송 대기', `문헌 업로드 시작...`, 5);
    const fd = new FormData(); fd.append("file", lawFile); fd.append("wallet_address", safeAddress);
    try {
      const res = await fetch(`https://api.blankd.top/api/upload-pdf`, { method: "POST", body: fd });
      if (res.ok) { const data = await res.json(); setLawFile(null); pollTaskProgress(data.task_id, () => loadAllData()); }
    } catch (err: any) { updatePanel('error', '오류', err.message, 0); }
  };

  const uploadExam = async () => {
    if (!examFile) return alert("모의고사 파일을 선택해주세요.");
    updatePanel('loading', '전송 대기', `모의고사 전송 시작...`, 5);
    const fd = new FormData(); fd.append("file", examFile); fd.append("wallet_address", safeAddress);
    try {
      const res = await fetch(`https://api.blankd.top/api/upload-exam`, { method: "POST", body: fd });
      if (res.ok) { const data = await res.json(); setExamFile(null); pollTaskProgress(data.task_id, () => loadAllData()); }
    } catch (err: any) { updatePanel('error', '오류', err.message, 0); }
  };

  const handleAiRecommend = async (cat: any) => {
    updatePanel('loading', '분석 요청', 'Gemma 26B 엔진 연결 중...', 5);
    try {
      const res = await fetch("https://api.blankd.top/api/recommend-blank", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: cat.content, wallet_address: safeAddress }) });
      if (res.ok) { const data = await res.json(); pollTaskProgress(data.task_id, () => loadAllData()); }
    } catch(e) { updatePanel('error', '연결 실패', 'AI 통신 오류', 0); }
  };

  const handleMakeBlankCard = async (cat: any, content: string, selectedIndices: Set<number>, onComplete: () => void) => {
    if (!isLoggedIn || selectedIndices.size === 0) return alert("단어를 선택해주세요.");
    updatePanel('loading', '처리 중', '카드 추출 및 원본 삭제 중...', 50);
    const words = content ? content.split(/(\s+|[ㆍ\.,!?()[\]{}<>"'「」『』“”‘’○①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮\-~·]+|(?:은|는|이|가|을|를|의|에|에게|과|와|로서|로써|로|으로|도|만|부터|까지|이다|한다|함|됨|됨을|함을|함으로써|대하여|대해|대한|등|및|에서|에서는|에서의|로부터|에의|로부터의|에도|에는|이나|나|라도|이라도)(?=\s|$|[ㆍ\.,!?()[\]{}<>"'「」『』“”‘’○①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮\-~·]))/g) : [];
    let cardContent = ""; let answerText = ""; let isBlanking = false;
    words.forEach((word, index) => {
      if (!word) return;
      if (selectedIndices.has(index) && word.trim() !== "") {
        if (!isBlanking) { cardContent += "[ "; if (answerText.length > 0) answerText += ", "; isBlanking = true; }
        cardContent += word; answerText += word;
      } else { if (isBlanking) { cardContent += " ]"; isBlanking = false; } cardContent += word; }
    });
    if (isBlanking) cardContent += " ]";
    try {
      const res = await fetch("https://api.blankd.top/api/save-card", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_address: safeAddress, card_content: cardContent, answer_text: answerText, folder_name: cat.folder_name }) });
      if (res.ok) {
        await fetch("https://api.blankd.top/api/delete-category", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_address: safeAddress, id: cat.id }) });
        loadAllData(); updatePanel('success', '완료', '추출 완료됨.', 100); onComplete(); setActiveTab('enhance');
      }
    } catch(err) { console.error(err); }
  };

  const handleSplitCategory = async (cat: any, splitIdx: number, wordsArray: string[]) => {
    if (!confirm("이 부분을 기준으로 조항을 분할하시겠습니까?")) return;
    const text1 = wordsArray.slice(0, splitIdx).join(''); const text2 = wordsArray.slice(splitIdx).join('');
    updatePanel('loading', '분할 중', '조항 분할 중...', 50);
    await fetch("https://api.blankd.top/api/split-category", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: cat.id, text1, text2, wallet_address: safeAddress }) });
    loadAllData(); updatePanel('success', '완료', '분할되었습니다.', 100);
  };

  const handleDeleteCategory = async (id: number) => {
    if (confirm("영구 삭제하시겠습니까?")) { await fetch("https://api.blankd.top/api/delete-category", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_address: safeAddress, id }) }); loadAllData(); }
  };
  const handleDeleteCard = async (id: number) => {
    if (confirm("영구 삭제하시겠습니까?")) { await fetch("https://api.blankd.top/api/delete-card", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_address: safeAddress, id }) }); setActiveCard(null); loadAllData(); }
  };

  const handleMoveCraftFolders = async () => {
    if (selectedCraftIds.size === 0 || !targetFolderName) return;
    await fetch('https://api.blankd.top/api/move-categories', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ids: Array.from(selectedCraftIds), folder_name: targetFolderName, wallet_address: safeAddress})});
    setSelectedCraftIds(new Set()); setTargetFolderName(''); loadAllData();
  };
  const handleMoveEnhanceFolders = async () => {
    if (selectedEnhanceIds.size === 0 || !targetFolderName) return;
    await fetch('https://api.blankd.top/api/move-cards', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ids: Array.from(selectedEnhanceIds), folder_name: targetFolderName, wallet_address: safeAddress})});
    setSelectedEnhanceIds(new Set()); setTargetFolderName(''); loadAllData();
  };

  const submitCombatAnswer = async (isCorrect: boolean, time: number = 999.0) => {
    if (!activeCard) return;
    await fetch("https://api.blankd.top/api/submit-answer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ card_id: activeCard.id, is_correct: isCorrect, clear_time: time }) });
    alert(isCorrect ? `성공! 기록: ${time.toFixed(1)}초` : `실패! 시간 초과 또는 오답입니다.`);
    setActiveCard(null); loadAllData();
  };

  useEffect(() => {
    if (activeCard) {
      const foundBlanks: {answer: string, correct: boolean}[] = [];
      const regex = /\[\s*(.*?)\s*\]/g; let match;
      while((match = regex.exec(activeCard.content || "")) !== null) foundBlanks.push({ answer: match[1].trim(), correct: false });
      if(foundBlanks.length === 0 && activeCard.answer) foundBlanks.push(...activeCard.answer.split(',').map((a:any) => ({answer: a.trim(), correct: false})));
      setBlanks(foundBlanks); setCurrentBlankIdx(0); setAnswerInput(""); setInputStatus('idle');
      const timePerBlank = Math.max(1.0, 5.0 - Math.floor(activeCard.level / 5) * 0.5);
      setTotalTimeLimit(timePerBlank * foundBlanks.length); setStartTime(Date.now()); setElapsed(0);
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
      setTimeout(() => { setAnswerInput(""); setInputStatus('idle'); if (currentBlankIdx + 1 < blanks.length) setCurrentBlankIdx(currentBlankIdx + 1); else submitCombatAnswer(true, elapsed); }, 300);
    } else { setInputStatus('wrong'); setTimeout(() => { setAnswerInput(""); setInputStatus('idle'); }, 500); }
  };

  const renderSequentialMaskedContent = (text?: string) => {
    if (!text) return null;
    const parts = text.split(/(\[.*?\])/g); let bIdx = 0;
    return parts.map((part, i) => {
      if (part.startsWith('[') && part.endsWith(']')) {
        const isCorrect = blanks[bIdx]?.correct; const isCurrent = bIdx === currentBlankIdx; bIdx++;
        if (isCorrect) return <span key={i} className="text-green-400 font-bold mx-1">{part.replace(/\[|\]/g, '')}</span>;
        else if (isCurrent) return <span key={i} className="inline-block min-w-[60px] h-5 bg-indigo-500/30 border-b-2 border-indigo-400 mx-1 animate-pulse align-middle"></span>;
        else return <span key={i} className="inline-block min-w-[60px] h-5 bg-white/10 border-b border-white/50 mx-1 align-middle"></span>;
      } return part;
    });
  };

  const handleGoogleLogin = async () => {
    try {
      addLog("🚀 구글 인증 URL 요청...");
      const url = await enokiFlow.createAuthorizationURL({ provider: 'google', clientId: '536814695888-bepe0chce3nq31vuu3th60c7al7vpsv7.apps.googleusercontent.com', redirectUrl: window.location.origin, network: 'testnet', extraParams: { scope: ['openid', 'email', 'profile'] }});
      window.location.href = url;
    } catch (e: any) { addLog(`❌ 로그인 에러: ${e.message}`); }
  };

  return (
    <div className="min-h-screen bg-[#0d0d0f] text-[#d1d1d1] p-6 sm:p-12 relative pb-48">
      <header className="max-w-6xl mx-auto border-b border-white/10 pb-8 mb-12 flex items-center justify-between">
        <div className="flex items-center gap-10">
          <h1 className="text-2xl font-light tracking-widest text-white">Blank_D</h1>
          {isLoggedIn && (
            <nav className="flex gap-6 overflow-x-auto">
              {[
                { id: 'progress', label: '진행상황' },
                { id: 'create', label: '만들기' },
                { id: 'enhance', label: '강화' },
                { id: 'exam', label: '모의고사' },
                { id: 'settings', label: '설정' }
              ].map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`text-sm font-bold tracking-widest ${activeTab === tab.id ? 'text-white border-b-2 border-white pb-1' : 'text-white/40 hover:text-white/70'}`}>{tab.label}</button>
              ))}
            </nav>
          )}
        </div>
      </header>

      {!isLoggedIn ? (
        <main className="max-w-md mx-auto mt-8 flex flex-col items-center">
          <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-sm mb-8 flex justify-center items-center text-2xl">🏛️</div>
          <button onClick={handleGoogleLogin} className="w-full py-4 bg-white text-black font-bold text-sm">Google 계정으로 시작하기</button>
        </main>
      ) : (
        <main className="max-w-6xl mx-auto">
          <ErrorBoundary fallbackLog={addLog}>
            {activeTab === 'progress' && <DashboardTab categories={categories} savedCards={savedCards} />}
            {activeTab === 'create' && <CraftTab categories={categories} colCount={colCount} viewMode={viewMode} useAiRecommend={useAiRecommend} panelState={panelState} lawFile={lawFile} setLawFile={setLawFile} uploadLaw={uploadLaw} selectedCraftIds={selectedCraftIds} setSelectedCraftIds={setSelectedCraftIds} targetFolderName={targetFolderName} setTargetFolderName={setTargetFolderName} handleMoveCraftFolders={handleMoveCraftFolders} handleMakeBlankCard={handleMakeBlankCard} handleAiRecommend={handleAiRecommend} handleSplitCategory={handleSplitCategory} handleDeleteCategory={handleDeleteCategory} />}
            {activeTab === 'enhance' && <EnhanceTab savedCards={savedCards} colCount={colCount} viewMode={viewMode} setActiveCard={setActiveCard} handleDeleteCard={handleDeleteCard} selectedEnhanceIds={selectedEnhanceIds} setSelectedEnhanceIds={setSelectedEnhanceIds} targetFolderName={targetFolderName} setTargetFolderName={setTargetFolderName} handleMoveEnhanceFolders={handleMoveEnhanceFolders} />}
            {activeTab === 'exam' && <ExamTab exams={exams} examFile={examFile} setExamFile={setExamFile} uploadExam={uploadExam} />}
            {activeTab === 'settings' && <MypageTab safeAddress={safeAddress} enokiFlow={enokiFlow} useAiRecommend={useAiRecommend} setUseAiRecommend={setUseAiRecommend} viewMode={viewMode} setViewMode={setViewMode} colCount={colCount} updateColCount={setColCount} handleDeleteAll={async () => { if(confirm('전체 초기화?')) { await api.deleteAll(safeAddress); loadAllData(); } }} />}
          </ErrorBoundary>
        </main>
      )}

      {activeCard && (
        <CardModal activeCard={activeCard} totalTimeLimit={totalTimeLimit} elapsed={elapsed} answerInput={answerInput} setAnswerInput={setAnswerInput} inputStatus={inputStatus} handleSequentialInput={handleSequentialInput} renderContent={() => renderSequentialMaskedContent(activeCard.content)} onClose={() => setActiveCard(null)} />
      )}

      <div className="fixed bottom-0 left-0 w-full bg-black/95 border-t border-indigo-500/50 p-4 z-50">
        <div className="max-w-6xl mx-auto"><div className="text-[10px] text-indigo-400 font-bold mb-2 uppercase">System Terminal Logs</div><div className="space-y-1 h-20 overflow-y-auto font-mono">{systemLogs.map((log, idx) => (<div key={idx} className={`text-[11px] ${log.includes('❌') ? 'text-red-400' : 'text-white/70'}`}>{log}</div>))}</div></div>
      </div>
    </div>
  );
}

export default function App() { return <MainApp />; }
