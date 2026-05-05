import React, { useState, useEffect, Component, ReactNode } from "react";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { useEnokiFlow, useZkLogin } from "@mysten/enoki/react";
import { api } from "./services/api";
import { CardModal } from "./components/CardModal";
import { DashboardTab } from "./tabs/DashboardTab";
import { CraftTab } from "./tabs/CraftTab";
import { EnhanceTab } from "./tabs/EnhanceTab";
import { MypageTab } from "./tabs/MypageTab";

// 🚨 [초정밀 진단] 화면이 하얗게 변하는 렌더링 에러를 잡아내는 Error Boundary 컴포넌트
class ErrorBoundary extends Component<{children: ReactNode, fallbackLog: (msg: string) => void}, {hasError: boolean, errorMessage: string}> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorMessage: error.message };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error("UI 렌더링 에러 상세:", error, errorInfo);
    this.props.fallbackLog(`❌ 화면 렌더링 붕괴: ${error.message}`);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-red-900/20 border border-red-500/50 rounded-md text-red-400 font-mono mt-8">
          <h3 className="font-bold mb-2">⚠️ 컴포넌트 렌더링 치명적 오류 발생</h3>
          <p className="text-sm">{this.state.errorMessage}</p>
          <p className="text-xs text-red-400/70 mt-4">개발자 도구(F12)의 Console 탭에서 상세 오류를 확인하거나, 해당 탭의 코드를 점검하세요.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

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

  const addLog = (msg: string) => {
    setSystemLogs(prev => {
      const newLogs = [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`];
      return newLogs.slice(-10);
    });
  };

  useEffect(() => {
    if (window.location.hash) {
      addLog("⏳ 인증 콜백 데이터 감지됨. zkLogin 세션을 생성합니다...");
      enokiFlow.handleAuthCallback()
        .then(() => {
          addLog("✅ 세션 생성 완벽 통과!");
          window.history.replaceState(null, '', window.location.pathname);
        })
        .catch((err: any) => {
          addLog(`❌ 콜백 처리 에러 발생: ${err.message || "Unknown Callback Error"}`);
        });
    }

    if (isLoggedIn) { 
      addLog("✅ 로그인 확인 완료. 데이터를 불러옵니다.");
      loadAllData(); 
    }
    
    const sAi = localStorage.getItem('useAiRecommend');
    if (sAi !== null) setUseAiRecommend(sAi === 'true');
  }, [isLoggedIn, safeAddress, enokiFlow]);

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

  const handleGoogleLogin = async () => {
    addLog("=============================");
    addLog("🚀 [진단] 구글 인증 분석 시작");
    
    try {
      const redirectUrl = window.location.origin; 
      const clientId = '536814695888-bepe0chce3nq31vuu3th60c7al7vpsv7.apps.googleusercontent.com';
      
      addLog(`[체크1] 추출된 Origin (리디렉션 URI): [${redirectUrl}]`);
      addLog(`[체크2] Client ID: ${clientId.substring(0, 15)}...`);
      
      addLog("⏳ Enoki 서버로 요청 발송 중...");
      const url = await enokiFlow.createAuthorizationURL({
        provider: 'google',
        clientId: clientId,
        redirectUrl: redirectUrl,
        network: 'testnet',
        extraParams: { scope: ['openid', 'email', 'profile'] }
      });
      
      addLog(`🔗 정상 통과! 로그인 창으로 이동합니다.`);
      window.location.href = url;
    } catch (error: any) {
      addLog(`❌ [에러 발생] 인증 URL 생성 실패`);
      addLog(`👉 상세 오류: ${error.message || "Unknown Error"}`);
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

          {/* 💡 에러 바운더리로 탭 영역 전체를 감싸서 어디서 터졌는지 화면에 표시합니다. */}
          <ErrorBoundary fallbackLog={addLog}>
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
          </ErrorBoundary>
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
