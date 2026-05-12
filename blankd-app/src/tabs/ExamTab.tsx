import React, { useState, useEffect, useRef } from 'react';

export const ExamTab = ({ walletAddress, address }: any) => {
  const userAddress = walletAddress || address;
  
  const [goldenExams, setGoldenExams] = useState<any[]>([]); 
  const [expandedExamId, setExpandedExamId] = useState<number | null>(null);
  
  // 업로드 상태 관리
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. 문제 목록 불러오기
  const fetchExams = async () => {
    if (!userAddress) return;
    try {
      const res = await fetch(`/api/get-golden-exams?wallet_address=${userAddress}`);
      const data = await res.json();
      if (data.exams) {
        setGoldenExams(data.exams);
      }
    } catch (e) {
      console.error("문제 목록 불러오기 실패:", e);
    }
  };

  useEffect(() => {
    fetchExams();
  }, [userAddress]);

  // 💡 [핵심 1] 모의고사 개별 삭제 기능
  const handleDeleteExam = async (e: React.MouseEvent, examId: number) => {
    e.stopPropagation(); // 클릭 시 아코디언 창이 닫히는 현상 방지
    
    if (!window.confirm("이 문제를 정말 삭제하시겠습니까? (삭제 후 복구 불가)")) return;
    
    try {
      const response = await fetch('/api/delete-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: examId,
          wallet_address: userAddress
        })
      });
      const result = await response.json();
      
      if (response.ok) {
        alert("🗑️ 성공적으로 삭제되었습니다.");
        fetchExams(); // 목록 즉시 새로고침
      } else {
        alert("삭제 실패: " + result.error);
      }
    } catch (error) {
      console.error("삭제 요청 중 에러:", error);
      alert("서버 통신 오류로 삭제에 실패했습니다.");
    }
  };

  // 💡 [핵심 2] 법령 융합형 지능형 해설 업로드 기능
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userAddress) return;

    setIsUploading(true);
    setUploadStatus("AI가 법령과 문제를 크로스체크하며 해설을 창작 중입니다...");

    const formData = new FormData();
    formData.append('file', file);
    formData.append('wallet_address', userAddress);

    try {
      const res = await fetch('/api/upload-exam', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (res.ok) {
        const taskId = data.task_id;
        const interval = setInterval(async () => {
          const statusRes = await fetch(`/api/task-status?task_id=${taskId}`);
          const statusData = await statusRes.json();

          if (statusData.status === 'completed') {
            clearInterval(interval);
            setIsUploading(false);
            alert("✨ AI 해설 작성 및 검수가 완벽하게 끝났습니다!");
            fetchExams(); // 업로드 완료 후 목록 갱신
            if (fileInputRef.current) fileInputRef.current.value = '';
          } else if (statusData.status === 'error') {
            clearInterval(interval);
            setIsUploading(false);
            alert("분석 중 오류 발생: " + statusData.message);
            if (fileInputRef.current) fileInputRef.current.value = '';
          } else {
            setUploadStatus(`AI 법령 분석 진행 중... (${statusData.progress || 0}%)`);
          }
        }, 2000);
      } else {
        setIsUploading(false);
        alert("업로드 실패: " + data.error);
      }
    } catch (err) {
      console.error(err);
      setIsUploading(false);
      alert("서버 연결에 실패했습니다.");
    }
  };

  return (
    <div className="p-6 space-y-8 animate-in fade-in duration-500">
      
      {/* 상단: 지능형 업로드 대시보드 */}
      <div className="bg-teal-950/20 border border-teal-500/30 p-8 rounded-xl text-center shadow-lg">
        <h2 className="text-2xl font-bold text-teal-100 mb-3">📄 AI 지능형 해설 & 자동 검수소</h2>
        <p className="text-teal-300/80 text-sm mb-6 leading-relaxed">
          <span className="font-bold text-teal-400">[법령 탭]</span>에 규정을 먼저 업로드한 뒤, 이곳에 문제지를 올리세요.<br/>
          제미나이가 법적 근거를 스스로 찾아내어 완벽한 해설을 창작합니다.
        </p>
        
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileUpload} 
          className="hidden" 
          accept=".pdf,.txt,.json"
        />
        <button 
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className={`px-8 py-4 rounded-lg font-bold text-lg transition-all shadow-xl ${
            isUploading 
              ? 'bg-teal-800/50 text-teal-500 cursor-wait border border-teal-700/50' 
              : 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white hover:from-teal-500 hover:to-emerald-500 hover:scale-105'
          }`}
        >
          {isUploading ? uploadStatus : '🚀 문제지 업로드 및 검수 시작'}
        </button>
      </div>

      {/* 하단: 무결점 문제 (골든 DB) 리스트 */}
      <div className="space-y-4">
        <div className="text-teal-400 text-sm border-b border-teal-500/30 pb-3 flex justify-between items-center px-2">
          <span className="font-bold text-lg">✅ 검수 완료된 모의고사 (골든 DB)</span>
          <span className="bg-teal-900/50 px-3 py-1 rounded-full text-teal-300 shadow-inner">
            총 {goldenExams.length}문제
          </span>
        </div>
        
        {goldenExams.length === 0 ? (
          <div className="py-24 text-center text-teal-700/70 text-sm tracking-widest bg-teal-950/10 rounded-lg border border-dashed border-teal-800/50">
            저장된 문제가 없습니다. 상단에서 문제지를 업로드해 주세요.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {goldenExams.map((exam: any) => {
              const isExpanded = expandedExamId === exam.id;
              return (
                <div 
                  key={exam.id} 
                  className={`border p-6 rounded-xl cursor-pointer transition-all duration-300 ${
                    isExpanded 
                      ? 'border-teal-400 bg-teal-900/30 shadow-[0_0_20px_rgba(45,212,191,0.15)] scale-[1.01]' 
                      : 'border-teal-900/40 bg-teal-950/20 hover:bg-teal-900/40 hover:border-teal-600/50'
                  }`}
                  onClick={() => setExpandedExamId(isExpanded ? null : exam.id)}
                >
                  {/* 문제 영역 */}
                  <div className="text-[16px] text-teal-50 font-medium leading-relaxed whitespace-pre-wrap">
                    <span className="text-teal-400 font-extrabold mr-2 text-lg">Q.</span>
                    {exam.question}
                  </div>

                  {/* 아코디언 확장 영역 (보기, 정답, 해설, 삭제버튼) */}
                  {isExpanded && (
                    <div className="mt-6 pt-6 border-t border-teal-800/50 animate-in slide-in-from-top-2 fade-in duration-300">
                      
                      {/* 보기 배열 출력 */}
                      {exam.options && exam.options.length > 0 && (
                        <div className="mb-6 space-y-3 pl-2">
                          {exam.options.map((opt: string, idx: number) => (
                            <div key={idx} className="text-teal-200/90 text-[15px] p-2 bg-teal-950/30 rounded border border-teal-800/30">
                              {opt}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 정답 표시 */}
                      <div className="flex items-center gap-3 mb-5">
                        <span className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-4 py-1.5 rounded-md text-[15px] font-bold shadow-md">
                          정답 : {exam.answer}
                        </span>
                      </div>

                      {/* 💡 [핵심 3] 시원하게 커진 해설창 영역 */}
                      <div className="mt-2">
                        <div className="text-teal-300 text-sm mb-2 font-bold flex items-center gap-2">
                          <span className="text-lg">💡</span> AI 법령 근거 및 해설
                        </div>
                        {/* index.css에 추가한 explanation-box 클래스가 여기서 작동합니다 */}
                        <div className="explanation-box">
                          {exam.explanation || "제공된 해설이 없습니다."}
                        </div>
                      </div>

                      {/* 삭제 버튼 */}
                      <div className="mt-6 flex justify-end">
                        <button 
                          onClick={(e) => handleDeleteExam(e, exam.id)}
                          className="px-4 py-2 bg-red-950/40 border border-red-500/40 text-red-400 rounded-md hover:bg-red-600 hover:text-white transition-all text-sm font-bold flex items-center gap-2 shadow-sm"
                        >
                          🗑️ 이 문제 영구 삭제
                        </button>
                      </div>

                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
