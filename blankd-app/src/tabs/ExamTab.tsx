import React, { useState } from 'react';
import { api } from '../services/api';

export const ExamTab = ({ exams, examFile, setExamFile, uploadExam, walletAddress }: any) => {
  const [expandedExamId, setExpandedExamId] = useState<number | null>(null);
  
  // 합동 검수(Co-op) 관련 상태
  const [mode, setMode] = useState<'list' | 'coop'>('list');
  
  // 💡 [신규] 검수 대기 중인 모의고사 목록을 관리하는 상태
  const [pendingExams, setPendingExams] = useState<Array<{filename: string, chunks: string[]}>>([]);
  
  // 현재 진행 중인 검수 데이터 상태
  const [chunks, setChunks] = useState<string[]>([]);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [filename, setFilename] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [parsedResult, setParsedResult] = useState<any>(null);

  // 1. 파일 업로드 후 즉시 시작하지 않고 '대기열'에 추가합니다.
  const handleUploadForReview = async () => {
    if (!examFile) return alert("먼저 파일을 선택해주세요.");
    const res = await api.uploadExamCoop(examFile);
    if (res.chunks) {
      // 대기열 목록에 추가
      setPendingExams(prev => [...prev, { filename: res.filename, chunks: res.chunks }]);
      setExamFile(null); // 업로드 창 초기화
      alert(`[${res.filename}] 파일이 합동 검수 대기소에 추가되었습니다!`);
    } else {
      alert("파일 분석에 실패했습니다.");
    }
  };

  // 2. 대기열 목록에서 우측의 [검수 시작] 버튼 클릭 시 발동
  const startCoopReview = (exam: {filename: string, chunks: string[]}) => {
    setChunks(exam.chunks);
    setFilename(exam.filename);
    setChunkIndex(0);
    setMode('coop');
    setParsedResult(null);
  };

  // AI에게 현재 문단 분석 지시
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

  // 데이터 교정 핸들러
  const handleEdit = (field: string, value: any) => {
    setParsedResult({ ...parsedResult, [field]: value });
  };
  const handleOptionEdit = (idx: number, value: string) => {
    const newOptions = [...(parsedResult.options || [])];
    newOptions[idx] = value;
    setParsedResult({ ...parsedResult, options: newOptions });
  };

  // DB에 골든 데이터로 승인 및 저장
  const approveAndNext = async () => {
    if (!parsedResult?.question || !parsedResult?.answer) return alert("데이터가 불완전합니다.");
    
    await api.saveGoldenExam({
      wallet_address: walletAddress,
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
      alert("🎉 해당 모의고사의 모든 검수가 완료되었습니다! 골든 DB에 저장되었습니다.");
      // 검수가 끝난 모의고사는 대기열 목록에서 제거합니다.
      setPendingExams(prev => prev.filter(e => e.filename !== filename));
      setMode('list');
    }
  };

  // ==========================================
  // 화면 1: 합동 검수(Co-op) 모드 렌더링
  // ==========================================
  if (mode === 'coop') {
    return (
      <div className="flex flex-col h-[80vh] space-y-4 animate-in fade-in">
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
          {/* 왼쪽: 원본 텍스트 */}
          <div className="flex-1 flex flex-col border border-white/10 rounded-sm bg-black/20 p-4">
            <div className="text-white/40 text-xs mb-4">📄 PDF 원본 문단 (직접 수정 가능)</div>
            <textarea 
              value={chunks[chunkIndex]} 
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

          {/* 오른쪽: AI 분석 결과 및 대표님 교정 */}
          <div className="flex-1 flex flex-col border border-teal-900/40 rounded-sm bg-teal-950/10 p-4 overflow-y-auto">
            <div className="text-teal-400/60 text-xs mb-4">✨ AI 추출 결과 (수정 가능)</div>
            
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
                    <label className="text-xs text-teal-500 block mb-1">정답</label>
                    <input value={parsedResult.answer || ''} onChange={e => handleEdit('answer', e.target.value)} className="w-full bg-black/30 border border-white/10 text-teal-400 font-bold p-2 text-center rounded-sm" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-teal-500 block mb-1">해설</label>
                    <textarea value={parsedResult.explanation || ''} onChange={e => handleEdit('explanation', e.target.value)} className="w-full bg-black/30 border border-white/10 text-white/80 p-2 text-sm rounded-sm" rows={2}/>
                  </div>
                </div>

                <button onClick={approveAndNext} className="w-full mt-6 py-4 bg-teal-500 text-teal-950 font-bold rounded-sm hover:scale-[1.02] transition-all shadow-lg shadow-teal-500/20">
                  ✅ 완벽함! 승인 및 다음 문제로 이동
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // 화면 2: 원본 리스트 뷰 및 대기열
  // ==========================================
  return (
    <div className="space-y-8 animate-in fade-in">
      {/* 파일 업로드 영역 */}
      <div className="flex gap-2 mb-8">
        <label className="flex-1 border border-teal-900/40 p-2 text-center text-xs hover:bg-teal-900/20 cursor-pointer text-teal-400">
          <input type="file" accept=".txt,.pdf,.html" onChange={e => setExamFile(e.target.files?.[0] || null)} className="hidden"/> 
          {examFile ? `✅ ${examFile.name}` : '+ 모의고사 파일 첨부하기'}
        </label>
        
        {/* 💡 신규: 업로드 하여 대기열에 올리기 */}
        <button onClick={handleUploadForReview} className="px-6 bg-teal-500 text-teal-950 font-bold text-xs hover:bg-teal-400 transition-colors">
          모의고사 업로드 🚀
        </button>

        {/* 기존 자동 전송 (혹시 필요할까봐 숨겨두거나 작게 배치) */}
        <button onClick={uploadExam} className="px-4 border border-teal-900/40 text-xs text-white/30 hover:text-white/60">
          (구) 자동 전송
        </button>
      </div>

      {/* 💡 신규: 검수 대기소 (업로드된 모의고사 목록) */}
      {pendingExams.length > 0 && (
        <div className="mb-12 p-6 border border-teal-500/50 bg-teal-950/30 rounded-sm shadow-[0_0_15px_rgba(45,212,191,0.1)]">
          <h3 className="text-teal-400 font-bold mb-2 text-lg">⏳ 합동 검수 대기소</h3>
          <p className="text-white/50 text-xs mb-6">업로드된 모의고사가 검수를 기다리고 있습니다. 우측의 '검수 시작'을 눌러주세요.</p>
          <div className="space-y-3">
            {pendingExams.map((exam, idx) => (
              <div key={idx} className="flex justify-between items-center p-4 bg-black/40 border border-teal-500/20 rounded-sm hover:border-teal-400 transition-colors group">
                <div className="flex flex-col">
                  <span className="text-teal-100 font-bold text-sm">{exam.filename}</span>
                  <span className="text-white/40 text-xs mt-1">총 {exam.chunks.length} 문단 대기 중</span>
                </div>
                <button 
                  onClick={() => startCoopReview(exam)} 
                  className="px-6 py-2 bg-teal-500 text-teal-950 font-bold text-sm rounded-sm shadow-lg hover:scale-105 transition-all opacity-90 group-hover:opacity-100"
                >
                  검수 시작 🎯
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-white/60 text-xs border-b border-white/10 pb-2">완료된 기출문제 열람실</div>
      {exams.length === 0 ? (
        <div className="py-20 text-center text-white/20 text-xs tracking-widest">저장된 모의고사가 없습니다. 상단에서 파일을 업로드하세요.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {exams.map((exam: any) => {
            const isExpanded = expandedExamId === exam.id;
            return (
              <div key={exam.id} className="border border-teal-900/40 bg-teal-950/10 p-6 rounded-sm cursor-pointer hover:bg-teal-900/20 transition-all" onClick={() => setExpandedExamId(isExpanded ? null : exam.id)}>
                <div className="text-[13px] text-teal-100 font-serif leading-loose whitespace-pre-wrap">{exam.question}</div>
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-teal-900/50 animate-in fade-in slide-in-from-top-2">
                    <div className="text-teal-400 font-bold text-sm mb-2">정답: {exam.answer}</div>
                    <div className="text-white/70 text-xs leading-relaxed">{exam.explanation}</div>
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
