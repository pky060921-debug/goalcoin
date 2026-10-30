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

class GlobalErrorBoundary extends Component<{children: ReactNode}, {hasError: boolean, error: any, errorInfo: any}> {
  constructor(props: any) { 
    super(props); 
    this.state = { hasError: false, error: null, errorInfo: null }; 
  }
  static getDerivedStateFromError(error: any) { 
    return { hasError: true, error }; 
  }
  componentDidCatch(error: any, errorInfo: any) { 
    this.setState({ errorInfo });
    console.error("🚨 글로벌 에러 포착:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) return (
      <div className="p-6 bg-red-950 text-white min-h-screen">
        <h1 className="text-xl font-bold mb-4 text-red-400">🚨 치명적 렌더링 오류 발생 (White Screen 차단)</h1>
        <p className="mb-4 text-sm opacity-80">아래 에러 메시지를 복사해서 개발자에게 전달해 주세요.</p>
        <pre className="text-xs bg-black p-4 overflow-auto border border-red-500/30 text-red-200">{String(this.state.error)}</pre>
        <pre className="text-xs bg-black p-4 mt-4 overflow-auto border border-red-500/30 text-white/60">{this.state.errorInfo?.componentStack}</pre>
        <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="mt-6 px-4 py-2 bg-white text-black font-bold rounded">캐시 초기화 및 새로고침</button>
      </div>
    );
    return this.props.children;
  }
}

const getKoreanDateString = () => {
  const kstTime = Date.now() + (9 * 60 * 60 * 1000);
  return new Date(kstTime).toISOString().split('T')[0];
};

const CHO_HANGUL = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

const getChosung = (str: string) => {
  if (!str) return '기타';
  const code = str.charCodeAt(0) - 0xAC00;
  if (code > -1 && code < 11172) {
    return CHO_HANGUL[Math.floor(code / 588)];
  }
  if (/[a-zA-Z]/.test(str[0])) return str[0].toUpperCase();
  if (/[0-9]/.test(str[0])) return '숫자';
  return '기타';
};

const getFullChosung = (str: string) => {
  if (!str) return '';
  let res = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i) - 0xAC00;
    if (code > -1 && code < 11172) {
      res += CHO_HANGUL[Math.floor(code / 588)];
    } else {
      res += str[i];
    }
  }
  return res;
};

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
    return content;
  }
};

const getExtendedStats = (memoStr: string) => {
  try {
    if (memoStr && memoStr.trim().startsWith('{')) {
      const p = JSON.parse(memoStr || '{}');
      return {
        text: p.text || "", filled: p.filled || 0, wrongIndices: p.wrongIndices || [],
        upgrade: p.upgrade || 0, bestTime: p.bestTime || 0, totalCorrect: p.totalCorrect || 0, totalWrong: p.totalWrong || 0,
        history: p.history || [],
        highlights: p.highlights || {},
        hiddenTokens: Array.isArray(p.hiddenTokens) ? p.hiddenTokens : [] // 💡 영구 숨김 구간 토큰 목록
      };
    }
  } catch(e) {}
  
  try {
    const old = parseCardStats(memoStr);
    return { text: old.text || "", filled: old.filled || 0, wrongIndices: old.wrongIndices || [], upgrade: 0, bestTime: 0, totalCorrect: 0, totalWrong: 0, history: [], highlights: {}, hiddenTokens: [] };
  } catch(e) {
    return { text: "", filled: 0, wrongIndices: [], upgrade: 0, bestTime: 0, totalCorrect: 0, totalWrong: 0, history: [], highlights: {}, hiddenTokens: [] };
  }
};

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
    console.error("동기화 가상 큐 적재 실패:", e); 
  }
};

const InlineBlankInput = React.memo(({ inputStatus, onSubmit, expected, abbrDict, hintLetter }: {
  inputStatus: string;
  onSubmit: (val: string) => void;
  expected: string; 
  abbrDict: Record<string, string>;
  hintLetter?: string | null;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const validAnswers = useMemo(() => {
      const expectedClean = expected.replace(/\s+/g, '').toLowerCase();
      const answers = [expectedClean, getFullChosung(expectedClean)];
      
      if (abbrDict) {
          Object.entries(abbrDict).forEach(([k, v]) => {
              const strK = k.replace(/\s+/g, '').toLowerCase();
              const strV = v.replace(/\s+/g, '').toLowerCase();
              const orig = strK.length >= strV.length ? strK : strV;
              const short = strK.length < strV.length ? strK : strV;
              if (expectedClean === orig) {
                  answers.push(short);
                  answers.push(getFullChosung(short)); 
              }
          });
      }
      return answers;
  }, [expected, abbrDict]);

  useEffect(() => {
    if (inputStatus === 'idle' && inputRef.current) {
        const timer = setTimeout(() => {
            if (inputRef.current) inputRef.current.focus();
        }, 10);
        return () => clearTimeout(timer);
    }
  }, [expected, inputStatus]);
  
  useEffect(() => { 
    if (inputStatus === 'correct' || inputStatus === 'idle') {
        if (inputRef.current) inputRef.current.value = '';
    } else if (inputStatus === 'wrong') {
        if (inputRef.current) inputRef.current.value = expected;
    }
  }, [inputStatus, expected]);

  useEffect(() => {
    const handleInput = (e: Event) => {
        if (inputStatus !== 'idle') {
            e.preventDefault();
            return;
        }
        const el = e.target as HTMLInputElement;
        const newVal = el.value;
        const cleanInput = newVal.replace(/\s+/g, '').toLowerCase();
        if (cleanInput === '') return;
        if (validAnswers.includes(cleanInput)) {
            el.value = '';
            onSubmit(newVal); 
        }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.isComposing) return; 
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            if (inputStatus !== 'idle') return;
            const el = e.target as HTMLInputElement;
            const newVal = el.value;
            el.value = '';
            onSubmit(newVal);
        }
    };

    const el = inputRef.current;
    if (el) {
        el.addEventListener('input', handleInput);
        el.addEventListener('keydown', handleKeyDown);
        return () => {
            el.removeEventListener('input', handleInput);
            el.removeEventListener('keydown', handleKeyDown);
        };
    }
  }, [validAnswers, onSubmit, inputStatus]);
  
  return (
    <input
      ref={inputRef}
      placeholder={inputStatus === 'wrong' ? expected : (hintLetter ? hintLetter : "")}
      readOnly={inputStatus !== 'idle'} 
      className={`inline-block mx-1 px-1.5 py-0.5 text-center font-bold border-b-2 outline-none transition-all ${
        inputStatus === 'wrong' ? 'bg-red-900/40 text-red-300 border-red-500 placeholder-red-400' :
        inputStatus === 'correct' ? 'bg-teal-900/40 text-teal-300 border-teal-500' :
        hintLetter ? 'bg-black/40 text-amber-300 border-amber-500/50 focus:border-amber-400 placeholder-amber-400/80' :
        'bg-black/40 text-amber-300 border-amber-500/50 focus:border-amber-400'
      }`}
      style={{ width: '4.5em', maxWidth: '100%' }}
    />
  );
}, (prevProps, nextProps) => {
  return prevProps.inputStatus === nextProps.inputStatus && 
         prevProps.expected === nextProps.expected && 
         prevProps.abbrDict === nextProps.abbrDict && 
         prevProps.hintLetter === nextProps.hintLetter;
});

