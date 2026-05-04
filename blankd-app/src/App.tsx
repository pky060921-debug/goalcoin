import React, { useState, useEffect } from "react";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { useEnokiFlow, useZkLogin } from "@mysten/enoki/react";
import { api } from "./services/api";
import { CardModal } from "./components/CardModal";
import { DashboardTab } from "./tabs/DashboardTab";
import { CraftTab } from "./tabs/CraftTab";
import { EnhanceTab } from "./tabs/EnhanceTab";
import { MypageTab } from "./tabs/MypageTab";

function MainApp() {
  const enokiFlow = useEnokiFlow();
  const zkLogin = useZkLogin();
  const suiWalletAccount = useCurrentAccount();
  const safeAddress = suiWalletAccount?.address || zkLogin?.address || "";
  const isLoggedIn = safeAddress.length > 0;

  const [activeTab, setActiveTab] = useState('dashboard');
  const [categories, setCategories] = useState([]);
  const [savedCards, setSavedCards] = useState([]);
  const [activeCard, setActiveCard] = useState<any>(null);
  
  // 글로벌 UI 상태
  const [viewMode, setViewMode] = useState('all');
  const [colCount, setColCount] = useState(3);
  const [useAiRecommend, setUseAiRecommend] = useState(true);
  const [panelState, setPanelState] = useState({ progress: 0, message: "대기 중..." });

  useEffect(() => {
    if (isLoggedIn) { loadAllData(); }
    const sAi = localStorage.getItem('useAiRecommend');
    if (sAi !== null) setUseAiRecommend(sAi === 'true');
  }, [isLoggedIn, safeAddress]);

  const loadAllData = async () => {
    try {
      const catRes = await api.getCategories(safeAddress);
      setCategories(catRes.categories || []);
      const cardRes = await api.getMyCards(safeAddress);
      setSavedCards(cardRes.cards || []);
    } catch (e) { console.error("데이터 로딩 실패:", e); }
  };

  const handleDeleteCard = async (id: number) => {
    if (window.confirm("이 카드를 삭제하시겠습니까?")) {
      await api.deleteCard(safeAddress, id);
      loadAllData();
    }
  };

  const handleMakeBlankCard = async (cat: any, text: string, selectedWords: Set<number>) => {
    alert("카드가 저장되었습니다! (실제 API 연동 필요)");
  };

  const handleAiRecommend = async (cat: any) => {
    setPanelState({ progress: 50, message: "AI가 추천 중입니다..." });
  };

  const createLongPressHandlers = (cb: any) => ({ onMouseDown: cb });

  return (
    <div className="min-h-screen bg-[#0d0d0f] text-[#d1d1d1] p-6 sm:p-12">
      <header className="max-w-6xl mx-auto border-b border-white/10 pb-8 mb-12 flex justify-between">
        <h1 className="text-2xl font-light tracking-widest text-white">Blank_D</h1>
        {!isLoggedIn ? <ConnectButton /> : <div className="text-[10px] text-white/30">{safeAddress.slice(0,10)}...</div>}
      </header>

      {isLoggedIn && (
        <main className="max-w-6xl mx-auto">
          <nav className="flex gap-8 mb-8 border-b border-white/5 pb-4 overflow-x-auto">
            {/* craft를 create로 변경 완료 */}
            {['dashboard', 'create', 'enhance', 'exam', 'mypage'].map(id => (
              <button key={id} onClick={() => setActiveTab(id)} className={`text-xs uppercase tracking-widest ${activeTab === id ? 'text-white border-b' : 'text-white/30'}`}>{id}</button>
            ))}
          </nav>

          {activeTab === 'dashboard' && <DashboardTab categories={categories} savedCards={savedCards} />}
          
          {/* activeTab 조건식을 create로 변경 */}
          {activeTab === 'create' && (
            <CraftTab 
              categories={categories} colCount={colCount} viewMode={viewMode} 
              useAiRecommend={useAiRecommend} panelState={panelState}
              handleMakeBlankCard={handleMakeBlankCard} handleAiRecommend={handleAiRecommend} 
            />
          )}
          
          {activeTab === 'enhance' && (
            <EnhanceTab 
              savedCards={savedCards} colCount={colCount} viewMode={viewMode} 
              setActiveCard={setActiveCard} handleDeleteCard={handleDeleteCard} 
              createLongPressHandlers={createLongPressHandlers} 
            />
          )}

          {activeTab === 'mypage' && (
             <MypageTab 
               useAiRecommend={useAiRecommend} setUseAiRecommend={setUseAiRecommend}
               viewMode={viewMode} setViewMode={setViewMode}
               colCount={colCount} updateColCount={setColCount}
               handleDeleteAll={async () => {
                 // 데이터 완전 초기화 로직 연동
                 if(window.confirm('구형 데이터(기본 폴더)를 지우기 위해 모든 데이터를 초기화합니까?')){
                   await fetch('https://api.blankd.top/api/delete-all', {
                     method: 'POST', 
                     headers: {'Content-Type':'application/json'}, 
                     body: JSON.stringify({wallet_address: safeAddress})
                   });
                   loadAllData();
                   alert("초기화 완료! 이제 문헌을 새로 업로드하시면 장별로 분류됩니다.");
                 }
               }}
             />
          )}
        </main>
      )}

      {activeCard && (
        <CardModal 
          activeCard={activeCard} totalTimeLimit={10} elapsed={0} 
          answerInput="" setAnswerInput={()=>{}} inputStatus="idle" 
          handleSequentialInput={()=>{}} renderContent={() => <div>{activeCard.content}</div>} 
          onClose={() => setActiveCard(null)} 
        />
      )}
    </div>
  );
}

export default MainApp;
