import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

export const MypageTab = ({ safeAddress, enokiFlow, zkLogin, setCategories, setSystemLogs, useAiRecommend, setUseAiRecommend, studyMode, setStudyMode, globalDict, saveGlobalDict, loadAllData }: any) => {
  const [showWallet, setShowWallet] = useState(false);
  const [lawFile, setLawFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // 💡 [추가] 엑셀 입출력 전용 상태 관리 모듈
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [uploadLog, setUploadLog] = useState<string | null>(null);

  // 💡 [진단 해결] 에노키 비동기 세션에서 사용자 이메일을 안전하게 격리 추출하기 위한 동적 상태
  const [userEmail, setUserEmail] = useState("설계자 계정 (이메일 정보 불러오는 중...)");

  useEffect(() => {
    const fetchUserEmail = async () => {
      try {
        if (zkLogin?.userEmail) {
          setUserEmail(zkLogin.userEmail);
          return;
        }
        // 에노키 프레임워크의 비동기 상태 구조를 파싱하여 메일 정보를 강제 동기화합니다.
        if (enokiFlow && typeof enokiFlow.getUserInfo === 'function') {
          const userInfo = await enokiFlow.getUserInfo();
          if (userInfo && userInfo.email) {
            setUserEmail(userInfo.email);
            return;
          }
        }
        // 프로토콜 객체 내부의 다이렉트 유저 세션 탐색
        if (enokiFlow?.user?.email) {
          setUserEmail(enokiFlow.user.email);
          return;
        }
        setUserEmail("설계자 계정 (이메일 정보 공백)");
      } catch (err) {
        console.error("[Mypage 진단] 에노키 이메일 추출 비동기 예외 발생:", err);
        setUserEmail("설계자 계정 (이메일 정보 공백)");
      }
    };
    fetchUserEmail();
  }, [enokiFlow, zkLogin]);

  // 📖 기존에 유지 요청하신 학습자료 파일 (.txt) 분석 서버 전송 엔진
  const handleFileUploadAndSubmit = async () => {
    if (!lawFile) {
      alert("전송할 원본 학습용 데이터 파일(.txt)을 선택해주십시오.");
      return;
    }
    
    try {
      setIsUploading(true);
      console.log("[Mypage 진단] 원본 데이터 인공지능 청크 분해 전송 시작:", lawFile.name);
      if (setSystemLogs) setSystemLogs((prev: string[]) => [...prev, `[업로드] 자료 파일 '${lawFile.name}' 가공 대기열 등록 완료.`]);

      const data = await api.uploadExamCoop(lawFile, safeAddress);
      console.log("[Mypage 진단] 서버 가공 결과 동기화 응답 수신 성공:", data);
      if (setSystemLogs) setSystemLogs((prev: string[]) => [...prev, `[성공] ${data.count || 0}개의 학습 조항 노드가 데이터베이스에 정착되었습니다.`]);
      
      const updatedCats = await api.getCategories(safeAddress);
      if (setCategories) setCategories(updatedCats);
      
      alert(`성공적으로 ${data.count || 0}개의 조항이 마이그레이션 파싱되었습니다.`);
      setLawFile(null);
    } catch (err: any) {
      console.error("[Mypage 진단 오류] 서버 스트리밍 전송 에러 캐치:", err);
      if (setSystemLogs) setSystemLogs((prev: string[]) => [...prev, `[에러] 업로드 실패 파서 로그: ${err.message}`]);
      alert(`가공 업로드 실패 알림: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  // 📥 [추가] 데이터베이스 내부 상태를 통째로 백업하는 엑셀 다운로드 연동 모듈
  const handleExportExcel = async () => {
    if (!safeAddress) return alert("로그인 세션이 만료되었습니다.");
    setIsExporting(true);
    try {
      const downloadUrl = `https://api.blankd.top/api/export-excel?wallet_address=${safeAddress}&t=${Date.now()}`;
      
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', `blankd_데이터베이스_백업.xlsx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      console.error("[Mypage 진단 오류] 엑셀 내보내기 통신 실패:", err);
      alert("백엔드 엔진 오류로 인해 엑셀 파일을 빌드하지 못했습니다.");
    } finally {
      setIsExporting(false);
    }
  };

  // 📤 [추가] 사용자가 수정 완료한 엑셀 파일을 업로드하여 DB를 통째로 바꾸는 연동 모듈
  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !safeAddress) return;

    if (!window.confirm("엑셀 내용에 따라 데이터베이스 내역이 즉시 일괄 수정 및 덮어쓰기됩니다. 진행하시겠습니까?")) {
      e.target.value = "";
      return;
    }

    setIsImporting(true);
    setUploadLog("⏳ 엑셀 바이너리 구조 해석 및 데이터베이스 동기화 반영 중...");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("wallet_address", safeAddress);

    try {
      const res = await fetch("https://api.blankd.top/api/import-excel", {
        method: "POST",
        body: formData,
      });

      const result = await res.json().catch(() => ({}));

      if (res.ok) {
        setUploadLog("✅ 성공: 데이터베이스 일괄 동기화 및 갱신이 완료되었습니다!");
        if (typeof loadAllData === 'function') {
          await loadAllData(); // 대시보드 리액트 상태 즉시 동기화 강제 명령
        }
      } else {
        throw new Error(result.error || "엑셀 파일 가공 동기화 실패");
      }
    } catch (err: any) {
      console.error("[Mypage 진단 오류] 엑셀 일괄 동기화 예외 발생:", err);
      setUploadLog(`❌ 실패: ${err.message || "엑셀 파일 내부 규격 불일치 오류"}`);
    } finally {
      setIsImporting(false);
      e.target.value = "";
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-8 py-12 px-4 animate-in fade-in duration-300 font-sans">
      <div className="border border-white/10 p-6 rounded-sm bg-[#08080a] shadow-xl space-y-6">
        
        {/* 계정 식별자 영역 */}
        <div>
          <div className="text-xs text-white/40 mb-2 font-mono uppercase tracking-wider">연결된 계정 식별자 (이메일 주소)</div>
          <button 
            onClick={() => {
              console.log("[Mypage 진단] 지갑 노드 주소창 토글:", !showWallet);
              setShowWallet(!showWallet);
            }}
            className="w-full text-left p-3 bg-black/50 border border-white/5 rounded-sm transition-all hover:bg-white/[0.02] cursor-pointer group"
          >
            <div className="text-xs font-bold text-teal-400 group-hover:text-teal-300 transition-colors break-all">
              {userEmail}
            </div>
            <div className="text-[10px] text-white/30 mt-1">💡 클릭하면 분산 원장용 블록체인 노드 고유 주소가 아래에 토글 표시됩니다.</div>
          </button>

          {showWallet && (
            <div className="text-[10px] font-mono text-amber-400 bg-amber-950/20 border border-amber-900/30 p-3 rounded-sm break-all animate-in fade-in duration-200">
              <span className="font-bold block mb-0.5 text-white/50">[안전 보안 수이 네트워크 노드 주소]</span>
              {safeAddress || "연결된 노드 지갑 고유 주소가 공백 상태입니다."}
            </div>
          )}
        </div>

        <button 
          onClick={() => { 
            console.log("[Mypage 진단] 시스템 커넥션 안전 종료 해제");
            enokiFlow?.logout(); 
            window.location.reload(); 
          }} 
          className="w-full py-2 text-xs border border-white/20 text-white/60 hover:text-white hover:bg-white/10 rounded-sm transition-all font-bold cursor-pointer"
        >
          시스템 연결 해제 (로그아웃)
        </button>

        <div className="border-t border-white/10"></div>

        {/* 📥 📤 [신규 추가] 엑셀 다운로드 / 일괄 수정 업로드 제어 인터페이스 */}
        <div className="space-y-3">
          <div className="text-xs text-white/50 font-bold tracking-wider font-mono uppercase">📊 데이터베이스 엑셀 통합 관리 (일괄 수정)</div>
          <div className="p-4 bg-black/40 border border-white/5 rounded-sm space-y-4">
            <p className="text-[10px] sm:text-[11px] text-white/40 leading-relaxed">
              데이터베이스에 보관된 만들기(카테고리) 및 채우기(카드) 전체 정보를 한 장의 통합 엑셀로 추출합니다. 데이터를 수정하여 다시 업로드하면 <span className="text-amber-400 font-bold">기존 조항은 일괄 덮어쓰기 수정</span>되며, 새로운 행은 신규 추가됩니다.
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={handleExportExcel}
                disabled={isExporting}
                className={`py-2.5 px-3 border rounded-sm font-bold text-xs transition-all shadow-md ${
                  isExporting 
                    ? "bg-white/5 border-white/10 text-white/30 cursor-not-allowed" 
                    : "bg-indigo-600/20 border-indigo-500 text-indigo-400 hover:bg-indigo-600/30 cursor-pointer"
                }`}
              >
                {isExporting ? "⏳ 엑셀 파일 조립 중..." : "📥 전체 DB 엑셀 다운로드"}
              </button>

              <div className="relative">
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  id="excel-import-file-mypage"
                  onChange={handleImportExcel}
                  disabled={isImporting}
                  className="hidden"
                />
                <label
                  htmlFor="excel-import-file-mypage"
                  className={`w-full py-2.5 px-3 border rounded-sm font-bold text-xs text-center block cursor-pointer transition-all shadow-md ${
                    isImporting
                      ? "bg-white/5 border-white/10 text-white/30 cursor-not-allowed"
                      : "bg-amber-500/10 border-amber-500/50 text-amber-400 hover:bg-amber-500/20"
                  }`}
                >
                  {isImporting ? "🔄 일괄 동기화 반영 중..." : "📤 수정된 엑셀 업로드 (DB 변경)"}
                </label>
              </div>
            </div>

            {uploadLog && (
              <div className={`p-2.5 text-[11px] rounded-sm border font-mono ${
                uploadLog.includes('❌') ? 'bg-red-950/20 border-red-500/30 text-red-400' :
                uploadLog.includes('✅') ? 'bg-teal-950/20 border-teal-500/30 text-teal-300' :
                'bg-white/5 border-white/10 text-white/60 animate-pulse'
              }`}>
                {uploadLog}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-white/10"></div>

        {/* 📖 기존에 잘 쓰고 계시던 원본 학습자료 문서 주입 인터페이스 (유지) */}
        <div className="space-y-3">
          <div className="text-xs text-white/50 font-bold tracking-wider font-mono uppercase">📖 원본 학습자료 텍스트 소스 공급부</div>
          <div className="space-y-4 bg-black/40 border border-white/5 p-4 rounded-sm">
            <div className="border border-dashed border-white/20 p-6 rounded-sm text-center bg-black/30 hover:border-amber-500/40 transition-colors relative group">
              <input 
                type="file" 
                accept=".txt"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  console.log("[Mypage 진단] 원본 자료 파일 타겟팅 캐시:", file?.name);
                  setLawFile(file);
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="text-xs text-white/70 group-hover:text-amber-400 transition-colors">
                {lawFile ? `📄 ${lawFile.name}` : "클릭하여 원본 (.txt) 파일을 공급해 주십시오"}
              </div>
              <div className="text-[10px] text-white/30 mt-1">파일 인코딩 규격 권장: UTF-8 일반 텍스트 문서</div>
            </div>

            <button
              onClick={handleFileUploadAndSubmit}
              disabled={isUploading || !lawFile}
              className={`w-full py-3 text-xs font-bold rounded-sm border transition-all ${isUploading ? 'bg-white/5 border-white/5 text-white/20 cursor-wait' : !lawFile ? 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed' : 'bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30 cursor-pointer'}`}
            >
              {isUploading ? "⚡ 인공지능 프레임 가공 엔진 분석 중..." : "🚀 서버로 원본 데이터 전송 가동"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
