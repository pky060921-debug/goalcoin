import React, { useState } from 'react';
import { api } from '../services/api';

export const MypageTab = ({ safeAddress, enokiFlow, zkLogin, setCategories, setSystemLogs }: any) => {
  const [showWallet, setShowWallet] = useState(false);
  const [lawFile, setLawFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // ZkLogin 이메일 또는 에노키 공급체인 정보에서 이메일 자동 확보
  const userEmail = zkLogin?.userEmail || enokiFlow?.getUserInfo?.()?.email || "설계자 계정 (이메일 정보 공백)";

  // 💡 CraftTab에서 완벽 이식된 업로드 코어 전송 엔진
  const handleFileUploadAndSubmit = async () => {
    if (!lawFile) {
      alert("전송할 원본 학습용 데이터 파일(.txt)을 선택해주십시오.");
      return;
    }
    
    try {
      setIsUploading(true);
      console.log("[Mypage 진단] 원본 데이터 인공지능 청크 분해 전송 시작:", lawFile.name);
      if (setSystemLogs) setSystemLogs((prev: string[]) => [...prev, `[Upload] 자료 파일 '${lawFile.name}' 가공 대기열 등록 완료.`]);

      const data = await api.uploadExamCoop(lawFile, safeAddress);
      console.log("[Mypage 진단] 서버 가공 결과 동기화 응답 수신 성공:", data);
      
      if (setSystemLogs) setSystemLogs((prev: string[]) => [...prev, `[Success] ${data.count || 0}개의 학습 조항 노드가 데이터베이스에 정착되었습니다.`]);
      
      const updatedCats = await api.getCategories(safeAddress);
      if (setCategories) setCategories(updatedCats);
      
      alert(`성공적으로 ${data.count || 0}개의 조항이 마이그레이션 파싱되었습니다.`);
      setLawFile(null);
    } catch (err: any) {
      console.error("[Mypage 진단 오류] 서버 스트리밍 전송 에러 캐치:", err);
      if (setSystemLogs) setSystemLogs((prev: string[]) => [...prev, `[Error] 업로드 실패 파서 로그: ${err.message}`]);
      alert(`가공 업로드 실패 알림: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-8 py-12 px-4 animate-in fade-in duration-300">
      <div className="border border-white/10 p-6 rounded-sm bg-[#08080a] shadow-xl">
        
        {/* 💡 [설계 요건] 지갑 정보를 계정 이메일 주소로 전면 배치 및 클릭 토글형 출력 변경 */}
        <div className="text-xs text-white/40 mb-2 font-mono uppercase tracking-wider">Account Identity (Email)</div>
        <button 
          onClick={() => {
            console.log("[Mypage 진단] 계정 이메일 터치 시도 -> 암호화 지갑 토글 전환:", !showWallet);
            setShowWallet(!showWallet);
          }}
          className="w-full text-left p-3 bg-black/50 border border-white/5 rounded-sm mb-4 transition-all hover:bg-white/[0.02] cursor-pointer group"
        >
          <div className="text-xs font-bold text-teal-400 group-hover:text-teal-300 transition-colors break-all">
            {userEmail}
          </div>
          <div className="text-[10px] text-white/30 mt-1">💡 터치(클릭)하면 분산 원장용 지갑 노드 주소가 하단에 표시됩니다.</div>
        </button>

        {showWallet && (
          <div className="text-[10px] font-mono text-amber-400 bg-amber-950/20 border border-amber-900/30 p-3 rounded-sm mb-4 break-all animate-in fade-in duration-200">
            <span className="font-bold block mb-0.5 text-white/50">[Secure Sui Network Node Address]</span>
            {safeAddress || "연결된 노드 지갑 고유 주소 공백 상태"}
          </div>
        )}

        <button 
          onClick={() => { 
            console.log("[Mypage 진단] 시스템 커넥션 연결 해제");
            enokiFlow?.logout(); 
            window.location.reload(); 
          }} 
          className="w-full py-2 text-xs border border-white/20 text-white/60 hover:text-white hover:bg-white/10 rounded-sm mb-6 transition-all font-bold cursor-pointer"
        >
          시스템 연결 해제 (로그아웃)
        </button>

        <div className="border-t border-white/10 my-6"></div>

        {/* 💡 [이식 완료] CraftTab에서 완전히 이동해온 학습자료 파일 로드 및 전송 구조체 */}
        <div className="text-xs text-white/50 font-bold mb-3 tracking-wider font-mono uppercase">📖 RESOURCE SOURCE FILE UPLOAD INTERFACE</div>
        <div className="space-y-4 bg-[#0a0a0c] border border-white/10 p-5 rounded-sm">
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
  );
};
