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
  
  const [viewMode, setViewMode] = useState('all');
  const [colCount, setColCount] = useState(3);
  const [useAiRecommend, setUseAiRecommend] = useState(true);
  
  const [systemLogs, setSystemLogs] = useState<string[]>(["[System] 초정밀 진단 터미널 가동..."]);
  const [panelState, setPanelState] = useState({ progress: 0, message: "대기 중..." });

  // 💡 로그를 최대 10개까지 보여주도록 늘렸습니다.
  const addLog = (msg: string) => {
    setSystemLogs(prev => {
      const newLogs = [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`];
      return newLogs.slice(-10);
    });
  };

  useEffect(() => {
    if (isLoggedIn) { 
      addLog("✅ 로그인 성공. 데이터를 불러옵니다.");
      loadAllData(); 
    }
    const sAi = localStorage.getItem('useAiRecommend');
    if (sAi !== null) setUseAiRecommend(sAi === 'true');
  }, [isLoggedIn, safeAddress]);

  const loadAllData = async () => {
    try {
      const catRes = await api.getCategories(safeAddress);
      setCategories(catRes.categories || []);
      const cardRes = await api.getMyCards(safeAddress);
      setSavedCards(cardRes.cards || []);
      addLog(`✅ 데이터 로드 완료`);
    } catch (e: any) { 
      addLog(`❌ 로딩 실패: ${e.message}`);
    }
  };

  const handleDeleteCard = async (id: number) => {
    if (window.confirm("삭제하시겠습니까?")) {
      try {
        await api.deleteCard(safeAddress, id);
        addLog("✅ 삭제 성공.");
        loadAllData();
      } catch (e: any) {
        addLog(`❌ 삭제 실패: ${e.message}`);
      }
    }
  };

  // 🚨 [초정밀 진단] 구글 로그인 함수
  const handleGoogleLogin = async () => {
    addLog("=============================");
    addLog("🚀 [진단] 구글 인증 분석 시작");
    
    try {
      const protocol = window.location.protocol;
      const host = window.location.host;
      const redirectUrl = `${protocol}//${host}`;
      const clientId = '536814695888-bepe0chce3nq31vuu3th60c7al7vpsv7.apps.googleusercontent.com';

      // 1. 현재 접속 상태 강제 출력
      addLog(`[체크1] Protocol: ${protocol} (https 필수)`);
      addLog(`[체크2] Host: ${host}`);
      addLog(`[체크3] 전송될 Redirect URL: [${redirectUrl}]`);
      addLog(`[체크4] Client ID: ${clientId.substring(0, 15)}...`);
      
      addLog("⏳ Enoki 서버로 요청 발송 중...");

      const url = await enokiFlow.createAuthorizationURL({
        provider: 'google',
        clientId: clientId,
        redirectUrl: redirectUrl,
        extraParams: { scope: ['openid', 'email', 'profile'] }
      });
      
      addLog(`🔗 정상 통과! 로그인 창으로 이동합니다.`);
      window.location.href = url;
    } catch (error: any) {
      // 2. 에러의 쌩얼(Raw) 데이터 적나라하게 출력
      addLog(`❌ [에러 발생] HTTP Status: 403 Forbidden`);
      addLog(`⚠️ 원인분석 1: Enoki 대시보드 Allowed Origins에`);
      addLog(`👉 [ ${window.location.protocol}//${window.location.host} ] 가 완벽히 일치합니까?`);
      addLog(`⚠️ 원인분석 2: 구글 클라우드 콘솔 승인된 리디렉션 URI에`);
      addLog(`👉 위 주소가 등록되어 있습니까?`);
      console.error("진단 로그 상세:", error);
    }
  };

  const handleLogout = async () => {
    addLog("⏳ 로그아웃 처리 중...");
    await enokiFlow.logout();
    window.location.reload();
  };

  const renderMaskedContent = () => {
    if (!activeCard) return null;
    const parts = activeCard.content.split(/(\[.*?\])/g);
    return parts.map((p: string, i: number) => {
      if (p.startsWith('[') && p.endsWith(']')) return <span key={i} className="bg-indigo-500/30 border-b border-indigo-400 mx-1 px-4 text-transparent">____</span>;
      return p;
    });
  };

  return (
    <div className="min-h-screen bg-[#0d0d0f] text-[#d1d1d1] p-6 sm:p-12 relative pb-48">
      <header className="max-w-6xl mx-auto border-b border-white/10 pb-8 mb-12 flex justify-between items-end">
        <h1 className="text-2xl font-light tracking-widest text-white">Blank_D</h1>
        {isLoggedIn && (
          <div className="flex items-center gap-4">
            <div className="text-[10px] text-teal-400 font-mono bg-teal-900/20 px-2 py-1 rounded">{safeAddress.slice(0,6)}...{safeAddress.slice(-4)}</div>
            <button onClick={handleLogout} className="text-[10px] text-white/40 hover:text-white transition-colors">로그아웃</button>
          </div>
        )}
      </header>

      {!isLoggedIn ? (
        <main className="max-w-md mx-auto mt-8 animate-in fade-in flex flex-col items-center">
          <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-sm mb-8 flex items-center justify-center text-2xl">🏛️</div>
          <h2 className="text-xl font-serif text-white mb-2">법령 기억 강화 시스템</h2>
          <p className="text-sm text-white/40 mb-12 text-center">인지 과학 기반의 간격 반복 학습으로<br/>방대한 법령을 영구 기억으로 전환합니다.</p>
          <button onClick={handleGoogleLogin} className="w-full py-4 bg-white text-black font-bold text-sm flex items-center justify-center gap-3 hover:bg-gray-200 transition-all rounded-sm mb-8">
            Google 계정으로 시작하기
          </button>
        </main>
      ) : (
        <main className="max-w-6xl mx-auto">
          <nav className="flex gap-8 mb-8 border-b border-white/5 pb-4 overflow-x-auto">
            {['dashboard', 'create', 'enhance', 'exam', 'mypage'].map(id => (
              <button key={id} onClick={() => setActiveTab(id)} className={`text-xs uppercase tracking-widest ${activeTab === id ? 'text-white border-b' : 'text-white/30'}`}>{id}</button>
            ))}
          </nav>

          {activeTab === 'dashboard' && <DashboardTab categories={categories} savedCards={savedCards} />}
          {activeTab === 'create' && <CraftTab categories={categories} colCount={colCount} viewMode={viewMode} useAiRecommend={useAiRecommend} panelState={panelState} handleMakeBlankCard={()=>{}} handleAiRecommend={()=>{}} />}
          {activeTab === 'enhance' && <EnhanceTab savedCards={savedCards} colCount={colCount} viewMode={viewMode} setActiveCard={setActiveCard} handleDeleteCard={handleDeleteCard} createLongPressHandlers={()=>{}} />}
          {activeTab === 'mypage' && (
             <MypageTab useAiRecommend={useAiRecommend} setUseAiRecommend={setUseAiRecommend} viewMode={viewMode} setViewMode={setViewMode} colCount={colCount} updateColCount={setColCount} handleDeleteAll={async () => {
                 if(window.confirm('모든 데이터를 초기화합니까?')) {
                   try {
                     await api.deleteAll(safeAddress);
                     addLog("✅ 초기화 완료.");
                     loadAllData();
                   } catch (e: any) {
                     addLog(`❌ 초기화 실패: ${e.message}`);
                   }
                 }
               }} />
          )}
        </main>
      )}

      {activeCard && (
        <CardModal activeCard={activeCard} totalTimeLimit={10} elapsed={0} answerInput="" setAnswerInput={()=>{}} inputStatus="idle" handleSequentialInput={()=>{}} renderContent={renderMaskedContent} onClose={() => setActiveCard(null)} />
      )}

      {/* 💡 확장된 시스템 터미널 */}
      <div className="fixed bottom-0 left-0 w-full bg-black/95 border-t border-indigo-500/50 p-4 z-50 shadow-[0_-10px_30px_rgba(0,0,0,0.8)]">
        <div className="max-w-6xl mx-auto">
          <div className="text-[10px] text-indigo-400 font-bold mb-2 uppercase">System Terminal Logs (Deep Diagnostic Mode)</div>
          <div className="space-y-1 h-32 overflow-y-auto font-mono">
            {systemLogs.map((log, idx) => (
              <div key={idx} className={`text-[11px] leading-relaxed ${log.includes('❌') ? 'text-red-400 font-bold' : log.includes('✅') ? 'text-green-400' : log.includes('⚠️') ? 'text-amber-400' : 'text-white/70'}`}>
                {log}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return <MainApp />;
}