const MarketTab = ({ safeAddress, goalBalance, handleUpdateBalance, loadAllData, savedCards }: any) => {
  const [marketItems, setMarketItems] = useState<any[]>([]);
  const [sellMode, setSellMode] = useState(false);
  
  const [selectedCards, setSelectedCards] = useState<Set<number>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const pressTimer = useRef<any>(null);

  useEffect(() => {
    fetch("https://api.blankd.top/api/market/list")
      .then(r => r.json())
      .then(d => setMarketItems(d.items || []));
  }, [sellMode]);

  const toggleSelection = (id: number) => {
    const newSet = new Set(selectedCards);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedCards(newSet);
    if (newSet.size === 0) setSelectionMode(false);
  };

  const handlePressStart = (id: number) => {
    if (selectionMode) return; 
    pressTimer.current = setTimeout(() => {
       setSelectionMode(true);
       toggleSelection(id);
       if ('vibrate' in navigator) navigator.vibrate(50);
    }, 500);
  };

  const handlePressEnd = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  const handleClickCard = (item: any, isMarketItem: boolean) => {
    if (selectionMode) {
      toggleSelection(item.id);
    } else {
      if (isMarketItem) handleBuySingle(item);
      else handleSellSingle(item);
    }
  };

  const groupedCards = useMemo(() => {
    const groups: Record<string, any[]> = {};
    savedCards.forEach((c: any) => {
      const folder = c.folder_name || '기본 폴더';
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(c);
    });
    return groups;
  }, [savedCards]);

  const handleSelectFolder = (folderName: string) => {
    const folderCardIds = groupedCards[folderName].map((c: any) => c.id);
    const newSet = new Set(selectedCards);
    const allSelected = folderCardIds.every((id: number) => newSet.has(id));
    
    if (allSelected) {
      folderCardIds.forEach((id: number) => newSet.delete(id));
    } else {
      folderCardIds.forEach((id: number) => newSet.add(id));
      setSelectionMode(true);
    }
    
    setSelectedCards(newSet);
    if (newSet.size === 0) setSelectionMode(false);
  };

  const handleSellSingle = async (card: any) => {
    const priceStr = prompt(`'${card.content.split('\n')[0].substring(0,20)}...' 조항을 얼마(P)에 판매하시겠습니까?\n\n(여러 개를 팔려면 카드를 길게 꾹 누르거나 폴더 전체 선택을 이용하세요!)`, "100");
    if (!priceStr) return;
    const price = parseInt(priceStr, 10);
    if (price > 0) {
      try {
        const res = await fetch("https://api.blankd.top/api/market/register", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet_address: safeAddress, card_id: card.id, price })
        });
        const data = await res.json();
        if (res.ok) alert("마켓에 성공적으로 등록되었습니다!");
        else alert(data.error);
      } catch(e) { alert("오류 발생"); }
    }
  };

  const handleBuySingle = async (item: any) => {
    if (item.seller_wallet === safeAddress) return alert("자신의 카드는 구매할 수 없습니다.");
    if (goalBalance < item.price) return alert("포인트가 부족합니다.");
    if (confirm(`'${item.title}' 카드를 ${item.price}P에 구매하시겠습니까?\n\n(여러 개를 구매하려면 카드를 길게 꾹 누르세요!)`)) {
      const res = await fetch("https://api.blankd.top/api/market/buy", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: safeAddress, market_id: item.id })
      });
      const data = await res.json();
      if (res.ok) {
        alert("구매 완료! 내 카드함에서 확인하세요.");
        handleUpdateBalance(-item.price);
        loadAllData(true);
      } else {
        alert(data.error);
      }
    }
  };

  const handleBatchSell = async () => {
    if (selectedCards.size === 0) return;
    const priceStr = prompt(`선택한 ${selectedCards.size}개의 조항을 각각 얼마(P)에 판매하시겠습니까?`, "100");
    if (!priceStr) return;
    const price = parseInt(priceStr, 10);
    
    if (price > 0) {
       try {
         const res = await fetch("https://api.blankd.top/api/market/register-batch", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ wallet_address: safeAddress, card_ids: Array.from(selectedCards), price })
         });
         const data = await res.json();
         if (res.ok) {
             alert(data.message);
             setSelectedCards(new Set());
             setSelectionMode(false);
             setSellMode(false); 
         } else {
             alert(data.error);
         }
       } catch (e) { alert("일괄 등록 오류가 발생했습니다."); }
    }
  };

  const handleBatchBuy = async () => {
    if (selectedCards.size === 0) return;
    
    const itemsToBuy = marketItems.filter(item => selectedCards.has(item.id));
    const totalPrice = itemsToBuy.reduce((sum, item) => sum + item.price, 0);

    if (goalBalance < totalPrice) {
      return alert(`포인트가 부족합니다. (필요: ${totalPrice}P, 보유: ${goalBalance}P)`);
    }

    if (confirm(`선택한 ${selectedCards.size}개의 카드를 총 ${totalPrice}P에 구매하시겠습니까?`)) {
      try {
        const res = await fetch("https://api.blankd.top/api/market/buy-batch", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet_address: safeAddress, market_ids: Array.from(selectedCards) })
        });
        const data = await res.json();
        if (res.ok) {
          alert(data.message);
          handleUpdateBalance(-totalPrice);
          setSelectedCards(new Set());
          setSelectionMode(false);
          loadAllData(true);
        } else {
          alert(data.error);
        }
      } catch (e) {
        alert("일괄 구매 중 오류가 발생했습니다.");
      }
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-teal-400">오픈 스토어</h2>
        <button onClick={() => { setSellMode(!sellMode); setSelectionMode(false); setSelectedCards(new Set()); }} className="px-3 py-1.5 bg-amber-900/50 text-amber-300 border border-amber-500/50 text-xs font-bold rounded hover:bg-amber-900 transition-all shadow-md">
           {sellMode ? '◀ 스토어 구경하기' : '💰 내 조항 판매하기'}
        </button>
      </div>
      <p className="text-sm text-white/50 mb-6">
        {sellMode ? '카드를 길게 꾹 누르거나 [폴더 전체 선택]을 눌러 일괄 판매가 가능합니다.' : '카드를 길게 꾹 눌러 다중 선택 후 일괄 구매를 진행해보세요.'}
      </p>
      
      {sellMode ? (
        <div className="space-y-8 pb-20">
           {Object.keys(groupedCards).length === 0 && <div className="text-center py-10 text-white/30 text-sm">보유 중인 카드가 없습니다.</div>}
           
           {Object.entries(groupedCards).map(([folderName, cards]) => (
             <div key={folderName} className="space-y-3">
               <div className="flex justify-between items-center border-b border-white/10 pb-2">
                 <h3 className="font-bold text-amber-400 text-sm">📁 {folderName} <span className="text-white/40 text-xs">({cards.length})</span></h3>
                 <button onClick={() => handleSelectFolder(folderName)} className="text-xs text-amber-200 bg-amber-900/40 px-2 py-1 rounded border border-amber-500/30 hover:bg-amber-900/60 transition-colors">
                   폴더 전체 선택
                 </button>
               </div>
               <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                 {cards.map(card => {
                    const isSelected = selectedCards.has(card.id);
                    return (
                      <div 
                        key={card.id}
                        onPointerDown={() => handlePressStart(card.id)}
                        onPointerUp={handlePressEnd}
                        onPointerLeave={handlePressEnd}
                        onClick={() => handleClickCard(card, false)}
                        className={`relative p-3 rounded flex flex-col justify-between h-28 cursor-pointer transition-all border select-none ${isSelected ? 'bg-amber-900/40 border-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]' : 'bg-white/5 border-white/10 hover:border-white/30'}`}
                      >
                         {selectionMode && (
                           <div className={`absolute top-2 right-2 w-4 h-4 rounded-full border ${isSelected ? 'bg-amber-500 border-amber-500' : 'border-white/30'} flex items-center justify-center`}>
                             {isSelected && <span className="text-black text-[10px] font-bold leading-none -mt-[1px]">✓</span>}
                           </div>
                         )}
                         <h4 className={`font-bold text-xs truncate leading-tight ${selectionMode ? 'pr-5' : ''}`}>{card.content.split('\n')[0].substring(0, 30)}</h4>
                         <p className="text-[10px] text-white/40 line-clamp-3 mt-1 flex-1">{card.content.split('\n').slice(1).join(' ')}</p>
                      </div>
                    )
                 })}
               </div>
             </div>
           ))}
           
           {selectionMode && selectedCards.size > 0 && (
             <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-amber-950 border border-amber-500 px-5 py-3 rounded-full shadow-2xl flex items-center gap-4 z-50 backdrop-blur-md animate-in slide-in-from-bottom-5">
               <span className="text-amber-100 font-bold text-sm">{selectedCards.size}개 조항 선택됨</span>
               <button onClick={handleBatchSell} className="bg-amber-500 text-black px-4 py-1.5 rounded-full text-xs font-bold hover:bg-amber-400 transition-colors shadow-lg active:scale-95">
                 일괄 판매하기
               </button>
             </div>
           )}
        </div>
      ) : (
        <div className="pb-20">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {marketItems.map(item => {
              const isSelected = selectedCards.has(item.id);
              return (
                <div 
                  key={item.id}
                  onPointerDown={() => handlePressStart(item.id)}
                  onPointerUp={handlePressEnd}
                  onPointerLeave={handlePressEnd}
                  onClick={() => handleClickCard(item, true)}
                  className={`relative p-3 rounded flex flex-col justify-between h-28 cursor-pointer transition-all border select-none ${isSelected ? 'bg-teal-900/40 border-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.3)]' : 'bg-white/5 border-white/10 hover:border-teal-500/30'}`}
                >
                  {selectionMode && (
                     <div className={`absolute top-2 right-2 w-4 h-4 rounded-full border ${isSelected ? 'bg-teal-500 border-teal-500' : 'border-white/30'} flex items-center justify-center`}>
                       {isSelected && <span className="text-black text-[10px] font-bold leading-none -mt-[1px]">✓</span>}
                     </div>
                  )}
                  <div>
                    <h3 className={`font-bold text-xs truncate leading-tight ${selectionMode ? 'pr-5' : ''}`}>{item.title}</h3>
                    <p className="text-[10px] text-white/40 mt-1">판매자: {item.seller_wallet}<br/>📥 {item.downloads}회</p>
                  </div>
                  {!selectionMode && (
                    <div className="mt-2 text-teal-300 text-xs font-bold bg-teal-900/50 py-1 rounded text-center">
                      {item.price}P 구매
                    </div>
                  )}
                </div>
              );
            })}
            {marketItems.length === 0 && (
              <div className="col-span-full py-10 text-center text-white/30 text-sm">등록된 상품이 없습니다.</div>
            )}
          </div>
          
          {selectionMode && selectedCards.size > 0 && (
            <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-teal-950 border border-teal-500 px-5 py-3 rounded-full shadow-2xl flex items-center gap-4 z-50 backdrop-blur-md animate-in slide-in-from-bottom-5">
              <span className="text-teal-100 font-bold text-sm">총 {selectedCards.size}개 일괄 구매</span>
              <button onClick={handleBatchBuy} className="bg-teal-500 text-black px-4 py-1.5 rounded-full text-xs font-bold hover:bg-teal-400 transition-colors shadow-lg active:scale-95">
                결제하기
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function MainApp() {
  const enokiFlow = useEnokiFlow();
  const zkLogin = useZkLogin();
  const suiWalletAccount = useCurrentAccount();
  const safeAddress = suiWalletAccount?.address || zkLogin?.address || "";
  const isLoggedIn = safeAddress.length > 0;

  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('blankd_active_tab') || 'progress');
  useEffect(() => { localStorage.setItem('blankd_active_tab', activeTab); }, [activeTab]);

  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('blankd_sidebar_open');
      if (saved !== null) return saved === 'true';
    }
    return true; 
  });

  useEffect(() => { localStorage.setItem('blankd_sidebar_open', String(isSidebarOpen)); }, [isSidebarOpen]);

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
  
  const [fontSizeLevel, setFontSizeLevel] = useState<number>(() => parseInt(localStorage.getItem('blankd_font_size') || '3'));
  useEffect(() => { localStorage.setItem('blankd_font_size', fontSizeLevel.toString()); }, [fontSizeLevel]);
  
  const [lawFile, setLawFile] = useState<File | null>(null);
  const [systemLogs, setSystemLogs] = useState<string[]>(["[System] 터미널 온라인. 환영합니다, 설계자님."]);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [isMemoOpen, setIsMemoOpen] = useState(false);
  const [blanks, setBlanks] = useState<{answer: string, correct: boolean}[]>([]);
  const [currentBlankIdx, setCurrentBlankIdx] = useState(0);
  const [inputStatus, setInputStatus] = useState<'idle'|'correct'|'wrong'>('idle');

  const statsRef = useRef<{ text: string, filled: number, wrongIndices: Set<number>, sessionCorrect: number, highlights: Record<string, string>, hiddenTokens: Set<string> }>({
    text: "", filled: 0, wrongIndices: new Set<number>(), sessionCorrect: 0, highlights: {}, hiddenTokens: new Set<string>()
  });

  // 💡 초고시인성 3색 형광 마커 ('purple' | 'blue' | 'orange' | 'eraser' | null)
  const [activeHighlighter, setActiveHighlighter] = useState<'purple' | 'blue' | 'orange' | 'eraser' | null>(null);
  const [cardHighlights, setCardHighlights] = useState<Record<string, string>>({});
  const isHighlightingDragRef = useRef<boolean>(false);

  // 💡 [추가] 스텔스 구간 숨기기 & 뒤 글자 터치 발견 시스템 상태
  const [isStealthEditMode, setIsStealthEditMode] = useState<boolean>(false); // 숨김 구간 설정 모드
  const [cardHiddenTokens, setCardHiddenTokens] = useState<Set<string>>(new Set()); // 영구 숨김 설정된 토큰 키 목록
  const [sessionRevealedTokens, setSessionRevealedTokens] = useState<Set<string>>(new Set()); // 이번 회독에서 뒤 글자를 터치해 찾아낸 토큰 키 목록
  const [showStealthHint, setShowStealthHint] = useState<boolean>(false); // 모르겠을 때 위치 힌트 표시 여부

  useEffect(() => {
    const handleGlobalPointerUp = () => { isHighlightingDragRef.current = false; };
    window.addEventListener('pointerup', handleGlobalPointerUp);
    return () => window.removeEventListener('pointerup', handleGlobalPointerUp);
  }, []);
  
  const [inputMode, setInputMode] = useState<'typing'|'touch'|'skimming'>('typing'); 
  const [skimmingWrongs, setSkimmingWrongs] = useState<Set<number>>(new Set());
  const [skimmingFocusIdx, setSkimmingFocusIdx] = useState<number>(0);
  const [isSkimmingPaused, setIsSkimmingPaused] = useState<boolean>(false);
  const lastKeyTimeRef = useRef<number>(0);

  const [touchCandidates, setTouchCandidates] = useState<string[]>([]);
  const isProcessingRef = useRef(false);

  const [goalBalance, setGoalBalance] = useState<number>(0);
  const [activityLog, setActivityLog] = useState<Record<string, number>>({});
  const [claimedRewards, setClaimedRewards] = useState<Record<string, boolean>>({});

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const [hintLetter, setHintLetter] = useState<string | null>(null);
  const [isFrozen, setIsFrozen] = useState<boolean>(false);

  const [globalDict, setGlobalDict] = useState<{ stopwords: string[], inclusions: string[], abbrs: Record<string, string>, groups: string[][] }>({
    stopwords: [], inclusions: [], abbrs: {}, groups: []
  });

  const [isDictModalOpen, setIsDictModalOpen] = useState(false);
  const [dictTab, setDictTab] = useState<'stop'|'include'|'abbr'|'group'>('abbr');
  const [tempKey, setTempKey] = useState("");
  const [tempValue, setTempValue] = useState("");

  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  const chosungGroups = useMemo(() => {
    const groups: Record<string, string[]> = {};
    touchCandidates.forEach(ans => {
        const cho = getChosung(ans);
        if (!groups[cho]) groups[cho] = [];
        if (!groups[cho].includes(ans)) groups[cho].push(ans);
    });
    return groups;
  }, [touchCandidates]);

  const activeTouchCandidates = useMemo(() => {
    if (!blanks[currentBlankIdx]) return [];
    
    const expectedRaw = blanks[currentBlankIdx].answer;
    const expectedClean = expectedRaw.replace(/\s+/g, '');
    const targetCho = getChosung(expectedClean);

    let matchedGroup: string[] | null = null;
    for (const group of (globalDict.groups || [])) {
        if (group.some(w => w.replace(/\s+/g, '') === expectedClean)) {
            matchedGroup = group;
            break;
        }
    }

    const shuffle = (array: string[]) => [...array].sort(() => Math.random() - 0.5);
    let distractors: string[] = [];

    if (matchedGroup) {
        const others = matchedGroup.filter(w => w.replace(/\s+/g, '') !== expectedClean);
        distractors = shuffle(others).slice(0, 3);
        
        if (distractors.length < 3) {
            const fallback = touchCandidates.filter(ans => ans.replace(/\s+/g, '') !== expectedClean && !distractors.includes(ans));
            const needed = 3 - distractors.length;
            distractors = [...distractors, ...shuffle(fallback).slice(0, needed)];
        }
    } else {
        const sameCho = touchCandidates.filter(ans => getChosung(ans.replace(/\s+/g, '')) === targetCho && ans.replace(/\s+/g, '') !== expectedClean);
        const otherCho = touchCandidates.filter(ans => getChosung(ans.replace(/\s+/g, '')) !== targetCho && ans.replace(/\s+/g, '') !== expectedClean);
        
        if (sameCho.length >= 3) {
            distractors = shuffle(sameCho).slice(0, 3);
        } else {
            distractors = [...sameCho];
            const needed = 3 - distractors.length;
            distractors = [...distractors, ...shuffle(otherCho).slice(0, needed)];
        }
    }
    
    const finalCandidates = [...distractors, expectedRaw];
    return finalCandidates.sort((a, b) => a.localeCompare(b, 'ko'));

  }, [currentBlankIdx, blanks, touchCandidates, globalDict.groups]); 

  useEffect(() => {
    setSkimmingFocusIdx(currentBlankIdx);
    setIsSkimmingPaused(false);
  }, [currentBlankIdx, activeCard, inputMode]);

  useEffect(() => {
    if (activeCard && inputMode === 'skimming') {
      const el = document.getElementById(`skimming-blank-${skimmingFocusIdx}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [skimmingFocusIdx, inputMode, activeCard]);

  // 💡 숨겨진 빈칸(아직 뒤 글자를 터치해 찾지 않은 빈칸)은 일반 진행에서 건너뛰거나 찾았을 때 자동 해결되도록 처리
  useEffect(() => {
    if (!activeCard || inputMode !== 'skimming' || isSkimmingPaused || blanks.length === 0) return;

    const timer = setTimeout(() => {
      const nextUnresolvedIdx = blanks.findIndex((b, idx) => idx > skimmingFocusIdx && !b.correct);
      if (nextUnresolvedIdx !== -1) {
        setSkimmingFocusIdx(nextUnresolvedIdx);
      } else {
        handleSkimmingSubmit(blanks.length - 1);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [activeCard, inputMode, isSkimmingPaused, skimmingFocusIdx, blanks]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (!activeCard) return;
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

      if (inputMode === 'skimming') {
          if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key) || e.code === 'Space') {
              e.preventDefault();
              e.stopPropagation();
              if (e.stopImmediatePropagation) e.stopImmediatePropagation();

              const now = Date.now();
              if (e.repeat || (now - lastKeyTimeRef.current < 120)) return;
              lastKeyTimeRef.current = now;
          }

          if (e.key === 'ArrowUp') {
              setIsSkimmingPaused(true);
          } else if (e.key === 'ArrowDown') {
              if (isSkimmingPaused) {
                  setIsSkimmingPaused(false);
                  const nextIdx = blanks.findIndex((b, idx) => idx > skimmingFocusIdx && !b.correct);
                  if (nextIdx !== -1) {
                      setSkimmingFocusIdx(nextIdx);
                  } else {
                      handleSkimmingSubmit(blanks.length - 1);
                  }
              }
          } else if (e.code === 'Space' || e.key === ' ') {
              if (!isSkimmingPaused) {
                  setIsSkimmingPaused(true);
                  setSkimmingWrongs(prev => {
                      const next = new Set(prev);
                      next.add(skimmingFocusIdx);
                      return next;
                  });
              } else {
                  setIsSkimmingPaused(false);
                  const nextIdx = blanks.findIndex((b, idx) => idx > skimmingFocusIdx && !b.correct);
                  if (nextIdx !== -1) {
                      setSkimmingFocusIdx(nextIdx);
                  } else {
                      handleSkimmingSubmit(blanks.length - 1);
                  }
              }
          } else if (e.key === 'ArrowRight') {
              const nextIdx = blanks.findIndex((b, idx) => idx > skimmingFocusIdx && !b.correct);
              if (nextIdx !== -1) setSkimmingFocusIdx(nextIdx);
              else handleSkimmingSubmit(blanks.length - 1);
          } else if (e.key === 'ArrowLeft') {
              let prevIdx = -1;
              for (let i = skimmingFocusIdx - 1; i >= currentBlankIdx; i--) {
                  if (!blanks[i]?.correct) { prevIdx = i; break; }
              }
              if (prevIdx !== -1) setSkimmingFocusIdx(prevIdx);
          }
      } else if (inputMode === 'touch') {
          const keyNum = parseInt(e.key, 10);
          if (!isNaN(keyNum) && keyNum >= 1 && keyNum <= 4) {
              e.preventDefault();
              const idx = keyNum - 1;
              if (activeTouchCandidates[idx]) {
                 handleSequentialInput(activeTouchCandidates[idx]);
              }
          } else if (e.key === '0' || e.key === 'Escape') {
              e.preventDefault();
              handleSequentialInput('모름(강제오답)');
          }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, { capture: true });
  }, [inputMode, activeCard, activeTouchCandidates, blanks, currentBlankIdx, inputStatus, skimmingFocusIdx, isSkimmingPaused, skimmingWrongs]);


  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false); 
      addLog("🌐 [시스템] 인터넷 연결 복구. 로컬 데이터 최대값 동기화 시작...");
      flushQueue()
        .then(() => syncAllLocalCardsToServer())
        .then(() => loadAllData(true));
    };

    const handleOffline = () => {
      setIsOffline(true);
      addLog("⚠️ [시스템] 통신 단절 감지. 안전한 오프라인 모드로 자동 전환됩니다.");
    };
    
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

  const syncAllLocalCardsToServer = async () => {
    if (!safeAddress || !navigator.onLine) return false;
    try {
      const localCards = JSON.parse(localStorage.getItem(`blankd_off_card_${safeAddress}`) || '[]');
      const memosToSync = localCards
          .filter((c: any) => c.id && !String(c.id).startsWith('temp_') && !isNaN(parseInt(c.id)))
          .map((c: any) => ({ id: c.id, memo: c.memo }));
          
      if (memosToSync.length > 0) {
          await fetch("https://api.blankd.top/api/sync-batch", {
              method: "POST", 
              keepalive: true, 
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ wallet_address: safeAddress, memos: memosToSync, answers: [] })
          });
          return true;
      }
    } catch(e) {}
    return false;
  };

  const flushQueue = async () => {
    if (!safeAddress) return false; 
    try {
      const qStr = localStorage.getItem('blankd_sync_queue');
      let q = qStr ? JSON.parse(qStr) : { memos: [], answers: [] };
      
      q.memos = q.memos.filter((m:any) => m.id && !String(m.id).startsWith('temp_') && !isNaN(parseInt(m.id)));
      q.answers = q.answers.filter((a:any) => a.card_id && !String(a.card_id).startsWith('temp_') && !isNaN(parseInt(a.card_id)));

      if (q.memos.length > 0 || q.answers.length > 0) {
          const res = await fetch("https://api.blankd.top/api/sync-batch", {
            method: "POST", 
            keepalive: true, 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ wallet_address: safeAddress, memos: q.memos, answers: q.answers })
          });

          if (res.ok) {
            localStorage.setItem('blankd_sync_queue', JSON.stringify({ memos: [], answers: [] }));
            addLog(`✅ 대기열 서버 전송 완료 (Memos: ${q.memos.length}, Answers: ${q.answers.length})`);
          }
      }
      return true;
    } catch (e) { 
      return false;
    }
  };

  const loadAllData = async (isManualSync = false) => {
    if (!safeAddress) return;
    try {
      if (!isOffline || isManualSync || navigator.onLine) {
         await flushQueue();
         await syncAllLocalCardsToServer(); 
      }

      const fetchWithDiagnostic = async (url: string, name: string) => {
          try {
              const res = await fetch(url);
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              return await res.json();
          } catch (err: any) { throw new Error(`[${name}] ${err.message}`); }
      };

      const [catRes, cardRes, userData, dictRes] = await Promise.all([
        fetchWithDiagnostic(`https://api.blankd.top/api/get-categories?wallet_address=${safeAddress}&t=${Date.now()}`, '카테고리'),
        fetchWithDiagnostic(`https://api.blankd.top/api/my-cards?wallet_address=${safeAddress}&t=${Date.now()}`, '카드'),
        fetch(`https://api.blankd.top/api/get-balance?wallet_address=${safeAddress}&t=${Date.now()}`).then(r => r.json()).catch(() => ({ balance: 0, activity_log: {}, claimed_rewards: {} })),
        fetchWithDiagnostic(`https://api.blankd.top/api/get-global-dict?wallet_address=${safeAddress}&t=${Date.now()}`, '사전').catch(() => ({ stopwords: [], inclusions: [], abbrs: {}, groups: [] }))
      ]);

      const serverStopwords = Array.isArray(dictRes.stopwords) ? dictRes.stopwords : [];
      const serverInclusions = Array.isArray(dictRes.inclusions) ? dictRes.inclusions : [];
      let finalAbbrs = (dictRes.abbrs && typeof dictRes.abbrs === 'object' && !Array.isArray(dictRes.abbrs)) ? dictRes.abbrs : {};
      const serverGroups = Array.isArray(dictRes.groups) ? dictRes.groups : [];
      const newDict = { stopwords: serverStopwords, inclusions: serverInclusions, abbrs: finalAbbrs, groups: serverGroups };

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
      } catch (e) {}

      const serverBalance = userData.balance || 0;
      const localBalance = parseInt(localStorage.getItem(`blankd_off_bal_${safeAddress}`) || '0', 10);
      const actualBalance = Math.max(serverBalance, localBalance);
      
      const serverActivityLog = userData.activity_log || {};
      const localActivityLog = JSON.parse(localStorage.getItem(`blankd_activity_log_${safeAddress}`) || '{}');
      const mergedActivity = { ...serverActivityLog };
      Object.keys(localActivityLog).forEach(k => {
         mergedActivity[k] = Math.max(mergedActivity[k] || 0, localActivityLog[k] || 0);
      });

      const serverClaimedRewards = userData.claimed_rewards || {};
      const localClaimedRewards = JSON.parse(localStorage.getItem(`blankd_claimed_rewards_${safeAddress}`) || '{}');
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
      
      if (isManualSync) addLog(`✅ 동기화 완료: 서버와 로컬 데이터 병합 성공`);
    } catch (e: any) {
      addLog(`⚠️ 서버 응답 지연: 기기 내장 캐시(로컬) 데이터를 우선 표시합니다.`);
      try {
        const offCat = JSON.parse(localStorage.getItem(`blankd_off_cat_${safeAddress}`) || '[]');
        const offCard = JSON.parse(localStorage.getItem(`blankd_off_card_${safeAddress}`) || '[]');
        const offBal = parseInt(localStorage.getItem(`blankd_off_bal_${safeAddress}`) || '0', 10);
        const offActivityLog = JSON.parse(localStorage.getItem(`blankd_activity_log_${safeAddress}`) || '{}');
        const offClaimedRewards = JSON.parse(localStorage.getItem(`blankd_claimed_rewards_${safeAddress}`) || '{}');
        const offDict = JSON.parse(localStorage.getItem(`blankd_off_dict_${safeAddress}`) || '{"stopwords":[],"inclusions":[],"abbrs":{},"groups":[]}');

        setCategories(offCat);
        setSavedCards(offCard);
        setGoalBalance(offBal);
        setActivityLog(offActivityLog);
        setClaimedRewards(offClaimedRewards);
        setGlobalDict(offDict);
      } catch(cacheError: any) {}
    }
  };

  const handleUpdateBalance = (changeAmount: number) => {
    setGoalBalance(prev => {
      const newBalance = prev + changeAmount;
      localStorage.setItem(`blankd_off_bal_${safeAddress}`, newBalance.toString());
      if (!isOffline && safeAddress && navigator.onLine) {
        fetch("https://api.blankd.top/api/update-balance", {
          method: "POST", keepalive: true, headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet_address: safeAddress, balance: newBalance })
        }).catch(e => console.error("포인트 동기화 실패:", e));
      }
      return newBalance;
    });
  };

  const registerToMarket = async (cardId: number) => {
    const price = parseInt(prompt("판매할 가격(포인트)을 입력하세요:", "100") || "0", 10);
    if (price > 0) {
      try {
        const res = await fetch("https://api.blankd.top/api/market/register", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet_address: safeAddress, card_id: cardId, price })
        });
        const data = await res.json();
        if (res.ok) alert(data.message);
        else alert(data.error);
      } catch(e) {
        alert("마켓 등록 중 오류가 발생했습니다.");
      }
    }
  };

  const saveGlobalDict = async (newDict: any) => {
    setGlobalDict(newDict); 
    localStorage.setItem(`blankd_off_dict_${safeAddress}`, JSON.stringify(newDict));
    
    try {
      await fetch("https://api.blankd.top/api/update-global-dict", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: safeAddress, ...newDict })
      });
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
      localStorage.setItem(`blankd_off_card_${safeAddress}`, JSON.stringify(updatedCards.map(c => { const { _isModified, ...rest } = c; return rest; })));
      return updatedCards.map(c => { const { _isModified, ...rest } = c; return rest; });
    });
  };

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
      }).catch((err: any) => addLog(`🚨 인증 실패: ${err.message}`));
    }
    if (isLoggedIn) loadAllData();
  }, [isLoggedIn, safeAddress, enokiFlow]);

  useEffect(() => {
    if (!safeAddress) return;
    const interval = setInterval(() => {
      if (navigator.onLine) flushQueue();
    }, 30000); 
    
    const handleVisibility = () => { 
      if(document.visibilityState === 'hidden' || document.visibilityState === 'unloaded') {
        const currentCard = activeCardRef.current;
        if (currentCard && statsRef.current) {
          const exStats = getExtendedStats(currentCard.memo);
          exStats.text = statsRef.current.text;
          exStats.filled = statsRef.current.filled;
          exStats.wrongIndices = Array.from(statsRef.current.wrongIndices);
          exStats.highlights = statsRef.current.highlights;
          exStats.hiddenTokens = Array.from(statsRef.current.hiddenTokens);
          
          if (navigator.onLine) {
            fetch("https://api.blankd.top/api/save-card", {
              method: "POST", keepalive: true, headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ wallet_address: safeAddress, card_id: currentCard.id, card_content: currentCard.content, answer_text: currentCard.answer_text || "", folder_name: currentCard.folder_name, memo: JSON.stringify(exStats) })
            }).catch(()=>{});
          }
        }
        if (navigator.onLine) flushQueue(); 
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
      addLog(`🚨 분할 처리 에러`);
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
      console.error("카드 생성 오류:", e);
    }
  };

  const handleUpdateMemoBackground = async (id: number, memo: string) => {
    setSavedCards(prev => {
      const next = prev.map(c => c.id === id ? { ...c, memo } : c);
      localStorage.setItem(`blankd_off_card_${safeAddress}`, JSON.stringify(next));
      return next;
    });
    pushToQueue('MEMO', { id, memo });
    
    if (navigator.onLine) {
      const target = savedCards.find((c:any) => c.id === id);
      if (target) {
        fetch("https://api.blankd.top/api/save-card", {
          method: "POST", keepalive: true, headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet_address: safeAddress, card_id: id, card_content: target.content, answer_text: target.answer_text || "", folder_name: target.folder_name, memo })
        }).catch(() => {});
      }
      flushQueue(); 
    }
  };

  const applyHighlightToToken = (tokenKey: string, isDrag = false) => {
    if (!activeHighlighter || !activeCard) return;
    setCardHighlights(prev => {
      const next = { ...prev };
      if (activeHighlighter === 'eraser') {
        if (!next[tokenKey]) return prev;
        delete next[tokenKey];
      } else {
        if (!isDrag && next[tokenKey] === activeHighlighter) {
          delete next[tokenKey];
        } else {
          next[tokenKey] = activeHighlighter;
        }
      }
      statsRef.current.highlights = next;
      const exStats = getExtendedStats(activeCard.memo);
      exStats.text = statsRef.current.text;
      exStats.filled = statsRef.current.filled;
      exStats.wrongIndices = Array.from(statsRef.current.wrongIndices);
      exStats.highlights = next;
      exStats.hiddenTokens = Array.from(statsRef.current.hiddenTokens);
      handleUpdateMemoBackground(activeCard.id, JSON.stringify(exStats));
      return next;
    });
  };

  // 💡 [추가] 영구 숨김 구간 토글 및 실시간 DB 저장 핸들러 (내가 해제할 때까지 영구 유지)
  const toggleStealthToken = (tokenKey: string, isDrag = false) => {
    if (!isStealthEditMode || !activeCard) return;
    setCardHiddenTokens(prev => {
      const next = new Set(prev);
      if (next.has(tokenKey)) {
        if (!isDrag) next.delete(tokenKey);
      } else {
        next.add(tokenKey);
      }
      statsRef.current.hiddenTokens = next;
      const exStats = getExtendedStats(activeCard.memo);
      exStats.text = statsRef.current.text;
      exStats.filled = statsRef.current.filled;
      exStats.wrongIndices = Array.from(statsRef.current.wrongIndices);
      exStats.highlights = statsRef.current.highlights;
      exStats.hiddenTokens = Array.from(next);
      handleUpdateMemoBackground(activeCard.id, JSON.stringify(exStats));
      return next;
    });
  };

  // 💡 [추가] 숨긴 구간 바로 뒤의 글자(트리거 단어)를 터치했을 때 숨겨진 정답 구간을 짠! 하고 보여주는 핸들러
  const handleRevealHiddenSegment = (tokensToReveal: string[], blankIndicesToResolve: number[]) => {
    setSessionRevealedTokens(prev => {
      const next = new Set(prev);
      tokensToReveal.forEach(k => next.add(k));
      return next;
    });

    if (blankIndicesToResolve.length > 0) {
      setBlanks(prev => {
        const next = [...prev];
        blankIndicesToResolve.forEach(bIdx => {
          if (next[bIdx]) next[bIdx] = { ...next[bIdx], correct: true };
        });
        return next;
      });
      statsRef.current.sessionCorrect = (statsRef.current.sessionCorrect || 0) + blankIndicesToResolve.length;

      // 현재 포커스된 빈칸이 방금 발견된 숨김 빈칸에 포함되어 있다면 다음 미해결 빈칸으로 자동 이동
      if (blankIndicesToResolve.includes(currentBlankIdx)) {
        setTimeout(() => {
          setBlanks(latestBlanks => {
            const nextUnresolved = latestBlanks.findIndex((b, idx) => idx > currentBlankIdx && !b.correct);
            if (nextUnresolved !== -1) {
              setCurrentBlankIdx(nextUnresolved);
            } else {
              const anyUnresolved = latestBlanks.findIndex(b => !b.correct);
              if (anyUnresolved !== -1) setCurrentBlankIdx(anyUnresolved);
              else finishCard();
            }
            return latestBlanks;
          });
        }, 150);
      }
    }
  };

  const handleClearAllStealth = () => {
    if (!activeCard) return;
    if (cardHiddenTokens.size === 0) return;
    if (window.confirm("이 조항에 설정된 모든 숨김 구간을 영구 해제하시겠습니까?")) {
      setCardHiddenTokens(new Set());
      setSessionRevealedTokens(new Set());
      statsRef.current.hiddenTokens = new Set();
      const exStats = getExtendedStats(activeCard.memo);
      exStats.text = statsRef.current.text;
      exStats.filled = statsRef.current.filled;
      exStats.wrongIndices = Array.from(statsRef.current.wrongIndices);
      exStats.highlights = statsRef.current.highlights;
      exStats.hiddenTokens = [];
      handleUpdateMemoBackground(activeCard.id, JSON.stringify(exStats));
    }
  };

  const handleClearAllHighlights = () => {
    if (!activeCard) return;
    if (Object.keys(cardHighlights).length === 0) return;
    if (window.confirm("이 조항에 표시된 모든 형광 마커를 지우시겠습니까?")) {
      setCardHighlights({});
      statsRef.current.highlights = {};
      const exStats = getExtendedStats(activeCard.memo);
      exStats.text = statsRef.current.text;
      exStats.filled = statsRef.current.filled;
      exStats.wrongIndices = Array.from(statsRef.current.wrongIndices);
      exStats.highlights = {};
      exStats.hiddenTokens = Array.from(statsRef.current.hiddenTokens);
      handleUpdateMemoBackground(activeCard.id, JSON.stringify(exStats));
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

  const toggleSkimmingWrong = (idx: number) => {
    setSkimmingWrongs(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleSkimmingSubmit = (pageEndIdx: number) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    
    const newWrongs = new Set(statsRef.current.wrongIndices);
    let newlyCorrect = 0;

    for (let i = currentBlankIdx; i <= pageEndIdx; i++) {
        if (blanks[i]?.correct) continue;
        if (skimmingWrongs.has(i)) {
            newWrongs.add(i);
        } else {
            if (newWrongs.has(i)) newWrongs.delete(i);
            newlyCorrect++;
        }
    }

    statsRef.current.wrongIndices = newWrongs;
    statsRef.current.sessionCorrect = (statsRef.current.sessionCorrect || 0) + newlyCorrect;
    
    setBlanks(prev => prev.map((b, i) => (i >= currentBlankIdx && i <= pageEndIdx) ? { ...b, correct: true } : b));
    
    const nextIdx = blanks.findIndex((b, idx) => idx > pageEndIdx && !b.correct);
    
    if (nextIdx !== -1) {
        setCurrentBlankIdx(nextIdx);
        localStorage.setItem(`blankd_progress_${activeCard.id}`, nextIdx.toString());
        setInputStatus('idle');
        isProcessingRef.current = false;
    } else {
        setCurrentBlankIdx(blanks.length);
        localStorage.removeItem(`blankd_progress_${activeCard.id}`);
        setInputStatus('idle');
        setTimeout(() => {
            isProcessingRef.current = false;
            finishCard();
        }, 200);
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
      
      const targetWrong = activeCard._targetWrongWords || null;
      const targetWrongIndices = activeCard._targetWrongIndices || null;

      const stats = getExtendedStats(activeCard.memo);
      const hiddenSet = new Set<string>(stats.hiddenTokens || []);

      const restoredBlanks = foundBlanks.map((b, i) => {
          let isCorrect = i < lastIdx;
          if (targetWrongIndices) {
              isCorrect = !targetWrongIndices.includes(i); 
          } else if (targetWrong) {
              const cleanAns = b.answer.replace(/\s+/g, '');
              const isTarget = targetWrong.some((w: string) => w.replace(/\s+/g, '') === cleanAns);
              isCorrect = !isTarget;
          }
          return { ...b, correct: isCorrect };
      });

      setBlanks(restoredBlanks); 

      // 첫 시작 빈칸은 숨겨지지 않은 미해결 빈칸을 우선 타겟팅
      const firstUnresolvedVisible = restoredBlanks.findIndex((b, idx) => !b.correct && !hiddenSet.has(`blank-${idx}`));
      const firstUnresolvedAny = restoredBlanks.findIndex(b => !b.correct);
      setCurrentBlankIdx(firstUnresolvedVisible !== -1 ? firstUnresolvedVisible : (firstUnresolvedAny !== -1 ? firstUnresolvedAny : 0));
      setInputStatus('idle');
      setSkimmingWrongs(new Set());
      setIsSkimmingPaused(false);

      const uniqueAnswers = Array.from(new Set(foundBlanks.map(b => b.answer)));
      setTouchCandidates(uniqueAnswers.sort((a, b) => a.localeCompare(b, 'ko')));

      setIsMemoOpen(false);
      setIsFrozen(false); setHintLetter(null); 
      setCardHighlights(stats.highlights || {});
      setCardHiddenTokens(hiddenSet);
      setSessionRevealedTokens(new Set());
      setShowStealthHint(false);
      setIsStealthEditMode(false);

      let cleanText = stats.text ? stats.text.replace(/\(\s*\)\s*=>\s*x\(\s*null\s*\)/g, "").trim() : "";

      statsRef.current = { 
          text: cleanText, 
          filled: stats.filled, 
          wrongIndices: new Set(stats.wrongIndices || []),
          sessionCorrect: 0,
          highlights: stats.highlights || {},
          hiddenTokens: hiddenSet
      };
      
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
      if (activeCard && inputStatus === 'idle' && inputMode !== 'skimming') {
          const timer = setTimeout(() => {
              const el = document.getElementById('active-blank');
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 50);
          return () => clearTimeout(timer);
      }
  }, [currentBlankIdx, inputMode, activeCard, inputStatus]);

  const finishCard = async (customDays?: number) => {
    if (isClosingRef.current || !activeCard) return;
    isClosingRef.current = true;
    const currentId = activeCard.id; const currentFolder = activeCard.folder_name; const finalTime = 0;
    const wrongArr = Array.from(statsRef.current.wrongIndices);
    
    const isTargetMode = !!activeCard._targetWrongWords || !!activeCard._isTargetMode;
    const correctCount = statsRef.current.sessionCorrect || 0;
    const isCorrect = wrongArr.length === 0;

    const exStats = getExtendedStats(activeCard.memo);
    exStats.text = statsRef.current.text;
    exStats.filled = exStats.filled + 1; 
    exStats.wrongIndices = wrongArr;
    exStats.highlights = statsRef.current.highlights;
    exStats.hiddenTokens = Array.from(statsRef.current.hiddenTokens);
    
    const nowTimeStr = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
    
    exStats.history = [{
      date: nowTimeStr,
      wrongCount: wrongArr.length,
      wrongWords: wrongArr.map(idx => blanks[idx]?.answer).filter(Boolean)
    }];
    
    exStats.totalCorrect += correctCount;
    exStats.totalWrong += wrongArr.length;

    const newMemo = JSON.stringify(exStats);

    const earnedPoints = correctCount * 5; 
    handleUpdateBalance(earnedPoints);

    const todayStr = getKoreanDateString();
    setActivityLog(prev => {
      const next = { ...prev };
      next[todayStr] = (next[todayStr] || 0) + correctCount;
      localStorage.setItem(`blankd_activity_log_${safeAddress}`, JSON.stringify(next));
      
      if (navigator.onLine) {
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

    const folderCards = savedCards.filter(c => c.folder_name === currentFolder);
    const currentIdx = folderCards.findIndex(c => c.id === currentId);
    
    let nextCard = null;
    if (isTargetMode) {
       for (let i = currentIdx + 1; i < folderCards.length; i++) {
           const nCard = folderCards[i];
           const nStats = getExtendedStats(nCard.memo);
           const nWrong = Array.from(nStats.wrongIndices || []);
           if (nWrong.length > 0) {
               nextCard = { ...nCard, _targetWrongIndices: nWrong, _isTargetMode: true };
               break;
           }
       }
    } else {
       nextCard = folderCards[currentIdx + 1] || null;
    }

    localStorage.removeItem(`blankd_progress_${currentId}`);

    setActiveCard(nextCard);
    setSavedCards(prev => {
      const next = prev.map(c => c.id === currentId ? { ...c, memo: newMemo } : c);
      localStorage.setItem(`blankd_off_card_${safeAddress}`, JSON.stringify(next));
      return next;
    });
    
    pushToQueue('MEMO', { id: currentId, memo: newMemo });
    pushToQueue('ANSWER', { card_id: currentId, is_correct: isCorrect, clear_time: finalTime, next_review: nextReviewDate.toISOString() });
    
    if (isOffline) {
      addLog(`💾 오프라인 기록 보존됨`);
    } else {
      addLog(`🎉 완료! 기록 갱신 됨. +${earnedPoints} Point`);
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
    exStats.highlights = statsRef.current.highlights;
    exStats.hiddenTokens = Array.from(statsRef.current.hiddenTokens);
    
    const newMemo = JSON.stringify(exStats);
    setActiveCard(null);

    setSavedCards(prev => {
      const next = prev.map(c => c.id === currentId ? { ...c, memo: newMemo } : c);
      localStorage.setItem(`blankd_off_card_${safeAddress}`, JSON.stringify(next));
      return next;
    });
    pushToQueue('MEMO', { id: currentId, memo: newMemo });
    
    if (navigator.onLine) {
      try {
        await fetch("https://api.blankd.top/api/save-card", {
          method: "POST", keepalive: true, headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet_address: safeAddress, card_id: currentId, card_content: activeCard.content, answer_text: activeCard.answer_text || "", folder_name: activeCard.folder_name, memo: newMemo })
        });
      } catch(e) {}
    }
    flushQueue();
  };

  const forceAdvance = () => {
    setBlanks(prev => {
      const nb = [...prev];
      if (nb[currentBlankIdx]) nb[currentBlankIdx].correct = true;
      return nb;
    });
    
    // 아직 발견되지 않은 숨김 빈칸은 건너뛰고 다음 일반 빈칸으로 이동
    const nextVisibleIdx = blanks.findIndex((b, idx) => idx > currentBlankIdx && !b.correct && (!cardHiddenTokens.has(`blank-${idx}`) || sessionRevealedTokens.has(`blank-${idx}`)));
    const nextAnyIdx = blanks.findIndex((b, idx) => idx > currentBlankIdx && !b.correct);
    const nextIdx = nextVisibleIdx !== -1 ? nextVisibleIdx : nextAnyIdx;

    if (nextIdx !== -1) {
        setCurrentBlankIdx(nextIdx);
        localStorage.setItem(`blankd_progress_${activeCard.id}`, nextIdx.toString());
        setInputStatus('idle');
        isProcessingRef.current = false;
    } else {
        localStorage.removeItem(`blankd_progress_${activeCard.id}`);
        setInputStatus('idle');
        isProcessingRef.current = false;
        finishCard();
    }
  };

  const handleSequentialInput = (overrideInput?: string | any) => {
    if (isProcessingRef.current) return; 
    if (inputStatus === 'correct' || !blanks[currentBlankIdx]) return;
    if (inputStatus === 'wrong') return; 

    const expected = blanks[currentBlankIdx].answer.replace(/\s+/g, '').toLowerCase();
    let actual = typeof overrideInput === 'string' ? overrideInput.replace(/\s+/g, '').toLowerCase() : '';
    
    let isCorrect = (expected === actual) || (getFullChosung(expected) === actual);

    if (!isCorrect && globalDict.abbrs) {
      Object.entries(globalDict.abbrs).forEach(([k, v]) => {
        const strK = k.replace(/\s+/g, '').toLowerCase();
        const strV = (v as string).replace(/\s+/g, '').toLowerCase();
        const orig = strK.length >= strV.length ? strK : strV;
        const short = strK.length < strV.length ? strK : strV;
        if (expected === orig && (actual === short || actual === getFullChosung(short))) { 
            isCorrect = true; 
        }
      });
    }

    if (isCorrect) {
      isProcessingRef.current = true; 
      setInputStatus('correct');
      if (statsRef.current.wrongIndices.has(currentBlankIdx)) {
          statsRef.current.wrongIndices.delete(currentBlankIdx);
      }
      statsRef.current.sessionCorrect = (statsRef.current.sessionCorrect || 0) + 1;
      setTimeout(forceAdvance, 150); 
    } else { 
      isProcessingRef.current = true; 
      setInputStatus('wrong'); 
      statsRef.current.wrongIndices.add(currentBlankIdx); 
      
      handleUpdateBalance(-10);
      addLog(`❌ 오답! (-10P)`);

      const nextIdx = blanks.findIndex((b, idx) => idx > currentBlankIdx && !b.correct);
      if (nextIdx !== -1) {
          setTimeout(forceAdvance, 600); 
      } else {
          isProcessingRef.current = false; 
      }
    }
  };
  
  const handleShowAnswer = () => {
    if (isProcessingRef.current) return;
    if (!blanks[currentBlankIdx]) return;
    if (inputStatus === 'wrong') return; 

    isProcessingRef.current = true;
    setInputStatus('wrong'); 
    statsRef.current.wrongIndices.add(currentBlankIdx);

    handleUpdateBalance(-10);
    addLog(`❌ 정답 확인 (-10P)`);

    const nextIdx = blanks.findIndex((b, idx) => idx > currentBlankIdx && !b.correct);
    if (nextIdx !== -1) {
        setTimeout(forceAdvance, 800);
    } else {
        isProcessingRef.current = false;
    }
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

  const minFilledCount = savedCards.length > 0 ? Math.min(...savedCards.map((card: any) => getExtendedStats(card.memo || "").filled || 0)) : 0;
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

  const memoizedCardContent = useMemo(() => {
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

    const titleSizes = ['text-[11px] sm:text-[12px]', 'text-[13px] sm:text-[14px]', 'text-[15px] sm:text-[16px]', 'text-[17px] sm:text-[18px]', 'text-[19px] sm:text-[22px]'];
    const bodySizes  = ['text-[10px] sm:text-[11px]', 'text-[12px] sm:text-[13px]', 'text-[14px] sm:text-[16px]', 'text-[17px] sm:text-[19px]', 'text-[20px] sm:text-[23px]'];
    const titleClass = titleSizes[fontSizeLevel - 1] || 'text-[15px] sm:text-[16px]';
    const bodyClass  = bodySizes[fontSizeLevel - 1] || 'text-[14px] sm:text-[16px]';

    const parts = restContent.split(/(\[.*?\]|##PAGE_BREAK##)/g).filter((p: string) => p !== '');
    let displayPage = 0; let tempGlobalBlank = 0; let tempPage = 0;
    const targetIdxForPage = inputMode === 'skimming' ? skimmingFocusIdx : currentBlankIdx;
    for (let part of parts) {
        if (part === '##PAGE_BREAK##') tempPage++;
        else if (part.startsWith('[') && part.endsWith(']')) {
            if (tempGlobalBlank === targetIdxForPage) { displayPage = tempPage; break; }
            tempGlobalBlank++;
        }
    }

    const getMarkerClass = (color?: string) => {
      if (color === 'purple' || color === 'yellow') {
        return 'mk-purple bg-purple-500/40 text-purple-100 border-b-[3px] border-purple-500 font-extrabold px-1 py-0.5 rounded-sm shadow-sm';
      }
      if (color === 'blue') {
        return 'mk-blue bg-sky-500/40 text-sky-100 border-b-[3px] border-sky-500 font-extrabold px-1 py-0.5 rounded-sm shadow-sm';
      }
      if (color === 'orange' || color === 'green' || color === 'pink') {
        return 'mk-orange bg-lime-500/40 text-lime-100 border-b-[3px] border-lime-500 font-extrabold px-1 py-0.5 rounded-sm shadow-sm';
      }
      return '';
    };

    const getBlankMarkerClass = (color?: string) => {
      if (color === 'purple' || color === 'yellow') {
        return 'ring-[3px] ring-purple-500 ring-offset-1 ring-offset-transparent shadow-[0_0_10px_rgba(168,85,247,0.8)]';
      }
      if (color === 'blue') {
        return 'ring-[3px] ring-sky-500 ring-offset-1 ring-offset-transparent shadow-[0_0_10px_rgba(14,165,233,0.8)]';
      }
      if (color === 'orange' || color === 'green' || color === 'pink') {
        return 'ring-[3px] ring-lime-500 ring-offset-1 ring-offset-transparent shadow-[0_0_10px_rgba(132,204,22,0.8)]';
      }
      return '';
    };

    const hasHighlights = Object.keys(cardHighlights).length > 0;
    const hasHiddenTokens = cardHiddenTokens.size > 0;
    // 💡 [렉 방지 핵심] 형광펜/숨김설정이 꺼져있고 이 카드에 저장된 형광펜/숨김도 없다면 일반 텍스트를 쪼개지 않고 고속 렌더링!
    const needTokenizePlainText = !!activeHighlighter || isStealthEditMode || hasHighlights || hasHiddenTokens;

    let renderPage = 0; 
    let bIdx = 0; 
    let lastBlankIdxOnPage = currentBlankIdx;

    // 현재 페이지의 아이템들을 플랫 리스트로 구성하여 '숨긴 구간'과 '바로 뒤의 트리거 글자'를 정확히 연결
    type PageTokenItem = {
      type: 'blank' | 'word' | 'space' | 'raw';
      tokenKey: string;
      text: string;
      blankIdx?: number;
      partIdx: number;
    };
    const pageItems: PageTokenItem[] = [];

    parts.forEach((part: string, i: number) => {
      if (part === '##PAGE_BREAK##') { renderPage++; return; }
      if (renderPage === displayPage) {
        if (part.startsWith('[') && part.endsWith(']')) {
          const targetBlankIdx = bIdx++;
          lastBlankIdxOnPage = targetBlankIdx;
          pageItems.push({
            type: 'blank',
            tokenKey: `blank-${targetBlankIdx}`,
            text: blanks[targetBlankIdx]?.answer || part.replace(/\[|\]/g, '').trim(),
            blankIdx: targetBlankIdx,
            partIdx: i
          });
        } else {
          if (!needTokenizePlainText) {
            pageItems.push({ type: 'raw', tokenKey: `raw-${i}`, text: part, partIdx: i });
          } else {
            const subTokens = part.split(/(\s+)/);
            subTokens.forEach((tok, tIdx) => {
              if (!tok) return;
              if (/^\s+$/.test(tok)) {
                pageItems.push({ type: 'space', tokenKey: `sp-${i}-${tIdx}`, text: tok, partIdx: i });
              } else {
                pageItems.push({ type: 'word', tokenKey: `${i}-${tIdx}`, text: tok, partIdx: i });
              }
            });
          }
        }
      } else if (part.startsWith('[') && part.endsWith(']')) {
        bIdx++;
      }
    });

    const contentToRender: any[] = [];
    let pendingHiddenKeys: string[] = [];
    let pendingHiddenBlanks: number[] = [];
    let remainingHiddenCount = 0;

    const renderSingleBlank = (item: PageTokenItem, isRevealedFromStealth: boolean) => {
      const targetBlankIdx = item.blankIdx!;
      const tokenKey = item.tokenKey;
      const isCorrect = blanks[targetBlankIdx]?.correct || isRevealedFromStealth;
      const isCurrent = targetBlankIdx === currentBlankIdx;
      const isWrong = statsRef.current.wrongIndices.has(targetBlankIdx);
      const blankMarkerColor = cardHighlights[tokenKey];
      const blankMarkerCls = getBlankMarkerClass(blankMarkerColor);
      const isStealthMarked = cardHiddenTokens.has(tokenKey);

      const stealthEditCls = isStealthEditMode && isStealthMarked
        ? 'ring-2 ring-fuchsia-400 bg-fuchsia-950/70 text-fuchsia-200 border-dashed border-fuchsia-400'
        : '';

      const handleBlankPointerDown = (e: React.PointerEvent) => {
        if (isStealthEditMode) {
          e.preventDefault();
          e.stopPropagation();
          isHighlightingDragRef.current = true;
          toggleStealthToken(tokenKey, false);
          return;
        }
        if (activeHighlighter) {
          e.preventDefault();
          e.stopPropagation();
          isHighlightingDragRef.current = true;
          applyHighlightToToken(tokenKey, false);
        }
      };

      const handleBlankPointerEnter = () => {
        if (!isHighlightingDragRef.current) return;
        if (isStealthEditMode) toggleStealthToken(tokenKey, true);
        else if (activeHighlighter) applyHighlightToToken(tokenKey, true);
      };

      // 숨김 설정 모드일 때는 어떤 빈칸이든 정답 텍스트와 숨김 배지를 선명하게 보여줌
      if (isStealthEditMode) {
        return (
          <span
            key={tokenKey}
            onPointerDown={handleBlankPointerDown}
            onPointerEnter={handleBlankPointerEnter}
            className={`inline-block font-bold mx-1 px-2 py-0.5 rounded border cursor-pointer select-none transition-all ${
              isStealthMarked
                ? 'bg-fuchsia-900/70 text-fuchsia-200 border-fuchsia-400 ring-2 ring-fuchsia-400 shadow-[0_0_10px_rgba(217,70,239,0.5)]'
                : 'bg-white/10 text-white/80 border-white/30 hover:border-fuchsia-400'
            }`}
          >
            {isStealthMarked ? `🙈 ${item.text}` : `[${item.text}]`}
          </span>
        );
      }

      // 스텔스에서 뒤 글자를 터치해 방금 찾아낸 빈칸은 황금빛/에메랄드 발견 배지로 표시
      if (isRevealedFromStealth) {
        return (
          <span
            key={tokenKey}
            className="inline-block font-extrabold mx-1 px-2 py-0.5 rounded bg-amber-500/30 text-amber-200 border border-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.5)] animate-in zoom-in-95 duration-200"
          >
            ✨ {item.text}
          </span>
        );
      }

      if (isCorrect) {
        return (
          <span
            key={tokenKey}
            onPointerDown={handleBlankPointerDown}
            onPointerEnter={handleBlankPointerEnter}
            className={`inline-block font-bold mx-1 px-1.5 py-0.5 rounded transition-all ${
              isWrong ? 'text-red-400 bg-red-900/20' : 'text-teal-400 bg-teal-900/20'
            } ${blankMarkerCls} ${stealthEditCls} ${activeHighlighter ? 'cursor-pointer select-none' : ''}`}
          >
            {item.text}
          </span>
        );
      } else if (inputMode === 'skimming' && targetBlankIdx >= currentBlankIdx) {
        const isSkimmingMarkedWrong = skimmingWrongs.has(targetBlankIdx);
        const isFocused = targetBlankIdx === skimmingFocusIdx;
        const isRevealed = targetBlankIdx <= skimmingFocusIdx;

        return (
          <span
            key={tokenKey}
            id={`skimming-blank-${targetBlankIdx}`}
            onPointerDown={handleBlankPointerDown}
            onPointerEnter={handleBlankPointerEnter}
            onClick={(e) => {
              e.stopPropagation();
              if (activeHighlighter || isStealthEditMode) return;
              setSkimmingFocusIdx(targetBlankIdx);
              if (!isSkimmingPaused) {
                setIsSkimmingPaused(true);
                setSkimmingWrongs(prev => new Set(prev).add(targetBlankIdx));
              } else {
                toggleSkimmingWrong(targetBlankIdx);
              }
            }}
            className={`inline-block mx-1 text-center font-bold border-b-2 rounded-sm transition-all cursor-pointer select-none align-middle ${blankMarkerCls} ${
              !isRevealed
                ? 'min-w-[40px] sm:min-w-[50px] h-4 sm:h-5 leading-none bg-white/5 border-white/20'
                : isSkimmingMarkedWrong
                  ? `px-1.5 py-0.5 leading-snug bg-red-900/50 text-red-300 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)] ${isFocused ? 'ring-2 ring-amber-400 scale-105' : ''}`
                  : `px-1.5 py-0.5 leading-snug ${isFocused ? 'bg-amber-500/30 text-amber-200 border-amber-400 ring-2 ring-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.5)] scale-105' : 'bg-teal-900/20 text-teal-400 border-teal-500/30'}`
            }`}
          >
            {isRevealed ? item.text : ''}
          </span>
        );
      } else if (isCurrent) {
        if (inputMode === 'typing') {
          return (
            <span id="active-blank" key="active-blank-input-fixed" className={`inline-block rounded-sm ${blankMarkerCls}`}>
              <InlineBlankInput inputStatus={inputStatus} expected={blanks[currentBlankIdx]?.answer || ""} abbrDict={globalDict.abbrs} hintLetter={hintLetter} onSubmit={handleSequentialInput}/>
            </span>
          );
        } else {
          return (
            <span
              id="active-blank"
              key="active-blank-input-fixed"
              onPointerDown={handleBlankPointerDown}
              onPointerEnter={handleBlankPointerEnter}
              className={`inline-block mx-1 px-3 py-1 text-center font-bold border-b-2 rounded-t-sm transition-all min-w-[3em] ${blankMarkerCls} ${
                inputStatus === 'wrong' ? 'bg-red-900/50 text-red-300 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : inputStatus === 'correct' ? 'bg-teal-900/50 text-teal-300 border-teal-500' : 'bg-amber-900/30 text-amber-400 border-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.3)]'
              }`}
            >
              {inputStatus === 'wrong' ? (blanks[currentBlankIdx]?.answer || '❌') : inputStatus === 'correct' ? '✅' : '?'}
            </span>
          );
        }
      } else {
        return (
          <span
            key={tokenKey}
            onPointerDown={handleBlankPointerDown}
            onPointerEnter={handleBlankPointerEnter}
            className={`inline-block min-w-[40px] sm:min-w-[50px] h-4 sm:h-5 bg-white/5 border-b border-white/20 mx-1 align-middle rounded-sm ${blankMarkerCls} ${activeHighlighter ? 'cursor-pointer' : ''}`}
          />
        );
      }
    };

    // 💡 페이지 아이템 순회: 숨긴 구간은 화면에서 완전히 생략하고, 바로 다음에 오는 첫 글자(단어/빈칸)에 터치 트리거를 심음!
    for (let idx = 0; idx < pageItems.length; idx++) {
      const item = pageItems[idx];

      if (item.type === 'raw') {
        contentToRender.push(<span key={item.tokenKey}>{item.text}</span>);
        continue;
      }

      if (item.type === 'space') {
        // 앞선 단어가 현재 숨겨진 상태라면 공백도 함께 숨겨서 문장이 자연스럽게 이어지도록 함
        if (pendingHiddenKeys.length > 0 && !isStealthEditMode) {
          continue;
        }
        contentToRender.push(<span key={item.tokenKey}>{item.text}</span>);
        continue;
      }

      const isCurrentlyHidden = !isStealthEditMode && cardHiddenTokens.has(item.tokenKey) && !sessionRevealedTokens.has(item.tokenKey);

      if (isCurrentlyHidden) {
        pendingHiddenKeys.push(item.tokenKey);
        if (item.type === 'blank' && item.blankIdx !== undefined) {
          pendingHiddenBlanks.push(item.blankIdx);
        }
        remainingHiddenCount++;
        continue;
      }

      // 만약 바로 앞에 숨겨진 구간(pendingHiddenKeys)이 대기 중이라면, 현재 이 글자(단어/빈칸)가 '숨긴 부분 바로 뒤의 트리거 글자'가 됨!
      const triggerKeys = pendingHiddenKeys.length > 0 ? [...pendingHiddenKeys] : null;
      const triggerBlanks = pendingHiddenBlanks.length > 0 ? [...pendingHiddenBlanks] : [];
      pendingHiddenKeys = [];
      pendingHiddenBlanks = [];

      if (item.type === 'blank') {
        const isRevealedStealth = cardHiddenTokens.has(item.tokenKey) && sessionRevealedTokens.has(item.tokenKey);
        const blankEl = renderSingleBlank(item, isRevealedStealth);

        if (triggerKeys) {
          contentToRender.push(
            <span
              key={`trigger-wrap-${item.tokenKey}`}
              onClick={(e) => {
                e.stopPropagation();
                handleRevealHiddenSegment(triggerKeys, triggerBlanks);
              }}
              className="inline-flex items-center cursor-pointer group"
              title="이 앞에 숨겨진 내용이 있습니다! 터치하여 정답 확인"
            >
              {showStealthHint && (
                <span className="inline-block mr-0.5 px-1 py-0.2 bg-amber-500 text-black font-extrabold text-[10px] rounded animate-bounce shadow-[0_0_8px_rgba(245,158,11,0.9)]">
                  ⚡여기
                </span>
              )}
              {blankEl}
            </span>
          );
        } else {
          contentToRender.push(blankEl);
        }
      } else if (item.type === 'word') {
        const hlColor = cardHighlights[item.tokenKey];
        const markerCls = getMarkerClass(hlColor);
        const isStealthMarked = cardHiddenTokens.has(item.tokenKey);
        const isRevealedStealth = isStealthMarked && sessionRevealedTokens.has(item.tokenKey);

        const stealthEditWordCls = isStealthEditMode && isStealthMarked
          ? 'bg-fuchsia-900/70 text-fuchsia-200 border border-dashed border-fuchsia-400 px-1 rounded-sm ring-1 ring-fuchsia-400'
          : isRevealedStealth
            ? 'bg-amber-500/30 text-amber-200 border-b-2 border-amber-400 px-1 rounded-sm font-extrabold animate-in zoom-in-95 duration-200'
            : '';

        contentToRender.push(
          <span
            key={item.tokenKey}
            onPointerDown={(e) => {
              if (isStealthEditMode) {
                e.preventDefault();
                isHighlightingDragRef.current = true;
                toggleStealthToken(item.tokenKey, false);
                return;
              }
              if (activeHighlighter) {
                e.preventDefault();
                isHighlightingDragRef.current = true;
                applyHighlightToToken(item.tokenKey, false);
              }
            }}
            onPointerEnter={() => {
              if (!isHighlightingDragRef.current) return;
              if (isStealthEditMode) toggleStealthToken(item.tokenKey, true);
              else if (activeHighlighter) applyHighlightToToken(item.tokenKey, true);
            }}
            onClick={(e) => {
              if (triggerKeys && !isStealthEditMode && !activeHighlighter) {
                e.stopPropagation();
                handleRevealHiddenSegment(triggerKeys, triggerBlanks);
              }
            }}
            className={`transition-all ${markerCls} ${stealthEditWordCls} ${
              activeHighlighter || isStealthEditMode || triggerKeys ? 'cursor-pointer select-none' : ''
            } ${showStealthHint && triggerKeys ? 'ring-2 ring-amber-400 bg-amber-500/20 rounded-sm px-0.5' : ''}`}
          >
            {showStealthHint && triggerKeys && (
              <span className="inline-block mr-0.5 px-1 py-0.2 bg-amber-500 text-black font-extrabold text-[10px] rounded animate-bounce shadow-[0_0_8px_rgba(245,158,11,0.9)]">
                ⚡
              </span>
            )}
            {isStealthEditMode && isStealthMarked ? `🙈${item.text}` : item.text}
          </span>
        );
      }
    }

    // 만약 문장 맨 마지막 끝부분이 숨겨져 있어서 뒤에 올 글자가 없는 경우에는 끝에 터치 마크를 배치
    if (pendingHiddenKeys.length > 0 && !isStealthEditMode) {
      const finalKeys = [...pendingHiddenKeys];
      const finalBlanks = [...pendingHiddenBlanks];
      contentToRender.push(
        <span
          key="trailing-hidden-trigger"
          onClick={() => handleRevealHiddenSegment(finalKeys, finalBlanks)}
          className={`inline-block ml-1 px-1.5 py-0.5 rounded text-xs font-bold cursor-pointer select-none transition-all ${
            showStealthHint
              ? 'bg-amber-500 text-black animate-bounce shadow-[0_0_8px_rgba(245,158,11,0.9)]'
              : 'text-white/30 hover:text-amber-400'
          }`}
          title="문장 끝에 숨겨진 구간이 있습니다. 터치하여 확인하세요."
        >
          {showStealthHint ? '⚡[끝 숨김 확인]' : '...'}
        </span>
      );
    }

    const hasSavedMemo = statsRef.current.text && statsRef.current.text.trim().length > 0;
    
    return (
      <div className="flex flex-col w-full h-[65vh] sm:h-[72vh] max-w-full overflow-hidden relative bg-[#0a0a0c] rounded-md border border-white/5 shadow-xl">
        
        {/* 1. 상단 고정 컨테이너 (제목 + 스텔스 숨김 설정 + 3색 형광 마커 + 글자크기/노트) */}
        <div className="shrink-0 flex flex-wrap justify-between items-center border-b border-white/10 px-3 py-2 sm:px-5 sm:py-2.5 w-full gap-2 bg-[#0a0a0c] z-20">
            <div className={`${titleColor} font-bold ${titleClass} leading-tight overflow-x-auto whitespace-nowrap custom-scrollbar flex-1 min-w-[120px] pb-0.5`}>
              {displayTitle}
            </div>
            
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap">
              
              {/* 🙈 스텔스 구간 숨기기 컨트롤 툴바 */}
              <div className="flex items-center gap-1 bg-white/5 px-1.5 py-1 rounded-sm border border-white/10">
                <button
                  onClick={(e) => {
                    e.currentTarget.blur();
                    setIsStealthEditMode(prev => {
                      const next = !prev;
                      if (next) setActiveHighlighter(null);
                      return next;
                    });
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-bold transition-all flex items-center gap-1 ${
                    isStealthEditMode
                      ? 'bg-fuchsia-600 text-white ring-2 ring-fuchsia-400 shadow-[0_0_10px_rgba(217,70,239,0.6)]'
                      : cardHiddenTokens.size > 0
                        ? 'bg-fuchsia-950/60 text-fuchsia-300 border border-fuchsia-500/40 hover:bg-fuchsia-900/70'
                        : 'bg-black/40 text-white/60 hover:text-white'
                  }`}
                >
                  <span>🙈 {isStealthEditMode ? '숨김설정 완료' : `구간숨김(${cardHiddenTokens.size})`}</span>
                </button>

                {!isStealthEditMode && remainingHiddenCount > 0 && (
                  <button
                    onClick={(e) => {
                      e.currentTarget.blur();
                      setShowStealthHint(prev => !prev);
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-bold transition-all ${
                      showStealthHint
                        ? 'bg-amber-500 text-black ring-2 ring-amber-300 shadow-md'
                        : 'bg-amber-950/60 text-amber-300 border border-amber-500/40 hover:bg-amber-900/70 animate-pulse'
                    }`}
                    title="숨겨진 위치가 어디인지 모르겠을 때 힌트 화살표 표시"
                  >
                    💡위치힌트({remainingHiddenCount})
                  </button>
                )}

                {cardHiddenTokens.size > 0 && (
                  <button
                    title="숨김 구간 전체 영구 해제"
                    onClick={(e) => { e.currentTarget.blur(); handleClearAllStealth(); }}
                    className="px-1 py-0.5 text-[10px] text-red-400 hover:text-red-300 font-bold"
                  >
                    🔓
                  </button>
                )}
              </div>

              {/* 🖍️ 초고시인성 3색 형광 마커 툴바 */}
              <div className="flex items-center gap-1 bg-white/5 px-1.5 py-1 rounded-sm border border-white/10">
                <button
                  title="보라색 형광펜"
                  onClick={(e) => { e.currentTarget.blur(); setIsStealthEditMode(false); setActiveHighlighter(p => p === 'purple' ? null : 'purple'); }}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all border-b-2 border-purple-500 ${
                    activeHighlighter === 'purple' ? 'bg-purple-600 text-white ring-2 ring-purple-400 scale-105 shadow-md' : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
                  }`}
                >
                  🟣
                </button>
                <button
                  title="파란색 형광펜"
                  onClick={(e) => { e.currentTarget.blur(); setIsStealthEditMode(false); setActiveHighlighter(p => p === 'blue' ? null : 'blue'); }}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all border-b-2 border-sky-500 ${
                    activeHighlighter === 'blue' ? 'bg-sky-600 text-white ring-2 ring-sky-400 scale-105 shadow-md' : 'bg-sky-500/20 text-sky-400 hover:bg-sky-500/30'
                  }`}
                >
                  🔵
                </button>
                <button
                  title="연두색 형광펜"
                  onClick={(e) => { e.currentTarget.blur(); setIsStealthEditMode(false); setActiveHighlighter(p => p === 'orange' ? null : 'orange'); }}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all border-b-2 border-lime-500 ${
                    activeHighlighter === 'orange' ? 'bg-lime-600 text-white ring-2 ring-lime-400 scale-105 shadow-md' : 'bg-lime-500/20 text-lime-400 hover:bg-lime-500/30'
                  }`}
                >
                  🟢
                </button>
                <button
                  title="형광펜 부분 지우개"
                  onClick={(e) => { e.currentTarget.blur(); setIsStealthEditMode(false); setActiveHighlighter(p => p === 'eraser' ? null : 'eraser'); }}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all ${
                    activeHighlighter === 'eraser' ? 'bg-zinc-700 text-white ring-2 ring-zinc-400 scale-105' : 'bg-black/40 text-white/60 hover:text-white'
                  }`}
                >
                  지우개
                </button>
                {hasHighlights && (
                  <button
                    title="형광펜 전체 초기화"
                    onClick={(e) => { e.currentTarget.blur(); handleClearAllHighlights(); }}
                    className="px-1 py-0.5 text-[10px] text-red-400 hover:text-red-300 font-bold"
                  >
                    🗑️
                  </button>
                )}
              </div>

              {/* 글자 크기 조절 */}
              <div className="flex items-center gap-1 bg-white/5 px-1 sm:px-2 py-1 rounded-sm border border-white/10">
                 <button onClick={(e) => { e.currentTarget.blur(); setFontSizeLevel(p => Math.max(1, p - 1)); }} className="px-1.5 py-0.5 bg-black/40 hover:bg-black/60 rounded text-white/60 text-xs transition-colors">-</button>
                 <span className="text-[10px] sm:text-[11px] font-mono text-white/80 w-3 text-center">{fontSizeLevel}</span>
                 <button onClick={(e) => { e.currentTarget.blur(); setFontSizeLevel(p => Math.min(5, p + 1)); }} className="px-1.5 py-0.5 bg-black/40 hover:bg-black/60 rounded text-white/60 text-xs transition-colors">+</button>
              </div>

              {/* 암기 노트 토글 */}
              <button onClick={(e) => { e.currentTarget.blur(); setIsMemoOpen(!isMemoOpen); }} className="px-2 py-1 bg-teal-900/30 text-teal-400 border border-teal-500/50 rounded text-[10px] sm:text-[11px] font-bold shrink-0 hover:bg-teal-900/50 transition-all shadow-md flex items-center gap-1">
                <span>{isMemoOpen ? '노트 닫기 ✕' : '📝 암기 노트'}</span>
                {!isMemoOpen && hasSavedMemo && <span className="text-teal-300 text-[8px] animate-pulse">●</span>}
              </button>
            </div>
        </div>

        {/* 숨김 구간 설정 모드 안내 배너 */}
        {isStealthEditMode && (
          <div className="shrink-0 bg-fuchsia-950/90 border-b border-fuchsia-500/50 px-4 py-1.5 flex justify-between items-center text-[11px] text-fuchsia-100">
            <span>
              🙈 <b>숨김 구간 설정 모드</b> — 숨기고 싶은 <b>[빈칸]</b>이나 <b>단어</b>를 터치/드래그하세요. (다시 터치하면 영구 숨김 해제됨)
            </span>
            <button onClick={() => setIsStealthEditMode(false)} className="text-[10px] bg-fuchsia-600 hover:bg-fuchsia-500 text-white px-2.5 py-0.5 rounded font-bold shadow">
              설정 완료 ✓
            </button>
          </div>
        )}

        {/* 실전 풀이 중 숨겨진 구간이 있을 때 안내 배너 */}
        {!isStealthEditMode && remainingHiddenCount > 0 && (
          <div className="shrink-0 bg-amber-950/60 border-b border-amber-500/30 px-4 py-1 flex justify-between items-center text-[11px] text-amber-200">
            <span>
              🕵️ 현재 문장에 <b>{remainingHiddenCount}개</b>의 숨겨진 구간이 있습니다. <b>숨겨진 부분 바로 뒤의 글자</b>를 터치하면 정답이 나타납니다!
            </span>
            <button
              onClick={() => setShowStealthHint(p => !p)}
              className="text-[10px] bg-amber-500/20 hover:bg-amber-500/40 border border-amber-400/50 text-amber-200 px-2 py-0.5 rounded font-bold"
            >
              {showStealthHint ? '힌트 숨기기' : '💡 위치 힌트 보기'}
            </button>
          </div>
        )}

        {/* 형광펜 모드 활성화 시 안내 배너 */}
        {activeHighlighter && !isStealthEditMode && (
          <div className="shrink-0 bg-indigo-950/80 border-b border-indigo-500/40 px-4 py-1 flex justify-between items-center text-[11px] text-indigo-200">
            <span>
              🖍️ <b>{activeHighlighter === 'purple' ? '🟣 보라색 형광펜' : activeHighlighter === 'blue' ? '🔵 파란색 형광펜' : activeHighlighter === 'orange' ? '🟢 연두색 형광펜' : '🧹 지우개'}</b> 켜짐 — 본문 단어나 빈칸을 터치/드래그하여 칠하세요!
            </span>
            <button onClick={() => setActiveHighlighter(null)} className="text-[10px] bg-white/10 hover:bg-white/20 px-2 py-0.5 rounded font-bold">
              펜 끄기 ✕
            </button>
          </div>
        )}

        {/* 2. 가운데 영역: 좌측 본문 스크롤 + 우측 메모 컨테이너 */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden bg-[#0a0a0c]">
            
            {/* 좌측: 조항 본문 (독립 스크롤) */}
            <div className="flex-1 min-h-0 overflow-y-scroll scroll-smooth custom-scrollbar px-3 py-3 sm:py-4 md:px-6 pb-8">
                <div className={`whitespace-pre-wrap leading-relaxed ${bodyClass} font-serif break-all break-words w-full max-w-full text-white/90`}>
                    {contentToRender}
                </div>
            </div>

            {/* 우측: 별도 분리된 메모 컨테이너 (토글 시 표시) */}
            {isMemoOpen && (
              <div className="w-full md:w-80 lg:w-96 h-48 md:h-full shrink-0 border-t md:border-t-0 md:border-l border-teal-500/30 bg-teal-950/10 flex flex-col p-3 sm:p-4 animate-in fade-in duration-200">
                 <div className="flex justify-between items-center mb-2 pb-1.5 border-b border-teal-500/20 shrink-0">
                    <span className="text-xs font-bold text-teal-400 flex items-center gap-1">
                      📌 나만의 암기 노트
                    </span>
                    <span className="text-[10px] text-teal-500/70 font-mono">자동 저장됨</span>
                 </div>
                 <textarea 
                    key={`memo-${activeCard.id}`}
                    defaultValue={statsRef.current.text || ""} 
                    placeholder="이 조항의 핵심 키워드, 두문자, 헷갈리는 포인트를 자유롭게 기록하세요. (줄바꿈 가능)" 
                    onChange={(e) => {
                        statsRef.current.text = e.target.value;
                    }}
                    onBlur={(e) => { 
                        statsRef.current.text = e.target.value; 
                        const exStats = getExtendedStats(activeCard.memo);
                        exStats.text = e.target.value;
                        exStats.filled = statsRef.current.filled;
                        exStats.wrongIndices = Array.from(statsRef.current.wrongIndices);
                        exStats.highlights = statsRef.current.highlights;
                        exStats.hiddenTokens = Array.from(statsRef.current.hiddenTokens);
                        handleUpdateMemoBackground(activeCard.id, JSON.stringify(exStats)); 
                    }} 
                    className="flex-1 w-full text-[12px] sm:text-[13px] leading-relaxed text-teal-200 bg-black/40 p-2.5 sm:p-3 rounded border border-teal-500/30 outline-none focus:border-teal-400 transition-all resize-none custom-scrollbar shadow-inner font-sans" 
                 />
              </div>
            )}
        </div>

        {/* 3. 하단 별도 고정 컨테이너 (스크롤 제외) */}
        <div className="shrink-0 w-full bg-[#0d0d0f] border-t border-white/10 p-2 sm:p-3 z-30 flex flex-col gap-1.5 sm:gap-3 shadow-[0_-10px_20px_rgba(0,0,0,0.5)]">
            
            {inputMode === 'skimming' && currentBlankIdx < blanks.length && (
              <div className="flex flex-col gap-1.5 sm:gap-2 w-full p-1.5 sm:p-2.5 bg-black/20 rounded border border-white/5 shadow-inner">
                <div className="w-full text-[10px] sm:text-[11px] text-amber-400 mb-0.5 sm:mb-1 font-bold flex items-center justify-between">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={isSkimmingPaused ? "" : "animate-pulse"}>{isSkimmingPaused ? '⏸️ 일시정지됨' : '▶️ 1초마다 자동 진행 중...'}</span> 
                    <span className="text-white/60 font-normal hidden sm:inline">| ▲: 멈춤 / ▼: 재개 / Space: 모름(오답)+멈춤</span>
                  </div>
                  <span className="text-[10px] font-mono text-white/50 shrink-0">{skimmingFocusIdx + 1} / {blanks.length}</span>
                </div>
                <div className="flex gap-2 w-full">
                  <button 
                    onClick={(e) => {
                       e.currentTarget.blur();
                       if (!isSkimmingPaused) {
                         setIsSkimmingPaused(true);
                         setSkimmingWrongs(prev => new Set(prev).add(skimmingFocusIdx));
                       } else {
                         setIsSkimmingPaused(false);
                         const nextIdx = blanks.findIndex((b, idx) => idx > skimmingFocusIdx && !b.correct);
                         if (nextIdx !== -1) setSkimmingFocusIdx(nextIdx);
                         else handleSkimmingSubmit(blanks.length - 1);
                       }
                    }} 
                    className={`flex-1 py-2 sm:py-3.5 border text-white text-[12px] sm:text-[14px] font-bold rounded shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 ${
                      isSkimmingPaused 
                        ? 'bg-teal-600 hover:bg-teal-500 border-teal-400 animate-pulse' 
                        : 'bg-red-900/60 hover:bg-red-800 border-red-500/50 text-red-200'
                    }`}
                  >
                    {isSkimmingPaused ? '▶️ 다시 진행하기 (▼ 또는 Space)' : '⏸️ 모름 체크 및 일시정지 (Space)'}
                  </button>
                  <button 
                    onClick={(e) => {
                       e.currentTarget.blur();
                       handleSkimmingSubmit(blanks.length - 1);
                    }} 
                    className="px-3 sm:px-4 py-2 sm:py-3.5 bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-white/70 text-[11px] sm:text-[13px] font-bold rounded shadow-md active:scale-95 transition-all shrink-0"
                  >
                    조항 스킵 ▶
                  </button>
                </div>
              </div>
            )}

            {inputMode === 'touch' && activeTouchCandidates.length > 0 && (
              <div className="flex flex-col gap-1.5 sm:gap-2 w-full max-h-[22vh] overflow-y-auto custom-scrollbar p-1.5 sm:p-2.5 bg-black/20 rounded border border-white/5 shadow-inner">
                <div className="w-full text-[10px] sm:text-[11px] text-teal-400 mb-0.5 sm:mb-1 font-bold flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className="animate-pulse">👆</span> 터치하여 정답을 선택하세요
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-1.5 sm:gap-2 w-full">
                   {activeTouchCandidates.map((ans, idx) => (
                     <button
                       key={idx}
                       onClick={(e) => {
                          e.currentTarget.blur();
                          handleSequentialInput(ans);
                       }}
                       className="relative px-2 py-2 sm:py-4 bg-black/40 border border-white/20 rounded text-[11px] sm:text-[15px] font-bold text-white/90 hover:bg-teal-900/40 hover:border-teal-500 hover:text-teal-300 transition-all active:scale-95 shadow-md flex items-center justify-center break-keep leading-tight"
                     >
                       {idx < 4 && <span className="absolute top-1 left-1.5 text-[10px] text-teal-500/60 font-mono">[{idx+1}]</span>}
                       {getFullChosung(ans)}
                     </button>
                   ))}
                </div>

                <button 
                  onClick={(e) => {
                     e.currentTarget.blur();
                     handleSequentialInput('모름(강제오답)');
                  }} 
                  className="w-full mt-0.5 sm:mt-1 py-1.5 sm:py-2.5 bg-red-900/40 hover:bg-red-900/60 border border-red-500/30 text-red-400 text-[11px] sm:text-[13px] font-bold rounded-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  🤔 모름 (오답 처리 후 다음 빈칸으로 넘어가기) <span className="text-[10px] text-red-500/60 font-mono ml-1">[0]</span>
                </button>
              </div>
            )}
            
            {inputStatus === 'wrong' && currentBlankIdx === blanks.length - 1 && inputMode !== 'skimming' ? (
              <button 
                onClick={(e) => {
                  e.currentTarget.blur();
                  if (!isProcessingRef.current) {
                     isProcessingRef.current = true;
                     forceAdvance();
                  }
                }} 
                className="w-full py-2 sm:py-3 bg-red-600/80 hover:bg-red-500 text-white text-[12px] sm:text-[15px] font-bold rounded shadow-[0_0_15px_rgba(220,38,38,0.5)] animate-pulse border border-red-400 flex justify-center items-center gap-2"
              >
                <span>다음 조항으로 넘어가기 ▶</span>
              </button>
            ) : (
              <div className="flex justify-between items-center w-full gap-1.5 sm:gap-2 flex-wrap">
                <button 
                  onClick={(e) => {
                     e.currentTarget.blur();
                     setInputMode(prev => prev === 'typing' ? 'touch' : prev === 'touch' ? 'skimming' : 'typing');
                  }} 
                  className="px-2 sm:px-3 py-1.5 sm:py-2.5 bg-zinc-900/80 text-zinc-300 border border-zinc-500/50 rounded text-[10px] sm:text-xs font-bold flex-1 hover:bg-zinc-800 transition-all shadow-md flex items-center justify-center gap-2"
                >
                  {inputMode === 'typing' ? '👆 터치 모드로 전환' : inputMode === 'touch' ? '⚡ 스키밍 모드로 전환' : '⌨️ 타이핑 모드로 전환'}
                </button>
                <button 
                  id="show-answer-btn"
                  onClick={(e) => {
                     e.currentTarget.blur();
                     handleShowAnswer();
                  }} 
                  className="px-2 sm:px-3 py-1.5 sm:py-2.5 bg-red-900/30 text-red-400 border border-red-500/50 rounded text-[10px] sm:text-[11px] font-bold shrink-0 hover:bg-red-900/50 transition-all shadow-md"
                >
                  정답 보기(스킵)
                </button>
              </div>
            )}
        </div>
      </div>
    );
  }, [activeCard, blanks, currentBlankIdx, inputStatus, isMemoOpen, isListening, globalDict.abbrs, hintLetter, inputMode, skimmingWrongs, skimmingFocusIdx, isSkimmingPaused, touchCandidates, fontSizeLevel, activeTouchCandidates, activeHighlighter, cardHighlights, isStealthEditMode, cardHiddenTokens, sessionRevealedTokens, showStealthHint]);

  const renderContent = React.useCallback(() => memoizedCardContent, [memoizedCardContent]);

  const handleOpenDict = (tab: 'abbr' | 'include' | 'stop' | 'group') => {
    setDictTab(tab);
    if (window.innerWidth >= 1024) { 
      setIsSidebarOpen(true);
    } else { 
      setIsDictModalOpen(true);
    }
  };

  const handleTxtFileUploadForGroups = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !safeAddress) return;

    const fd = new FormData();
    fd.append("file", file);
    fd.append("wallet_address", safeAddress);

    addLog("▶️ 대량 오답쌍 텍스트 파일 업로드 중...");
    try {
      const res = await fetch("https://api.blankd.top/api/upload-wrong-answers", {
        method: "POST",
        body: fd
      });
      if (res.ok) {
        addLog("✅ 대량 오답쌍 추가 완료! 데이터를 서버에서 동기화합니다.");
        await loadAllData(true);
        setTempKey(""); 
      } else {
        addLog("🚨 업로드 처리 중 문제가 발생했습니다.");
      }
    } catch (err) {
      addLog("🚨 네트워크 에러로 업로드에 실패했습니다.");
    }
  };

  const handleAddDictItem = () => {
    if (dictTab === 'abbr' && tempKey && tempValue) {
      const k = tempKey.trim(); const v = tempValue.trim();
      const orig = k.length >= v.length ? k : v; const short = k.length < v.length ? k : v;
      saveGlobalDict({ ...globalDict, abbrs: { ...globalDict.abbrs, [short]: orig } });
      setTempKey(""); setTempValue("");
    } else if (dictTab === 'stop' || dictTab === 'include') {
      if (!tempKey) return;
      const words = tempKey.split(',').map(w => w.trim()).filter(Boolean);
      const targetArray = dictTab === 'stop' ? globalDict.stopwords : globalDict.inclusions;
      saveGlobalDict({ ...globalDict, [dictTab === 'stop' ? 'stopwords' : 'inclusions']: Array.from(new Set([...targetArray, ...words])) });
      setTempKey("");
    } else if (dictTab === 'group' && tempKey) {
      const words = tempKey.split(',').map(w => w.trim()).filter(Boolean);
      if (words.length > 1) {
          saveGlobalDict({ ...globalDict, groups: [...(globalDict.groups || []), words] });
      } else {
          alert("쉼표로 구분하여 최소 2개 이상의 단어를 입력해주세요.");
      }
      setTempKey("");
    }
  };

  const memoizedTabs = useMemo(() => {
    return (
      <>
        <div className={activeTab === 'progress' ? 'block' : 'hidden'}>
          <DashboardTab categories={categories} savedCards={savedCards} setActiveTab={setActiveTab} setExpandedId={setExpandedId} setActiveCard={setActiveCard} goalBalance={goalBalance} handleUpdateBalance={handleUpdateBalance} activityLog={activityLog} claimedRewards={claimedRewards} setClaimedRewards={setClaimedRewards} safeAddress={safeAddress} loadAllData={loadAllData} isOffline={isOffline} />
        </div>
        <div className={activeTab === 'create' ? 'block' : 'hidden'}>
          <CraftTab categories={categories} savedCards={savedCards} colCount={colCount} viewMode={viewMode} useAiRecommend={useAiRecommend} safeAddress={safeAddress} lawFile={lawFile} setLawFile={setLawFile} uploadLaw={uploadLaw} handleMakeBlankCard={handleMakeBlankCard} handleSplitCategory={handleSplitCategory} addLog={addLog} expandedId={expandedId} setExpandedId={setExpandedId} handleDeleteCategory={async (id: number) => { if(confirm('삭제하시겠습니까?')){ await fetch("https://api.blankd.top/api/delete-category", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_address: safeAddress, id }) }); loadAllData(); } }} globalDict={globalDict} saveGlobalDict={saveGlobalDict} />
        </div>
        <div className={activeTab === 'enhance' ? 'block' : 'hidden'}>
          <EnhanceTab safeAddress={safeAddress} loadAllData={loadAllData} categories={categories} savedCards={savedCards} colCount={colCount} viewMode={viewMode} setActiveCard={setActiveCard} setActiveTab={setActiveTab} setExpandedId={setExpandedId} globalDict={globalDict} />
        </div>
        <div className={activeTab === 'record' ? 'block' : 'hidden'}>
          <RecordTab 
            savedCards={savedCards} 
            goalBalance={goalBalance} 
            handleUpdateBalance={handleUpdateBalance} 
            loadAllData={loadAllData} 
            safeAddress={safeAddress} 
            colCount={colCount} 
            setActiveCard={(card: any, mode?: string) => {
                if (!card) return setActiveCard(null);
                const stats = getExtendedStats(card.memo);
                const lastWrong = Array.from(stats.wrongIndices || []);
                if (mode !== 'all' && lastWrong.length > 0) {
                    setActiveCard({ ...card, _targetWrongIndices: lastWrong, _isTargetMode: true });
                } else {
                    setActiveCard(card);
                }
             }} 
          />
        </div>
        <div className={activeTab === 'market' ? 'block' : 'hidden'}>
          <MarketTab safeAddress={safeAddress} goalBalance={goalBalance} handleUpdateBalance={handleUpdateBalance} loadAllData={loadAllData} savedCards={savedCards} />
        </div>
        <div className={activeTab === 'exam' ? 'block' : 'hidden'}>
          <ExamTab walletAddress={safeAddress} address={safeAddress} />
        </div>
        <div className={activeTab === 'settings' ? 'block' : 'hidden'}>
          <MypageTab safeAddress={safeAddress} enokiFlow={enokiFlow} zkLogin={zkLogin} useAiRecommend={useAiRecommend} setUseAiRecommend={setUseAiRecommend} studyMode={studyMode} setStudyMode={setStudyMode} globalDict={globalDict} saveGlobalDict={saveGlobalDict} loadAllData={loadAllData} theme={theme} setTheme={setTheme}/>
        </div>
      </>
    );
  }, [activeTab, categories, savedCards, colCount, viewMode, useAiRecommend, safeAddress, lawFile, expandedId, enokiFlow, zkLogin, studyMode, setStudyMode, globalDict, theme, goalBalance, activityLog, claimedRewards, isOffline]);

  const renderDictionaryUI = (isMobile: boolean) => (
    <div className={`flex flex-col w-full h-full ${isMobile ? 'bg-[#0a0a0c] border border-white/10 p-5 sm:p-6 rounded-sm' : 'bg-[#08080a]/80 border border-white/10 p-5 rounded-sm shadow-xl backdrop-blur-sm'}`}>
      <div className="flex justify-between items-start mb-6">
        <div className="flex gap-4 border-b border-white/10 w-full pt-1">
          <button onClick={() => setDictTab('abbr')} className={`text-[11px] sm:text-[13px] font-bold tracking-wide transition-all px-1 pb-2 -mb-[1px] ${dictTab === 'abbr' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-white/40 hover:text-white/70'}`}>⚡ 약어</button>
          <button onClick={() => setDictTab('include')} className={`text-[11px] sm:text-[13px] font-bold tracking-wide transition-all px-1 pb-2 -mb-[1px] ${dictTab === 'include' ? 'text-teal-400 border-b-2 border-teal-400' : 'text-white/40 hover:text-white/70'}`}>✅ 포함</button>
          <button onClick={() => setDictTab('stop')} className={`text-[11px] sm:text-[13px] font-bold tracking-wide transition-all px-1 pb-2 -mb-[1px] ${dictTab === 'stop' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-white/40 hover:text-white/70'}`}>❌ 제외</button>
          <button onClick={() => setDictTab('group')} className={`text-[11px] sm:text-[13px] font-bold tracking-wide transition-all px-1 pb-2 -mb-[1px] ${dictTab === 'group' ? 'text-rose-400 border-b-2 border-rose-400' : 'text-white/40 hover:text-white/70'}`}>🔗 오답 그룹</button>
        </div>
        <button onClick={() => isMobile ? setIsDictModalOpen(false) : setIsSidebarOpen(false)} className="text-white/40 hover:text-white ml-4 text-xs font-bold bg-white/5 hover:bg-white/10 px-2 py-1 rounded-sm transition-all flex items-center gap-1 shrink-0">
          {isMobile ? '✕ 닫기' : '▶ 닫기'}
        </button>
      </div>
      
      <div className="flex gap-2 mb-5 shrink-0">
        <input type="text" value={tempKey} onChange={(e) => setTempKey(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAddDictItem(); }} placeholder={dictTab === 'abbr' ? "원래 정답 (예: 행정안전부장관)" : dictTab === 'group' ? "보건복지부장관, 공단, 요양기관 (쉼표 구분)" : "단어 입력 (쉼표 구분)"} className="flex-1 bg-black/50 border border-white/30 transition-colors w-full min-w-0" />
        {dictTab === 'abbr' && (
          <input type="text" value={tempValue} onChange={(e) => setTempValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAddDictItem(); }} placeholder="약어 (예: 행안부장관)" className="flex-1 bg-black/50 border border-white/10 p-2 text-xs sm:text-sm text-white/80 outline-none rounded-sm focus:border-indigo-500/50 transition-colors w-full min-w-0" />
        )}
        <button onClick={handleAddDictItem} className="px-3 sm:px-4 bg-white/5 text-white/80 border border-white/10 text-xs font-bold rounded-sm hover:bg-white/10 transition-colors shrink-0">등록</button>
      </div>

      {dictTab === 'group' && (
        <div className="flex items-center gap-2 mb-4 shrink-0">
          <label className="flex-1 cursor-pointer bg-rose-900/30 border border-rose-500/50 text-rose-300 px-3 py-2 text-[11px] sm:text-xs font-bold rounded-sm hover:bg-rose-900/50 transition-colors text-center shadow-inner">
            📄 텍스트 파일(.txt)로 오답쌍 대량 추가하기
            <input type="file" accept=".txt" className="hidden" onChange={handleTxtFileUploadForGroups} />
          </label>
        </div>
      )}
      
      <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-2 min-h-[160px]">
        {dictTab === 'abbr' && Object.entries(globalDict.abbrs || {}).map(([k, v]) => {
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
        {(dictTab === 'stop' || dictTab === 'include') && (dictTab === 'stop' ? globalDict.stopwords : globalDict.inclusions).map((word: string) => (
            <div key={word} className="flex justify-between items-center text-xs sm:text-sm border-b border-white/5 pb-2">
              <span className={`px-2 py-0.5 rounded-sm border ${dictTab === 'stop' ? 'text-amber-400 bg-amber-900/10 border-amber-500/20' : 'text-teal-400 bg-teal-900/10 border-teal-500/20'}`}>{word}</span>
              <button onClick={() => {
                const targetArray = (dictTab === 'stop' ? globalDict.stopwords : globalDict.inclusions).filter((w: string) => w !== word);
                saveGlobalDict({ ...globalDict, [dictTab === 'stop' ? 'stopwords' : 'inclusions']: targetArray });
              }} className="text-white/20 hover:text-red-400 text-xs px-2 transition-colors">✕</button>
            </div>
        ))}
        {dictTab === 'group' && (globalDict.groups || []).map((group, idx) => (
            <div key={idx} className="flex justify-between items-center text-xs sm:text-sm border-b border-white/5 pb-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                {group.map((w, wIdx) => (
                   <span key={wIdx} className="bg-rose-900/20 text-rose-300 px-1.5 py-0.5 rounded border border-rose-500/30 text-[10px] font-bold">{w}</span>
                ))}
              </div>
              <button onClick={() => {
                const next = [...(globalDict.groups || [])];
                next.splice(idx, 1);
                saveGlobalDict({...globalDict, groups: next});
              }} className="text-white/20 hover:text-red-400 text-xs px-2 transition-colors shrink-0">✕</button>
            </div>
        ))}

        {((dictTab === 'abbr' && Object.keys(globalDict.abbrs || {}).length === 0) || (dictTab === 'stop' && (globalDict.stopwords || []).length === 0) || (dictTab === 'include' && (globalDict.inclusions || []).length === 0) || (dictTab === 'group' && (globalDict.groups || []).length === 0)) && (
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
        .text-white\\/80, .text-white\\/90 { color: #1f2937 !important; font-weight: 700; }
        .text-white\\/95, .text-white { color: #111827 !important; font-weight: 700; }
        .text-\\[\\#d1d1d1\\] { color: #111827 !important; font-weight: 700; }
        
        .bg-\\[\\#08080a\\] { background-color: #ffffff !important; border-color: #9ca3af !important; }
        .bg-\\[\\#08080a\\]\\/80 { background-color: rgba(255, 255, 255, 0.95) !important; backdrop-filter: blur(8px); }
        .bg-\\[\\#0a0a0c\\] { background-color: #ffffff !important; box-shadow: 0 1px 4px rgba(0,0,0,0.05); border-color: #d1d5db !important; }
        .bg-\\[\\#0d0d0f\\] { background-color: #f3f4f6 !important; }
        
        .bg-black\\/20, .bg-black\\/30, .bg-black\\/40, .bg-black\\/50, .bg-black\\/60 { 
          background-color: #f9fafb !important; color: #111827 !important; border-color: #9ca3af !important; 
        }
        .bg-white\\/5, .bg-white\\/10 { 
          background-color: #f3f4f6 !important; border-color: #9ca3af !important; color: #111827 !important; 
        }
        
        .border-white\\/5, .border-white\\/10, .border-white\\/20, .border-white\\/30 { 
          border-color: #6b7280 !important; 
        }

        /* 화이트 테마용 3색 형광펜 초고시인성 스타일 */
        .mk-purple { background-color: #e9d5ff !important; color: #581c87 !important; border-bottom: 3px solid #9333ea !important; font-weight: 900 !important; }
        .mk-blue { background-color: #bae6fd !important; color: #0c4a6e !important; border-bottom: 3px solid #0284c7 !important; font-weight: 900 !important; }
        .mk-orange { background-color: #d9f99d !important; color: #365314 !important; border-bottom: 3px solid #65a30d !important; font-weight: 900 !important; }

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
        <div className="w-full max-w-[1600px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3 px-2 sm:px-4 md:px-8">
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
              <button onClick={() => handleOpenDict('stop')} className="text-[10px] bg-amber-900/30 text-amber-400 border border-amber-500/40 px-2 py-1 rounded-sm hover:bg-amber-900/50 transition-colors">제외/포함</button>
              <button onClick={() => handleOpenDict('abbr')} className="text-[10px] bg-indigo-900/30 text-indigo-400 border border-indigo-500/40 px-2 py-1 rounded-sm hover:bg-indigo-900/50 transition-colors">약어 채점</button>
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
                    const offBal = parseInt(localStorage.getItem(`blankd_off_bal_${safeAddress}`) || '0', 10);
                    const offActivityLog = JSON.parse(localStorage.getItem(`blankd_activity_log_${safeAddress}`) || '{}');
                    const offClaimedRewards = JSON.parse(localStorage.getItem(`blankd_claimed_rewards_${safeAddress}`) || '{}');
                    await fetch("https://api.blankd.top/api/update-balance", {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ wallet_address: safeAddress, balance: offBal, activity_log: offActivityLog, claimed_rewards: offClaimedRewards })
                    });
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
        <nav className="border-b border-white/5 bg-black/40 py-1.5 overflow-x-auto whitespace-nowrap custom-scrollbar w-full mb-6">
          <div className="w-full max-w-[1600px] mx-auto flex items-center justify-start gap-1 sm:gap-2 px-2 sm:px-4 md:px-8">
            {[{ id: 'progress', label: '진행상황' }, { id: 'create', label: '만들기' }, { id: 'enhance', label: '채우기' }, { id: 'record', label: '기록실' }, { id: 'market', label: '마켓' }, { id: 'exam', label: '모의고사' }, { id: 'settings', label: '설정' }].map(tab => (
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
        <div className="w-full max-w-[1600px] mx-auto flex gap-4 sm:gap-6 px-2 sm:px-4 lg:px-8 items-start pb-10 transition-all duration-300">
          <main className="flex-1 w-full min-w-0 transition-all duration-300">
            {memoizedTabs}
          </main>
          
          {isSidebarOpen ? (
            <aside className="hidden lg:flex flex-col shrink-0 sticky top-[100px] h-[calc(100vh-140px)] w-[320px] xl:w-[400px] transition-all duration-300 animate-in slide-in-from-right-8">
              {renderDictionaryUI(false)}
            </aside>
          ) : (
            <aside className="hidden lg:flex flex-col shrink-0 sticky top-[100px] h-[calc(100vh-140px)] w-[40px] items-center justify-start transition-all duration-300 animate-in fade-in">
              <button onClick={() => setIsSidebarOpen(true)} className="w-full h-32 bg-white/5 border border-white/10 hover:bg-white/10 rounded-sm flex items-center justify-center text-white/50 hover:text-white transition-colors flex-col gap-2 shadow-md">
                <span className="text-xs">◀</span>
                <span className="text-[10px] font-bold" style={{ writingMode: 'vertical-rl' }}>사전 열기</span>
              </button>
            </aside>
          )}
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
        <div className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh] relative">
            {renderDictionaryUI(true)}
          </div>
        </div>
      )}

      {activeCard && (
        <CardModal 
          activeCard={activeCard} 
          renderContent={renderContent} 
          onClose={handleCloseModal} 
          goalBalance={goalBalance}
          handleUseItem={handleUseItem}
        />
      )}
    </div>
  );
}

export default function App() { 
  return (
    <GlobalErrorBoundary>
      <MainApp />
    </GlobalErrorBoundary>
  ); 
}
