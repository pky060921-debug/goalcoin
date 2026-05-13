import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';

export const ExamTab = ({ walletAddress, address }: any) => {
  const userAddress = walletAddress || address;

  const [mode, setMode] = useState<'list' | 'coop' | 'cbt' | 'result'>('list');
  const [examFile, setExamFile] = useState<File | null>(null);
  const [pendingExams, setPendingExams] = useState<Array<{id: number, filename: string, chunks: string[]}>>([]);
  const [goldenExams, setGoldenExams] = useState<any[]>([]);
  const [expandedExamId, setExpandedExamId] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const smartFileInputRef = useRef<HTMLInputElement>(null); // 신규: 지능형 해설 업로드용 ref

  const [currentExamId, setCurrentExamId] = useState<number | null>(null);
  const [chunks, setChunks] = useState<string[]>([]);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [filename, setFilename] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [parsedResult, setParsedResult] = useState<any>(null);

  // 신규: 지능형 분석 상태 관리
  const [isSmartUploading, setIsSmartUploading] = useState(false);
  const [smartUploadStatus, setSmartUploadStatus] = useState("");

  const [cbtQuestions, setCbtQuestions] = useState<any[]>([]);
  const [cbtCurrentIndex, setCbtCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [wrongNotes, setWrongNotes] = useState<any[]>([]);

  const fetchData = async () => {
    if (!userAddress) return;
    try {
      const [pending, golden] = await Promise.all([
        api.getPendingExams(userAddress),
        api.getGoldenExams(userAddress)
      ]);
      setPendingExams(Array.isArray(pending) ? pending : []);
      setGoldenExams(golden.exams || []);
    } catch (err) {
      console.error("데이터 로딩 실패", err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [userAddress]);

  // [신규] 개별 삭제 기능
  const handleDeleteExam = async (e: React.MouseEvent, examId: number) => {
    e.stopPropagation();
    if (!window.confirm("이 문제를 정말 삭제하시겠습니까? (삭제 후 복구 불가)")) return;
    
    try {
      const response = await fetch('/api/delete-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: examId, wallet_address: userAddress })
      });
      if (response.ok) {
        alert("성공적으로 삭제되었습니다.");
        fetchData();
      } else {
        alert("삭제 실패");
      }
    } catch (error) {
      console.error("삭제 요청 중 에러:", error);
      alert("서버 통신 오류로 삭제에 실패했습니다.");
    }
  };

  // [신규] 법령 기반 지능형 해설 업로드 (RAG)
  const handleSmartUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userAddress) return;

    setIsSmartUploading(true);
    setSmartUploadStatus("AI가 법령과 문제를 크로스체크하며 해설을 창작 중입니다...");

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
            setIsSmartUploading(false);
            alert("✨ AI 해설 작성이 완료되었습니다! 아래 리스트에서 확인하세요.");
            fetchData();
            if (smartFileInputRef.current) smartFileInputRef.current.value = '';
          } else if (statusData.status === 'error') {
            clearInterval(interval);
            setIsSmartUploading(false);
            alert("분석 중 오류 발생: " + statusData.message);
            if (smartFileInputRef.current) smartFileInputRef.current.value = '';
          } else {
            setSmartUploadStatus(`AI 분석 진행 중... (${statusData.progress || 0}%)`);
          }
        }, 2000);
      } else {
        setIsSmartUploading(false);
        alert("업로드 실패: " + data.error);
      }
    } catch (err) {
      console.error(err);
      setIsSmartUploading(false);
      alert("서버 연결에 실패했습니다.");
    }
  };

  // 기존 업로드 로직 (협동 검수용)
  const handleUploadForReview = async () => {
    if (!examFile) {
      fileInputRef.current?.click();
      return;
    }
    if (!userAddress) {
      return alert("지갑 주소가 없습니다. 앱 상단에서 로그인을 확인해주세요.");
    }
    
    try {
      await api.uploadExamCoop(examFile, userAddress);
      setExamFile(null);
      alert("파일이 DB에 안전하게 저장되었습니다! 이제 검수 대기소에서 확인 가능합니다.");
      fetchData();
    } catch (err: any) {
      alert(`업로드 실패: ${err.message}`);
    }
  };

  const startCoopReview = (exam: {id: number, filename: string, chunks: string[]}) => {
    setCurrentExamId(exam.id);
    setChunks(exam.chunks);
    setFilename(exam.filename);
    setChunkIndex(0);
    setMode('coop');
    setParsedResult(null);
  };

  const analyzeCurrentChunk = async () => {
    setIsAnalyzing(true);
    try {
      const res = await api.analyzeChunk(chunks[chunkIndex]);
      setParsedResult(res.result);
    } catch (err) {
      alert("AI 분석에 실패했습니다.");
    }
    setIsAnalyzing(false);
  };

  const handleEdit = (field: string, value: any) => {
    setParsedResult({ ...parsedResult, [field]: value });
  };

  const handleOptionEdit = (idx: number, value: string) => {
    const newOptions = [...(parsedResult.options || [])];
    newOptions[idx] = value;
    setParsedResult({ ...parsedResult, options: newOptions });
  };

  const approveAndNext = async () => {
    if (!parsedResult?.question || !parsedResult?.answer) return alert("데이터가 불완전합니다.");
    await api.saveGoldenExam({
      wallet_address: userAddress,
      title: filename,
      question: parsedResult.question,
      options: parsedResult.options,
      answer: parsedResult.answer,
      explanation: parsedResult.explanation
    });

    if (chunkIndex + 1 < chunks.length) {
      setChunkIndex(chunkIndex + 1);
      setParsedResult(null);
    } else {
      if (currentExamId && userAddress) {
        await api.deletePendingExam(userAddress, currentExamId);
      }
      alert("🎉 해당 모의고사의 모든 검수가 완료되었습니다! 골든 DB에 완벽히 저장되었습니다.");
      fetchData(); 
      setMode('list');
    }
  };

  const startCBT = async () => {
    if (!userAddress) return alert("로그인이 필요합니다.");
    try {
      const data = await api.getCbtSession(userAddress);
      setCbtQuestions(data);
      setCbtCurrentIndex(0);
      setUserAnswers({});
      setMode('cbt');
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleMark = (ans: string) => {
    setUserAnswers({ ...userAnswers, [cbtCurrentIndex]: ans });
  };

  const submitExam = () => {
    const wrongs = cbtQuestions.filter((q, idx) => String(q.answer) !== userAnswers[idx]);
    setWrongNotes(wrongs);
    setMode('result');
  };

  if (mode === 'coop') {
    return (
      <div className="flex flex-col h-[80vh] space-y-4 animate-in fade-in pb-10">
        <div className="flex justify-between items-center pb-4 border-b border-white/10">
          <h2 className="text-xl text-teal-400 font-serif">🤝 AI-대표님 합동 검수소 [{filename}]</h2>
          <div className="flex gap-4 items-center">
            <span className="text-white/40 text-sm font-bold bg-teal-950/50 px-3 py-1 rounded-sm border border-teal-900/50">
              진행도: {chunkIndex + 1} / {chunks.length}
            </span>
            <button onClick={() => setMode('list')} className="text-xs text-white/40 hover:text-white border border-white/10 px-3 py-1 rounded-sm hover:bg-white/5 transition-all">
              목록으로 나가기
            </button>
          </div>
        </div>

        <div className="flex flex-1 gap-6 overflow-hidden">
          <div className="flex-1 flex flex-col border border-white/10 rounded-sm bg-black/20 p-4">
            <div className="text-white/40 text-xs mb-4">📄 PDF 원본 문단 (직접 수정 가능)</div>
            <textarea 
              value={chunks[chunkIndex] || ""} 
              onChange={(e) => {
                const newChunks = [...chunks];
                newChunks[chunkIndex] = e.target.value;
                setChunks(newChunks);
              }}
              className="flex-1 w-full bg-transparent text-white/80 text-sm leading-relaxed outline-none resize-none"
            />
            <button 
              onClick={analyzeCurrentChunk} 
              disabled={isAnalyzing}
              className="mt-4 py-3 bg-teal-900/50 text-teal-400 border border-teal-500/30 hover:bg-teal-800/50 transition-all shadow-md"
            >
              {isAnalyzing ? "🧠 AI가 띄어쓰기 교정 및 분석 중..." : "🚀 이 문단 AI에게 풀기 지시"}
            </button>
          </div>

          <div className="flex-1 flex flex-col border border-teal-900/40 rounded-sm bg-teal-950/10 p-4 overflow-y-auto custom-scrollbar">
            <div className="text-teal-400/60 text-xs mb-4">💡 AI 추출 결과 (수정 가능)</div>
            {!parsedResult ? (
              <div className="flex-1 flex items-center justify-center text-white/20 text-sm">
                좌측에서 'AI에게 풀기 지시' 버튼을 눌러주세요.
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-teal-500 block mb-1">문제</label>
                  <textarea value={parsedResult.question || ''} onChange={e => handleEdit('question', e.target.value)} className="w-full bg-black/30 border border-white/10 text-white p-3 text-sm rounded-sm" rows={3}/>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-teal-500 block">보기 (4지 선다)</label>
                  {(parsedResult.options || ['', '', '', '']).map((opt: string, i: number) => (
                    <input key={i} value={opt} onChange={e => handleOptionEdit(i, e.target.value)} className="w-full bg-black/30 border border-white/10 text-white p-2 text-sm rounded-sm" />
                  ))}
                </div>
                <div className="flex gap-4">
                  <div className="w-1/4">
                    <label className="text-xs text-teal-500 block mb-1">정답 번호</label>
                    <input value={parsedResult.answer || ''} onChange={e => handleEdit('answer', e.target.value)} className="w-full bg-black/30 border border-white/10 text-teal-400 font-bold p-2 text-center rounded-sm" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-teal-500 block mb-1">해설</label>
                    <textarea value={parsedResult.explanation || ''} onChange={e => handleEdit('explanation', e.target.value)} className="w-full bg-black/30 border border-white/10 text-white/80 p-2 text-sm rounded-sm" rows={2}/>
                  </div>
                </div>
                <button onClick={approveAndNext} className="w-full mt-6 py-4 bg-teal-500 text-teal-950 font-bold rounded-sm hover:scale-[1.02] transition-all shadow-lg shadow-teal-500/20">
                  ✨ 완벽함! 승인 및 다음 문제로 이동
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'cbt') {
    const q = cbtQuestions[cbtCurrentIndex];
    if (!q) return null;
    return (
      <div className="flex flex-col h-[70vh] bg-teal-950/10 border border-teal-900/40 p-8 rounded-sm relative">
        <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-4">
          <div className="text-teal-400 font-serif text-xl">Q. {cbtCurrentIndex + 1} / {cbtQuestions.length}</div>
        </div>
        
        <div className="flex-1 overflow-y-auto mb-6 pr-4">
          <div className="text-white/90 text-lg leading-relaxed whitespace-pre-wrap">{q.question}</div>
         
          <div className="mt-8 space-y-3">
            {q.options && q.options.map((opt: string, idx: number) => {
              const numStr = String(idx + 1);
              const isSelected = userAnswers[cbtCurrentIndex] === numStr;
              return (
                <button 
                  key={idx} 
                  onClick={() => handleMark(numStr)}
                  className={`w-full text-left p-4 rounded-sm border transition-all ${isSelected ? 'border-teal-400 bg-teal-900/40 text-teal-100' : 'border-white/10 text-white/60 hover:bg-white/5'}`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-between mt-auto">
          <button onClick={() => setCbtCurrentIndex(Math.max(0, cbtCurrentIndex - 1))} disabled={cbtCurrentIndex === 0} className="px-6 py-3 border border-white/20 text-white/60 disabled:opacity-30">이전</button>
          {cbtCurrentIndex === cbtQuestions.length - 1 ? (
            <button onClick={submitExam} className="px-8 py-3 bg-teal-500 text-teal-950 font-bold rounded-sm">답안 제출 및 채점</button>
          ) : (
            <button onClick={() => setCbtCurrentIndex(cbtCurrentIndex + 1)} className="px-6 py-3 border border-teal-500/50 text-teal-400">다음 문제</button>
          )}
        </div>
      </div>
    );
  }

  if (mode === 'result') {
    return (
      <div className="space-y-8 animate-in fade-in pb-20">
        <div className="text-center space-y-2 mb-12">
          <h2 className="text-4xl font-serif text-teal-400">{cbtQuestions.length - wrongNotes.length}점 / {cbtQuestions.length}점</h2>
          <p className="text-white/50 text-sm">오답노트를 복습하여 다음 시험을 대비하세요.</p>
        </div>
        
        <div className="text-white/60 text-xs border-b border-white/10 pb-2">오답 취약점 분석</div>
    
        {wrongNotes.map((q, i) => (
          <div key={i} className="p-6 border border-red-900/30 bg-red-950/5 rounded-sm space-y-4">
            <div className="text-white/80 whitespace-pre-wrap">{q.question}</div>
            <div className="text-teal-400 text-sm bg-teal-950/30 p-4 border-l-2 border-teal-500">
              <p className="font-bold mb-2">🎯 정답: {q.answer}번</p>
              <p>{q.explanation}</p>
            </div>
          </div>
        ))}
        <button onClick={() => setMode('list')} className="w-full py-4 border border-white/10 text-white/40 hover:bg-white/5 transition-colors text-sm">열람실로 돌아가기</button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in pb-20">
      
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        {/* 기존의 개별 문단 분석(협동 검수)용 파일 업로드 버튼 */}
        <label className="flex-1 border border-teal-900/40 p-4 text-center text-sm hover:bg-teal-900/20 cursor-pointer text-teal-400 flex items-center justify-center transition-colors">
          <input ref={fileInputRef} type="file" accept=".pdf,.txt" onChange={e => setExamFile(e.target.files?.[0] || null)} className="hidden"/> 
          {examFile ? `📂 ${examFile.name} (선택됨)` : '📄 협동 검수용 파일 첨부하기'}
        </label>
   
        <button onClick={handleUploadForReview} className="px-8 bg-teal-500 text-teal-950 font-bold text-sm hover:bg-teal-400 transition-colors shadow-lg">
          {examFile ? '이 모의고사 업로드 🚀' : '협동 검수 대기소로 업로드 🚀'}
        </button>

        <button onClick={startCBT} className="px-8 border border-teal-400 text-teal-400 font-bold text-sm hover:bg-teal-900/30 transition-colors">
          🎯 100문제 실전 응시하기
        </button>
      </div>

      {/* 💡 [신규] 법령 기반 지능형 해설 업로드 패널 (RAG) */}
      <div className="mb-12 p-8 border border-emerald-500/40 bg-teal-950/40 rounded-sm shadow-xl text-center">
        <h3 className="text-emerald-400 font-bold mb-3 text-xl">💡 지능형 해설 자동 생성소 (RAG)</h3>
        <p className="text-white/60 text-sm mb-6">
          법령 탭에 규정을 먼저 업로드해두셨나요? 문제지만 업로드하면 AI가 법령을 대조하여 상세 해설을 자동 생성해 골든 DB에 즉시 저장합니다.
        </p>
        <input ref={smartFileInputRef} type="file" accept=".pdf,.txt" onChange={handleSmartUpload} className="hidden" id="smart-upload-btn"/>
        <label htmlFor="smart-upload-btn" className={`px-10 py-4 font-bold rounded-sm shadow-lg cursor-pointer inline-block transition-all ${isSmartUploading ? 'bg-emerald-900/50 text-emerald-500 cursor-wait' : 'bg-emerald-600 text-white hover:bg-emerald-500 hover:scale-105'}`}>
          {isSmartUploading ? smartUploadStatus : "✨ 지능형 모의고사 업로드 (해설 자동생성)"}
        </label>
      </div>

      <div className="mb-12 p-6 border border-teal-500/50 bg-teal-950/30 rounded-sm shadow-[0_0_15px_rgba(45,212,191,0.1)]">
        <h3 className="text-teal-400 font-bold mb-2 text-lg">📁 합동 검수 대기소 (클라우드 연동)</h3>
        <p className="text-white/50 text-xs mb-6">스마트폰이나 PC 어디서든 업로드한 파일이 동기화됩니다.</p>
        
        {pendingExams.length === 0 ? (
          <div className="py-12 text-center border border-dashed border-teal-900/40 rounded-sm text-teal-500/50 text-sm">
            현재 대기 중인 모의고사가 없습니다.<br/>위 버튼을 눌러 새 모의고사를 업로드해주세요.
          </div>
        ) : (
          <div className="space-y-3">
            {pendingExams.map((exam) => (
              <div key={exam.id} className="flex justify-between items-center p-4 bg-black/40 border border-teal-500/20 rounded-sm hover:border-teal-400 transition-colors group">
                <div className="flex flex-col">
                  <span className="text-teal-100 font-bold text-sm">{exam.filename}</span>
                  <span className="text-white/40 text-xs mt-1">총 {exam.chunks.length} 문단 대기 중</span>
                </div>
          
                <button onClick={() => startCoopReview(exam)} className="px-6 py-2 bg-teal-500 text-teal-950 font-bold text-sm rounded-sm shadow-lg hover:scale-105 transition-all opacity-90 group-hover:opacity-100">
                  검수 시작 🚀
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-white/60 text-xs border-b border-white/10 pb-2">✅ 검수 완료된 무결점 문제 (골든 DB)</div>
      {goldenExams.length === 0 ? (
        <div className="py-20 text-center text-white/20 text-xs tracking-widest">저장된 문제가 없습니다. 검수를 완료해 주세요.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {goldenExams.map((exam: any) => {
            const isExpanded = expandedExamId === exam.id;
            return (
              <div key={exam.id} className="border border-teal-900/40 bg-teal-950/10 p-6 rounded-sm cursor-pointer hover:bg-teal-900/20 transition-all" onClick={() => setExpandedExamId(isExpanded ? null : exam.id)}>
                <div className="text-[13px] text-teal-100 font-serif leading-loose whitespace-pre-wrap">{exam.question}</div>
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-teal-900/50 animate-in fade-in slide-in-from-top-2">
                    <div className="text-teal-400 font-bold text-sm mb-2">정답: {exam.answer}</div>
                    
                    {/* 💡 확장 적용된 해설창 클래스 */}
                    <div className="explanation-box mt-3 text-white/80">
                      {exam.explanation}
                    </div>

                    {/* 💡 개별 영구 삭제 버튼 */}
                    <div className="mt-6 flex justify-end">
                      <button 
                        onClick={(e) => handleDeleteExam(e, exam.id)} 
                        className="px-4 py-2 border border-red-500/30 text-red-400 hover:bg-red-500/20 rounded-sm text-xs font-bold transition-all"
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
  );
};
