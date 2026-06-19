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
import { RecordTab } from "./tabs/RecordTab";

const autoApplyDictHelper = (content: string, dict: any) => {
  try {
    if (!dict) return content;
    let fixedContent = content.replace(/\[ORIG_ID:(\d+)\]/g, '[[ORIG_ID:$1]]');
    const lines = fixedContent.split('\n');
    const titleLine = lines[0] || '';
    const restContent = lines.length > 1 ? lines.slice(1).join('\n') : '';

    const stopWords = dict.stopwords || [];
    const abbrevKeys = Object.keys(dict.abbrs || {});
    const abbrevValues = Object.values(dict.abbrs || {});
    
    const wordsToUnbracket = [...stopWords, ...abbrevKeys];

    const includeWords = Array.from(new Set([
        ...(dict.inclusions || []),
        ...(abbrevValues as string[])
    ])).filter((w: any) => typeof w === 'string' && w.trim() !== '')
      .filter(w => !abbrevKeys.some(key => key.replace(/\s+/g, '') === w.replace(/\s+/g, ''))) 
      .sort((a: any, b: any) => b.length - a.length);

    let currentText = restContent;

    if (wordsToUnbracket.length > 0) {
      currentText = currentText.replace(/\[([^\]]+)\]/g, (match, inner) => {
        let cleanInner = inner.replace(/\s+/g, '');
        if (wordsToUnbracket.some(w => w.replace(/\s+/g, '') === cleanInner)) {
          return inner; 
        }
        return match;
      });
    }

    includeWords.forEach((iw: string) => {
      const chars = iw.replace(/\s+/g, '').split('');
      const flexibleRegexStr = chars.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
      const regex = new RegExp(`\\[[^\\]]+\\]|(${flexibleRegexStr})`, 'gi');
      
      currentText = currentText.replace(regex, (match, p1) => {
        if (match.startsWith('[')) return match; 
        return `[${p1}]`; 
      });
    });

    return titleLine + (lines.length > 1 ? '\n' : '') + currentText;
  } catch (err: any) {
    console.error("사전 자동 적용 엔진 오류 진단:", err.message);
    return content;
  }
};

// 💡 [핵심 버그 수정] 구형 포맷 문자열과 신형 JSON을 모두 해독하는 데이터 보호 엔진
const getExtendedStats = (memoStr: string) => {
  try {
    if (memoStr && memoStr.trim().startsWith('{')) {
      const p = JSON.parse(memoStr || '{}');
      return {
        text: p.text || "", filled: p.filled || 0, wrongIndices: p.wrongIndices || [],
        upgrade: p.upgrade || 0, bestTime: p.bestTime || 0, totalCorrect: p.totalCorrect || 0, totalWrong: p.totalWrong || 0
      };
    }
  } catch(e) {}
  
  // JSON 파싱 실패 시, 예전 문자열 방식 데이터로 복구 시도
  try {
    const old = parseCardStats(memoStr);
    return { text: old.text || "", filled: old.filled || 0, wrongIndices: old.wrongIndices || [], upgrade: 0, bestTime: 0, totalCorrect: 0, totalWrong: 0 };
  } catch(e) {
    return { text: "", filled: 0, wrongIndices: [], upgrade: 0, bestTime: 0, totalCorrect: 0, totalWrong: 0 };
  }
};

