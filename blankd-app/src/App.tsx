import React, { Component, ErrorInfo, ReactNode, useState, useEffect, useRef } from "react";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { useEnokiFlow, useZkLogin } from "@mysten/enoki/react";

// 최상위 에러 바운더리
class ErrorBoundary extends Component<{children: ReactNode}, {hasError: boolean, error: Error | null, errorInfo: ErrorInfo | null}> {
  constructor(props: any) { super(props); this.state = { hasError: false, error: null, errorInfo: null }; }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) { console.error("렌더링 오류 진단:", error, errorInfo); this.setState({ errorInfo }); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black text-rose-500 p-10 font-mono">
          <h1 className="text-2xl font-bold mb-4 border-b border-rose-500/50 pb-2">🚨 치명적 렌더링 오류 감지됨</h1>
          <p className="mb-4 text-white/80">흰 화면(Crash)을 방지하고 오류 진단 결과를 표시합니다.</p>
          <div className="bg-rose-950/30 p-4 rounded border border-rose-900/50 mb-4 overflow-auto max-h-64">
            <p className="font-bold">{this.state.error?.toString()}</p>
            <pre className="text-xs text-rose-300 mt-2">{this.state.errorInfo?.componentStack}</pre>
          </div>
          <button onClick={() => window.location.reload()} className="px-6 py-2 bg-rose-900/50 border border-rose-500 text-white hover:bg-rose-800/50">시스템 새로고침</button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface Category { id: number; title: string; content: string; folder_name?: string; is_x_marked?: boolean; }
interface Card { id: number; content: string; answer: string; options: string[]; level: number; next_review: string; status: string; best_time?: number; folder_name?: string; }
interface Exam { id: number; title: string; question: string; answer: string; explanation: string; }

const SPLIT_REGEX = /(\s+|[ㆍ\.,!?()[\]{}<>"'「」『』“”‘’○①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮\-~·]+|(?:은|는|이|가|을|를|의|에|에게|과|와|로서|로써|로|으로|도|만|부터|까지|이다|한다|함|됨|됨을|함을|함으로써|대하여|대해|대한|등|및|에서|에서는|에서의|로부터|에의|로부터의|에도|에는|이나|나|라도|이라도)(?=\s|$|[ㆍ\.,!?()[\]{}<>"'「」『』“”‘’○①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮\-~·]))/g;

function MainApp() {
  const enokiFlow = useEnokiFlow();
  const zkLogin = useZkLogin();
  const suiWalletAccount = useCurrentAccount();
  const safeAddress = suiWalletAccount?.address || zkLogin?.address || "";
  const isLoggedIn = safeAddress.length > 0;

  const [activeTab, setActiveTab] = useState('dashboard');
  const [lawFile, setLawFile] = useState<File | null>(null);
  const [examFile, setExamFile] = useState<File | null>(null);
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

  const [blankRecommendationActive, setBlankRecommendationActive] = useState(false);

  // [핵심 교체] Hook(useRef)을 제거하고 순수 클로저로 동작하는 롱프레스 함수 생성기 (에러 310 완벽 해결)
  const createLongPress = (callback: () => void, ms = 800) => {
    let timer: any = null;
    const start = () => { timer = setTimeout(callback, ms); };
    const clear = () => { if (timer) clearTimeout(timer); };
    return { onTouchStart: start, onTouchEnd: clear, onMouseDown: start, onMouseUp: clear, onMouseLeave: clear, onContextMenu: (e: any) => { e.preventDefault(); callback(); } };
  };

  useEffect(() => {
    const sCols = localStorage.getItem('cardColumns'); if (sCols) try { setCardColumns(JSON.parse(sCols)); } catch(e) { console.error("LocalStorage 에러:", e); }
    const sNames = localStorage.getItem('columnNames'); if (sNames) try { setColumnNames(JSON.parse(sNames)); } catch(e) { console.error("LocalStorage 에러:", e); }
    const sColCount = localStorage.getItem('colCount'); if (sColCount) try { setColCount(parseInt(sColCount)); } catch(e) { console.error("LocalStorage 에러:", e); }
  }, []);

  const updateColCount = (num: number) => { setColCount(num); localStorage.setItem('colCount', num.toString()); };

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
    const handleAuth = async () => { try { await enokiFlow.handleAuthCallback(); window.history.replaceState(null, '', window.location.pathname); } catch (err) { console.error("인증콜백 오류:", err); } };
    if (window.location.hash.includes("id_token=")) handleAuth();
  }, [enokiFlow]);

  useEffect(() => { if (isLoggedIn) { loadCategories(); loadMyCards(); loadExams(); } }, [isLoggedIn, safeAddress]);

  const loadCategories = async () => {
    try {
      const res = await fetch(`https://api.blankd.top/api/get-categories?wallet_address=${safeAddress}`);
      const data = await res.json();
      if (res.ok) setCategories(Array.isArray(data.categories) ? data.categories : []);
      else console.error("백엔드 에러 응답:", data);
    } catch (err) { console.error("카테고리 로드 에러:", err); setCategories([]); }
  };

  const loadMyCards = async () => {
    try {
      const res = await fetch(`https://api.blankd.top/api/my-cards?wallet_address=${safeAddress}`);
      const data = await res.json();
      if (res.ok) setSavedCards(Array.isArray(data.cards) ? data.cards : []);
      else console.error("백엔드 에러 응답:", data);
    } catch (err) { console.error("카드 로드 에러:", err); setSavedCards([]); }
  };

  const loadExams = async () => {
    try {
      const res = await fetch(`https://api.blankd.top/api/get-all-exams?wallet_address=${safeAddress}`);
      const data = await res.json();
      if (res.ok) setExams(Array.isArray(data.exams) ? data.exams : []);
      else console.error("백엔드 에러 응답:", data);
    } catch (err) { console.error("모의고사 로드 에러:", err); setExams([]); }
  };

  const updatePanel = (status: string, title: string, msg: string, progress: number = 0) => {
    setPanelState(prev => ({ status, title, message: msg, progress, logs: [`[${new Date().toLocaleTimeString()}] ${msg}`, ...(Array.isArray(prev.logs) ? prev.logs : [])].slice(0, 10) }));
  };

  const pollTaskProgress = (taskId: string, onSuccess: () => void) => {
    const intv = setInterval(async () => {
      try {
        const res = await fetch(`https://api.blankd.top/api/task-status?task_id=${taskId}`);
        const data = await res.json();
        if (data.status === 'completed') {
          clearInterval(intv);
          updatePanel('success', '작업 완료', data.message, 100);
          onSuccess();
        } else if (data.status === 'error') {
          clearInterval(intv);
          updatePanel('error', '오류 발생', data.message, 0);
        } else {
          updatePanel('loading', '백그라운드 처리 중', data.message, data.progress);
        }
      } catch(e) { console.error("폴링 실패", e); }
    }, 1500);
  };

  const uploadLaw = async () => {
    if (!lawFile) return alert("법령 파일을 선택해주세요.");
    updatePanel('loading', '전송 대기', `업로드를 시작합니다...`, 5);
    const formData = new FormData(); formData.append("file", lawFile); formData.append("wallet_address", safeAddress);
    try {
      const res = await fetch(`https://api.blankd.top/api/upload-pdf`, { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        setLawFile(null);
        pollTaskProgress(data.task_id, () => loadCategories());
      } else {
        updatePanel('error', '서버 거부', '백엔드에서 업로드를 거절했습니다.', 0);
      }
    } catch (err: any) { updatePanel('error', '전송 오류', err.message, 0); }
  };

  const uploadExam = async () => {
    if (!examFile) return alert("모의고사 파일을 선택해주세요.");
    updatePanel('loading', '전송 대기', `모의고사 전송을 시작합니다...`, 5);
    const formData = new FormData(); formData.append("file", examFile); formData.append("wallet_address", safeAddress);
    try {
      const res = await fetch(`https://api.blankd.top/api/upload-exam`, { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        setExamFile(null);
        pollTaskProgress(data.task_id, () => loadExams());
      }
    } catch (err: any) { updatePanel('error', '전송 오류', err.message, 0); }
  };

  const handleAiRecommend = async (cat: Category) => {
    updatePanel('loading', '분석 요청', 'AI 엔진과 연결 중입니다...', 5);
    try {
      const res = await fetch("https://api.blankd.top/api/recommend-blank", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: cat.content, wallet_address: safeAddress })
      });
      if (res.ok) {
        const data = await res.json();
        pollTaskProgress(data.task_id, () => {});
      }
    } catch(e) { updatePanel('error', '연결 실패', 'AI 통신 오류', 0); }
  };

  const handleSplitCategory = async (cat: Category, splitIdx: number, wordsArray: string[]) => {
    if (!confirm("이 부분을 기준으로 조항을 분할하시겠습니까?")) return;
    const text1 = wordsArray.slice(0, splitIdx).join(''); const text2 = wordsArray.slice(splitIdx).join('');
    updatePanel('loading', '문헌 분할 중', '조항을 나누고 있습니다...', 50);
    try {
      const res = await fetch("https://api.blankd.top/api/split-category", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cat.id, text1, text2, wallet_address: safeAddress })
      });
      if (res.ok) { setExpandedCategoryId(null); setSelectedWordIndices(new Set()); loadCategories(); updatePanel('success', '완료', '분할되었습니다.', 100); }
    } catch(e) { console.error("분할 에러", e); }
  };

  const handleMakeBlankCard = async (cat: Category) => {
    if (!isLoggedIn || selectedWordIndices.size === 0) return alert("단어를 선택해주세요.");
    updatePanel('loading', '저장 및 삭제 중', '카드를 만들고 원본 문헌을 삭제합니다...', 50);
    
    const words = cat?.content ? String(cat.content).split(SPLIT_REGEX) : [];
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
      const res = await fetch("https://api.blankd.top/api/save-card", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: safeAddress, card_content: cardContent, answer_text: answerText }),
      });
      if (res.ok) {
        await fetch("https://api.blankd.top/api/delete-category", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet_address: safeAddress, id: cat.id })
        });
        setSelectedWordIndices(new Set()); setExpandedCategoryId(null);
        loadCategories(); loadMyCards(); 
        updatePanel('success', '완료', '추출 및 삭제됨.', 100); 
        setActiveTab('enhance'); 
      }
    } catch(err) { console.error("추출 에러", err); }
  };

  const handleDeleteCategory = async (cat_id: number) => {
    if (!confirm("이 문헌을 영구 삭제하시겠습니까?")) return;
    try {
      const res = await fetch("https://api.blankd.top/api/delete-category", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_address: safeAddress, id: cat_id }) });
      if (res.ok) loadCategories();
    } catch(err) { console.error("삭제 에러:", err); }
  };

  const handleDeleteCard = async (card_id: number) => {
    if (!confirm("이 카드를 영구 삭제하시겠습니까?")) return;
    try {
      const res = await fetch("https://api.blankd.top/api/delete-card", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_address: safeAddress, id: card_id }) });
      if (res.ok) { setActiveCard(null); loadMyCards(); }
    } catch(err) { console.error("카드 삭제 에러:", err); }
  };

  const handleMoveCraftFolders = async () => {
    if (selectedCraftIds.size === 0 || !targetFolderName) return;
    try {
      await fetch('/api/move-categories', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ids: Array.from(selectedCraftIds), folder_name: targetFolderName, wallet_address: safeAddress})});
      setSelectedCraftIds(new Set()); setTargetFolderName(''); loadCategories();
      setOpenCraftFolders(prev => ({...prev, [targetFolderName]: true}));
    } catch(err) { console.error("폴더 이동 에러:", err); }
  };

  const handleMoveEnhanceFolders = async () => {
    if (selectedEnhanceIds.size === 0 || !targetFolderName) return;
    try {
      await fetch('/api/move-cards', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ids: Array.from(selectedEnhanceIds), folder_name: targetFolderName, wallet_address: safeAddress})});
      setSelectedEnhanceIds(new Set()); setTargetFolderName(''); loadMyCards();
      setOpenEnhanceFolders(prev => ({...prev, [targetFolderName]: true}));
    } catch(err) { console.error("폴더 이동 에러:", err); }
  };

  const submitCombatAnswer = async (isCorrect: boolean, time: number = 999.0) => {
    if (!activeCard) return;
    try {
      const res = await fetch("https://api.blankd.top/api/submit-answer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card_id: activeCard.id, is_correct: isCorrect, clear_time: time }),
      });
      if (res.ok) {
        alert(isCorrect ? `성공! 기록: ${time.toFixed(1)}초` : `실패! 시간 초과 또는 오답입니다.`);
        setActiveCard(null);
        loadMyCards();
      }
    } catch(err) { console.error("정답 제출 에러:", err); }
  };

  const handleGoogleZkLogin = async () => {
    try {
      const createUrl = (enokiFlow as any).createAuthorizationURL || enokiFlow.createAuthorizationUrl;
      if (!createUrl) throw new Error("인증 함수 없음");
      const url = await createUrl.call(enokiFlow, {
        provider: 'google',
        clientId: '536814695888-bepe0chce3nq31vuu3th60c7al7vpsv7.apps.googleusercontent.com',
        redirectUrl: window.location.origin,
        network: 'testnet'
      });
      window.location.href = url;
    } catch (err: any) { alert(`로그인 에러: ${err.message}`); }
  };

  const toggleWordSelection = (index: number) => {
    const newSet = new Set(selectedWordIndices);
    if (newSet.has(index)) newSet.delete(index);
    else newSet.add(index);
    setSelectedWordIndices(newSet);
  };

  useEffect(() => {
    if (activeCard) {
      const foundBlanks: {answer: string, correct: boolean}[] = [];
      const regex = /\[\s*(.*?)\s*\]/g;
      let match;
      const safeContent = activeCard?.content || "";
      while((match = regex.exec(safeContent)) !== null) foundBlanks.push({ answer: match[1].trim(), correct: false });
      if(foundBlanks.length === 0 && activeCard?.answer) foundBlanks.push(...activeCard.answer.split(',').map(a => ({answer: a.trim(), correct: false})));
      setBlanks(foundBlanks); setCurrentBlankIdx(0); setAnswerInput(""); setInputStatus('idle');
 
      const timePerBlank = Math.max(1.0, 5.0 - Math.floor((activeCard?.level || 0) / 5) * 0.5);
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

  const getStrictCardTitle = (text?: any) => {
    if (!text || typeof text !== 'string') return "제목 없음";
    try {
      const match = text.match(/^(\[.*?\]\s*제\s*\d+\s*조(?:의\s*\d+)?(?:\([^)]+\))?)/);
      return match ? match[1] : text.split('\n')[0].substring(0, 15) + "...";
    } catch(e) { return "제목 파싱 오류"; }
  };

  const getSortNumber = (text?: any) => {
    if (!text || typeof text !== 'string') return 999999;
    try {
      const chapterMatch = text.match(/(\d+)장/);
      const articleMatch = text.match(/제\s*(\d+)\s*조/);
      let score = 0;
      if (chapterMatch) score += parseInt(chapterMatch[1]) * 10000;
      if (articleMatch) score += parseInt(articleMatch[1]);
      return score || 999999;
    } catch (e) { return 999999; }
  };

  const renderSequentialMaskedContent = (text?: any) => {
    if (!text || typeof text !== 'string') return null;
    try {
      const parts = text.split(/(\[.*?\])/g);
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
    } catch (e) { return <span>렌더링 오류</span>; }
  };

  const safeCategories = Array.isArray(categories) ? categories : [];
  const safeCards = Array.isArray(savedCards) ? savedCards : [];
  const safeExams = Array.isArray(exams) ? exams : [];

  const craftFolders = Array.from(new Set(safeCategories.map(c => c?.folder_name || '기본 폴더'))).reverse();
  const enhanceFolders = Array.from(new Set(safeCards.map(c => c?.folder_name || '기본 폴더'))).reverse();

  const handleDeleteAll = async () => {
    if (!confirm("보관소의 모든 데이터를 영구 지우시겠습니까?")) return;
    try {
      const res = await fetch("https://api.blankd.top/api/delete-all", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: safeAddress }),
      });
      if (res.ok) { setCategories([]); setSavedCards([]); setExams([]); setExpandedCategoryId(null); updatePanel('idle', '초기화', '데이터 리셋됨', 0); }
    } catch(err) { console.error("전체 삭제 에러:", err); }
  };

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
              {[{ id: 'dashboard', label: '열람실' }, { id: 'craft', label: '지식 추출' }, { id: 'enhance', label: '기억 강화' }, { id: 'exam', label: '모의고사' }, { id: 'mypage', label: '설정' }].map((tab) => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`text-xs font-light tracking-[0.1em] pb-4 -mb-[17px] ${activeTab === tab.id ? 'text-white border-b border-white/50' : 'text-white/30'}`}>{tab.label}</button>
              ))}
            </nav>

            {activeTab === 'dashboard' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 animate-in fade-in">
                <div className="border border-white/10 p-8 rounded-sm bg-white/[0.02]">
                  <div className="text-[10px] text-white/30 mb-4 tracking-widest uppercase">보유 지식 (카드)</div>
                  <div className="text-4xl font-light text-white/90">{safeCards.length}</div>
                </div>
                <div className="border border-rose-900/30 p-8 rounded-sm bg-rose-950/10">
                  <div className="text-[10px] text-rose-400/50 mb-4 tracking-widest uppercase">망각 경고 (위험)</div>
                  <div className="text-4xl font-light text-rose-400/80">{safeCards.filter(c => c?.status === 'AT_RISK').length}</div>
                </div>
                <div className="border border-amber-900/30 p-8 rounded-sm bg-amber-950/10">
                  <div className="text-[10px] text-amber-500/50 mb-4 tracking-widest uppercase">영구 보존 (전설)</div>
                  <div className="text-4xl font-light text-amber-500/80">{safeCards.filter(c => (c?.level || 0) >= 3).length}</div>
                </div>
              </div>
            )}

            {activeTab === 'craft' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                <div className="lg:col-span-8 space-y-8">
                  <div className="flex gap-2 mb-4">
                    <label className="flex-1 border border-white/20 p-2 text-center text-xs hover:bg-white/10 cursor-pointer text-white/80">
                      <input type="file" accept=".pdf,.html" onChange={e => setLawFile(e.target.files?.[0] || null)} className="hidden"/> {lawFile ? `✅ ${lawFile.name}` : '+ 법령 업로드'}
                    </label>
                    <button onClick={uploadLaw} className="px-4 border border-white/20 text-xs">전송</button>
                    
                    <label className="flex-1 border border-teal-900/40 p-2 text-center text-xs hover:bg-teal-900/20 cursor-pointer text-teal-400">
                      <input type="file" accept=".pdf,.html" onChange={e => setExamFile(e.target.files?.[0] || null)} className="hidden"/> {examFile ? `✅ ${examFile.name}` : '+ 모의고사 업로드'}
                    </label>
                    <button onClick={uploadExam} className="px-4 border border-teal-900/40 text-xs text-teal-400">전송</button>
                  </div>
                  
                  {selectedCraftIds.size > 0 && (
                    <div className="flex gap-2 items-center bg-indigo-900/20 p-3 rounded-sm border border-indigo-500/20 mb-4">
                      <span className="text-xs text-indigo-300">{selectedCraftIds.size}개 선택됨</span>
                      <input value={targetFolderName} onChange={e=>setTargetFolderName(e.target.value)} placeholder="새 폴더명" className="bg-black/50 border border-white/20 text-xs p-2 text-white outline-none flex-1" />
                      <button onClick={handleMoveCraftFolders} className="text-xs border border-indigo-500/50 bg-indigo-600/30 text-white px-4 py-2">폴더로 이동</button>
                    </div>
                  )}

                  {craftFolders.map(folder => {
                    if (!folder) return null;
                    return (
                    <div key={folder} className="mb-6">
                      <button onClick={() => setOpenCraftFolders(p => ({...p, [folder]: !p[folder]}))} className="w-full text-left bg-indigo-900/40 p-4 text-indigo-300 font-bold border border-indigo-500/30 flex justify-between rounded-sm">
                        <span>📁 {folder}</span>
                        <span>{openCraftFolders[folder] ? '▼' : '▶'}</span>
                      </button>
                      
                      {openCraftFolders[folder] && (
                        <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}>
                          {safeCategories
                            .filter(c => c && (c.folder_name || '기본 폴더') === folder)
                            .filter(c => {
                              if (c?.is_x_marked && !blankRecommendationActive) return false;
                              return true;
                            })
                            .sort((a, b) => getSortNumber(a?.title) - getSortNumber(b?.title))
                            .map(cat => {
                            if (!cat) return null;
                            const isExpanded = expandedCategoryId === cat.id;
                            return (
                              <div key={cat.id} className="expandable-card relative flex items-center justify-center">
                                <input type="checkbox" className="absolute top-2 right-2 z-10 w-4 h-4 cursor-pointer" checked={selectedCraftIds.has(cat.id)} onChange={() => { const s = new Set(selectedCraftIds); if(s.has(cat.id)) s.delete(cat.id); else s.add(cat.id); setSelectedCraftIds(s); }} />
                                {!isExpanded ? (
                                  <button 
                                    {...createLongPress(() => handleDeleteCategory(cat.id), 800)}
                                    onClick={() => { setExpandedCategoryId(cat.id); setSelectedWordIndices(new Set()); setParsedText(cat.content || ""); }} 
                                    className="w-full h-full text-[13px] font-serif font-bold text-center text-indigo-300 bg-indigo-900/20 py-4 px-3 rounded-sm border border-indigo-500/30 shadow-[0_0_10px_rgba(99,102,241,0.1)] transition-all hover:bg-indigo-900/40"
                                  >
                                    {getStrictCardTitle(cat.title)} 
                                  </button>
                                ) : (
                                  <div className="w-full absolute z-20 top-0 left-0 animate-in fade-in flex flex-col gap-3 p-4 bg-[#0a0a0c] border border-indigo-500/50 shadow-2xl rounded-sm">
                                    <div className="flex justify-between items-center mb-2">
                                      <button onClick={() => handleAiRecommend(cat)} className="text-[10px] bg-teal-900/40 text-teal-400 px-2 py-1 rounded">✨ Gemma 26B 빈칸 추천</button>
                                      <button onClick={(e) => { e.stopPropagation(); setExpandedCategoryId(null); }} className="text-white/40 text-xs">닫기</button>
                                    </div>
                                    <textarea value={parsedText} onChange={(e) => { setParsedText(e.target.value); setSelectedWordIndices(new Set()); }} className="w-full h-20 bg-black/40 text-white/80 border border-white/10 p-2 text-[11px] font-serif outline-none scrollbar-hide" />
                                    <div className="font-serif text-[13px] leading-loose text-white/80 p-3 bg-black/40 border border-white/10 max-h-48 overflow-y-auto break-all scrollbar-hide">
                                      {(parsedText || "").split(SPLIT_REGEX).map((word, idx, arr) => {
                                        if (!word) return null;
                                        if (/^\s+$/.test(word)) return <span key={idx}>{word}</span>;
                                        const isSelected = selectedWordIndices.has(idx);
                                        return (
                                          <span key={idx} onClick={() => toggleWordSelection(idx)} {...createLongPress(() => handleSplitCategory(cat, idx, arr), 800)} className={`cursor-pointer px-[2px] rounded select-none ${isSelected ? 'bg-amber-500 text-black font-bold' : 'hover:bg-white/20'}`}>{word}</span>
                                        )
                                      })}
                                    </div>
                                    <button onClick={() => handleMakeBlankCard(cat)} className="w-full py-3 bg-amber-500/20 text-amber-400 text-xs hover:bg-amber-500/30 transition-all">
                                      지식 추출 및 원본 삭제
                                    </button>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )})}
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

                {enhanceFolders.map(folder => {
                  if (!folder) return null;
                  return (
                  <div key={folder} className="mb-6">
                    <button onClick={() => setOpenEnhanceFolders(p => ({...p, [folder]: !p[folder]}))} className="w-full text-left bg-amber-900/30 p-4 text-amber-300 font-bold border border-amber-500/30 flex justify-between rounded-sm">
                      <span>📁 {folder}</span>
                      <span>{openEnhanceFolders[folder] ? '▼' : '▶'}</span>
                    </button>
                    
                    {openEnhanceFolders[folder] && (
                      <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}>
                        {safeCards
                          .filter(c => c && (c.folder_name || '기본 폴더') === folder)
                          .sort((a, b) => getSortNumber(a?.content) - getSortNumber(b?.content))
                          .map((card) => {
                          if (!card) return null;
                          return (
                            <div key={card.id} className="relative expandable-card">
                              <input type="checkbox" className="absolute top-2 right-2 z-10 w-4 h-4 cursor-pointer" checked={selectedEnhanceIds.has(card.id)} onChange={() => { const s = new Set(selectedEnhanceIds); if(s.has(card.id)) s.delete(card.id); else s.add(card.id); setSelectedEnhanceIds(s); }} />
                              <button 
                                {...createLongPress(() => handleDeleteCard(card.id), 800)}
                                onClick={() => setActiveCard(card)}
                                className={`w-full relative text-[13px] font-serif font-bold text-center py-5 px-3 rounded-sm border shadow-[0_0_10px_rgba(0,0,0,0.5)] transition-all select-none ${card.status === "BURNED" ? "border-white/5 text-white/30" : "border-indigo-500/30 text-indigo-300 bg-indigo-900/20 hover:bg-indigo-900/40"}`}
                              >
                                <span className="absolute top-1 left-2 text-[9px] text-amber-400">LV.{card.level || 0}</span>
                                {getStrictCardTitle(card.content)}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )})}
              </div>
            )}

            {activeTab === 'exam' && (
              <div className="space-y-8 animate-in fade-in">
                <div className="text-white/60 text-xs border-b border-white/10 pb-2">CBT 모의고사 문제 풀이장</div>
                {safeExams.length === 0 ? (
                  <div className="py-32 text-center text-white/20 text-xs tracking-widest">저장된 모의고사가 없습니다. 지식 추출 탭에서 업로드하세요.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {safeExams.map(exam => {
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
                  <div className="text-xs text-white/60 mb-4">컬럼 단수 설정 (지식추출 & 기억강화)</div>
                  <div className="flex gap-2 mb-8">
                    {[2, 3, 4].map(num => (
                      <button key={num} onClick={() => updateColCount(num)} className={`px-3 py-1 text-[10px] rounded-sm ${colCount === num ? 'bg-white/20 text-white' : 'border border-white/10 text-white/40'}`}>{num}단</button>
                    ))}
                  </div>

                  <div className="text-xs text-white/60 mb-4">지식 관리 설정</div>
                  <button 
                    onClick={() => setBlankRecommendationActive(!blankRecommendationActive)}
                    className={`w-full py-3 text-[10px] border transition-all rounded-sm ${blankRecommendationActive ? 'bg-teal-900/30 border-teal-500/50 text-teal-300' : 'border-white/10 text-white/40'}`}
                  >
                    빈칸 추천 활성화 (x표시 문헌 노출): {blankRecommendationActive ? "ON" : "OFF"}
                  </button>
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
                <span className="font-bold text-amber-400 mr-4">LV.{activeCard.level || 0}</span>
                <span className="text-xs text-teal-400 mr-4">⏳ {(totalTimeLimit - elapsed).toFixed(1)}초 남음</span>
                {activeCard.best_time && <span className="text-xs text-amber-300 font-bold">🏆 BEST: {activeCard.best_time.toFixed(1)}초</span>}
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
