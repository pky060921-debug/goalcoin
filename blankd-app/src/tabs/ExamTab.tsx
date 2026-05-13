import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';

const BASE_URL = "https://api.blankd.top/api";

export const ExamTab = ({ walletAddress, address }: any) => {
  const userAddress = walletAddress || address;
  
  const [mode, setMode] = useState<'list' | 'coop' | 'cbt' | 'result'>('list');
  const [examFile, setExamFile] = useState<File | null>(null);
  const [answerFile, setAnswerFile] = useState<File | null>(null);
  
  // 💡 법령과 정관 파일 상태 분리
  const [lawFile, setLawFile] = useState<File | null>(null);
  const [ruleFile, setRuleFile] = useState<File | null>(null);
  
  const [pendingExams, setPendingExams] = useState<Array<{id: number, filename: string, chunks: string[]}>>([]);
  const [goldenExams, setGoldenExams] = useState<any[]>([]); 
  const [rawLawsData, setRawLawsData] = useState<any[]>([]); 
  const [expandedExamId, setExpandedExamId] = useState<number | null>(null);
  
  // 💡 클릭 시 문서 내용을 보여줄 뷰어 상태
  const [viewingContent, setViewingContent] = useState<{title: string, content: string} | null>(null);

  const lawInputRef = useRef<HTMLInputElement>(null);
  const ruleInputRef = useRef<HTMLInputElement>(null);
  const examInputRef = useRef<HTMLInputElement>(null);
  const answerInputRef = useRef<HTMLInputElement>(null);
  
  const [currentExamId, setCurrentExamId] = useState<number | null>(null);
  const [chunks, setChunks] = useState<string[]>([]);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [filename, setFilename] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [parsedResult, setParsedResult] = useState<any>(null);

  const [isRefUploading, setIsRefUploading] = useState(false);
  const [isExamUploading, setIsExamUploading] = useState(false);

  const [cbtQuestions, setCbtQuestions] = useState<any[]>([]);
  const [cbtCurrentIndex, setCbtCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [wrongNotes, setWrongNotes] = useState<any[]>([]);

  const fetchData = async () => {
    if (!userAddress) return;
    try {
      const [pending, goldenRes, catsRes] = await Promise.all([
        api.getPendingExams(userAddress),
        fetch(`${BASE_URL}/get-golden-exams?wallet_address=${userAddress}`).then(r => r.json()),
        fetch(`${BASE_URL}/get-categories?wallet_address=${userAddress}`).then(r => r.json())
      ]);
      setPendingExams(Array.isArray(pending) ? pending : []);
      setGoldenExams(goldenRes.exams || []);
      
      if (catsRes.categories) {
        setRawLawsData(catsRes.categories);
      }
    } catch (err: any) {
      console.error("[데이터 로드 에러]", err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [userAddress]);

  // 1. 공통 근거자료 (법령/정관) 업로드 로직
  const handleRefUpload = async (file: File | null, typeLabel: string) => {
    if (!file || !userAddress) return alert(`${typeLabel} 파일을 선택해주세요.`);
    setIsRefUploading(true);
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('wallet_address', userAddress);
    formData.append('custom_folder', file.name);

    try {
      const res = await fetch(`${BASE_URL}/upload-pdf`, { method: 'POST', body: formData });
      const data = await res.json();
      
      if (res.ok) {
         const taskId = data.task_id;
         const timer = setInterval(async () => {
           try {
             const sRes = await fetch(`${BASE_URL}/task-status?task_id=${taskId}`);
             const sData = await sRes.json();
             if (sData.status === 'completed') {
               clearInterval(timer); 
               setIsRefUploading(false); 
               if (typeLabel === '법령') setLawFile(null);
               if (typeLabel === '정관') setRuleFile(null);
               alert(`${typeLabel} 업로드가 완료되었습니다!`);
               fetchData();
             } else if (sData.status === 'error') {
               clearInterval(timer); 
               setIsRefUploading(false); 
               alert(`${typeLabel} 분석 오류: ` + sData.message);
             }
           } catch(err) {
             console.error("[상태 체크 통신 에러]", err);
           }
         }, 2000);
      } else {
         setIsRefUploading(false);
         alert("업로드 실패: " + data.error);
      }
    } catch(e: any) {
      setIsRefUploading(false);
      alert(`서버 연결 실패.\n사유: ${e.message}`);
    }
  };

  // 2. 모의고사 첨부 - 업로드 로직
  const handleUploadForReview = async () => {
    if (!examFile || !userAddress) return alert("문제지 파일을 반드시 첨부해주세요.");
    setIsExamUploading(true);
    
    const formData = new FormData();
    formData.append('exam_file', examFile);
    if (answerFile) formData.append('answer_file', answerFile);
    formData.append('wallet_address', userAddress);

    try {
      const res = await fetch(`${BASE_URL}/upload-exam-coop`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      
      if (res.ok) {
        setExamFile(null);
        setAnswerFile(null);
        alert("문제와 정답이 한 쌍으로 대기소에 안전하게 저장되었습니다!");
        fetchData();
      } else {
        alert("업로드 실패: " + data.error);
      }
    } catch (err: any) {
      alert(`업로드 실패: ${err.message}`);
    }
    setIsExamUploading(false);
  };

  const handleDeletePendingExam = async (id: number) => {
    if (!confirm("이 대기열 모의고사를 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`${BASE_URL}/delete-pending-exam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, wallet_address: userAddress })
      });
      if (res.ok) {
        alert("삭제되었습니다.");
        fetchData();
      } else {
        const data = await res.json();
        alert("삭제 실패: " + data.error);
      }
    } catch (e: any) {
      alert("삭제 중 서버 오류가 발생했습니다.");
    }
  };

  const handleGenerateRAGFromPending = async (id: number) => {
    if (!confirm("법령을 참고하여 이 문제들의 해설을 자동 생성하시겠습니까?")) return;
    setIsAnalyzing(true);
    try {
      const res = await fetch(`${BASE_URL}/generate-rag-from-pending`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, wallet_address: userAddress })
      });
      const data = await res.json();
      if (res.ok) {
         const taskId = data.task_id;
         const timer = setInterval(async () => {
           try {
             const sRes = await fetch(`${BASE_URL}/task-status?task_id=${taskId}`);
             const sData = await sRes.json();
             if (sData.status === 'completed') {
               clearInterval(timer); 
               setIsAnalyzing(false); 
               fetchData();
               alert("✨ 해설 자동 생성이 완료되어 골든 DB에 저장되었습니다!");
             } else if (sData.status === 'error') {
               clearInterval(timer); 
               setIsAnalyzing(false); 
               alert("분석 오류: " + sData.message);
             }
           } catch(err) {
             console.error("[RAG 상태 체크 에러]", err);
           }
         }, 2000);
      } else {
         setIsAnalyzing(false); 
         alert(data.error);
      }
    } catch(e: any) {
      setIsAnalyzing(false); 
      alert(`서버 연결 실패.\n사유: ${e.message}`);
    }
  };

  const handleDeleteExam = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm("이 문제를 영구 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`${BASE_URL}/delete-exam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, wallet_address: userAddress })
      });
      if (res.ok) {
        alert("삭제가 완료되었습니다.");
        fetchData();
      } else {
        const data = await res.json();
        alert("삭제 실패: " + data.error);
      }
    } catch (err: any) {
      alert("삭제 실패: 서버 통신 오류");
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
      const res = await fetch(`${BASE_URL}/analyze-chunk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chunk_text: chunks[chunkIndex], wallet_address: userAddress })
      });
      const data = await res.json();
      if (res.ok) {
        setParsedResult(data.result);
      } else {
        alert("AI 분석 실패: " + data.error);
      }
    } catch (err: any) {
      alert("AI 분석 중 통신 에러가 발생했습니다.");
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
    try {
      await fetch(`${BASE_URL}/save-golden-exam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: userAddress,
          title: filename,
          question: parsedResult.question,
          options: parsedResult.options,
          answer: parsedResult.answer,
          explanation: parsedResult.explanation,
          search_process: parsedResult.search_process || ""
        })
      });

      if (chunkIndex + 1 < chunks.length) {
        setChunkIndex(chunkIndex + 1);
        setParsedResult(null);
      } else {
        if (currentExamId && userAddress) {
          await fetch(`${BASE_URL}/delete-pending-exam`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: currentExamId, wallet_address: userAddress })
          });
        }
        alert("해당 모의고사의 모든 검수가 완료되었습니다!");
        fetchData(); 
        setMode('list');
      }
    } catch(err: any) {
      console.error(`[승인 및 저장 에러] 상세 내역:`, err.message || err);
    }
  };

  const startCBT = async () => {
    if (!userAddress) return alert("로그인이 필요합니다.");
    try {
      const data = await fetch(`${BASE_URL}/get-cbt-session?wallet_address=${userAddress}`).then(r => r.json());
      if (data.error) throw new Error(data.error);
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
      <div className="flex flex-col h-[85vh] space-y-4 animate-in fade-in pb-10">
        <div className="flex justify-between items-center pb-4 border-b border-white/10">
          <h2 className="text-xl text-teal-400 font-serif">🤝 AI 합동 검수소 [{filename}]</h2>
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
          <div className="w-1/2 flex flex-col gap-4 border border-white/10 rounded-sm bg-black/20 p-5 overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center">
              <div className="text-teal-300 font-bold text-sm">📝 1. 문제 원문 (수정 가능)</div>
              <button 
                onClick={analyzeCurrentChunk} 
                disabled={isAnalyzing}
                className="py-2 px-4 bg-teal-600 text-white text-xs font-bold rounded-sm shadow-md hover:bg-teal-500 transition-all"
              >
                {isAnalyzing ? "AI 분석 중..." : "🚀 AI에게 문제/정답/해설 분리 지시"}
              </button>
            </div>
            <textarea 
              value={chunks[chunkIndex] || ""} 
              onChange={(e) => {
                const newChunks = [...chunks];
                newChunks[chunkIndex] = e.target.value;
                setChunks(newChunks);
              }}
              className="h-48 w-full bg-black/40 border border-white/10 text-white/80 p-3 text-sm leading-relaxed outline-none resize-none rounded-sm"
            />

            {parsedResult && (
              <div className="flex flex-col gap-4 mt-2 animate-in fade-in">
                <div>
                  <label className="text-sm font-bold text-teal-400 block mb-2">🎯 2. 추출된 문제</label>
                  <textarea value={parsedResult.question || ''} onChange={e => handleEdit('question', e.target.value)} className="w-full bg-teal-950/20 border border-teal-500/30 text-white p-3 text-sm rounded-sm" rows={3}/>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-teal-400 block mb-2">📋 3. 추출된 보기</label>
                  {(parsedResult.options || ['', '', '', '']).map((opt: string, i: number) => (
                    <div key={i} className="flex gap-2 items-center">
                      <span className="text-teal-500 font-bold text-xs">{i+1}.</span>
                      <input value={opt} onChange={e => handleOptionEdit(i, e.target.value)} className="w-full bg-teal-950/20 border border-teal-500/30 text-white p-2 text-sm rounded-sm" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="w-1/2 flex flex-col border border-emerald-900/40 rounded-sm bg-emerald-950/10 p-5 overflow-y-auto custom-scrollbar">
            {!parsedResult ? (
              <div className="h-full flex flex-col items-center justify-center text-white/30 text-sm space-y-4">
                <div className="text-4xl">🤖</div>
                <p>좌측의 원문을 확인하고 [AI에게 분리 지시] 버튼을 눌러주세요.</p>
                <p>미리 업로드된 근거(법령/정관)를 기반으로 상세 해설이 이곳에 작성됩니다.</p>
              </div>
            ) : (
              <div className="flex flex-col h-full animate-in fade-in">
                <div className="mb-4">
                  <label className="text-sm font-bold text-emerald-400 block mb-2">✅ 4. 정답</label>
                  <input value={parsedResult.answer || ''} onChange={e => handleEdit('answer', e.target.value)} className="w-full bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 font-black p-3 text-center rounded-sm text-lg" />
                </div>
                
                {parsedResult.search_process && (
                  <div className="mb-4 p-3 bg-black/40 border-l-2 border-indigo-500 rounded-sm">
                    <div className="text-indigo-400 font-bold text-xs mb-1">🧠 AI 사고 과정 (장기 기억)</div>
                    <div className="text-white/60 text-xs leading-relaxed whitespace-pre-wrap">{parsedResult.search_process}</div>
                  </div>
                )}

                <div className="flex flex-col flex-1">
                  <label className="text-sm font-bold text-emerald-400 block mb-2">💡 5. AI 지능형 해설 (근거 기반)</label>
                  <textarea value={parsedResult.explanation || ''} onChange={e => handleEdit('explanation', e.target.value)} className="w-full flex-1 min-h-[250px] bg-emerald-950/20 border border-emerald-500/30 text-emerald-100/90 p-4 text-[15px] leading-loose rounded-sm resize-none" />
                </div>
                <button onClick={approveAndNext} className="w-full mt-6 py-4 bg-emerald-600 text-white font-bold rounded-sm hover:scale-[1.01] hover:bg-emerald-500 transition-all shadow-lg">
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
                <button key={idx} onClick={() => handleMark(numStr)} className={`w-full text-left p-4 rounded-sm border transition-all ${isSelected ? 'border-teal-400 bg-teal-900/40 text-teal-100' : 'border-white/10 text-white/60 hover:bg-white/5'}`}>
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
      
      <div className="flex gap-4 border-b border-white/10 pb-4">
        <button onClick={() => setMode('list')} className={`px-4 py-2 ${mode === 'list' ? 'bg-teal-600 text-white' : 'text-teal-400'}`}>목록/업로드</button>
      </div>

      {mode === 'list' && (
        <div className="space-y-8">
          
          {/* 💡 1. 근거 자료 (법령 및 정관) 분리 업로드 패널 */}
          <div className="flex flex-col gap-4 p-6 border border-teal-500/50 bg-teal-950/30 rounded-sm">
            <h3 className="text-teal-400 font-bold text-lg mb-2">📥 1. 근거 자료 (법령 및 정관) 업로드</h3>
            
            <div className="flex flex-col xl:flex-row gap-4">
              {/* 1-1. 법령 업로드 */}
              <div className="flex-1 flex gap-2 items-center">
                <label className="flex-1 border border-teal-900/40 p-3 text-center text-sm hover:bg-teal-900/20 cursor-pointer text-teal-400 transition-colors">
                  <input ref={lawInputRef} type="file" accept=".pdf,.txt,.html" onChange={e => setLawFile(e.target.files?.[0] || null)} className="hidden"/>
                  {lawFile ? `📂 ${lawFile.name}` : '⚖️ 1-1. 법령 파일 첨부'}
                </label>
                <button onClick={() => handleRefUpload(lawFile, '법령')} disabled={isRefUploading} className="px-6 py-3 bg-emerald-600 text-white font-bold text-sm shadow-lg w-28 shrink-0 hover:bg-emerald-500 transition-all">
                  {isRefUploading ? "..." : "업로드"}
                </button>
              </div>

              {/* 1-2. 정관 업로드 */}
              <div className="flex-1 flex gap-2 items-center">
                <label className="flex-1 border border-teal-900/40 p-3 text-center text-sm hover:bg-teal-900/20 cursor-pointer text-teal-400 transition-colors">
                  <input ref={ruleInputRef} type="file" accept=".pdf,.txt,.html" onChange={e => setRuleFile(e.target.files?.[0] || null)} className="hidden"/>
                  {ruleFile ? `📂 ${ruleFile.name}` : '📜 1-2. 정관 파일 첨부'}
                </label>
                <button onClick={() => handleRefUpload(ruleFile, '정관')} disabled={isRefUploading} className="px-6 py-3 bg-emerald-600 text-white font-bold text-sm shadow-lg w-28 shrink-0 hover:bg-emerald-500 transition-all">
                  {isRefUploading ? "..." : "업로드"}
                </button>
              </div>
            </div>

            {/* 💡 업로드된 법령/정관 뷰어 리스트 */}
            {rawLawsData.length > 0 && (
              <div className="mt-4 p-4 bg-black/30 border border-emerald-900/50 rounded-sm">
                <div className="text-xs text-emerald-400 mb-3 font-bold">✅ 현재 참고 중인 근거 자료 (클릭하여 내용 확인):</div>
                <div className="flex flex-wrap gap-2">
                  {rawLawsData.map((law, idx) => (
                    <button 
                      key={idx} 
                      onClick={() => setViewingContent(law)}
                      className="px-3 py-2 bg-emerald-950/50 border border-emerald-800 text-emerald-200 text-xs rounded hover:bg-emerald-800 transition-colors"
                    >
                      📄 {law.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 2. 모의고사 (문제+정답) 첨부 패널 */}
          <div className="flex flex-col gap-4 p-6 border border-teal-500/50 bg-teal-950/30 rounded-sm">
            <h3 className="text-teal-400 font-bold text-lg mb-2">📥 2. 모의고사 (문제와 정답 한 쌍) 업로드</h3>
            <p className="text-white/50 text-xs mb-4">문제지 파일과 정답지 파일을 각각 선택하여 하나의 세트로 묶어서 올립니다.</p>

            <div className="flex flex-col md:flex-row gap-4">
              <label className="flex-1 border border-teal-900/40 p-3 text-center text-sm hover:bg-teal-900/20 cursor-pointer text-teal-400 transition-colors">
                <input ref={examInputRef} type="file" accept=".pdf,.txt" onChange={e => setExamFile(e.target.files?.[0] || null)} className="hidden"/>
                <span className="font-bold">Q.</span> {examFile ? `📂 ${examFile.name}` : '문제지 파일 선택 (필수)'}
              </label>

              <label className="flex-1 border border-emerald-900/40 p-3 text-center text-sm hover:bg-emerald-900/20 cursor-pointer text-emerald-400 transition-colors">
                <input ref={answerInputRef} type="file" accept=".pdf,.txt" onChange={e => setAnswerFile(e.target.files?.[0] || null)} className="hidden"/>
                <span className="font-bold">A.</span> {answerFile ? `📂 ${answerFile.name}` : '정답/해설지 파일 선택 (선택)'}
              </label>

              <button onClick={handleUploadForReview} disabled={isExamUploading} className="px-6 py-3 bg-teal-500 text-teal-950 font-bold text-sm shadow-lg w-full md:w-32 shrink-0 hover:bg-teal-400 transition-all">
                {isExamUploading ? "처리 중..." : "한 쌍 업로드"}
              </button>
            </div>
          </div>

          {/* 3. 합동 검수 대기소 */}
          <div className="p-6 border border-teal-500/50 bg-teal-950/30 rounded-sm shadow-[0_0_15px_rgba(45,212,191,0.1)]">
            <h3 className="text-teal-400 font-bold mb-2 text-lg">📁 3. 합동 검수 목록 (클라우드 연동)</h3>
            <p className="text-white/50 text-xs mb-6">스마트폰이나 PC 어디서든 업로드한 파일이 동기화됩니다.</p>
            
            {pendingExams.length === 0 ? (
              <div className="py-12 text-center border border-dashed border-teal-900/40 rounded-sm text-teal-500/50 text-sm">
                대기 중인 모의고사가 없습니다. 위 버튼을 눌러 모의고사를 업로드해주세요.
              </div>
            ) : (
              <div className="space-y-3">
                {pendingExams.map((exam) => (
                  <div key={exam.id} className="flex flex-col xl:flex-row justify-between items-center p-4 bg-black/40 border border-teal-500/20 rounded-sm hover:border-teal-400 transition-colors gap-4">
                    <div className="flex flex-col w-full xl:w-auto">
                      <span className="text-teal-100 font-bold text-sm">{exam.filename} (문제+정답 세트)</span>
                      <span className="text-white/40 text-xs mt-1">총 {exam.chunks.length} 문제 대기 중</span>
                    </div>
              
                    <div className="flex flex-wrap gap-2 w-full xl:w-auto justify-end">
                      <button onClick={() => startCoopReview(exam)} className="px-4 py-2 border border-teal-500/50 text-teal-400 font-bold text-xs rounded-sm hover:bg-teal-900/30 transition-all">
                        수동 검수 시작 🚀
                      </button>
                      <button onClick={() => handleGenerateRAGFromPending(exam.id)} className="px-4 py-2 bg-emerald-600 text-white font-bold text-xs rounded-sm shadow-lg hover:bg-emerald-500 transition-all">
                        4. 해설 자동생성
                      </button>
                      <button onClick={() => handleDeletePendingExam(exam.id)} className="px-3 py-2 bg-red-950/40 border border-red-500/30 text-red-400 font-bold text-xs rounded-sm hover:bg-red-900/50 transition-all">
                        🗑️ 삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {isAnalyzing && <div className="mt-4 text-emerald-400 text-sm font-bold text-center animate-pulse">✨ AI가 분석 중입니다. 터미널의 로그를 주시해주세요...</div>}
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
                        <div className="text-teal-400 font-bold text-sm mb-4">정답: {exam.answer}</div>
                        
                        {exam.search_process && (
                          <div className="mb-4 p-4 bg-black/40 border-l-2 border-indigo-500 rounded-sm">
                            <div className="text-indigo-400 font-bold text-xs mb-2">🧠 AI 장기기억 (사고 과정)</div>
                            <div className="text-white/60 text-xs leading-relaxed whitespace-pre-wrap">{exam.search_process}</div>
                          </div>
                        )}

                        <div className="explanation-box mt-3 text-white/80">
                          {exam.explanation}
                        </div>

                        <div className="mt-6 flex justify-end">
                          <button onClick={(e) => handleDeleteExam(e, exam.id)} className="px-4 py-2 border border-red-500/30 text-red-400 hover:bg-red-500/20 rounded-sm text-xs font-bold transition-all">
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
      )}

      {/* 💡 문서 내용 팝업 뷰어 (Modal) */}
      {viewingContent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 animate-in fade-in">
          <div className="bg-teal-950 border border-teal-500/50 rounded-sm w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl">
            <div className="flex justify-between items-center p-4 border-b border-teal-500/30 bg-teal-900/30">
              <h3 className="text-teal-300 font-bold text-lg">📄 {viewingContent.title}</h3>
              <button 
                onClick={() => setViewingContent(null)} 
                className="text-white/50 hover:text-white text-2xl font-bold px-2"
              >
                &times;
              </button>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 text-white/80 text-sm leading-relaxed whitespace-pre-wrap bg-black/20">
              {viewingContent.content}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
