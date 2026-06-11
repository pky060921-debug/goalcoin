import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

export const MypageTab = ({ safeAddress, enokiFlow, zkLogin, setCategories, setSystemLogs, useAiRecommend, setUseAiRecommend, studyMode, setStudyMode, globalDict, saveGlobalDict, loadAllData, theme, setTheme }: any) => {
  const [showWallet, setShowWallet] = useState(false);
  const [lawFile, setLawFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [uploadLog, setUploadLog] = useState<string | null>(null);

  const [userEmail, setUserEmail] = useState("설계자 계정 (이메일 정보 불러오는 중...)");
  const [rankingData, setRankingData] = useState<any[]>([]);
  const [isLoadingRanking, setIsLoadingRanking] = useState(false);

  useEffect(() => {
    const fetchUserEmail = async () => {
      try {
        if (zkLogin?.userEmail) { setUserEmail(zkLogin.userEmail); return; }
        if (enokiFlow && typeof enokiFlow.getUserInfo === 'function') {
          const userInfo = await enokiFlow.getUserInfo();
          if (userInfo && userInfo.email) { setUserEmail(userInfo.email); return; }
        }
        if (enokiFlow?.user?.email) { setUserEmail(enokiFlow.user.email); return; }
        setUserEmail("설계자 계정 (이메일 정보 공백)");
      } catch (err) { setUserEmail("설계자 계정 (이메일 정보 공백)"); }
    };
    fetchUserEmail();
  }, [enokiFlow, zkLogin]);

  useEffect(() => {
    const fetchRanking = async () => {
      setIsLoadingRanking(true);
      try {
        const res = await fetch("https://api.blankd.top/api/ranking");
        const data = await res.json();
        if (data.ranking) {
          setRankingData(data.ranking);
        }
      } catch (err) {
        console.error("랭킹 로드 실패:", err);
      } finally {
        setIsLoadingRanking(false);
      }
    };
    fetchRanking();
  }, []);

  const handleFileUploadAndSubmit = async () => {
    if (!lawFile) { alert("전송할 원본 학습용 데이터 파일(.txt)을 선택해주십시오."); return; }
    try {
      setIsUploading(true);
      if (setSystemLogs) setSystemLogs((prev: string[]) => [...prev, `[업로드] 자료 파일 '${lawFile.name}' 가공 대기열 등록 완료.`]);
      const data = await api.uploadExamCoop(lawFile, safeAddress);
      if (setSystemLogs) setSystemLogs((prev: string[]) => [...prev, `[성공] ${data.count || 0}개의 학습 조항 노드가 데이터베이스에 정착되었습니다.`]);
      
      const updatedCats = await api.getCategories(safeAddress);
      if (setCategories) setCategories(updatedCats);
      
      alert(`성공적으로 ${data.count || 0}개의 조항이 마이그레이션 파싱되었습니다.`);
      setLawFile(null);
    } catch (err: any) {
      if (setSystemLogs) setSystemLogs((prev: string[]) => [...prev, `❌ [에러] 업로드 실패 파서 로그: ${err.message}`]);
      alert(`가공 업로드 실패 알림: ${err.message}`);
    } finally { setIsUploading(false); }
  };

  const handleExportExcel = async () => {
    if (!safeAddress) return alert("로그인 세션이 존재하지 않습니다.");
    setIsExporting(true);
    const downloadUrl = `https://api.blankd.top/api/export-excel?wallet_address=${safeAddress}&t=${Date.now()}`;
    if (setSystemLogs) setSystemLogs((prev: string[]) => [...prev, `🔍 [진단 탐색] 주소: ${safeAddress} 기반 엑셀 빌드 유닛 요청 전송.`]);

    try {
      const checkRes = await fetch(downloadUrl, { method: 'GET' });
      if (!checkRes.ok) {
        const errorJson = await checkRes.json().catch(() => ({}));
        const mainError = errorJson.error || "알 수 없는 백엔드 가동 중단";
        const traceLog = errorJson.traceback || "트레이스백 없음";

        if (setSystemLogs) setSystemLogs((prev: string[]) => [...prev, `❌ [서버거절] 원인: ${mainError}`, `🚨 [추적로그]: ${traceLog.substring(0, 150)}...`]);
        alert(`❌ [서버 내부 진단 결과] 다운로드 실패\n\n요약: ${mainError}\n\n*상세 정보는 하단 터미널을 확인하세요.`);
        setIsExporting(false);
        return;
      }

      const blob = await checkRes.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', `blankd_내자료_백업_${new Date().toISOString().slice(0,10)}.xlsx`);
      document.body.appendChild(link); link.click();
      window.URL.revokeObjectURL(blobUrl); document.body.removeChild(link);
      
      if (setSystemLogs) setSystemLogs((prev: string[]) => [...prev, `✅ [정상 완료] 엑셀 패키지 다운로드가 성공했습니다.`]);
    } catch (err: any) {
      if (setSystemLogs) setSystemLogs((prev: string[]) => [...prev, `❌ [통신차단] 프론트 브라우저가 서버 접속에 실패했습니다: ${err.message}`]);
      alert(`❌ [네트워크 차단 진단]\n서버와 통신망이 연결되지 않았습니다.\n\n사유: ${err.message}`);
    } finally { setIsExporting(false); }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !safeAddress) return;
    if (!window.confirm("엑셀 내용에 따라 데이터베이스 내역이 즉시 일괄 수정 및 덮어쓰기됩니다. 진행하시겠습니까?")) { e.target.value = ""; return; }

    setIsImporting(true); setUploadLog("⏳ 엑셀 바이너리 구조 해석 및 데이터베이스 동기화 반영 중...");
    const formData = new FormData();
    formData.append("file", file); formData.append("wallet_address", safeAddress);

    try {
      const res = await fetch("https://api.blankd.top/api/import-excel", { method: "POST", body: formData });
      const result = await res.json().catch(() => ({}));
      if (res.ok) {
        setUploadLog("✅ 성공: 데이터베이스 일괄 동기화 및 갱신이 완료되었습니다!");
        if (typeof loadAllData === 'function') await loadAllData(); 
      } else { throw new Error(result.error || "엑셀 파일 가공 동기화 실패"); }
    } catch (err: any) { setUploadLog(`❌ 실패: ${err.message || "엑셀 파일 내부 규격 불일치 오류"}`);
    } finally { setIsImporting(false); e.target.value = ""; }
  };

  const formatAddress = (addr: string) => {
    if (!addr) return "Unknown User";
    if (addr.includes('@')) {
      const [name, domain] = addr.split('@');
      return `${name.substring(0, 3)}***@${domain}`;
    }
    if (addr.length > 15) {
      return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
    }
    return addr;
  };

  return (
    <div className="max-w-xl mx-auto space-y-8 py-12 px-4 animate-in fade-in duration-300 font-sans pb-24">
      <div className="border border-white/10 p-6 rounded-sm bg-[#08080a] shadow-xl space-y-6">
        
        {/* 계정 정보 */}
        <div>
          <div className="text-xs text-white/40 mb-2 font-mono uppercase tracking-wider">연결된 계정 식별자 (이메일 주소)</div>
          <button onClick={() => setShowWallet(!showWallet)} className="w-full text-left p-3 bg-black/50 border border-white/5 rounded-sm transition-all hover:bg-white/[0.02] cursor-pointer group">
            <div className="text-xs font-bold text-teal-400 group-hover:text-teal-300 transition-colors break-all">{userEmail}</div>
            <div className="text-[10px] text-white/30 mt-1">💡 클릭하면 분산 원장용 블록체인 노드 고유 주소가 아래에 토글 표시됩니다.</div>
          </button>
          {showWallet && (
            <div className="text-[10px] font-mono text-amber-400 bg-amber-950/20 border border-amber-900/30 p-3 rounded-sm break-all animate-in fade-in duration-200 mt-2">
              <span className="font-bold block mb-0.5 text-white/50">[안전 보안 수이 네트워크 노드 주소]</span>
              {safeAddress || "연결된 노드 지갑 고유 주소가 공백 상태입니다."}
            </div>
          )}
        </div>

        <button onClick={() => { enokiFlow?.logout(); window.location.reload(); }} className="w-full py-2 text-xs border border-white/20 text-white/60 hover:text-white hover:bg-white/10 rounded-sm transition-all font-bold cursor-pointer">
          시스템 연결 해제 (로그아웃)
        </button>

        <div className="border-t border-white/10"></div>

        {/* 🎨 화면 테마 설정 (신규 기능) */}
        <div className="space-y-3">
          <div className="text-xs text-white/50 font-bold tracking-wider font-mono uppercase flex items-center gap-2">
            <span>🎨</span> 화면 테마 설정
          </div>
          <div className="grid grid-cols-3 gap-2 bg-black/40 border border-white/5 p-4 rounded-sm">
            <button onClick={() => setTheme('black')} className={`py-2.5 rounded-sm text-xs font-bold transition-all shadow-sm ${theme === 'black' ? 'bg-gray-800 text-white border border-gray-500' : 'bg-white/5 text-white/40 border border-transparent hover:bg-white/10'}`}>다크 (블랙)</button>
            <button onClick={() => setTheme('white')} className={`py-2.5 rounded-sm text-xs font-bold transition-all shadow-sm ${theme === 'white' ? 'bg-gray-200 text-gray-900 border border-gray-400' : 'bg-white/5 text-white/40 border border-transparent hover:bg-white/10'}`}>라이트 (화이트)</button>
            <button onClick={() => setTheme('green')} className={`py-2.5 rounded-sm text-xs font-bold transition-all shadow-sm ${theme === 'green' ? 'bg-green-800 text-green-50 border border-green-500' : 'bg-white/5 text-white/40 border border-transparent hover:bg-white/10'}`}>칠판 (그린)</button>
          </div>
        </div>

        <div className="border-t border-white/10"></div>

        {/* 🏆 명예의 전당 (랭킹 보드) */}
        <div className="space-y-3">
          <div className="text-xs text-amber-400/80 font-bold tracking-wider font-mono uppercase flex items-center gap-2">
            <span>🏆</span> 명예의 전당 (학습 랭킹)
          </div>
          <div className="bg-black/40 border border-white/5 p-4 rounded-sm">
            {isLoadingRanking ? (
              <div className="text-center text-white/40 text-[11px] py-6 animate-pulse">실시간 서버 데이터를 수집하는 중...</div>
            ) : rankingData.length > 0 ? (
              <div className="space-y-2 max-h-[250px] overflow-y-auto custom-scrollbar pr-2">
                {rankingData.map((user, idx) => (
                  <div key={idx} className={`flex items-center justify-between p-3 rounded-sm border transition-colors ${
                    idx === 0 ? 'bg-amber-900/30 border-amber-500/50' : 
                    idx === 1 ? 'bg-gray-400/10 border-gray-400/30' : 
                    idx === 2 ? 'bg-orange-900/20 border-orange-700/40' : 
                    'bg-white/5 border-white/10'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className={`font-bold font-mono text-[14px] w-6 text-center ${
                        idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-gray-300' : idx === 2 ? 'text-orange-400' : 'text-white/30'
                      }`}>
                        {idx + 1}
                      </div>
                      <div className="text-[11px] sm:text-xs text-white/80 font-mono">
                        {user.wallet_address === safeAddress ? (
                          <span className="text-teal-400 font-bold">(내 계정) {formatAddress(user.wallet_address)}</span>
                        ) : (
                          formatAddress(user.wallet_address)
                        )}
                      </div>
                    </div>
                    <div className="text-[11px] sm:text-xs font-bold text-indigo-400 text-right shrink-0">
                      {user.total_filled.toLocaleString()} 회
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-white/40 text-[11px] py-6">랭킹 데이터가 존재하지 않습니다.</div>
            )}
          </div>
        </div>

        <div className="border-t border-white/10"></div>

        {/* 엑셀 관리 */}
        <div className="space-y-3">
          <div className="text-xs text-white/50 font-bold tracking-wider font-mono uppercase">📊 데이터베이스 엑셀 통합 관리</div>
          <div className="p-4 bg-black/40 border border-white/5 rounded-sm space-y-4">
            <p className="text-[10px] sm:text-[11px] text-white/40 leading-relaxed">
              데이터베이스에 보관된 만들기(카테고리) 및 채우기(카드) 전체 정보를 한 장의 통합 엑셀로 추출합니다. 데이터를 수정하여 다시 업로드하면 <span className="text-amber-400 font-bold">기존 조항은 일괄 덮어쓰기 수정</span>되며, 새로운 행은 신규 추가됩니다.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button onClick={handleExportExcel} disabled={isExporting} className={`w-full py-2.5 px-3 border rounded-sm font-bold text-[11px] transition-all shadow-md ${isExporting ? "bg-white/5 border-white/10 text-white/30 cursor-not-allowed" : "bg-indigo-600/20 border-indigo-500 text-indigo-400 hover:bg-indigo-600/30 cursor-pointer"}`}>
                {isExporting ? "⏳ 실시간 진단 유닛 가동 중..." : "📥 전체 DB 엑셀 다운로드"}
              </button>
              <div className="relative">
                <input type="file" accept=".xlsx, .xls" id="excel-import-file-mypage" onChange={handleImportExcel} disabled={isImporting} className="hidden" />
                <label htmlFor="excel-import-file-mypage" className={`w-full py-2.5 px-3 border rounded-sm font-bold text-[11px] text-center block cursor-pointer transition-all shadow-md ${isImporting ? "bg-white/5 border-white/10 text-white/30 cursor-not-allowed" : "bg-amber-500/10 border-amber-500/50 text-amber-400 hover:bg-amber-500/20"}`}>
                  {isImporting ? "🔄 일괄 동기화 반영 중..." : "📤 수정된 엑셀 업로드 (DB 변경)"}
                </label>
              </div>
            </div>
            {uploadLog && (
              <div className={`p-2.5 text-[11px] rounded-sm border font-mono ${uploadLog.includes('❌') ? 'bg-red-950/20 border-red-500/30 text-red-400' : uploadLog.includes('✅') ? 'bg-teal-950/20 border-teal-500/30 text-teal-300' : 'bg-white/5 border-white/10 text-white/60 animate-pulse'}`}>
                {uploadLog}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-white/10"></div>

        {/* .txt 원본 데이터 업로드 */}
        <div className="space-y-3">
          <div className="text-xs text-white/50 font-bold tracking-wider font-mono uppercase">📖 원본 학습자료 텍스트 소스 공급부</div>
          <div className="space-y-4 bg-black/40 border border-white/5 p-4 rounded-sm">
            <div className="border border-dashed border-white/20 p-6 rounded-sm text-center bg-black/30 hover:border-amber-500/40 transition-colors relative group">
              <input type="file" accept=".txt" onChange={(e) => setLawFile(e.target.files?.[0] || null)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"/>
              <div className="text-[11px] text-white/70 group-hover:text-amber-400 transition-colors">
                {lawFile ? `📄 ${lawFile.name}` : "클릭하여 원본 (.txt) 파일을 공급해 주십시오"}
              </div>
              <div className="text-[10px] text-white/30 mt-1">파일 인코딩 규격 권장: UTF-8 일반 텍스트 문서</div>
            </div>
            <button onClick={handleFileUploadAndSubmit} disabled={isUploading || !lawFile} className={`w-full py-3 text-[11px] font-bold rounded-sm border transition-all ${isUploading ? 'bg-white/5 border-white/5 text-white/20 cursor-wait' : !lawFile ? 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed' : 'bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30 cursor-pointer'}`}>
              {isUploading ? "⚡ 인공지능 프레임 가공 엔진 분석 중..." : "🚀 서버로 원본 데이터 전송 가동"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
