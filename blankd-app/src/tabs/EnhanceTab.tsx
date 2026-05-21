import React, { useState, useEffect, useRef } from 'react';

const BASE_URL = "https://api.blankd.top/api";

export const ExamTab = ({ walletAddress, address }: any) => {
  const userAddress = walletAddress || address;
  
  const [mode, setMode] = useState<'list' | 'coop'>('list');
  const [pendingExams, setPendingExams] = useState<Array<{id: number, filename: string, chunks: string[]}>>([]);
  
  const [examFile, setExamFile] = useState<File | null>(null);
  const [answerFile, setAnswerFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // 진행 상태
  const [currentExamId, setCurrentExamId] = useState<number | null>(null);
  const [chunks, setChunks] = useState<string[]>([]);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [filename, setFilename] = useState("");
  
  // AI 연동 상태
  const [parsedResult, setParsedResult] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{sender: 'ai' | 'user', text: string}>>([]);
  const [userFeedback, setUserFeedback] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 데이터 로드
  const fetchPending = async () => {
    if (!userAddress) return;
    try {
      const res = await fetch(`${BASE_URL}/get-pending-exams?wallet_address=${userAddress}`);
      const data = await res.json();
      setPendingExams(Array.isArray(data) ? data : []);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchPending(); }, [userAddress]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  // 1. 업로드 로직
  const handleUpload = async () => {
    if (!examFile || !userAddress) return alert("문제지 파일을 반드시 첨부해주세요.");
    setIsUploading(true);
    const fd = new FormData();
    fd.append('exam_file', examFile);
    if (answerFile) fd.append('answer_file', answerFile);
    fd.append('wallet_address', userAddress);

    try {
      const res = await fetch(`${BASE_URL}/upload-exam-coop`, { method: 'POST', body: fd });
      if (res.ok) {
        setExamFile(null); setAnswerFile(null);
        alert("업로드 완료!");
        fetchPending();
      }
    } catch (err: any) { alert(`업로드 실패: ${err.message}`); }
    setIsUploading(false);
  };

  // 2. 대화형 검수 시작
  const startReview = (exam: any) => {
    setCurrentExamId(exam.id); setChunks(exam.chunks); setFilename(exam.filename); setChunkIndex(0); setMode('coop');
    setParsedResult({ question: exam.chunks[0], options: ["①", "②", "③", "④", "⑤"], answer: "확인 필요", explanation: "" });
    setChatMessages([{ sender: 'ai', text: `안녕하세요 대표님!\n어떤 조항명을 검색해서 O/X 대조를 해드릴까요?\n(예: "건강보험법 제1조 검색해줘")` }]); 
    setUserFeedback("");
  };

  // 3. AI와 대화 (검색 및 O/X 판별)
  const analyzeChunk = async () => {
    if (isAnalyzing || !userFeedback.trim()) return;
    setIsAnalyzing(true);
    
    const newChat = [...chatMessages, { sender: 'user', text: userFeedback }];
    setChatMessages(newChat);
    setUserFeedback("");

    try {
      const res = await fetch(`${BASE_URL}/analyze-chunk`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chunk_text: parsedResult ? parsedResult.question : chunks[chunkIndex],
          wallet_address: userAddress,
          user_feedback: newChat[newChat.length -1].text,
          chat_history: newChat
        })
      });
      const data = await res.json();
      if (res.ok && data.result) {
        setParsedResult(data.result);
        setChatMessages(prev => [...prev, { sender: 'ai', text: data.result.chat_message || "대조 완료!" }]);
      }
    } catch (err) { alert("AI 통신 에러"); }
    setIsAnalyzing(false);
  };

  // 4. 장기기억(Rule) 저장 로직
  const saveToMemory = async () => {
    const rule = prompt("이 지문에서 배운 AI의 오답 패턴이나 O/X 판별 규칙을 요약해서 적어주세요.\n(예: '제42조에서 위원장은 장관이 아니라 차관임')");
    if (!rule) return;
    try {
      await fetch(`${BASE_URL}/save-ai-memory`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: userAddress, rule })
      });
      alert("✅ AI 장기기억에 규칙이 저장되어 다음 문제부터 적용됩니다!");
    } catch (e) { alert("저장 실패"); }
  };

  // 5. 현재 검수 저장 후 다음 문제로
  const nextChunk = async () => {
    try {
      await fetch(`${BASE_URL}/save-golden-exam`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: userAddress, title: filename, question: parsedResult.question, options: parsedResult.options, answer: parsedResult.answer, explanation: parsedResult.explanation })
      });

      if (chunkIndex + 1 < chunks.length) {
        setChunkIndex(chunkIndex + 1);
        setParsedResult({ question: chunks[chunkIndex + 1], options: ["①", "②", "③", "④", "⑤"], answer: "확인 필요", explanation: "" });
        setChatMessages([{ sender: 'ai', text: `[다음 문제] 입니다. 검색할 조항명을 말씀해주세요!` }]); 
      } else {
        await fetch(`${BASE_URL}/delete-pending-exam`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: currentExamId, wallet_address: userAddress })
        });
        alert("이 모의고사의 검수가 모두 끝났습니다!");
        setMode('list'); fetchPending();
      }
    } catch(err) {}
  };

  // 렌더링: 대화형 UI
  if (mode === 'coop') {
    return (
      <div className="flex flex-col h-[85vh] space-y-4 animate-in fade-in pb-10">
        <div className="flex justify-between items-center pb-4 border-b border-white/10">
          <h2 className="text-xl text-teal-400 font-serif">🤝 1:1 대화형 검수 [{filename}] ({chunkIndex + 1} / {chunks.length})</h2>
          <button onClick={() => setMode('list')} className="text-xs text-white/40 border border-white/10 px-3 py-1 rounded-sm hover:bg-white/5">목록으로</button>
        </div>

        <div className="flex flex-1 gap-6 overflow-hidden">
          {/* 좌측: 지문 및 해설 관리 */}
          <div className="w-[50%] flex flex-col gap-4 border border-white/10 rounded-sm bg-black/20 p-5 overflow-y-auto">
            <label className="text-teal-300 font-bold text-sm">📝 지문 원문</label>
            <textarea 
              value={parsedResult?.question || chunks[chunkIndex]} 
              onChange={e => setParsedResult({...parsedResult, question: e.target.value})}
              className="w-full min-h-[250px] bg-black/40 border border-white/10 text-white/90 p-4 text-[15px] leading-loose outline-none resize-none"
            />
            
            <div className="flex gap-2 items-center">
               <label className="text-sm font-bold text-teal-400 w-16">정답:</label>
               <input value={parsedResult?.answer || ''} onChange={e => setParsedResult({...parsedResult, answer: e.target.value})} className="bg-transparent border border-white/20 p-2 text-white outline-none w-20" />
            </div>

            <div className="flex justify-between items-end mt-4">
                <label className="text-[13px] font-bold text-emerald-400">💡 해설 정리</label>
                <button onClick={saveToMemory} className="text-[11px] bg-purple-600/80 hover:bg-purple-500 text-white px-3 py-1.5 rounded-sm transition-all shadow-lg">
                    🧠 방금 배운 규칙 AI 장기기억에 저장
                </button>
            </div>
            <textarea 
              value={parsedResult?.explanation || ''} 
              onChange={e => setParsedResult({...parsedResult, explanation: e.target.value})} 
              className="w-full min-h-[150px] bg-emerald-950/20 border border-emerald-500/30 text-emerald-100/90 p-4 text-[14px] leading-loose resize-none outline-none" 
            />
            
            <button onClick={nextChunk} className="mt-auto py-3 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-sm">✨ 저장 및 다음 문제로</button>
          </div>

          {/* 우측: 챗봇 */}
          <div className="w-[50%] flex flex-col border border-emerald-900/40 rounded-sm bg-[#0a192f]">
            <div className="bg-emerald-950/60 p-4 border-b border-emerald-900/40 shrink-0 text-emerald-300 font-bold text-sm">
                💬 AI O/X 판독기 {isAnalyzing && <span className="animate-pulse ml-2 text-xs">...검색 중</span>}
            </div>
            <div className="flex-1 overflow-y-auto flex flex-col gap-4 p-5">
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`flex flex-col max-w-[90%] ${msg.sender === 'user' ? 'self-end items-end' : 'self-start items-start'}`}>
                  <div className={`p-3 text-[14.5px] leading-relaxed rounded-lg whitespace-pre-wrap ${msg.sender === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-emerald-50 border border-emerald-500/20'}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="shrink-0 p-4 bg-slate-900 border-t border-white/5 flex gap-2">
              <input 
                type="text" value={userFeedback} onChange={e => setUserFeedback(e.target.value)} 
                placeholder="예: 법 제1조 대조해줘"
                onKeyDown={e => e.key === 'Enter' && analyzeChunk()}
                className="flex-1 bg-black/50 border border-indigo-500/40 text-white p-3 text-sm rounded outline-none"
              />
              <button onClick={analyzeChunk} disabled={isAnalyzing} className="px-6 py-2 bg-indigo-600 text-white font-bold text-sm rounded">전송</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 렌더링: 목록 및 업로드 UI
  return (
    <div className="space-y-8 animate-in fade-in pb-20">
      <div className="flex flex-col md:flex-row gap-4 p-6 border border-teal-500/50 bg-teal-950/30 rounded-sm">
        <label className="flex-1 border border-teal-900/40 p-3 text-center text-sm cursor-pointer text-teal-400 hover:bg-teal-900/20">
          <input type="file" onChange={e => setExamFile(e.target.files?.[0] || null)} className="hidden"/>
          {examFile ? `📂 ${examFile.name}` : '➕ 문제지 파일 선택'}
        </label>
        <label className="flex-1 border border-emerald-900/40 p-3 text-center text-sm cursor-pointer text-emerald-400 hover:bg-emerald-900/20">
          <input type="file" onChange={e => setAnswerFile(e.target.files?.[0] || null)} className="hidden"/>
          {answerFile ? `📂 ${answerFile.name}` : '➕ 정답지 파일 선택 (선택)'}
        </label>
        <button onClick={handleUpload} disabled={isUploading} className="px-6 py-3 bg-teal-500 text-teal-950 font-bold text-sm w-full md:w-32">
          {isUploading ? "업로드 중..." : "업로드"}
        </button>
      </div>

      <div className="p-6 border border-teal-500/50 bg-teal-950/30 rounded-sm">
        <h3 className="text-teal-400 font-bold mb-4 text-lg">📁 업로드된 모의고사 목록</h3>
        {pendingExams.length === 0 ? (
          <div className="py-8 text-center text-teal-500/50 text-sm">업로드된 파일이 없습니다.</div>
        ) : (
          <div className="space-y-2">
            {pendingExams.map((exam) => (
              <div key={exam.id} onClick={() => startReview(exam)} className="p-4 bg-black/40 border border-teal-500/20 rounded-sm hover:border-teal-400 cursor-pointer flex justify-between items-center transition-colors">
                <span className="text-teal-100 font-bold text-sm">{exam.filename}</span>
                <span className="text-white/40 text-xs">총 {exam.chunks.length} 문항 대기 중 ➔ 클릭하여 시작</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
