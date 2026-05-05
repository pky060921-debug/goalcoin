import React, { useState } from 'react';
import { useCurrentAccount } from "@mysten/dapp-kit";
import { useZkLogin } from "@mysten/enoki/react";
import { api } from "../services/api";

export const DashboardTab = ({ categories = [], savedCards = [] }: any) => {
  // 계정 주소 추출
  const suiWalletAccount = useCurrentAccount();
  const zkLogin = useZkLogin();
  const safeAddress = suiWalletAccount?.address || zkLogin?.address || "";

  // 업로드 폼 상태 관리
  const [folderName, setFolderName] = useState('법령');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadLog, setUploadLog] = useState('');

  // 🚨 [초정밀 진단] 업로드 및 예외 처리 로직
  const handleUpload = async () => {
    if (!title.trim() || !content.trim()) {
      setUploadLog("⚠️ 경고: 제목과 내용을 모두 입력해야 합니다.");
      return;
    }

    setIsUploading(true);
    setUploadLog("⏳ 서버 통신 중... 데이터를 전송하고 있습니다.");

    try {
      // API 함수 호출 (api.ts에 정의된 함수명에 따라 수정이 필요할 수 있습니다)
      // 예시: saveCategory, createCategory, addCategory 등
      if (typeof api.saveCategory !== 'function') {
        throw new Error("api.saveCategory 함수를 찾을 수 없습니다. api.ts를 확인하세요.");
      }

      await api.saveCategory(safeAddress, {
        title: title,
        content: content,
        folder_name: folderName
      });

      setUploadLog("✅ 업로드 완료! 데이터가 성공적으로 저장되었습니다. (적용을 위해 새로고침 해주세요)");
      setTitle('');
      setContent('');
    } catch (error: any) {
      setUploadLog(`❌ 업로드 실패: ${error.message}`);
      console.error("업로드 진단 에러 상세:", error);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
      
      {/* 🟢 왼쪽 영역: 시스템 통계 (기존 대시보드 기능 유지) */}
      <div className="lg:col-span-5 space-y-6">
        <div className="p-6 bg-indigo-900/10 border border-indigo-500/20 rounded-sm">
          <h2 className="text-sm font-bold text-indigo-400 mb-4 uppercase tracking-widest">System Overview</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b border-white/5 pb-2">
              <span className="text-white/50 text-sm">등록된 원본 데이터 (법령/모의고사)</span>
              <span className="text-xl font-mono text-white">{categories.length}</span>
            </div>
            <div className="flex justify-between items-center border-b border-white/5 pb-2">
              <span className="text-white/50 text-sm">추출된 암기 카드 (빈칸)</span>
              <span className="text-xl font-mono text-teal-400">{savedCards.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 🟢 오른쪽 영역: 법령 및 모의고사 업로드 폼 복구 */}
      <div className="lg:col-span-7">
        <div className="p-6 bg-[#0a0a0c] border border-indigo-500/30 rounded-sm shadow-xl">
          <h2 className="text-sm font-bold text-white mb-6 uppercase tracking-widest flex items-center justify-between">
            <span>데이터 베이스 추가 (Data Upload)</span>
            {isUploading && <span className="text-teal-400 animate-pulse text-[10px]">Processing...</span>}
          </h2>

          <div className="space-y-5">
            {/* 1. 폴더(분류) 선택 */}
            <div>
              <label className="block text-[11px] text-white/50 mb-2 uppercase">분류 (Folder)</label>
              <div className="flex gap-3">
                {['법령', '모의고사', '기타'].map(folder => (
                  <button
                    key={folder}
                    onClick={() => setFolderName(folder)}
                    className={`px-4 py-2 text-xs font-bold rounded-sm border transition-colors ${
                      folderName === folder 
                        ? 'bg-indigo-600 border-indigo-500 text-white' 
                        : 'bg-transparent border-white/10 text-white/40 hover:border-white/30'
                    }`}
                  >
                    {folder}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. 제목 입력 */}
            <div>
              <label className="block text-[11px] text-white/50 mb-2 uppercase">제목 (Title)</label>
              <input 
                type="text" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 민사집행법 제1조 또는 24년 1회차 모의고사"
                className="w-full bg-black/50 border border-white/10 p-3 text-sm text-white rounded-sm focus:border-indigo-500 focus:outline-none transition-colors"
              />
            </div>

            {/* 3. 본문 내용 입력 */}
            <div>
              <label className="block text-[11px] text-white/50 mb-2 uppercase">본문 내용 (Content)</label>
              <textarea 
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="법령 조문이나 모의고사 지문 전체를 여기에 붙여넣기 하세요."
                className="w-full bg-black/50 border border-white/10 p-3 text-sm text-white rounded-sm h-48 focus:border-indigo-500 focus:outline-none transition-colors resize-none leading-relaxed font-serif"
              />
            </div>

            {/* 진단 로그 출력 */}
            {uploadLog && (
              <div className={`text-[11px] p-3 rounded-sm font-mono ${uploadLog.includes('❌') || uploadLog.includes('⚠️') ? 'bg-red-900/20 text-red-400 border border-red-500/30' : 'bg-teal-900/20 text-teal-400 border border-teal-500/30'}`}>
                {uploadLog}
              </div>
            )}

            {/* 업로드 버튼 */}
            <button 
              onClick={handleUpload}
              disabled={isUploading}
              className={`w-full py-3 text-sm font-bold rounded-sm transition-all ${
                isUploading 
                  ? 'bg-indigo-900/50 text-indigo-400 cursor-not-allowed' 
                  : 'bg-white text-black hover:bg-gray-200'
              }`}
            >
              서버에 데이터 등록하기
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};