const InlineBlankInput = React.memo(({ inputStatus, onSubmit, expected, abbrDict, hintLetter }: {
  inputStatus: string;
  onSubmit: (val: string) => void;
  expected: string; 
  abbrDict: Record<string, string>;
  hintLetter?: string | null;
}) => {
  const [val, setVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  
  useEffect(() => { 
    if (inputStatus === 'correct' || inputStatus === 'idle') setVal(''); 
  }, [inputStatus]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setVal(newVal);

    const cleanInput = newVal.replace(/\s+/g, '').toLowerCase();
    const cleanExpected = expected.replace(/\s+/g, '').toLowerCase();
    let isMatch = (cleanInput === cleanExpected);

    if (!isMatch && abbrDict) {
      Object.entries(abbrDict).forEach(([k, v]) => {
        const strK = k.replace(/\s+/g, '').toLowerCase();
        const strV = v.replace(/\s+/g, '').toLowerCase();
        const orig = strK.length >= strV.length ? strK : strV;
        const short = strK.length < strV.length ? strK : strV;
        if (cleanExpected === orig && cleanInput === short) { isMatch = true; }
      });
    }
    if (isMatch) onSubmit(newVal);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') onSubmit(val);
  };
  
  return (
    <input
      ref={inputRef}
      value={val}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder={hintLetter ? hintLetter : ""}
      className={`inline-block mx-1 px-1.5 py-0.5 text-center font-bold border-b-2 outline-none transition-all ${
        inputStatus === 'error' ? 'bg-red-900/40 text-red-300 border-red-500 placeholder-red-400' :
        inputStatus === 'correct' ? 'bg-teal-900/40 text-teal-300 border-teal-500' :
        hintLetter ? 'bg-black/40 text-amber-300 border-amber-500/50 focus:border-amber-400 placeholder-amber-400/80' :
        'bg-black/40 text-amber-300 border-amber-500/50 focus:border-amber-400'
      }`}
      style={{ width: `${Math.max(expected.length * 1.2, 3)}em` }}
    />
  );
}, (prevProps, nextProps) => {
  return prevProps.inputStatus === nextProps.inputStatus && prevProps.expected === nextProps.expected && prevProps.abbrDict === nextProps.abbrDict && prevProps.hintLetter === nextProps.hintLetter;
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
    this.props.fallbackLog(`🚨 렌더링 예외 발생 핸들링 진단: ${error.message}`); 
  }
  render() {
    if (this.state.hasError) return (
      <div className="p-6 text-red-400 font-mono border border-red-500/30 bg-red-900/10 rounded-sm shadow-xl">
        <h3 className="text-lg font-bold mb-2">🔥 화면 렌더링 복구 활성화</h3>
        <p className="text-sm opacity-80">{this.state.errorMessage}</p>
      </div>
    );
    return this.props.children;
  }
}

const pushToQueue = (type: 'MEMO' | 'ANSWER', payload: any) => {
  try {
    const targetId = payload.id || payload.card_id;
    if (typeof targetId === 'string' && targetId.startsWith('temp_')) return; 
    if (!targetId || isNaN(parseInt(targetId as string, 10))) return;

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
    console.error("동기화 가상 큐 적재 실패 진단:", e); 
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
  
  const activeCardRef = useRef<any>(null);
  useEffect(() => { activeCardRef.current = activeCard; }, [activeCard]);
  
  const [viewMode, setViewMode] = useState('all');
  const [colCount, setColCount] = useState(3);
  const [useAiRecommend, setUseAiRecommend] = useState(true);
  const [studyMode, setStudyMode] = useState('일반');
  
  const [theme, setTheme] = useState(() => localStorage.getItem('blankd_theme') || 'black');
  useEffect(() => { localStorage.setItem('blankd_theme', theme); }, [theme]);
  
  const [lawFile, setLawFile] = useState<File | null>(null);
  const [systemLogs, setSystemLogs] = useState<string[]>(["[System] 터미널 온라인. 환영합니다, 설계자님."]);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [isMemoOpen, setIsMemoOpen] = useState(false);
  const [blanks, setBlanks] = useState<{answer: string, correct: boolean}[]>([]);
  const [currentBlankIdx, setCurrentBlankIdx] = useState(0);
  const [inputStatus, setInputStatus] = useState<'idle'|'correct'|'wrong'>('idle');
  
  const [elapsed, setElapsed] = useState<number>(0);
  const [totalTimeLimit, setTotalTimeLimit] = useState<number>(0);

  const [goalBalance, setGoalBalance] = useState<number>(0);
  const [activityLog, setActivityLog] = useState<Record<string, number>>({});
  const [claimedRewards, setClaimedRewards] = useState<Record<string, boolean>>({});

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const [hintLetter, setHintLetter] = useState<string | null>(null);
  const [isFrozen, setIsFrozen] = useState<boolean>(false);

  const handleUpdateBalance = (changeAmount: number) => {
    setGoalBalance(prev => {
      const newBalance = prev + changeAmount;
      localStorage.setItem(`blankd_off_bal_${safeAddress}`, newBalance.toString());
      if (!isOffline && safeAddress) {
        fetch("https://api.blankd.top/api/update-balance", {
          method: "POST", keepalive: true, headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet_address: safeAddress, balance: newBalance })
        }).catch(e => console.error("포인트 동기화 실패:", e));
      }
      return newBalance;
    });
  };

  const [globalDict, setGlobalDict] = useState<{ stopwords: string[], inclusions: string[], abbrs: Record<string, string> }>({
    stopwords: [], inclusions: [], abbrs: {}
  });

  const [isDictModalOpen, setIsDictModalOpen] = useState(false);
  const [dictTab, setDictTab] = useState<'stop'|'include'|'abbr'>('abbr');
  const [tempKey, setTempKey] = useState("");
  const [tempValue, setTempValue] = useState("");

  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleInstallClick = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult: any) => {
        if (choiceResult.outcome === 'accepted') addLog('✅ PWA 앱 설치 완료');
        setDeferredPrompt(null);
      });
    }
  };

  const loadAllData = async () => {
    if (!safeAddress) return;
    try {
      const [catRes, cardRes, userData, dictRes] = await Promise.all([
        fetch(`https://api.blankd.top/api/get-categories?wallet_address=${safeAddress}&t=${Date.now()}`).then(r => { if(!r.ok) throw new Error(); return r.json(); }),
        fetch(`https://api.blankd.top/api/my-cards?wallet_address=${safeAddress}&t=${Date.now()}`).then(r => { if(!r.ok) throw new Error(); return r.json(); }),
        fetch(`https://api.blankd.top/api/get-balance?wallet_address=${safeAddress}&t=${Date.now()}`).then(r => r.json()).catch(() => ({ balance: 0, activity_log: {}, claimed_rewards: {} })),
        api.getGlobalDict(safeAddress).catch(() => ({ stopwords: [], inclusions: [], abbrs: {} }))
      ]);

      const serverStopwords = Array.isArray(dictRes.stopwords) ? dictRes.stopwords : [];
      const serverInclusions = Array.isArray(dictRes.inclusions) ? dictRes.inclusions : [];
      let finalAbbrs = (dictRes.abbrs && typeof dictRes.abbrs === 'object' && !Array.isArray(dictRes.abbrs)) ? dictRes.abbrs : {};
      const newDict = { stopwords: serverStopwords, inclusions: serverInclusions, abbrs: finalAbbrs };

      let finalCards = cardRes.cards || [];
      try {
        const qStr = localStorage.getItem('blankd_sync_queue');
        if (qStr) {
          const q = JSON.parse(qStr);
          if (q && Array.isArray(q.memos) && q.memos.length > 0) {
            finalCards = finalCards.map((c: any) => {
              const pendingMemo = q.memos.find((m: any) => String(m.id) === String(c.id));
              return pendingMemo ? { ...c, memo: pendingMemo.memo } : c;
            });
          }
        }
      } catch (queueMergeError: any) {}

      const serverBalance = userData.balance || 0;
      const serverActivityLog = userData.activity_log || {};
      const serverClaimedRewards = userData.claimed_rewards || {};

      const localBalance = parseInt(localStorage.getItem(`blankd_off_bal_${safeAddress}`) || '0', 10);
      const actualBalance = Math.max(serverBalance, localBalance);
      
      const localActivityLog = JSON.parse(localStorage.getItem(`blankd_activity_log_${safeAddress}`) || '{}');
      const localClaimedRewards = JSON.parse(localStorage.getItem(`blankd_claimed_rewards_${safeAddress}`) || '{}');

      const mergedActivity = { ...serverActivityLog };
      Object.keys(localActivityLog).forEach(k => {
         mergedActivity[k] = Math.max(mergedActivity[k] || 0, localActivityLog[k] || 0);
      });
      const mergedClaims = { ...serverClaimedRewards, ...localClaimedRewards };

      if (actualBalance > serverBalance || JSON.stringify(mergedActivity) !== JSON.stringify(serverActivityLog) || !isOffline) {
        try {
          fetch("https://api.blankd.top/api/update-balance", {
            method: "POST", keepalive: true, headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ wallet_address: safeAddress, balance: actualBalance, activity_log: mergedActivity, claimed_rewards: mergedClaims })
          }).catch(()=>{});
        } catch (e) {}
      }

      setCategories([...(catRes.categories || [])]);
      setSavedCards(finalCards); 
      setGoalBalance(actualBalance);
      setActivityLog(mergedActivity);
      setClaimedRewards(mergedClaims);
      setGlobalDict(newDict);

      localStorage.setItem(`blankd_off_cat_${safeAddress}`, JSON.stringify(catRes.categories || []));
      localStorage.setItem(`blankd_off_card_${safeAddress}`, JSON.stringify(finalCards));
      localStorage.setItem(`blankd_off_bal_${safeAddress}`, actualBalance.toString());
      localStorage.setItem(`blankd_activity_log_${safeAddress}`, JSON.stringify(mergedActivity));
      localStorage.setItem(`blankd_claimed_rewards_${safeAddress}`, JSON.stringify(mergedClaims));
      localStorage.setItem(`blankd_off_dict_${safeAddress}`, JSON.stringify(newDict));
      
      setIsOffline(false);
    } catch (e: any) {
      setIsOffline(true);
      try {
        const offCat = JSON.parse(localStorage.getItem(`blankd_off_cat_${safeAddress}`) || '[]');
        const offCard = JSON.parse(localStorage.getItem(`blankd_off_card_${safeAddress}`) || '[]');
        const offBal = parseInt(localStorage.getItem(`blankd_off_bal_${safeAddress}`) || '0', 10);
        const offActivityLog = JSON.parse(localStorage.getItem(`blankd_activity_log_${safeAddress}`) || '{}');
        const offClaimedRewards = JSON.parse(localStorage.getItem(`blankd_claimed_rewards_${safeAddress}`) || '{}');
        const offDict = JSON.parse(localStorage.getItem(`blankd_off_dict_${safeAddress}`) || '{"stopwords":[],"inclusions":[],"abbrs":{}}');

        setCategories(offCat);
        setSavedCards(offCard);
        setGoalBalance(offBal);
        setActivityLog(offActivityLog);
        setClaimedRewards(offClaimedRewards);
        setGlobalDict(offDict);
      } catch(cacheError: any) {}
    }
  };

  const saveGlobalDict = async (newDict: any) => {
    setGlobalDict(newDict); 
    
    try {
      await api.updateGlobalDict(safeAddress, newDict);
    } catch (err) {}

    setSavedCards(prevCards => {
      let changeCount = 0;
      const updatedCards = prevCards.map(card => {
        const newContent = autoApplyDictHelper(card.content, newDict);
        if (newContent !== card.content) {
          changeCount++;
          return { ...card, content: newContent, _isModified: true };
        }
        return card;
      });

      if (changeCount > 0) {
        addLog(`🔄 스마트 스캔 중: ${changeCount}개 카드에 빈칸 자동 생성 및 동기화 진행...`);
        updatedCards.filter(c => c._isModified).forEach(card => {
           const newAnswers = (card.content.match(/\[\s*(.*?)\s*\]/g) || [])
              .map((b: string) => b.replace(/\[|\]/g, '').trim())
              .filter((a: string) => !a.startsWith('ORIG_ID:'))
              .filter(Boolean)
              .join(", ");
           
           fetch("https://api.blankd.top/api/save-card", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                  wallet_address: safeAddress, card_id: card.id, card_content: card.content, answer_text: newAnswers, folder_name: card.folder_name, memo: card.memo
              })
           }).catch(()=>{});
        });
        setTimeout(() => addLog(`✅ 전역 빈칸 자동 생성 완료!`), 1000);
      }
      return updatedCards.map(c => { const { _isModified, ...rest } = c; return rest; });
    });
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
        addLog("✅ 로그인 콜백 처리 완료"); 
      }).catch((err: any) => addLog(`🚨 인증 실패 진단: ${err.message}`));
    }
    if (isLoggedIn) loadAllData();
  }, [isLoggedIn, safeAddress, enokiFlow]);

  const flushQueue = async () => {
    if (!safeAddress || isOffline) return; 
    try {
      const qStr = localStorage.getItem('blankd_sync_queue');
      if (!qStr) return;
      let q = JSON.parse(qStr);
      
      q.memos = q.memos.filter((m:any) => m.id && !String(m.id).startsWith('temp_') && !isNaN(parseInt(m.id)));
      q.answers = q.answers.filter((a:any) => a.card_id && !String(a.card_id).startsWith('temp_') && !isNaN(parseInt(a.card_id)));

      if (q.memos.length === 0 && q.answers.length === 0) {
          localStorage.removeItem('blankd_sync_queue'); return;
      }

      const res = await fetch("https://api.blankd.top/api/sync-batch", {
        method: "POST", 
        keepalive: true, 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: safeAddress, memos: q.memos, answers: q.answers })
      });

      if (res.ok) {
        localStorage.setItem('blankd_sync_queue', JSON.stringify({ memos: [], answers: [] }));
        addLog(`✅ 백그라운드 동기화 완료`);
      }
    } catch (e) { 
      setIsOffline(true);
    }
  };

  useEffect(() => {
    if (!safeAddress) return;
    const interval = setInterval(flushQueue, 30000); 
    const handleVisibility = () => { 
      if(document.visibilityState === 'hidden' || document.visibilityState === 'unloaded') {
        const currentCard = activeCardRef.current;
        if (currentCard && statsRef.current) {
          const exStats = getExtendedStats(currentCard.memo);
          exStats.text = statsRef.current.text;
          exStats.filled = statsRef.current.filled;
          exStats.wrongIndices = Array.from(statsRef.current.wrongIndices);
          
          fetch("https://api.blankd.top/api/save-card", {
            method: "POST", 
            keepalive: true, 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ wallet_address: safeAddress, card_id: currentCard.id, card_content: currentCard.content, answer_text: currentCard.answer_text || "", folder_name: currentCard.folder_name, memo: JSON.stringify(exStats) })
          }).catch(()=>{});
        }
        flushQueue(); 
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handleVisibility);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', handleVisibility); window.removeEventListener('pagehide', handleVisibility); };
  }, [safeAddress, isOffline]);

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

  const handleSplitCategory = async (cat: any, text1: string, text2: string, title1: string, title2: string) => {
    try {
        const res = await fetch("https://api.blankd.top/api/split-category", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ wallet_address: safeAddress, id: cat.id, text1, text2, title1, title2, folder_name: cat.folder_name })
        });
        if (res.ok) { 
          addLog(`✅ [${title1}] 분할 완료`); 
          await loadAllData();
        }
    } catch (e: any) { 
      addLog(`🚨 분할 처리 통신 에러 진단`);
    }
  };

  const handleMakeBlankCard = async (
    cat: any, wordsArray: string[], selectedIndices: Set<number>, pageBreaks: Set<number>, memo: string, cardId: any, onComplete: () => void
  ) => {
    try {
      let bodyContent = ""; let answerText = ""; let isBlanking = false;
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
      
      const existingCard = savedCards.find((c: any) => 
        c && c.content && (c.content.trim().startsWith(cat.title.trim()))
      );
      const targetCardId = existingCard ? existingCard.id : null; 

      const rawTitle = cat.title || "";
      const rawContent = cat.content || "";
      
      const firstLineToScan = `${rawTitle} ${rawContent.split('\n')[0]}`;

      let detectedPrefix = "[법]"; 
      if (firstLineToScan.includes("[칙]") || firstLineToScan.includes("[규]") || firstLineToScan.includes("시행규칙")) {
        detectedPrefix = "[칙]";
      } else if (firstLineToScan.includes("[령]") || firstLineToScan.includes("시행령")) {
        detectedPrefix = "[령]";
      } else {
        detectedPrefix = "[법]";
      }

      let firstLineRaw = rawTitle.length > rawContent.split('\n')[0].length ? rawTitle : rawContent.split('\n')[0];
      let cleanFirstLine = firstLineRaw.replace(/\[(법|령|칙|규)\]/g, '').trim();
      const finalFirstLine = `${detectedPrefix} ${cleanFirstLine}`;
      
      const finalCardContent = `${finalFirstLine}\n${bodyContent.trim()}`;
      
      const exStats = getExtendedStats(memo);
      const initialMemo = JSON.stringify(exStats);
      
      const res = await fetch("https://api.blankd.top/api/save-card", { 
        method: "POST", headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ 
            wallet_address: safeAddress, card_id: targetCardId, card_content: finalCardContent, answer_text: answerText, folder_name: cat.folder_name, memo: initialMemo 
        }) 
      });
      
      if (res.ok) {
        localStorage.setItem('blankd_last_crafted_id', cat.id.toString());
        localStorage.setItem('blankd_last_crafted_title', cat.title);
        addLog(targetCardId ? "✅ 덮어쓰기 완료" : "✅ 신규 생성 완료");
        await loadAllData(); onComplete(); 
      }
    } catch (e) {
      console.error("카드 생성 오류 진단:", e);
    }
  };

  const handleUpdateMemoBackground = async (id: number, memo: string) => {
    setSavedCards(prev => prev.map(c => c.id === id ? { ...c, memo } : c));
    pushToQueue('MEMO', { id, memo });
    
    if (!isOffline) {
      const target = savedCards.find((c:any) => c.id === id);
      if (target) {
        fetch("https://api.blankd.top/api/save-card", {
          method: "POST", 
          keepalive: true, 
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet_address: safeAddress, card_id: id, card_content: target.content, answer_text: target.answer_text || "", folder_name: target.folder_name, memo })
        }).catch(() => {});
      }
      flushQueue(); 
    }
  };

  const handleUseItem = (itemType: 'hint' | 'freeze' | 'magic', cost: number) => {
    if (goalBalance < cost) {
      alert("포인트가 부족합니다! 카드를 끝까지 채워서 포인트를 모아보세요.");
      return;
    }
    handleUpdateBalance(-cost);
    
    if (itemType === 'hint') {
      const currentAnswer = blanks[currentBlankIdx]?.answer;
      if (currentAnswer) {
        setHintLetter(currentAnswer.charAt(0));
        addLog(`🔍 첫 글자 힌트 발동! (-${cost}P)`);
        setTimeout(() => setHintLetter(null), 2000);
      }
    } else if (itemType === 'freeze') {
      setIsFrozen(true);
      addLog(`⏳ 10초 시간 멈춤 발동! (-${cost}P)`);
      setTimeout(() => setIsFrozen(false), 10000);
    } else if (itemType === 'magic') {
      const currentAnswer = blanks[currentBlankIdx]?.answer;
      if (currentAnswer) {
        addLog(`🪄 마법 지팡이 발동! (강제 정답 처리) (-${cost}P)`);
        handleSequentialInput(currentAnswer);
      }
    }
  };

  useEffect(() => {
    if (activeCard) {
      isClosingRef.current = false;
      const cleanContent = activeCard.content;
      const lines = cleanContent.split('\n');
      const restContent = lines.length > 1 ? lines.slice(1).join('\n').trim() : cleanContent;

      const foundBlanks: {answer: string, correct: boolean}[] = [];
      const parts = restContent.split(/(\[.*?\])/g);
      parts.forEach(part => {
        if (part.startsWith('[') && part.endsWith(']')) {
          foundBlanks.push({ answer: part.replace(/\[|\]/g, '').trim(), correct: false });
        }
      });
      
      const savedProgress = localStorage.getItem(`blankd_progress_${activeCard.id}`);
      const lastIdx = savedProgress ? parseInt(savedProgress, 10) : 0;
      const restoredBlanks = foundBlanks.map((b, i) => ({ ...b, correct: i < lastIdx }));

      setBlanks(restoredBlanks); setCurrentBlankIdx(lastIdx < foundBlanks.length ? lastIdx : 0); setInputStatus('idle');

      const stats = getExtendedStats(activeCard.memo); 
      const timePerBlank = Math.max(3.0, 10.0 - (stats.filled * 0.5));
      setTotalTimeLimit(timePerBlank * foundBlanks.length); 
      setElapsed(0); setIsMemoOpen(false);
      setIsFrozen(false); setHintLetter(null); 

      let cleanText = stats.text;
      if (cleanText) { cleanText = cleanText.replace(/\(\s*\)\s*=>\s*x\(\s*null\s*\)/g, "").trim(); }
      statsRef.current = { text: cleanText, filled: stats.filled, wrongIndices: new Set(stats.wrongIndices) };
      const cleanTitle = getStrictTitleOnly(cleanContent);
      localStorage.setItem('blankd_last_enhanced_id', activeCard.id.toString());
      localStorage.setItem('blankd_last_enhanced_title', cleanTitle || "이름 없는 카드");
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null; recognitionRef.current.stop(); recognitionRef.current = null; setIsListening(false);
      }
    }
  }, [activeCard]);

  useEffect(() => {
    if (activeCard && currentBlankIdx < blanks.length) {
      const interval = setInterval(() => {
        if (isFrozen) return; 
        
        setElapsed(prev => {
          const next = prev + 0.1;
          if (next >= totalTimeLimit) {
            clearInterval(interval);
            setTimeout(() => { alert("집중 시간 초과! 현재 기록을 저장합니다."); finishCard(); }, 10);
          }
          return next;
        });
      }, 100);
      return () => clearInterval(interval);
    }
  }, [activeCard, currentBlankIdx, blanks.length, totalTimeLimit, isFrozen]);

  const finishCard = async (customDays?: number) => {
    if (isClosingRef.current || !activeCard) return;
    isClosingRef.current = true;
    const currentId = activeCard.id; const currentFolder = activeCard.folder_name; const finalTime = elapsed;
    const wrongArr = Array.from(statsRef.current.wrongIndices);
    
    const correctCount = Math.max(0, blanks.length - wrongArr.length);
    const isCorrect = wrongArr.length === 0;

    const exStats = getExtendedStats(activeCard.memo);
    exStats.text = statsRef.current.text;
    exStats.filled = statsRef.current.filled + 1; 
    exStats.wrongIndices = wrongArr;
    
    if (exStats.bestTime === 0 || finalTime < exStats.bestTime) {
      exStats.bestTime = finalTime;
    }
    
    exStats.totalCorrect += correctCount;
    exStats.totalWrong += wrongArr.length;

    const newMemo = JSON.stringify(exStats);

    const earnedPoints = correctCount * 5; 
    handleUpdateBalance(earnedPoints);

    const todayStr = new Date().toISOString().split('T')[0];
    setActivityLog(prev => {
      const next = { ...prev };
      next[todayStr] = (next[todayStr] || 0) + correctCount;
      localStorage.setItem(`blankd_activity_log_${safeAddress}`, JSON.stringify(next));
      
      if (!isOffline) {
        fetch("https://api.blankd.top/api/update-balance", {
           method: "POST", keepalive: true, headers: { "Content-Type": "application/json" },
           body: JSON.stringify({ wallet_address: safeAddress, activity_log: next })
        }).catch(()=>{});
      }
      return next;
    });

    let daysInterval = customDays;
    if (daysInterval === undefined) {
      const wrongCount = wrongArr.length; const totalBlanks = blanks.length;
      let quality = 5;
      if (totalBlanks > 0 && wrongCount > 0) {
        const wrongRatio = wrongCount / totalBlanks;
        if (wrongRatio > 0.5) quality = 1; else if (wrongRatio > 0.2) quality = 2; else quality = 3;
      }
      let easiness = parseFloat(localStorage.getItem(`blankd_factor_${currentId}`) || "2.5");
      easiness = easiness + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
      if (easiness < 1.3) easiness = 1.3;
      localStorage.setItem(`blankd_factor_${currentId}`, easiness.toString());

      const currentRepetitions = exStats.filled;
      if (quality < 3) { daysInterval = 1; } 
      else {
        if (currentRepetitions === 1) daysInterval = 1;
        else if (currentRepetitions === 2) daysInterval = 4;
        else daysInterval = Math.ceil((currentRepetitions - 1) * easiness);
      }
    } else {
      let quality = 3;
      if (daysInterval === 1) quality = 1; else if (daysInterval === 4) quality = 2; else if (daysInterval >= 14) quality = 5;
      let easiness = parseFloat(localStorage.getItem(`blankd_factor_${currentId}`) || "2.5");
      easiness = easiness + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
      if (easiness < 1.3) easiness = 1.3;
      localStorage.setItem(`blankd_factor_${currentId}`, easiness.toString());
    }

    const nextReviewDate = new Date(); nextReviewDate.setDate(nextReviewDate.getDate() + daysInterval);

    // 💡 [핵심 버그 수정] ID를 강제로 묶지 않고 뷰 화면의 원래 순서를 유지합니다.
    const folderCards = savedCards.filter(c => c.folder_name === currentFolder).sort((a,b) => {
        return parseInt(a.id, 10) - parseInt(b.id, 10);
    });
    const currentIdx = folderCards.findIndex(c => c.id === currentId);
    const nextCard = folderCards[currentIdx + 1] || null;

    localStorage.removeItem(`blankd_progress_${currentId}`);
    setActiveCard(nextCard);
    setSavedCards(prev => prev.map(c => c.id === currentId ? { ...c, memo: newMemo } : c));
    
    pushToQueue('MEMO', { id: currentId, memo: newMemo });
    pushToQueue('ANSWER', { card_id: currentId, is_correct: isCorrect, clear_time: finalTime, next_review: nextReviewDate.toISOString() });
    
    if (isOffline) {
      addLog(`💾 오프라인 기록 (ID:${currentId}) | +${earnedPoints} Point 획득`);
    } else {
      addLog(`🎉 학습 완료! 기록 갱신 됨. +${earnedPoints} Point 획득`);
      try {
        await fetch("https://api.blankd.top/api/save-card", {
          method: "POST", 
          keepalive: true, 
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet_address: safeAddress, card_id: currentId, card_content: activeCard.content, answer_text: activeCard.answer_text || "", folder_name: activeCard.folder_name, memo: newMemo })
        });
      } catch(e) {}
      flushQueue();
    }
  };

  const handleReviewSelect = (days: number) => { if (!activeCard) return; statsRef.current.filled += 1; finishCard(days); };

  const handleCloseModal = async () => {
    if (isClosingRef.current || !activeCard) return;
    isClosingRef.current = true;
    const currentId = activeCard.id;
    const exStats = getExtendedStats(activeCard.memo);
    exStats.text = statsRef.current.text;
    exStats.filled = statsRef.current.filled;
    exStats.wrongIndices = Array.from(statsRef.current.wrongIndices);
    
    const newMemo = JSON.stringify(exStats);
    setActiveCard(null);
    setSavedCards(prev => prev.map(c => c.id === currentId ? { ...c, memo: newMemo } : c));
    pushToQueue('MEMO', { id: currentId, memo: newMemo });
    
    if (!isOffline) {
      try {
        await fetch("https://api.blankd.top/api/save-card", {
          method: "POST", 
          keepalive: true, 
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet_address: safeAddress, card_id: currentId, card_content: activeCard.content, answer_text: activeCard.answer_text || "", folder_name: activeCard.folder_name, memo: newMemo })
        });
      } catch(e) {}
    }
    flushQueue();
  };

  const syncProgressToServer = () => {
    if (isOffline || !safeAddress || !activeCardRef.current) return;
    const card = activeCardRef.current;
    
    const exStats = getExtendedStats(card.memo);
    exStats.text = statsRef.current.text;
    exStats.filled = statsRef.current.filled;
    exStats.wrongIndices = Array.from(statsRef.current.wrongIndices);
    const newMemo = JSON.stringify(exStats);

    fetch("https://api.blankd.top/api/save-card", {
      method: "POST",
      keepalive: true, 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet_address: safeAddress,
        card_id: card.id,
        card_content: card.content,
        answer_text: card.answer_text || "",
        folder_name: card.folder_name,
        memo: newMemo
      })
    }).catch(()=>{});
  };

  const handleSequentialInput = (overrideInput?: string | any) => {
    if (inputStatus === 'correct' || inputStatus === 'wrong' || !blanks[currentBlankIdx]) return;
    const expected = blanks[currentBlankIdx].answer.replace(/\s+/g, '').toLowerCase();
    let actual = typeof overrideInput === 'string' ? overrideInput.replace(/\s+/g, '').toLowerCase() : '';
    let isCorrect = (expected === actual);

    if (!isCorrect && globalDict.abbrs) {
      Object.entries(globalDict.abbrs).forEach(([k, v]) => {
        const strK = k.replace(/\s+/g, '').toLowerCase();
        const strV = v.replace(/\s+/g, '').toLowerCase();
        const orig = strK.length >= strV.length ? strK : strV;
        const short = strK.length < strV.length ? strK : strV;
        if (expected === orig && actual === short) { isCorrect = true; }
      });
    }

    if (isCorrect) {
      setInputStatus('correct');
      setBlanks(prev => { const nb = [...prev]; if (nb[currentBlankIdx]) nb[currentBlankIdx].correct = true; return nb; });
      statsRef.current.wrongIndices.delete(currentBlankIdx);
      setTimeout(() => {
        setInputStatus('idle'); 
        setBlanks(currentBlanks => {
          if (currentBlankIdx + 1 < currentBlanks.length) {
            setCurrentBlankIdx(prevIdx => {
              const nextIdx = prevIdx + 1; localStorage.setItem(`blankd_progress_${activeCard.id}`, nextIdx.toString()); return nextIdx;
            });
          } else {
            localStorage.removeItem(`blankd_progress_${activeCard.id}`); finishCard();
          }
          syncProgressToServer(); 
          return currentBlanks;
        });
      }, 150);
    } else { 
      setInputStatus('wrong'); 
      statsRef.current.wrongIndices.add(currentBlankIdx); 
      syncProgressToServer(); 
      setTimeout(() => setInputStatus('idle'), 500);
    }
  };
  
  const handleShowAnswer = () => {
    if (!blanks[currentBlankIdx]) return;
    setInputStatus('wrong'); statsRef.current.wrongIndices.add(currentBlankIdx);
    setBlanks(prev => { const nb = [...prev]; if (nb[currentBlankIdx]) nb[currentBlankIdx].correct = true; return nb; });
    setTimeout(() => {
      setInputStatus('idle');
      setBlanks(currentBlanks => {
        if (currentBlankIdx + 1 < currentBlanks.length) {
          setCurrentBlankIdx(prevIdx => { const nextIdx = prevIdx + 1; localStorage.setItem(`blankd_progress_${activeCard.id}`, nextIdx.toString()); return nextIdx; });
        } else {
          localStorage.removeItem(`blankd_progress_${activeCard.id}`); finishCard();
        }
        syncProgressToServer(); 
        return currentBlanks;
      });
    }, 800);
  };

  const toggleVoiceRecognition = () => {
    if (isListening) {
      setIsListening(false);
      if (recognitionRef.current) { recognitionRef.current.onend = null; recognitionRef.current.stop(); recognitionRef.current = null; }
      addLog("🎤 음성 인식 종료됨"); return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { alert("크롬 브라우저를 권장합니다."); return; }
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR'; recognition.interimResults = false; recognition.continuous = true; recognition.maxAlternatives = 1;
    recognition.onstart = () => { setIsListening(true); addLog("🎙️ 음성 인식 활성화됨 (계속 듣는 중...)"); };
    recognition.onresult = (event: any) => {
      const last = event.results.length - 1;
      const transcript = event.results[last][0].transcript;
      const cleanText = transcript.replace(/\s+/g, '').replace(/[.,!?]/g, '');
      addLog(`💬 인식: "${transcript}"`); setTimeout(() => handleSequentialInput(cleanText), 300);
    };
    recognition.onerror = (err: any) => { if (err.error !== 'no-speech') { setIsListening(false); recognitionRef.current = null; } };
    recognition.onend = () => { if (recognitionRef.current) { try { recognitionRef.current.start(); } catch(e) {} } else { setIsListening(false); } };
    recognitionRef.current = recognition; recognition.start();
  };

  const minFilledCount = savedCards.length > 0 ? Math.min(...savedCards.map((card: any) => parseCardStats(card.memo || "").filled || 0)) : 0;
  const passProbability = Math.min(minFilledCount * 2, 100);

  const { nextCatToCraft, nextStudyCard } = useMemo(() => {
    let craftTarget = null; let studyTarget = null;
    if (!isLoggedIn) return { nextCatToCraft: null, nextStudyCard: null };

    if (categories && categories.length > 0) {
      const craftedOrigIds = new Set(); const craftedTitles: string[] = [];
      const cleanText = (text: string) => text ? text.replace(/\([^)]*\)|\[[^\]]*\]|<[^>]*>/g, '').replace(/[^가-힣a-zA-Z0-9一-龥]/g, '') : "";
      savedCards.forEach((c: any) => {
        const firstLine = c.content.split('\n')[0];
        if (firstLine) craftedTitles.push(cleanText(firstLine));
      });
      const sortedCats = [...categories].sort((a: any, b: any) => a.id - b.id);
      craftTarget = sortedCats.find((cat: any) => {
        const cleanTitle = cleanText(cat.title || "");
        return !(cleanTitle && craftedTitles.some(t => t === cleanTitle || t.endsWith(cleanTitle)));
      });
    }

    if (savedCards && savedCards.length > 0) {
      // 💡 [핵심 버그 수정] ID 정렬을 부활시켜 항상 먼저 생성된 카드부터 이어하기가 되도록 수정 (순서 점프 방지)
      const cardsWithStatus = savedCards.map(c => {
         const stats = getExtendedStats(c.memo);
         return { ...c, repetitions: stats.filled || 0, origId: parseInt(c.id, 10) };
      }).filter(c => !isNaN(c.origId)).sort((a, b) => a.origId - b.origId);
      
      if (cardsWithStatus.length > 0) {
        const minReps = Math.min(...cardsWithStatus.map(c => c.repetitions));
        studyTarget = cardsWithStatus.find(c => c.repetitions === minReps) || cardsWithStatus[0];
      }
    }
    return { nextCatToCraft: craftTarget, nextStudyCard: studyTarget };
  }, [isLoggedIn, categories, savedCards]);

  const renderContent = React.useCallback(() => {
    if (!activeCard) return null;
    const cleanContent = activeCard.content; 
    const lines = cleanContent.split('\n');
    const titleLine = lines[0] || '';
    const restContent = lines.length > 1 ? lines.slice(1).join('\n').trim() : cleanContent;

    let displayTitle = titleLine
      .replace(/\[법\]|\[령\]|\[칙\]|\[규\]|\[정관\]|\[규정\]/g, '')
      .replace(/\(\s*내용\s*\)/g, '')
      .replace(/내용/g, '')
      .trim();
    if (!displayTitle) displayTitle = "제목 없음";

    let titleColor = "text-red-500";
    if (titleLine.includes('[정관]')) titleColor = "text-yellow-500";
    else if (titleLine.includes('[칙]') || titleLine.includes('[규]') || titleLine.includes('[규정]')) titleColor = "text-green-500";
    else if (titleLine.includes('[령]')) titleColor = "text-blue-400";

    const parts = restContent.split(/(\[.*?\]|##PAGE_BREAK##)/g).filter(p => p !== '');
    let displayPage = 0; let tempGlobalBlank = 0; let tempPage = 0;
    for (let part of parts) {
        if (part === '##PAGE_BREAK##') tempPage++;
        else if (part.startsWith('[') && part.endsWith(']')) {
            if (tempGlobalBlank === currentBlankIdx) { displayPage = tempPage; break; }
            tempGlobalBlank++;
        }
    }

    let renderPage = 0; let bIdx = 0; const contentToRender: any[] = [];
    parts.forEach((part: string, i: number) => {
      if (part === '##PAGE_BREAK##') { renderPage++; return; }
      if (renderPage === displayPage) {
          if (part.startsWith('[') && part.endsWith(']')) {
            const isCorrect = blanks[bIdx]?.correct; 
            const isCurrent = bIdx === currentBlankIdx; 
            const isWrong = statsRef.current.wrongIndices.has(bIdx); 
            if (isCorrect) {
              contentToRender.push(
                <span key={i} className={`font-bold mx-1 px-1 rounded ${isWrong ? 'text-red-400 bg-red-900/20' : 'text-teal-400 bg-teal-900/20'}`}>{part.replace(/\[|\]/g, '')}</span>
              );
            } else if (isCurrent) {
              contentToRender.push(
                <InlineBlankInput key={`blank-${currentBlankIdx}`} inputStatus={inputStatus} expected={blanks[currentBlankIdx]?.answer || ""} abbrDict={globalDict.abbrs} hintLetter={hintLetter} onSubmit={handleSequentialInput}/>
              );
            } else {
              contentToRender.push(<span key={i} className="inline-block min-w-[50px] h-5 bg-white/5 border-b border-white/20 mx-1 align-middle rounded-sm"></span>);
            }
            bIdx++;
          } else { contentToRender.push(<span key={i}>{part}</span>); }
      } else if (part.startsWith('[') && part.endsWith(']')) { bIdx++; }
    });
    
    return (
      <div className="flex flex-col gap-6 w-full overflow-hidden">
        <div className="flex justify-between items-center border-b border-white/10 pb-2 w-full gap-3 overflow-hidden">
            <div className={`${titleColor} font-bold text-[14px] leading-tight overflow-x-auto whitespace-nowrap custom-scrollbar flex-1 pb-1`}>
              {displayTitle}
            </div>
            <span className="text-[12px] text-white/40 font-mono bg-white/5 px-2 py-1 rounded shadow-sm shrink-0">Page {displayPage + 1}</span>
        </div>
        <div className="whitespace-pre-wrap leading-relaxed text-[15px] font-serif break-keep min-h-[160px]">{contentToRender}</div>
        <div className="flex justify-between items-center w-full mb-2 gap-2 flex-wrap">
          <button onClick={() => setIsMemoOpen(!isMemoOpen)} className="px-3 py-1.5 bg-teal-900/30 text-teal-400 border border-teal-500/50 rounded-sm text-[11px] font-bold shrink-0 hover:bg-teal-900/50 transition-all shadow-md">
            {isMemoOpen ? '닫기 ✕' : '메모 열기'}
          </button>
          <button onClick={() => { setDictTab('abbr'); setIsDictModalOpen(true); }} className="px-3 py-1.5 bg-indigo-900/30 text-indigo-400 border border-indigo-500/50 rounded-sm text-[11px] font-bold shrink-0 hover:bg-indigo-900/50 transition-all shadow-md">
            ⚡ 약어 추가
          </button>
          <button onClick={toggleVoiceRecognition} className={`flex-1 min-w-[120px] py-1.5 border rounded-sm text-[11px] font-bold transition-all shadow-md ${isListening ? 'bg-red-600/50 text-white border-red-500 animate-pulse' : 'bg-blue-900/30 text-blue-400 border-blue-500/50 hover:bg-blue-900/50'}`}>
            {isListening ? '음성 인식 끄기' : '음성으로 입력'}
          </button>
          <button id="show-answer-btn" onClick={handleShowAnswer} className="px-3 py-1.5 bg-red-900/30 text-red-400 border border-red-500/50 rounded-sm text-[11px] font-bold shrink-0 hover:bg-red-900/50 transition-all shadow-md">
            정답 보기 (오답 처리)
          </button>
        </div>
        {isMemoOpen && (
          <div className="pt-4 border-t border-white/10 w-full animate-in slide-in-from-top-2">
             {/* 💡 [수정] 메모 편집 시 기존 통계 데이터 파괴 현상 방지 */}
             <input defaultValue={statsRef.current.text || ""} placeholder="학습 인사이트 기록..." onBlur={(e) => { 
                 statsRef.current.text = e.target.value; 
                 const exStats = getExtendedStats(activeCard.memo);
                 exStats.text = e.target.value;
                 exStats.filled = statsRef.current.filled;
                 exStats.wrongIndices = Array.from(statsRef.current.wrongIndices);
                 handleUpdateMemoBackground(activeCard.id, JSON.stringify(exStats)); 
             }} className="text-[13px] text-teal-300 bg-teal-950/20 p-3 rounded border border-teal-500/30 w-full outline-none focus:border-teal-400 transition-all" autoFocus/>
          </div>
        )}
      </div>
    );
  }, [activeCard, blanks, currentBlankIdx, inputStatus, isMemoOpen, isListening, globalDict.abbrs, hintLetter]);

  const handleAddDictItem = () => {
    if (dictTab === 'abbr' && tempKey && tempValue) {
      const k = tempKey.trim(); const v = tempValue.trim();
      const orig = k.length >= v.length ? k : v; const short = k.length < v.length ? k : v;
      saveGlobalDict({ ...globalDict, abbrs: { ...globalDict.abbrs, [short]: orig } });
      setTempKey(""); setTempValue("");
    } else if (dictTab !== 'abbr' && tempKey) {
      const words = tempKey.split(',').map(w => w.trim()).filter(Boolean);
      const targetArray = dictTab === 'stop' ? globalDict.stopwords : globalDict.inclusions;
      saveGlobalDict({ ...globalDict, [dictTab === 'stop' ? 'stopwords' : 'inclusions']: Array.from(new Set([...targetArray, ...words])) });
      setTempKey("");
    }
  };

  const memoizedTabs = useMemo(() => {
    return (
      <>
        <div className={activeTab === 'progress' ? 'block' : 'hidden'}>
          <DashboardTab categories={categories} savedCards={savedCards} setActiveTab={setActiveTab} setExpandedId={setExpandedId} setActiveCard={setActiveCard} goalBalance={goalBalance} handleUpdateBalance={handleUpdateBalance} activityLog={activityLog} claimedRewards={claimedRewards} setClaimedRewards={setClaimedRewards} safeAddress={safeAddress} />
        </div>
        <div className={activeTab === 'create' ? 'block' : 'hidden'}>
          <CraftTab categories={categories} savedCards={savedCards} colCount={colCount} viewMode={viewMode} useAiRecommend={useAiRecommend} safeAddress={safeAddress} lawFile={lawFile} setLawFile={setLawFile} uploadLaw={uploadLaw} handleMakeBlankCard={handleMakeBlankCard} handleSplitCategory={handleSplitCategory} addLog={addLog} expandedId={expandedId} setExpandedId={setExpandedId} handleDeleteCategory={async (id: number) => { if(confirm('삭제하시겠습니까?')){ await fetch("https://api.blankd.top/api/delete-category", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_address: safeAddress, id }) }); loadAllData(); } }} globalDict={globalDict} saveGlobalDict={saveGlobalDict} />
        </div>
        <div className={activeTab === 'enhance' ? 'block' : 'hidden'}>
          <EnhanceTab safeAddress={safeAddress} loadAllData={loadAllData} categories={categories} savedCards={savedCards} colCount={colCount} viewMode={viewMode} setActiveCard={setActiveCard} setActiveTab={setActiveTab} setExpandedId={setExpandedId} globalDict={globalDict} />
        </div>
        <div className={activeTab === 'record' ? 'block' : 'hidden'}>
          <RecordTab savedCards={savedCards} goalBalance={goalBalance} handleUpdateBalance={handleUpdateBalance} loadAllData={loadAllData} safeAddress={safeAddress} colCount={colCount} />
        </div>
        <div className={activeTab === 'exam' ? 'block' : 'hidden'}>
          <ExamTab walletAddress={safeAddress} address={safeAddress} />
        </div>
        <div className={activeTab === 'settings' ? 'block' : 'hidden'}>
          <MypageTab safeAddress={safeAddress} enokiFlow={enokiFlow} zkLogin={zkLogin} useAiRecommend={useAiRecommend} setUseAiRecommend={setUseAiRecommend} studyMode={studyMode} setStudyMode={setStudyMode} globalDict={globalDict} saveGlobalDict={saveGlobalDict} loadAllData={loadAllData} theme={theme} setTheme={setTheme}/>
        </div>
      </>
    );
  }, [activeTab, categories, savedCards, colCount, viewMode, useAiRecommend, safeAddress, lawFile, expandedId, enokiFlow, zkLogin, studyMode, setStudyMode, globalDict, theme, goalBalance, activityLog, claimedRewards]);

  const renderDictionaryUI = (isMobile: boolean) => (
    <div className={`flex flex-col w-full h-full ${isMobile ? 'bg-[#0a0a0c] border border-white/10 p-5 sm:p-6 rounded-sm' : 'bg-[#08080a]/80 border border-white/10 p-5 rounded-sm shadow-xl backdrop-blur-sm'}`}>
      <div className="flex justify-between items-start mb-6">
        <div className="flex gap-4 border-b border-white/10 w-full pt-1">
          <button onClick={() => setDictTab('abbr')} className={`text-[11px] sm:text-[13px] font-bold tracking-wide transition-all px-1 pb-2 -mb-[1px] ${dictTab === 'abbr' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-white/40 hover:text-white/70'}`}>⚡ 스마트 약어</button>
          <button onClick={() => setDictTab('include')} className={`text-[11px] sm:text-[13px] font-bold tracking-wide transition-all px-1 pb-2 -mb-[1px] ${dictTab === 'include' ? 'text-teal-400 border-b-2 border-teal-400' : 'text-white/40 hover:text-white/70'}`}>✅ 필수 포함</button>
          <button onClick={() => setDictTab('stop')} className={`text-[11px] sm:text-[13px] font-bold tracking-wide transition-all px-1 pb-2 -mb-[1px] ${dictTab === 'stop' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-white/40 hover:text-white/70'}`}>❌ 제외 단어</button>
        </div>
        {isMobile && <button onClick={() => setIsDictModalOpen(false)} className="text-white/40 hover:text-white ml-6 text-lg font-bold">✕</button>}
      </div>
      
      <div className="flex gap-2 mb-5 shrink-0">
        <input type="text" value={tempKey} onChange={(e) => setTempKey(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAddDictItem(); }} placeholder={dictTab === 'abbr' ? "원래 정답 (예: 행정안전부장관)" : "단어 입력 (쉼표 구분)"} className="flex-1 bg-black/50 border border-white/30 transition-colors w-full min-w-0" />
        {dictTab === 'abbr' && (
          <input type="text" value={tempValue} onChange={(e) => setTempValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAddDictItem(); }} placeholder="약어 (예: 행안부장관)" className="flex-1 bg-black/50 border border-white/10 p-2 text-xs sm:text-sm text-white/80 outline-none rounded-sm focus:border-indigo-500/50 transition-colors w-full min-w-0" />
        )}
        <button onClick={handleAddDictItem} className="px-3 sm:px-4 bg-white/5 text-white/80 border border-white/10 text-xs font-bold rounded-sm hover:bg-white/10 transition-colors shrink-0">등록</button>
      </div>
      
      <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-2 min-h-[160px]">
        {dictTab === 'abbr' && Object.entries(globalDict.abbrs || {})
          .sort((a, b) => a[1].localeCompare(b[1], 'ko'))
          .map(([k, v]) => {
            const strK = k as string; const strV = v as string;
            const orig = strK.length >= strV.length ? strK : strV; const short = strK.length < strV.length ? strK : strV;
            return (
              <div key={k} className="flex justify-between items-center text-xs sm:text-sm border-b border-white/5 pb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="opacity-60">{orig}</span> <span className="text-white/30 text-[10px]">→</span> <span className="text-indigo-400 font-bold px-2 py-0.5 bg-indigo-900/20 rounded-sm border border-indigo-500/20">{short}</span> 
                </div>
                <button onClick={() => { const nw = {...globalDict.abbrs}; delete nw[k]; saveGlobalDict({...globalDict, abbrs: nw}); }} className="text-white/20 hover:text-red-400 text-xs px-2 transition-colors shrink-0">✕</button>
              </div>
            )
        })}
        {dictTab !== 'abbr' && (dictTab === 'stop' ? globalDict.stopwords : globalDict.inclusions)
          .sort((a, b) => a.localeCompare(b, 'ko'))
          .map((word: string) => (
            <div key={word} className="flex justify-between items-center text-xs sm:text-sm border-b border-white/5 pb-2">
              <span className={`px-2 py-0.5 rounded-sm border ${dictTab === 'stop' ? 'text-amber-400 bg-amber-900/10 border-amber-500/20' : 'text-teal-400 bg-teal-900/10 border-teal-500/20'}`}>{word}</span>
              <button onClick={() => {
                const targetArray = (dictTab === 'stop' ? globalDict.stopwords : globalDict.inclusions).filter((w: string) => w !== word);
                saveGlobalDict({ ...globalDict, [dictTab === 'stop' ? 'stopwords' : 'inclusions']: targetArray });
              }} className="text-white/20 hover:text-red-400 text-xs px-2 transition-colors">✕</button>
            </div>
        ))}
        {((dictTab === 'abbr' && Object.keys(globalDict.abbrs || {}).length === 0) || (dictTab === 'stop' && (globalDict.stopwords || []).length === 0) || (dictTab === 'include' && (globalDict.inclusions || []).length === 0)) && (
          <div className="text-center py-8 text-white/20 text-[11px] sm:text-xs">등록된 단어가 없습니다.</div>
        )}
      </div>
    </div>
  );

  const getThemeCSS = () => {
    if (theme === 'white') {
      return `
        body { background-color: #f3f4f6; color: #111827; }
        .text-white { color: #111827 !important; }
        .text-white\\/20, .text-white\\/30 { color: #6b7280 !important; font-weight: 600; }
        .text-white\\/40, .text-white\\/50 { color: #4b5563 !important; font-weight: 600; }
        .text-white\\/60, .text-white\\/70 { color: #374151 !important; font-weight: 700; }
        .text-white\\/80 { color: #1f2937 !important; font-weight: 700; }
        .text-\\[\\#d1d1d1\\] { color: #111827 !important; font-weight: 700; }
        
        .bg-\\[\\#08080a\\] { background-color: #ffffff !important; border-color: #9ca3af !important; }
        .bg-\\[\\#08080a\\]\\/80 { background-color: rgba(255, 255, 255, 0.95) !important; backdrop-filter: blur(8px); }
        .bg-\\[\\#0a0a0c\\] { background-color: #ffffff !important; box-shadow: 0 1px 4px rgba(0,0,0,0.05); border-color: #d1d5db !important; }
        .bg-\\[\\#0d0d0f\\] { background-color: #f3f4f6 !important; }
        
        .bg-black\\/30, .bg-black\\/40, .bg-black\\/50, .bg-black\\/60 { 
          background-color: #f9fafb !important; color: #111827 !important; border-color: #9ca3af !important; 
        }
        .bg-white\\/5, .bg-white\\/10 { 
          background-color: #f3f4f6 !important; border-color: #9ca3af !important; color: #111827 !important; 
        }
        
        .border-white\\/5, .border-white\\/10, .border-white\\/20, .border-white\\/30 { 
          border-color: #6b7280 !important; 
        }

        /* 💡 화이트 모드 버튼 가독성 패치 */
        .text-amber-100, .text-amber-200 { color: #b45309 !important; font-weight: 800; }
        .text-teal-100, .text-teal-200 { color: #0f766e !important; font-weight: 800; }

        .text-teal-300, .text-teal-400, .text-teal-500 { color: #0f766e !important; font-weight: 800 !important; }
        .bg-teal-900\\/20, .bg-teal-900\\/30, .bg-teal-900\\/40, .bg-teal-950\\/20, .bg-teal-500\\/10, .bg-teal-500\\/20 { 
          background-color: #ccfbf1 !important; border-color: #0d9488 !important; 
        }
        .border-teal-500\\/30, .border-teal-500\\/40, .border-teal-500\\/50 { border-color: #0d9488 !important; }

        .text-amber-300, .text-amber-400, .text-amber-500 { color: #b45309 !important; font-weight: 800 !important; }
        .bg-amber-900\\/20, .bg-amber-900\\/30, .bg-amber-900\\/40, .bg-amber-950\\/20, .bg-amber-500\\/10, .bg-amber-500\\/20 { 
          background-color: #fef3c7 !important; border-color: #d97706 !important; 
        }
        .border-amber-500\\/30, .border-amber-500\\/40, .border-amber-500\\/50, .border-amber-900\\/30 { border-color: #d97706 !important; }

        .text-indigo-300, .text-indigo-400, .text-indigo-500 { color: #4338ca !important; font-weight: 800 !important; }
        .bg-indigo-900\\/20, .bg-indigo-900\\/30, .bg-indigo-900\\/40 { 
          background-color: #e0e7ff !important; border-color: #6366f1 !important; 
        }
        .border-indigo-500\\/30, .border-indigo-500\\/40, .border-indigo-500\\/50 { border-color: #6366f1 !important; }

        .text-blue-300, .text-blue-400, .text-blue-500 { color: #1d4ed8 !important; font-weight: 800 !important; }
        .bg-blue-900\\/20, .bg-blue-900\\/30, .bg-blue-900\\/40, .bg-blue-500\\/10, .bg-blue-500\\/20 { 
          background-color: #dbeafe !important; border-color: #3b82f6 !important; 
        }
        .border-blue-500\\/30, .border-blue-500\\/40, .border-blue-500\\/50, .border-blue-500 { border-color: #3b82f6 !important; }

        .text-red-300, .text-red-400, .text-red-500 { color: #b91c1c !important; font-weight: 800 !important; }
        .bg-red-900\\/20, .bg-red-900\\/30, .bg-red-900\\/40, .bg-red-950\\/20, .bg-red-500\\/10, .bg-red-500\\/20 { 
          background-color: #fee2e2 !important; border-color: #ef4444 !important; 
        }
        .border-red-500\\/30, .border-red-500\\/40, .border-red-500\\/50, .border-red-900\\/30 { border-color: #ef4444 !important; }

        .text-green-300, .text-green-400, .text-green-500 { color: #15803d !important; font-weight: 800 !important; }
        .bg-green-900\\/20, .bg-green-900\\/30, .bg-green-900\\/40, .bg-green-500\\/10, .bg-green-500\\/20 { 
          background-color: #dcfce7 !important; border-color: #10b981 !important; 
        }
        .border-green-500\\/30, .border-green-500\\/40, .border-green-500\\/50 { border-color: #10b981 !important; }
      `;
    } else if (theme === 'green') {
      return `
        body { background-color: #163322; }
        .bg-\\[\\#08080a\\] { background-color: #0f2418 !important; }
        .bg-\\[\\#08080a\\]\\/80 { background-color: rgba(15, 36, 24, 0.9) !important; }
        .bg-\\[\\#0a0a0c\\] { background-color: #122b1c !important; }
        .bg-\\[\\#0d0d0f\\] { background-color: #163322 !important; }
      `;
    }
    return `body { background-color: #0d0d0f; }`; 
  };

  return (
    <div className="min-h-screen bg-[#0d0d0f] text-[#d1d1d1] p-4 sm:p-6 md:p-8 relative pb-24 font-sans text-pretty overflow-x-hidden transition-colors">
      <style>{getThemeCSS()}</style>
      <header className="border-b border-white/10 bg-[#08080a] px-4 py-2.5 sticky top-0 z-40 backdrop-blur-md w-full">
        <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center justify-between w-full md:w-auto">
            <button onClick={() => { const lastTab = localStorage.getItem('blankd_active_tab') || 'progress'; setActiveTab(lastTab); }} className="text-xl sm:text-2xl font-bold tracking-widest text-current shrink-0 hover:text-teal-400 transition-colors">
              BlankD
            </button>
          </div>

          <div className="flex items-center justify-start md:justify-end gap-3 sm:gap-4 shrink-0 overflow-x-auto custom-scrollbar pb-1 md:pb-0 w-full md:w-auto">
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] sm:text-xs font-mono font-bold tracking-widest text-white/40 mr-1 uppercase hidden sm:inline">이어하기:</span>
              {nextCatToCraft ? (
                <button onClick={() => { setActiveTab('create'); setExpandedId(nextCatToCraft.id); }} className="bg-amber-900/30 border border-amber-500/40 px-2 sm:px-3 py-1 sm:py-1.5 rounded-sm flex items-center gap-1.5 hover:bg-amber-900/50 transition-all text-left max-w-[140px] sm:max-w-[200px]">
                  <span className="text-[9px] sm:text-[10px] text-amber-400 font-bold whitespace-nowrap">▶ 만들기</span><span className="text-[10px] sm:text-[11px] font-medium text-amber-100 truncate">{getStrictTitleOnly(nextCatToCraft.title) || "다음 조항"}</span>
                </button>
              ) : (<div className="text-[10px] sm:text-[11px] text-white/20 border border-white/5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-sm">만들기 완료</div>)}

              {nextStudyCard ? (
                <button onClick={() => { setActiveTab('enhance'); setActiveCard(nextStudyCard); }} className="bg-teal-900/30 border border-teal-500/40 px-2 sm:px-3 py-1 sm:py-1.5 rounded-sm flex items-center gap-1.5 hover:bg-teal-900/50 transition-all text-left max-w-[140px] sm:max-w-[200px]">
                  <span className="text-[9px] sm:text-[10px] text-teal-400 font-bold whitespace-nowrap">▶ 채우기</span><span className="text-[10px] sm:text-[11px] font-medium text-teal-100 truncate">{nextStudyCard.content.split('\n')[0].replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim()}</span>
                </button>
              ) : (<div className="text-[10px] sm:text-[11px] text-white/20 border border-white/5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-sm">채우기 완료</div>)}
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-1 sm:ml-2 border-l border-white/10 pl-2 sm:pl-3">
              <span className="text-[10px] sm:text-xs font-mono font-bold tracking-widest text-white/40 mr-1 hidden sm:inline">사전:</span>
              <button onClick={() => { setDictTab('stop'); setIsDictModalOpen(true); }} className="text-[10px] bg-amber-900/30 text-amber-400 border border-amber-500/40 px-2 py-1 rounded-sm hover:bg-amber-900/50 transition-colors">제외/포함</button>
              <button onClick={() => { setDictTab('abbr'); setIsDictModalOpen(true); }} className="text-[10px] bg-indigo-900/30 text-indigo-400 border border-indigo-500/40 px-2 py-1 rounded-sm hover:bg-indigo-900/50 transition-colors">약어 채점</button>
            </div>

            <div className="h-5 sm:h-6 w-px bg-white/10 shrink-0 hidden sm:block ml-1 sm:ml-2"></div>

            {isLoggedIn && (
              <div className="flex items-center gap-3 sm:gap-4 shrink-0 font-mono">
                {deferredPrompt && (
                  <button onClick={handleInstallClick} className="bg-teal-600/50 border border-teal-500 text-teal-200 px-2 py-1 text-[9px] sm:text-[10px] rounded hover:bg-teal-600 transition-colors flex items-center shadow-md">
                    앱 설치하기
                  </button>
                )}
                {isOffline && (
                  <span className="bg-red-900/80 border border-red-500 text-red-300 px-2 py-1 text-[9px] sm:text-[10px] rounded font-bold animate-pulse shadow-md">
                    오프라인 모드
                  </span>
                )}
                
                <div className="text-right"><span className="text-[8px] sm:text-[9px] text-white/40 block tracking-widest">누적 회독수</span><span className="text-[10px] sm:text-xs font-bold text-amber-400">{minFilledCount} 회독</span></div>
                <div className="h-5 sm:h-6 w-px bg-white/10"></div>
                <div className="text-right"><span className="text-[8px] sm:text-[9px] text-white/40 block tracking-widest">예상 합격률</span><span className="text-[10px] sm:text-xs font-bold text-indigo-400">{passProbability}%</span></div>
                <div className="h-5 sm:h-6 w-px bg-white/10 hidden sm:block"></div>
                <button onClick={async () => { 
                  try {
                    addLog("🔄 로그아웃 전 데이터 안전 동기화 중...");
                    await flushQueue();
                  } catch(e: any) {}
                  await enokiFlow.logout(); 
                  localStorage.clear(); 
                  window.location.reload(); 
                }} className="border border-white/20 px-2 py-1 text-[9px] sm:text-[10px] hover:bg-white/10 tracking-wider font-mono rounded-sm text-white/70 whitespace-nowrap shrink-0">로그아웃</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {isLoggedIn && (
        <nav className="border-b border-white/5 bg-black/40 py-1.5 px-4 overflow-x-auto whitespace-nowrap custom-scrollbar w-full mb-6">
          <div className="max-w-[1600px] mx-auto flex items-center justify-start gap-1 sm:gap-2">
            {[{ id: 'progress', label: '진행상황' }, { id: 'create', label: '만들기' }, { id: 'enhance', label: '채우기' }, { id: 'record', label: '수집' }, { id: 'exam', label: '모의고사' }, { id: 'settings', label: '설정' }].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-3 sm:px-4 py-1.5 text-[11px] sm:text-xs font-bold tracking-widest rounded-sm transition-all ${activeTab === tab.id ? 'bg-white/10 text-current' : 'text-white/40 hover:text-white/70'}`}>{tab.label}</button>
            ))}
          </div>
        </nav>
      )}

      {!isLoggedIn ? (
        <main className="max-w-md mx-auto mt-20 sm:mt-24 flex flex-col items-center px-4">
          <h2 className="text-xl sm:text-2xl font-serif text-current mb-4 tracking-tight">빈칸개발 (BlankD)</h2>
          <p className="text-xs sm:text-sm text-white/40 mb-10 sm:mb-12 text-center leading-relaxed">인지 부하 이론 기반의 학습 플랫폼<br/>압도적인 영구 기억을 형성합니다.</p>
          <button onClick={async () => { window.location.href = await enokiFlow.createAuthorizationURL({ provider: 'google', clientId: '536814695888-bepe0chce3nq31vuu3th60c7al7vpsv7.apps.googleusercontent.com', redirectUrl: window.location.origin, network: 'testnet', extraParams: { scope: ['openid', 'email', 'profile'] }}); }} className="w-full py-4 bg-[#111827] text-white text-sm font-bold rounded-sm mb-6 transition-transform active:scale-95 shadow-lg">Google 계정으로 시작하기</button>
        </main>
      ) : (
        <div className="max-w-[1600px] mx-auto w-full flex gap-4 sm:gap-6 px-4 lg:px-6 items-start pb-10">
          <main className="flex-1 w-full min-w-0">
            <ErrorBoundary fallbackLog={addLog}>
              {memoizedTabs}
            </ErrorBoundary>
          </main>
          <aside className="hidden lg:flex flex-col shrink-0 sticky top-[100px] h-[calc(100vh-140px)] w-[416px] xl:w-[468px]" style={{ width: '416px', maxWidth: '35vw' }}>
            {renderDictionaryUI(false)}
          </aside>
        </div>
      )}

      <div className="fixed bottom-4 right-4 z-[999] flex flex-col items-end gap-2">
        {isTerminalOpen && (
          <div className="w-[85vw] max-w-lg h-64 bg-black/95 border border-teal-500/30 p-4 font-mono text-[11px] text-teal-400 overflow-y-auto rounded shadow-2xl flex flex-col custom-scrollbar animate-in slide-in-from-bottom-5 fade-in">
            <div className="flex justify-between items-center mb-2 border-b border-teal-500/10 pb-2 sticky top-0 bg-black/95">
              <span className="uppercase tracking-widest text-teal-500/50 font-bold">시스템 진단 터미널</span>
              <button onClick={() => setSystemLogs([])} className="text-white/40 hover:text-white px-2 py-0.5 bg-white/5 rounded transition-colors">기록 지우기</button>
            </div>
            <div className="space-y-1 flex-1 overflow-y-auto custom-scrollbar pr-1">
              {systemLogs.map((l, i) => (
                <div key={i} className={`leading-snug break-all ${l.includes('?') ? 'text-red-400 font-bold' : l.includes('▶?') ? 'text-amber-300' : ''}`}>{l}</div>
              ))}
            </div>
          </div>
        )}
        <button onClick={() => setIsTerminalOpen(!isTerminalOpen)} className={`px-4 py-2 rounded-full font-bold text-[11px] uppercase tracking-wider shadow-lg transition-all border ${isTerminalOpen ? 'bg-red-900/50 border-red-500/50 text-red-400 hover:bg-red-900/80' : 'bg-teal-900/50 border-teal-500/50 text-teal-400 hover:bg-teal-900/80'}`}>
          {isTerminalOpen ? '터미널 닫기' : '터미널 열기'}
        </button>
      </div>

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
          renderContent={renderContent} 
          onClose={handleCloseModal} 
          goalBalance={goalBalance}
          handleUseItem={handleUseItem}
          isFrozen={isFrozen}
        />
      )}
    </div>
  );
}

export default function App() { return <MainApp />; }
