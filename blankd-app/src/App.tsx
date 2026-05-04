import React, { useState, useEffect } from "react";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { useEnokiFlow, useZkLogin } from "@mysten/enoki/react";
import { api } from "./services/api";
import { SPLIT_REGEX } from "./utils/constants";
import { CardModal } from "./components/CardModal";
import { DashboardTab } from "./tabs/DashboardTab";
import { CraftTab } from "./tabs/CraftTab";
import { EnhanceTab } from "./tabs/EnhanceTab";
import { MypageTab } from "./tabs/MypageTab"; // Mypage는 기존 코드 그대로 사용 권장

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
  const [panelState, setPanelState] = useState({ progress: 0, message: "대기 중" });
  
  // 전역 상태 관리
  useEffect(() => {
    if (isLoggedIn) {
      api.getCategories(safeAddress).then(d => setCategories(d.categories || []));
      api.getMyCards(safeAddress).then(d => setSavedCards(d.cards || []));
    }
  }, [isLoggedIn, safeAddress]);

  // 렌더링 로직 (빈칸 복원용)
  const renderMaskedContent = () => {
    if (!activeCard) return null;
    const parts = activeCard.content.split(/(\[.*?\])/g);
    return parts.map((p: string, i: number) => {
      if (p.startsWith('[') && p.endsWith(']')) return <span key={i} className="bg-indigo-500/30 border-b border-indigo-400 mx-1 px-4 text-transparent">____</span>;
      return p;
    });
  };

  return (
    <div className="min-h-screen bg-[#0d0d0f] text-[#d1d1d1] p-6 sm:p-12">
      <header className="max-w-6xl mx-auto border-b border-white/10 pb-8 mb-12 flex justify-between">
        <h1 className="text-2xl font-light tracking-widest text-white">Blank_D</h1>
        {!isLoggedIn ? <ConnectButton /> : <div className="text-[10px] text-white/30">{safeAddress.slice(0,10)}...</div>}
      </header>

      {isLoggedIn && (
        <main className="max-w-6xl mx-auto">
          <nav className="flex gap-8 mb-8 border-b border-white/5 pb-4 overflow-x-auto">
            {['dashboard', 'craft', 'enhance', 'exam', 'mypage'].map(id => (
              <button key={id} onClick={() => setActiveTab(id)} className={`text-xs uppercase tracking-widest ${activeTab === id ? 'text-white border-b' : 'text-white/30'}`}>{id}</button>
            ))}
          </nav>

          {activeTab === 'dashboard' && <DashboardTab categories={categories} savedCards={savedCards} />}
          {activeTab === 'craft' && <CraftTab categories={categories} craftFolders={Array.from(new Set(categories.map((c:any)=>c.folder_name||'기본 폴더')))} openCraftFolders={{}} setOpenCraftFolders={()=>{}} panelState={panelState} />}
          {activeTab === 'enhance' && <EnhanceTab savedCards={savedCards} enhanceFolders={Array.from(new Set(savedCards.map((c:any)=>c.folder_name||'기본 폴더')))} openEnhanceFolders={{}} setOpenEnhanceFolders={()=>{}} colCount={3} viewMode="all" setActiveCard={setActiveCard} />}
        </main>
      )}

      {activeCard && (
        <CardModal 
          activeCard={activeCard} totalTimeLimit={10} elapsed={0} 
          answerInput="" setAnswerInput={()=>{}} inputStatus="idle" 
          handleSequentialInput={()=>{}} renderContent={renderMaskedContent} 
          onClose={() => setActiveCard(null)} 
        />
      )}
    </div>
  );
}

export default MainApp;
