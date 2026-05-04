import React, { useState, useEffect, useRef } from "react";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { useEnokiFlow, useZkLogin } from "@mysten/enoki/react";

interface Category { id: number; title: string; content: string; folder_name?: string; }
interface Card { id: number; content: string; answer: string; options: string[]; level: number; next_review: string; status: string; best_time?: number; folder_name?: string; }
interface Exam { id: number; title: string; question: string; answer: string; explanation: string; }

// 🚨 대한민국 법령 및 학술 문헌에 최적화된 초정밀 형태소 분리 정규식
// 1. 특수기호 및 띄어쓰기 분리
// 2. 조사, 어미, 접미사 등 명사가 아닌 찌꺼기 형태소 완벽 분리
const SPLIT_REGEX = /(\s+|[ㆍ\.,!?()[\]{}<>"'「」『』“”‘’○①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮\-~·]+|(?:은|는|이|가|을|를|의|에|에게|과|와|로서|로써|로|으로|도|만|부터|까지|이다|한다|하다|함|됨|됨을|함을|함으로써|됨으로써|대하여|대해|대한|관하여|관해|관한|등|및|에서|에서는|에서의|로부터|에의|로부터의|에도|에는|이나|나|라도|이라도|인가|든가|이든지|든지|적|적인|적으로|할|한|하는|된|될|되는|인|일|이고|이며|이면|이지|입니다|합니다|습니다)(?=\s|$|[ㆍ\.,!?()[\]{}<>"'「」『』“”‘’○①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮\-~·]))/g;

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-10 text-red-500 bg-black min-h-screen font-mono">
          <h1 className="text-2xl font-bold mb-4">🚨 앱 렌더링 치명적 에러 발생</h1>
          <p className="mb-4 text-white/80">아래 에러 메시지를 긁어서 아키텍트에게 알려주세요.</p>
          <pre className="bg-red-950/30 p-4 border border-red-500/50 rounded overflow-auto whitespace-pre-wrap text-[11px]">
            {this.state.error?.toString()}
            {"\n\n"}
            {this.state.error?.stack}
          </pre>
          <button onClick={() => window.location.reload()} className="mt-6 px-6 py-2 bg-red-600 text-white rounded">새로고침</button>
        </div>
      );
    }
    return this.props.children;
  }
}

let globalLongPressTimer: any = null;
const createLongPressHandlers = (callback: () => void, ms = 800) => {
  const start = () => { globalLongPressTimer = setTimeout(callback, ms); };
  const clear = () => { if (globalLongPressTimer) clearTimeout(globalLongPressTimer); };
  return { onTouchStart: start, onTouchEnd: clear, onMouseDown: start, onMouseUp: clear, onMouseLeave: clear, onContextMenu: (e:any) => { e.preventDefault(); callback(); } };
};

