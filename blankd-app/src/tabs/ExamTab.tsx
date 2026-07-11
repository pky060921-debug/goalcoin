import React, { useState } from 'react';

const BASE_URL = "https://api.blankd.top/api";

export const ExamTab = ({ walletAddress, address }: any) => {
  const safeAddress = walletAddress || address;
  
  const [examFile, setExamFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState<string>("");
  const [isExtracting, setIsExtracting] = useState(false);
  
  const [parsedQuizzes, setParsedQuizzes] = useState<any[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [systemLog, setSystemLog] = useState<string>("");

  // 1. PDF ➔ 텍스트 추출 로직
  const handleExtractText = async () => {
    if (!examFile) return alert("모의고사 PDF 파일을 선택해주세요.");
    
    setIsExtracting(true);
    setSystemLog("📡 PDF 파일 텍스트 추출 중...");
    
    const formData = new FormData();
    formData.append("file", examFile);
    
    try {
      const res = await fetch(`${BASE_URL}/extract-pdf-text`, {
        method: "POST",
        body: formData
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `HTTP Error ${res.status}`);
      }
      
      const data = await res.json();
      setExtractedText(data.text);
      setSystemLog("✅ 텍스트 추출 완료! 내용 확인 후 AI 분석을 진행하세요.");
    } catch (error: any) {
      alert(`🚨 텍스트 추출 실패\n\n원인: ${error.message}`);
      setSystemLog(`❌ 추출 실패: ${error.message}`);
    } finally {
      setIsExtracting(false);
    }
  };

  // 2. 텍스트 ➔ AI (Gemma) 보기별 분할 파싱 로직
  const handleParseWithAI = async () => {
    if (!extractedText.trim()) return alert("추출된 텍스트가 없습니다.");
    
    setIsParsing(true);
    setSystemLog("🤖 로컬 AI(Gemma)가 모의고사를 분석하여 보기 단위 OX 퀴즈로 쪼개는 중입니다. (1~2분 소요될 수 있습니다)");
    
    try {
      // 너무 길면 AI가 뻗을 수 있으므로 4000자씩 끊어서 보냅니다.
      const res = await fetch(`${BASE_URL}/parse-exam-to-ox`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: extractedText.substring(0, 4000) })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `HTTP Error ${res.status}`);
      }

      const data = await res.json();
      setParsedQuizzes(data.quizzes || []);
      setSystemLog(`✅ 총 ${data.quizzes?.length || 0}개의 OX 퀴즈가 성공적으로 분리되었습니다!`);
    } catch (error: any) {
      alert(`🚨 AI 파싱 실패\n\n원인: ${error.message}\n\nOllama(Gemma) 모델이 켜져 있는지 확인해주세요.`);
      setSystemLog(`❌ 파싱 실패: ${error.message}`);
    } finally {
      setIsParsing(false);
    }
  };

  // 3. 분리된 OX 퀴즈를 수집(Record) 탭 카드로 DB에 영구 저장
  const handleSaveToRecordTab = async () => {
    if (parsedQuizzes.length === 0) return alert("저장할 OX 퀴즈가 없습니다.");
    if (!window.confirm(`분리된 ${parsedQuizzes.length}개의 OX 퀴즈를 모두 '수집 탭'의 카드로 저장하시겠습니까?`)) return;

    setIsSaving(true);
    setSystemLog("💾 수집 탭(DB)으로 카드 전송 중...");

    let successCount = 0;

    for (const quiz of parsedQuizzes) {
      try {
        const memoData = {
          text: "", filled: 0, wrongIndices: [], upgrade: 0, 
          bestTime: 0, totalCorrect: 0, totalWrong: 0,
          ox_quiz: {
            question: quiz.question,
            answer: quiz.answer,
            explanation: quiz.explanation
          }
        };

        const payload = {
          wallet_address: safeAddress || "ENOKI_USER",
          card_content: `${quiz.title || "기출 분석 조항"}\n[${quiz.question}]`,
          answer_text: quiz.answer,
          folder_name: quiz.folder_name || "모의고사 기출",
          memo: JSON.stringify(memoData)
        };

        await fetch(`${BASE_URL}/save-card`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        
        successCount++;
      } catch (e) {
        console.error("저장 실패:", e);
      }
    }

    setIsSaving(false);
    setSystemLog(`✅ 총 ${successCount}개의 카드가 수집 탭에 생성되었습니다!`);
    alert(`성공적으로 ${successCount}개의 실전 퀴즈가 수집 탭으로 전송되었습니다.\n수집 탭에서 확인해보세요!`);
    setParsedQuizzes([]); 
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in pb-24 w-full">
      <div className="border-b border-white/10 pb-4">
        <h1 className="text-2xl sm:text-3xl font-serif text-current tracking-tight mb-2">모의고사 분해 & 수집</h1>
        <p className="text-[11px] sm:text-xs text-white/40 leading-relaxed">
          모의고사 PDF를 업로드하면 텍스트를 추출하고, AI가 각 보기를 낱낱이 쪼개어 수집 탭의 개별 조항 OX 카드로 매핑합니다.
        </p>
      </div>

      {systemLog && (
        <div className={`p-3 text-[11px] rounded-sm font-mono border ${systemLog.includes('❌') ? 'bg-red-950/20 border-red-500/30 text-red-400' : 'bg-teal-950/20 border-teal-500/30 text-teal-300'}`}>
          {systemLog}
        </div>
      )}

      {/* 1단계: 파일 업로드 및 추출 */}
      <div className="bg-[#0a0a0c] border border-white/10 p-5 rounded-sm shadow-md space-y-4">
        <div className="text-sm font-bold text-white/80">Step 1. 모의고사 PDF 텍스트 무손실 추출</div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="border border-dashed border-white/20 p-3 flex-1 rounded-sm text-center bg-black/30 hover:border-indigo-500/40 transition-colors relative group">
            <input type="file" accept=".pdf" onChange={(e) => setExamFile(e.target.files?.[0] || null)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"/>
            <div className="text-xs text-white/50 group-hover:text-indigo-400 transition-colors">
              {examFile ? `📄 ${examFile.name}` : "여기를 클릭하여 모의고사 PDF 파일 업로드"}
            </div>
          </div>
          <button 
            onClick={handleExtractText} 
            disabled={isExtracting || !examFile}
            className={`px-6 py-3 text-xs font-bold rounded-sm border transition-all whitespace-nowrap ${isExtracting ? 'bg-white/5 text-white/30 cursor-not-allowed' : 'bg-indigo-600/20 text-indigo-400 border-indigo-500 hover:bg-indigo-600/40'}`}
          >
            {isExtracting ? "추출 중..." : "텍스트 추출하기"}
          </button>
        </div>

        {extractedText && (
          <div className="mt-4">
            <div className="text-[10px] text-white/40 mb-1">추출된 원문 텍스트 (수정 가능):</div>
            <textarea 
              value={extractedText} 
              onChange={(e) => setExtractedText(e.target.value)}
              className="w-full h-40 bg-black/50 border border-white/10 rounded-sm p-3 text-[11px] text-white/60 font-serif leading-relaxed outline-none focus:border-indigo-500/50 custom-scrollbar"
            />
          </div>
        )}
      </div>

      {/* 2단계: AI 보기 분할 파싱 */}
      {extractedText && (
        <div className="bg-[#0a0a0c] border border-white/10 p-5 rounded-sm shadow-md space-y-4 animate-in slide-in-from-top-4">
          <div className="flex justify-between items-center">
            <div className="text-sm font-bold text-white/80">Step 2. 인공지능(Gemma) 모의고사 분해</div>
            <button 
              onClick={handleParseWithAI} 
              disabled={isParsing}
              className={`px-4 py-2 text-xs font-bold rounded-sm border transition-all ${isParsing ? 'bg-white/5 text-white/30 cursor-not-allowed' : 'bg-teal-600/20 text-teal-400 border-teal-500 hover:bg-teal-600/40'}`}
            >
              {isParsing ? "AI 분해 중..." : "🤖 보기 단위로 분할 파싱"}
            </button>
          </div>

          {parsedQuizzes.length > 0 && (
            <div className="mt-6 space-y-3">
              <div className="text-[10px] text-teal-400 font-bold">분할된 OX 퀴즈 미리보기 ({parsedQuizzes.length}개)</div>
              <div className="max-h-80 overflow-y-auto custom-scrollbar space-y-2 pr-2">
                {parsedQuizzes.map((quiz, idx) => (
                  <div key={idx} className="bg-black/40 border border-white/5 p-3 rounded-sm text-[11px] space-y-2">
                    <div className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-white/40 font-mono">[{quiz.folder_name}] {quiz.title}</span>
                      <span className={`font-bold ${quiz.answer === 'O' ? 'text-teal-400' : 'text-red-400'}`}>정답: {quiz.answer}</span>
                    </div>
                    <div className="text-white/80 font-serif leading-relaxed">Q. {quiz.question}</div>
                    <div className="text-indigo-300 bg-indigo-900/10 p-2 rounded-sm border border-indigo-500/10">A. {quiz.explanation}</div>
                  </div>
                ))}
              </div>
              
              {/* 3단계: DB 전송 */}
              <button 
                onClick={handleSaveToRecordTab} 
                disabled={isSaving}
                className={`w-full mt-4 py-3 text-xs font-bold rounded-sm border transition-all shadow-[0_0_15px_rgba(79,70,229,0.3)] ${isSaving ? 'bg-white/5 text-white/30 cursor-not-allowed' : 'bg-indigo-600 text-white border-indigo-400 hover:bg-indigo-500'}`}
              >
                {isSaving ? "데이터 전송 중..." : "🚀 분리된 조항 카드를 수집(Record) 탭으로 전송"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