function MainApp() {
  const enokiFlow = useEnokiFlow();
  const zkLogin = useZkLogin();
  const suiWalletAccount = useCurrentAccount();
  const safeAddress = suiWalletAccount?.address || zkLogin?.address || "";
  const isLoggedIn = safeAddress.length > 0;

  const [activeTab, setActiveTab] = useState('dashboard');
  const [lawFile, setLawFile] = useState<File | null>(null);
  const [examFile, setExamFile] = useState<File | null>(null);
  const [uploadFolder, setUploadFolder] = useState("기본 폴더");
  
  const [panelState, setPanelState] = useState({ status: 'idle', title: '대기 중', message: '작업을 선택하세요.', progress: 0, logs: [] as string[] });
  
  const [categories, setCategories] = useState<Category[]>([]);
  const [savedCards, setSavedCards] = useState<Card[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  
  const [activeCraftFolder, setActiveCraftFolder] = useState('기본 폴더');
  const [activeEnhanceFolder, setActiveEnhanceFolder] = useState('기본 폴더');
  const [openCraftFolders, setOpenCraftFolders] = useState<Record<string, boolean>>({"기본 폴더": true});
  const [openEnhanceFolders, setOpenEnhanceFolders] = useState<Record<string, boolean>>({"기본 폴더": true});
  
  const [selectedCraftIds, setSelectedCraftIds] = useState<Set<number>>(new Set());
  const [selectedEnhanceIds, setSelectedEnhanceIds] = useState<Set<number>>(new Set());
  const [targetFolderName, setTargetFolderName] = useState('');
  
  const [viewMode, setViewMode] = useState<'all' | '법' | '령' | '칙'>('all');
  const [colCount, setColCount] = useState<number>(3);
  const [cardColumns, setCardColumns] = useState<Record<number, number>>({});
  const [columnNames, setColumnNames] = useState<Record<number, string>>({ 0: "COLUMN 1", 1: "COLUMN 2", 2: "COLUMN 3", 3: "COLUMN 4" });
  
  const [expandedCardId, setExpandedCardId] = useState<number | null>(null);
  const [expandedCategoryId, setExpandedCategoryId] = useState<number | null>(null);
  const [expandedExamId, setExpandedExamId] = useState<number | null>(null);
  
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [parsedText, setParsedText] = useState("");
  const [selectedWordIndices, setSelectedWordIndices] = useState<Set<number>>(new Set());
  const [answerInput, setAnswerInput] = useState("");

  const [blanks, setBlanks] = useState<{answer: string, correct: boolean}[]>([]);
  const [currentBlankIdx, setCurrentBlankIdx] = useState(0);
  const [inputStatus, setInputStatus] = useState<'idle'|'correct'|'wrong'>('idle');
  const [startTime, setStartTime] = useState<number>(0);
  const [elapsed, setElapsed] = useState<number>(0);
  const [totalTimeLimit, setTotalTimeLimit] = useState<number>(0);

  useEffect(() => {
    try {
      const sCols = localStorage.getItem('cardColumns'); if (sCols) setCardColumns(JSON.parse(sCols));
      const sNames = localStorage.getItem('columnNames'); if (sNames) setColumnNames(JSON.parse(sNames));
      const sColCount = localStorage.getItem('colCount'); if (sColCount) setColCount(parseInt(sColCount) || 3);
    } catch(e) {}
  }, []);

  const updateColCount = (num: number) => { setColCount(num); localStorage.setItem('colCount', num.toString()); };
  const updateCardColumn = (cardId: number, colIndex: number) => { const n = { ...cardColumns, [cardId]: colIndex }; setCardColumns(n); localStorage.setItem('cardColumns', JSON.stringify(n)); };
  const updateColumnName = (colIndex: number, newName: string) => { const n = { ...columnNames, [colIndex]: newName }; setColumnNames(n); localStorage.setItem('columnNames', JSON.stringify(n)); };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.expandable-card') && !(e.target as Element).closest('.modal-container')) { 
        setExpandedCardId(null); setExpandedCategoryId(null); setExpandedExamId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleAuth = async () => { try { await enokiFlow.handleAuthCallback(); window.history.replaceState(null, '', window.location.pathname); } catch (err) {} };
    if (window.location.hash.includes("id_token=")) handleAuth();
  }, [enokiFlow]);

  useEffect(() => { if (isLoggedIn) { loadCategories(); loadMyCards(); loadExams(); } }, [isLoggedIn, safeAddress]);

  const loadCategories = async () => {
    try { const res = await fetch(`https://api.blankd.top/api/get-categories?wallet_address=${safeAddress}`); const data = await res.json(); if (res.ok) setCategories(data.categories || []); } catch (err) {}
  };
  const loadMyCards = async () => {
    try { const res = await fetch(`https://api.blankd.top/api/my-cards?wallet_address=${safeAddress}`); const data = await res.json(); if (res.ok) setSavedCards(data.cards || []); } catch (err) {}
  };
  const loadExams = async () => {
    try { const res = await fetch(`https://api.blankd.top/api/get-all-exams?wallet_address=${safeAddress}`); const data = await res.json(); if (res.ok) setExams(data.exams || []); } catch (err) {}
  };

  const updatePanel = (status: string, title: string, msg: string, progress: number = 0) => {
    setPanelState(prev => ({ status, title, message: msg, progress, logs: [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.logs].slice(0, 10) }));
  };

  const pollTaskProgress = (taskId: string, onSuccess: () => void) => {
    const intv = setInterval(async () => {
      try {
        const res = await fetch(`https://api.blankd.top/api/task-status?task_id=${taskId}`);
        const data = await res.json();
        if (data.status === 'completed') { clearInterval(intv); updatePanel('success', '작업 완료', data.message, 100); onSuccess(); }
        else if (data.status === 'error') { clearInterval(intv); updatePanel('error', '오류 발생', data.message, 0); }
        else { updatePanel('loading', 'AI 처리 중', data.message, data.progress); }
      } catch(e) {}
    }, 1500);
  };

  const uploadLaw = async () => {
    if (!lawFile) return alert("법령 파일을 선택해주세요.");
    updatePanel('loading', '전송 대기', `업로드를 시작합니다...`, 5);
    const formData = new FormData(); formData.append("file", lawFile); formData.append("wallet_address", safeAddress); formData.append("custom_folder", uploadFolder);
    try {
      const res = await fetch(`https://api.blankd.top/api/upload-pdf`, { method: "POST", body: formData });
      if (res.ok) { const data = await res.json(); setLawFile(null); pollTaskProgress(data.task_id, () => loadCategories()); }
    } catch (err: any) { updatePanel('error', '전송 오류', err.message, 0); }
  };

  const uploadExam = async () => {
    if (!examFile) return alert("모의고사 파일을 선택해주세요.");
    updatePanel('loading', '전송 대기', `모의고사 전송을 시작합니다...`, 5);
    const formData = new FormData(); formData.append("file", examFile); formData.append("wallet_address", safeAddress);
    try {
      const res = await fetch(`https://api.blankd.top/api/upload-exam`, { method: "POST", body: formData });
      if (res.ok) { const data = await res.json(); setExamFile(null); pollTaskProgress(data.task_id, () => loadExams()); }
    } catch (err: any) { updatePanel('error', '전송 오류', err.message, 0); }
  };

  const handleAiRecommend = async (cat: Category) => {
    updatePanel('loading', '분석 요청', 'AI 엔진과 연결 중입니다...', 5);
    try {
      const res = await fetch("https://api.blankd.top/api/recommend-blank", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: cat.content, wallet_address: safeAddress }) });
      if (res.ok) { const data = await res.json(); pollTaskProgress(data.task_id, () => {}); }
    } catch(e) { updatePanel('error', '연결 실패', 'AI 통신 오류', 0); }
  };

  const handleSplitCategory = async (cat: Category, splitIdx: number, wordsArray: string[]) => {
    if (!confirm("이 부분을 기준으로 조항을 분할하시겠습니까?")) return;
    const text1 = wordsArray.slice(0, splitIdx).join(''); const text2 = wordsArray.slice(splitIdx).join('');
    updatePanel('loading', '문헌 분할 중', '조항을 나누고 있습니다...', 50);
    try {
      const res = await fetch("https://api.blankd.top/api/split-category", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: cat.id, text1, text2, wallet_address: safeAddress }) });
      if (res.ok) { setExpandedCategoryId(null); setSelectedWordIndices(new Set()); loadCategories(); updatePanel('success', '완료', '분할되었습니다.', 100); }
    } catch(e) {}
  };

  const handleMakeBlankCard = async (cat: Category) => {
    if (!isLoggedIn || selectedWordIndices.size === 0) return alert("단어를 선택해주세요.");
    updatePanel('loading', '저장 및 삭제 중', '카드를 만들고 원본을 삭제합니다...', 50);
    const words = parsedText ? String(parsedText).split(SPLIT_REGEX) : [];
    let cardContent = ""; let answerText = ""; let isBlanking = false; 
    words.forEach((word, index) => {
      if (!word) return;
      if (selectedWordIndices.has(index) && word.trim() !== "") {
        if (!isBlanking) { cardContent += "[ "; if (answerText.length > 0) answerText += ", "; isBlanking = true; }
        cardContent += word; answerText += word;
      } else {
        if (isBlanking) { cardContent += " ]"; isBlanking = false; }
        cardContent += word;
      }
    });
    if (isBlanking) cardContent += " ]";

    try {
      const res = await fetch("https://api.blankd.top/api/save-card", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_address: safeAddress, card_content: cardContent, answer_text: answerText, folder_name: cat.folder_name || '기본 폴더' }) });
      if (res.ok) {
        await fetch("https://api.blankd.top/api/delete-category", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_address: safeAddress, id: cat.id }) });
        setSelectedWordIndices(new Set()); setExpandedCategoryId(null);
        loadCategories(); loadMyCards(); updatePanel('success', '완료', '추출 및 삭제됨.', 100); setActiveTab('enhance');
      }
    } catch(err) {}
  };

  const handleDeleteCategory = async (cat_id: number) => {
    if (!confirm("이 문헌을 영구 삭제하시겠습니까?")) return;
    const res = await fetch("https://api.blankd.top/api/delete-category", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_address: safeAddress, id: cat_id }) });
    if (res.ok) loadCategories();
  };

  const handleDeleteCard = async (card_id: number) => {
    if (!confirm("이 카드를 영구 삭제하시겠습니까?")) return;
    const res = await fetch("https://api.blankd.top/api/delete-card", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_address: safeAddress, id: card_id }) });
    if (res.ok) { setActiveCard(null); loadMyCards(); }
  };

  const handleDeleteAll = async () => {
    if (!confirm("보관소의 모든 데이터를 영구 지우시겠습니까?")) return;
    const res = await fetch("https://api.blankd.top/api/delete-all", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_address: safeAddress }) });
    if (res.ok) { setCategories([]); setSavedCards([]); setExams([]); setExpandedCategoryId(null); updatePanel('idle', '초기화', '데이터 리셋됨', 0); }
  };

  const handleMoveCraftFolders = async () => {
    if (selectedCraftIds.size === 0 || !targetFolderName) return;
    await fetch('https://api.blankd.top/api/move-categories', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ids: Array.from(selectedCraftIds), folder_name: targetFolderName, wallet_address: safeAddress})});
    setSelectedCraftIds(new Set()); setTargetFolderName(''); loadCategories(); setOpenCraftFolders(prev => ({...prev, [targetFolderName]: true}));
  };

  const handleMoveEnhanceFolders = async () => {
    if (selectedEnhanceIds.size === 0 || !targetFolderName) return;
    await fetch('https://api.blankd.top/api/move-cards', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ids: Array.from(selectedEnhanceIds), folder_name: targetFolderName, wallet_address: safeAddress})});
    setSelectedEnhanceIds(new Set()); setTargetFolderName(''); loadMyCards(); setOpenEnhanceFolders(prev => ({...prev, [targetFolderName]: true}));
  };

  const submitCombatAnswer = async (isCorrect: boolean, time: number = 999.0) => {
    if (!activeCard) return;
    const res = await fetch("https://api.blankd.top/api/submit-answer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ card_id: activeCard.id, is_correct: isCorrect, clear_time: time }) });
    if (res.ok) { alert(isCorrect ? `성공! 기록: ${time.toFixed(1)}초` : `실패! 시간 초과 또는 오답입니다.`); setActiveCard(null); loadMyCards(); }
  };

  const handleGoogleZkLogin = async () => {
    try {
      const createUrl = (enokiFlow as any).createAuthorizationURL || enokiFlow.createAuthorizationUrl;
      if (!createUrl) throw new Error("인증 함수 없음");
      const url = await createUrl.call(enokiFlow, { provider: 'google', clientId: '536814695888-bepe0chce3nq31vuu3th60c7al7vpsv7.apps.googleusercontent.com', redirectUrl: window.location.origin, network: 'testnet' });
      window.location.href = url;
    } catch (err: any) { alert(`로그인 에러: ${err.message}`); }
  };

  const toggleWordSelection = (index: number) => {
    const newSet = new Set(selectedWordIndices);
    if (newSet.has(index)) newSet.delete(index); else newSet.add(index);
    setSelectedWordIndices(newSet);
  };

  useEffect(() => {
    if (activeCard) {
      const foundBlanks: {answer: string, correct: boolean}[] = [];
      const regex = /\[\s*(.*?)\s*\]/g;
      let match;
      const safeContent = activeCard.content ? String(activeCard.content) : "";
      while((match = regex.exec(safeContent)) !== null) foundBlanks.push({ answer: match[1].trim(), correct: false });
      if(foundBlanks.length === 0 && activeCard.answer) foundBlanks.push(...activeCard.answer.split(',').map(a => ({answer: a.trim(), correct: false})));
      setBlanks(foundBlanks); setCurrentBlankIdx(0); setAnswerInput(""); setInputStatus('idle');
      const timePerBlank = Math.max(1.0, 5.0 - Math.floor(activeCard.level / 5) * 0.5);
      setTotalTimeLimit(timePerBlank * foundBlanks.length); setStartTime(Date.now()); setElapsed(0);
    }
  }, [activeCard]);

  useEffect(() => {
    if (activeCard && currentBlankIdx < blanks.length) {
      const interval = setInterval(() => {
        const diff = (Date.now() - startTime) / 1000;
        setElapsed(diff);
        if (diff >= totalTimeLimit) { clearInterval(interval); submitCombatAnswer(false, diff); }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [activeCard, currentBlankIdx, blanks.length, startTime, totalTimeLimit]);

  const handleSequentialInput = () => {
    if (inputStatus === 'correct' || inputStatus === 'wrong') return;
    if (!blanks[currentBlankIdx]) return;
    const expected = blanks[currentBlankIdx].answer.replace(/\s+/g, '').toLowerCase();
    const actual = answerInput.replace(/\s+/g, '').toLowerCase();
    
    if (expected === actual) {
      setInputStatus('correct');
      const newBlanks = [...blanks]; newBlanks[currentBlankIdx].correct = true; setBlanks(newBlanks);
      setTimeout(() => {
        setAnswerInput(""); setInputStatus('idle');
        if (currentBlankIdx + 1 < blanks.length) setCurrentBlankIdx(currentBlankIdx + 1);
        else submitCombatAnswer(true, elapsed);
      }, 300);
    } else {
      setInputStatus('wrong');
      setTimeout(() => { setAnswerInput(""); setInputStatus('idle'); }, 500);
    }
  };

  const getStrictCardTitle = (text?: string) => {
    if (!text) return "제목 없음";
    const str = String(text);
    const match = str.match(/^(\[.*?\]\s*제\s*\d+\s*조(?:의\s*\d+)?(?:\([^)]+\))?)/);
    return match ? match[1] : str.split('\n')[0].substring(0, 15) + "...";
  };

  const getSortNumber = (text?: string) => {
    if (!text) return 999999;
    const match = String(text).match(/제\s*(\d+)\s*조/);
    return match ? parseInt(match[1]) : 999999;
  };

  const getColSpanAndStartClass = (title: string, currentViewMode: string, isExpanded: boolean, colCount: number) => {
    if (isExpanded) return "col-span-full";
    const isLaw = title?.includes('[법]');
    const isDecret = title?.includes('[령]');
    const isRule = title?.includes('[칙]');
    if (currentViewMode === 'all' && colCount >= 3 && (isLaw || isDecret || isRule)) {
      if (isLaw) return "md:col-start-1 col-span-1";
      if (isDecret) return "md:col-start-2 col-span-1";
      if (isRule) return "md:col-start-3 col-span-1";
    }
    return "col-span-full";
  };

  const renderSequentialMaskedContent = (text?: string) => {
    if (!text) return null;
    const parts = String(text).split(/(\[.*?\])/g);
    let bIdx = 0;
    return parts.map((part, i) => {
      if (part.startsWith('[') && part.endsWith(']')) {
        const isCorrect = blanks[bIdx]?.correct; const isCurrent = bIdx === currentBlankIdx; bIdx++;
        if (isCorrect) return <span key={i} className="text-green-400 font-bold mx-1">{part.replace(/\[|\]/g, '')}</span>;
        else if (isCurrent) return <span key={i} className="inline-block min-w-[60px] h-5 bg-indigo-500/30 border-b-2 border-indigo-400 mx-1 animate-pulse align-middle"></span>;
        else return <span key={i} className="inline-block min-w-[60px] h-5 bg-white/10 border-b border-white/50 mx-1 align-middle"></span>;
      }
      return part;
    });
  };

  const craftFolders = Array.from(new Set((categories || []).map(c => c?.folder_name || '기본 폴더')));
  const enhanceFolders = Array.from(new Set((savedCards || []).map(c => c?.folder_name || '기본 폴더')));

  return (
    <div className="min-h-screen bg-[#0d0d0f] text-[#d1d1d1] font-sans selection:bg-neutral-800 selection:text-white p-6 sm:p-12 relative">
      <header className="max-w-6xl mx-auto flex justify-between items-baseline border-b border-white/10 pb-8 mb-12 gap-4">
        <h1 className="text-2xl font-light tracking-[0.3em] text-white">Blank_D</h1>
      </header>
      <main className="max-w-6xl mx-auto">
        {!isLoggedIn ? (
          <div className="flex justify-center py-40">
            <button onClick={handleGoogleZkLogin} className="px-10 py-3 border border-white/20 text-white/80 hover:bg-white/10 transition-all font-light tracking-widest text-sm">
              Google 로그인
            </button>
          </div>
        ) : (
          <>
            <nav className="flex gap-8 mb-8 border-b border-white/5 pb-4 overflow-x-auto scrollbar-hide">
              {[{ id: 'dashboard', label: '대시보드' }, { id: 'craft', label: '지식 추출' }, { id: 'enhance', label: '기억 강화' }, { id: 'exam', label: '모의고사' }, { id: 'mypage', label: '설정' }].map((tab) => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`text-xs font-light tracking-[0.1em] pb-4 -mb-[17px] ${activeTab === tab.id ? 'text-white border-b border-white/50' : 'text-white/30'}`}>{tab.label}</button>
              ))}
            </nav>

            {activeTab === 'dashboard' && (
              <div className="space-y-8 animate-in fade-in">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div className="border border-white/10 p-6 rounded-sm bg-white/[0.02]">
                    <div className="text-[10px] text-white/30 mb-2 tracking-widest uppercase">총 보유 지식</div>
                    <div className="text-3xl font-light text-white/90">{savedCards.length}</div>
                  </div>
                  <div className="border border-rose-900/30 p-6 rounded-sm bg-rose-950/10">
                    <div className="text-[10px] text-rose-400/50 mb-2 tracking-widest uppercase">망각 경고 (복원 필요)</div>
                    <div className="text-3xl font-light text-rose-400/80">{savedCards.filter(c => c.status === 'AT_RISK').length}</div>
                  </div>
                  <div className="border border-amber-900/30 p-6 rounded-sm bg-amber-950/10">
                    <div className="text-[10px] text-amber-500/50 mb-2 tracking-widest uppercase">영구 보존 (전설)</div>
                    <div className="text-3xl font-light text-amber-500/80">{savedCards.filter(c => c.level >= 3).length}</div>
                  </div>
                </div>

                <div className="border border-white/10 rounded-sm overflow-hidden">
                  <div className="bg-white/5 px-6 py-4 border-b border-white/10 text-xs text-white/50 tracking-widest">
                    장별 학습 진행률 현황
                  </div>
                  <div className="divide-y divide-white/5">
                    {Array.from(new Set([...categories.map(c=>c.folder_name||'기본 폴더'), ...savedCards.map(c=>c.folder_name||'기본 폴더')])).sort().map(folder => {
                      const folderCats = categories.filter(c => (c.folder_name||'기본 폴더') === folder);
                      const folderCards = savedCards.filter(c => (c.folder_name||'기본 폴더') === folder);
                      const totalExtracted = folderCards.length;
                      const totalRemaining = folderCats.length;
                      const memorized = folderCards.filter(c => c.level >= 1).length;
                      
                      return (
                        <div key={folder} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors">
                          <div className="text-sm font-bold text-white/80 w-1/3">📁 {folder}</div>
                          <div className="flex-1 space-y-3 w-full">
                            <div>
                              <div className="flex justify-between text-[10px] text-indigo-400 mb-1">
                                <span>지식 추출 진행률</span>
                                <span>{totalExtracted} / {totalExtracted + totalRemaining} 완료</span>
                              </div>
                              <div className="h-1.5 w-full bg-black border border-indigo-900/30 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-500" style={{ width: `${(totalExtracted + totalRemaining) === 0 ? 0 : (totalExtracted / (totalExtracted + totalRemaining)) * 100}%` }}></div>
                              </div>
                            </div>
                            <div>
                              <div className="flex justify-between text-[10px] text-amber-400 mb-1">
                                <span>기억 강화 (방어 성공률)</span>
                                <span>{memorized} / {totalExtracted || 1} 방어됨</span>
                              </div>
                              <div className="h-1.5 w-full bg-black border border-amber-900/30 rounded-full overflow-hidden">
                                <div className="h-full bg-amber-500" style={{ width: `${totalExtracted === 0 ? 0 : (memorized / totalExtracted) * 100}%` }}></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'craft' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                <div className="lg:col-span-8 space-y-8">
                  <div className="flex flex-col gap-2 mb-4">
                    <div className="flex gap-2">
                      <input type="text" value={uploadFolder} onChange={e=>setUploadFolder(e.target.value)} placeholder="분류할 주제/폴더명 (법령 HTML 업로드 시에는 제N장이 우선 적용됩니다)" className="flex-1 bg-black/50 border border-white/20 text-xs p-2 text-white outline-none" />
                    </div>
                    <div className="flex gap-2">
                      <label className="flex-1 border border-white/20 p-2 text-center text-xs hover:bg-white/10 cursor-pointer text-white/80">
                        <input type="file" accept=".pdf,.html,.txt" onChange={e => setLawFile(e.target.files?.[0] || null)} className="hidden"/> {lawFile ? `✅ ${lawFile.name}` : '+ 문헌(법령) 업로드'}
                      </label>
                      <button onClick={uploadLaw} className="px-4 border border-white/20 text-xs">문헌 전송</button>
                      
                      <label className="flex-1 border border-teal-900/40 p-2 text-center text-xs hover:bg-teal-900/20 cursor-pointer text-teal-400">
                        <input type="file" accept=".pdf,.html,.txt" onChange={e => setExamFile(e.target.files?.[0] || null)} className="hidden"/> {examFile ? `✅ ${examFile.name}` : '+ 모의고사 업로드'}
                      </label>
                      <button onClick={uploadExam} className="px-4 border border-teal-900/40 text-xs text-teal-400">문제 전송</button>
                    </div>
                  </div>
                  
                  {selectedCraftIds.size > 0 && (
                    <div className="flex gap-2 items-center bg-indigo-900/20 p-3 rounded-sm border border-indigo-500/20 mb-4">
                      <span className="text-xs text-indigo-300">{selectedCraftIds.size}개 선택됨</span>
                      <input value={targetFolderName} onChange={e=>setTargetFolderName(e.target.value)} placeholder="새 폴더명" className="bg-black/50 border border-white/20 text-xs p-2 text-white outline-none flex-1" />
                      <button onClick={handleMoveCraftFolders} className="text-xs border border-indigo-500/50 bg-indigo-600/30 text-white px-4 py-2">폴더로 이동</button>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 mb-6">
                    {craftFolders.map(folder => (
                      <button 
                        key={folder} 
                        onClick={() => setOpenCraftFolders(p => ({...p, [folder]: !p[folder]}))} 
                        className={`px-4 py-2 text-[12px] font-bold border rounded-sm transition-all ${openCraftFolders[folder] ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-indigo-900/40 text-indigo-300 border-indigo-500/30'}`}
                      >
                        📁 {folder}
                      </button>
                    ))}
                  </div>

                  {craftFolders.map(folder => (
                    openCraftFolders[folder] && (
                      <div key={folder} className="mb-8">
                        <div className="text-sm text-white/50 mb-3 border-b border-white/10 pb-2">{folder}</div>
                        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}>
                          {categories.filter(c => c && (c.folder_name || '기본 폴더') === folder).sort((a, b) => getSortNumber(a.title) - getSortNumber(b.title)).map(cat => {
                            if (!cat) return null;
                            const isExpanded = expandedCategoryId === cat.id;
                            return (
                              <div key={cat.id} className={`expandable-card relative flex flex-col justify-center ${getColSpanAndStartClass(cat.title, viewMode, isExpanded, colCount)} ${isExpanded ? "items-stretch" : "items-center"}`}>
                                <input type="checkbox" className="absolute top-2 right-2 z-10 w-4 h-4 cursor-pointer" checked={selectedCraftIds.has(cat.id)} onChange={() => { const s = new Set(selectedCraftIds); if(s.has(cat.id)) s.delete(cat.id); else s.add(cat.id); setSelectedCraftIds(s); }} />
                                {!isExpanded ? (
                                  <button 
                                    {...createLongPressHandlers(() => handleDeleteCategory(cat.id), 800)}
                                    onClick={() => { setExpandedCategoryId(cat.id); setSelectedWordIndices(new Set()); setParsedText(cat.content || ""); }} 
                                    className="w-full h-full text-[13px] font-serif font-bold text-center text-indigo-300 bg-indigo-900/20 py-4 px-3 rounded-sm border border-indigo-500/30 shadow-[0_0_10px_rgba(99,102,241,0.1)] transition-all hover:bg-indigo-900/40"
                                  >
                                    {getStrictCardTitle(cat.title)} 
                                  </button>
                                ) : (
                                  <div className="w-full animate-in fade-in flex flex-col gap-3 p-6 bg-[#0a0a0c] border border-indigo-500/50 shadow-2xl rounded-sm">
                                    <div className="flex justify-between items-center mb-2">
                                      <button onClick={() => handleAiRecommend(cat)} className="text-[10px] bg-teal-900/40 text-teal-400 px-2 py-1 rounded">✨ Gemma 26B 빈칸 추천</button>
                                      <button onClick={(e) => { e.stopPropagation(); setExpandedCategoryId(null); }} className="text-white/40 text-xs">닫기</button>
                                    </div>
                                    <div className="font-serif text-[15px] leading-loose text-white/80 p-4 bg-black/40 border border-white/10 max-h-64 overflow-y-auto break-all scrollbar-hide">
                                      {parsedText.split(SPLIT_REGEX).map((word, idx, arr) => {
                                        if (!word) return null;
                                        if (/^\s+$/.test(word)) return <span key={idx}>{word}</span>;
                                        const isSelected = selectedWordIndices.has(idx);
                                        return (
                                          <span key={idx} onClick={() => toggleWordSelection(idx)} {...createLongPressHandlers(() => handleSplitCategory(cat, idx, arr), 800)} className={`cursor-pointer px-[2px] rounded select-none ${isSelected ? 'bg-amber-500 text-black font-bold' : 'hover:bg-white/20'}`}>{word}</span>
                                        )
                                      })}
                                    </div>
                                    <button onClick={() => handleMakeBlankCard(cat)} className="w-full py-4 bg-amber-500/20 text-amber-400 text-sm tracking-widest mt-2">지식 추출 및 원본 삭제</button>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  ))}
                </div>
                <div className="lg:col-span-4 flex flex-col space-y-6">
                  <div className="border border-indigo-900/30 bg-indigo-950/5 rounded-sm overflow-hidden sticky top-12">
                    <div className="border-b border-indigo-900/30 p-4 bg-indigo-950/20 flex justify-between items-center">
                      <span className="text-[10px] text-indigo-400 font-bold uppercase">System Terminal</span>
                      <div className="text-[10px] text-teal-400">{panelState.progress}%</div>
                    </div>
                    {panelState.progress > 0 && panelState.progress < 100 && (
                      <div className="h-1 bg-indigo-500/20"><div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${panelState.progress}%` }}></div></div>
                    )}
                    <div className="p-6 text-center space-y-3">
                      <div className="text-[11px] text-white/80 whitespace-pre-wrap">{panelState.message}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'enhance' && (
              <div className="space-y-8 animate-in fade-in">
                {selectedEnhanceIds.size > 0 && (
                  <div className="flex gap-2 items-center bg-amber-900/20 p-3 rounded-sm border border-amber-500/20 mb-4">
                    <span className="text-xs text-amber-300">{selectedEnhanceIds.size}개 선택됨</span>
                    <input value={targetFolderName} onChange={e=>setTargetFolderName(e.target.value)} placeholder="새 폴더명" className="bg-black/50 border border-white/20 text-xs p-2 text-white outline-none flex-1" />
                    <button onClick={handleMoveEnhanceFolders} className="text-xs border border-amber-500/50 bg-amber-600/30 text-white px-4 py-2">폴더로 이동</button>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 mb-6">
                  {enhanceFolders.map(folder => (
                    <button 
                      key={folder} 
                      onClick={() => setOpenEnhanceFolders(p => ({...p, [folder]: !p[folder]}))} 
                      className={`px-4 py-2 text-[12px] font-bold border rounded-sm transition-all ${openEnhanceFolders[folder] ? 'bg-amber-600 text-white border-amber-500' : 'bg-amber-900/30 text-amber-300 border-amber-500/30'}`}
                    >
                      📁 {folder}
                    </button>
                  ))}
                </div>

                {enhanceFolders.map(folder => (
                  openEnhanceFolders[folder] && (
                    <div key={folder} className="mb-8">
                      <div className="text-sm text-white/50 mb-3 border-b border-white/10 pb-2">{folder}</div>
                      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}>
                        {savedCards
                          .filter(c => c && (c.folder_name || '기본 폴더') === folder)
                          .sort((a, b) => getSortNumber(a.content) - getSortNumber(b.content))
                          .map((card) => {
                          if (!card) return null;
                          const isExpanded = false;
                          return (
                            <div key={card.id} className={`relative expandable-card flex flex-col justify-center ${getColSpanAndStartClass(card.content, viewMode, isExpanded, colCount)} items-center`}>
                              <input type="checkbox" className="absolute top-2 right-2 z-10 w-4 h-4 cursor-pointer" checked={selectedEnhanceIds.has(card.id)} onChange={() => { const s = new Set(selectedEnhanceIds); if(s.has(card.id)) s.delete(card.id); else s.add(card.id); setSelectedEnhanceIds(s); }} />
                              <button 
                                {...createLongPressHandlers(() => handleDeleteCard(card.id), 800)}
                                onClick={() => setActiveCard(card)}
                                className={`w-full relative text-[13px] font-serif font-bold text-center py-5 px-3 rounded-sm border shadow-[0_0_10px_rgba(0,0,0,0.5)] transition-all select-none ${card.status === "BURNED" ? "border-white/5 text-white/30" : "border-indigo-500/30 text-indigo-300 bg-indigo-900/20 hover:bg-indigo-900/40"}`}
                              >
                                <span className="absolute top-1 left-2 text-[9px] text-amber-400">LV.{card.level}</span>
                                {getStrictCardTitle(card.content)}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                ))}
              </div>
            )}

            {activeTab === 'exam' && (
              <div className="space-y-8 animate-in fade-in">
                <div className="text-white/60 text-xs border-b border-white/10 pb-2">CBT 모의고사 문제 풀이장</div>
                {exams.length === 0 ? (
                  <div className="py-32 text-center text-white/20 text-xs tracking-widest">저장된 모의고사가 없습니다. 지식 추출 탭에서 업로드하세요.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {exams.map(exam => {
                       if (!exam) return null;
                       const isExpanded = expandedExamId === exam.id;
                       return (
                         <div key={exam.id} className="border border-teal-900/40 bg-teal-950/10 p-6 rounded-sm cursor-pointer hover:bg-teal-900/20 transition-all expandable-card" onClick={() => setExpandedExamId(isExpanded ? null : exam.id)}>
                            <div className="text-[13px] text-teal-100 font-serif leading-loose whitespace-pre-wrap">{exam.question}</div>
                            {isExpanded && (
                              <div className="mt-4 pt-4 border-t border-teal-900/50 animate-in fade-in">
                                <div className="text-amber-400 font-bold mb-2">정답: {exam.answer}</div>
                                <div className="text-[11px] text-white/60 leading-relaxed bg-black/40 p-3 rounded">{exam.explanation}</div>
                              </div>
                            )}
                         </div>
                       )
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'mypage' && (
              <div className="max-w-md mx-auto space-y-8 py-16 animate-in fade-in">
                <div className="border border-white/10 p-6 rounded-sm">
                  <div className="text-xs text-white/60 mb-4">공통 레이아웃 뷰어 설정</div>
                  <div className="flex gap-2 mb-4">
                    {['all', '법', '령', '칙'].map(mode => (
                      <button key={mode} onClick={() => setViewMode(mode as any)} className={`px-3 py-1 text-[10px] rounded-sm ${viewMode === mode ? 'bg-white/20 text-white' : 'border border-white/10 text-white/40'}`}>{mode === 'all' ? '전체' : mode}</button>
                    ))}
                  </div>
                  <div className="text-xs text-white/60 mb-4">레이아웃 단수 설정 (지식추출 & 기억강화)</div>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4].map(num => (
                      <button key={num} onClick={() => updateColCount(num)} className={`px-3 py-1 text-[10px] rounded-sm ${colCount === num ? 'bg-white/20 text-white' : 'border border-white/10 text-white/40'}`}>{num}단</button>
                    ))}
                  </div>
                </div>
                <button onClick={handleDeleteAll} className="w-full py-4 border border-rose-900/30 text-rose-500/70 text-xs transition-all hover:bg-rose-900/20">데이터 완전 초기화 (전체 삭제)</button>
              </div>
            )}
          </>
        )}
      </main>

      {activeCard && (
        <div className="modal-container fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0d0d0f]/95 backdrop-blur-sm animate-in fade-in">
          <div className="border border-white/10 bg-[#121214] w-full max-w-2xl p-10 shadow-2xl rounded-sm">
            <div className="flex justify-between items-baseline border-b border-white/5 pb-6 mb-8">
              <div>
                <span className="font-bold text-amber-400 mr-4">LV.{activeCard.level}</span>
                <span className="text-xs text-teal-400 mr-4">⏳ {Number(totalTimeLimit - elapsed || 0).toFixed(1)}초 남음</span>
                {activeCard.best_time && <span className="text-xs text-amber-300 font-bold">🏆 BEST: {Number(activeCard.best_time).toFixed(1)}초</span>}
              </div>
              <button onClick={() => setActiveCard(null)} className="text-white/40 hover:text-white text-sm font-light"> 닫기 </button>
            </div>
            <div className="p-8 border border-white/5 bg-[#0a0a0c] text-[15px] leading-loose font-serif text-white/90 mb-8 rounded-sm">
              {renderSequentialMaskedContent(activeCard.content)}
            </div>
            <div className="flex flex-col gap-4 relative">
              <input 
                type="text" 
                autoFocus
                value={answerInput} 
                onChange={(e) => setAnswerInput(e.target.value)} 
                onKeyDown={(e) => e.key === 'Enter' && handleSequentialInput()}
                placeholder="보라색으로 깜빡이는 빈칸의 정답을 입력 후 엔터"
                className={`w-full bg-black/50 border p-4 text-white text-sm outline-none transition-all ${inputStatus === 'correct' ? 'border-green-500 text-green-400' : inputStatus === 'wrong' ? 'shake-animation border-red-500 text-red-400' : 'border-white/20 focus:border-indigo-500'}`}
              />
              <button onClick={handleSequentialInput} className="w-full py-4 bg-indigo-600/20 border border-indigo-500/50 hover:bg-indigo-600/40 text-indigo-300 text-sm tracking-widest transition-all">기억 복원 도전</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 50% { transform: translateX(5px); } 75% { transform: translateX(-5px); } }
        .shake-animation { animation: shake 0.3s ease-in-out; }
        .scrollbar-hide::-webkit-scrollbar { display: none; } 
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
