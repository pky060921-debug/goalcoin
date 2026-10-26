import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

// 💡 Vite 환경에서 pdf.js 워커를 안전하게 불러오기 위한 CDN 설정
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const BASE_URL = "https://api.blankd.top/api";

export interface OxQuestion {
  id: number;
  category: string;
  question: string;
  answer: 'O' | 'X';
  explanation: string;
}

// 💡 기본 내장 핵심 OX 문제 (JSON 파일 업로드 시 120문제 전체로 확장·대체 가능)
const DEFAULT_OX_QUESTIONS: OxQuestion[] = [
  { id: 1, category: "즉시·지체없이·미리", question: "공단은 기관장이 예탁한 현역병 등의 요양급여비용과 요양비가 공단이 부담해야 할 금액에 미치지 못할 때에는 기관장에게 이를 지체 없이 청구해야 한다.", answer: "X", explanation: "지체 없이가 아니라 '즉시' 청구하고, 기관장은 공단의 청구에 따라 지급해야 합니다(영 제27조제4항)." },
  { id: 2, category: "즉시·지체없이·미리", question: "공단은 부당이득 징수금 압류 통지를 받은 자가 징수금에 상당하는 다른 재산을 담보로 제공하고 압류 해제를 요구하는 경우 압류를 즉시 해제하여야 한다.", answer: "O", explanation: "타 재산 담보 제공 요구 시 또는 법원의 무죄 판결 확정 등으로 위반 혐의가 입증되지 아니한 경우 '즉시' 압류를 해제해야 합니다(법 제81조의2제3항)." },
  { id: 3, category: "즉시·지체없이·미리", question: "시·도지사 또는 시장·군수·구청장은 공고기간 중 위반사실 공표 사항이 변경된 사실이 확인되었을 때에는 즉시 보건복지부장관에게 알려야 하며, 장관은 변경 사항이 공고 내용에 지체 없이 반영되도록 필요한 조치를 해야 한다.", answer: "X", explanation: "앞뒤가 바뀌었습니다. 지자체장이 장관에게 알리는 것은 '지체 없이'이고, 장관이 공고 내용에 반영하도록 조치하는 것이 '즉시'입니다(영 제74조제4항)." },
  { id: 4, category: "즉시·지체없이·미리", question: "재정운영위원회 위원장은 법 제30조제1항 각 호의 사항을 심의·의결한 때에는 그 내용을 공단 이사장에게 즉시 통보하여야 한다.", answer: "O", explanation: "정관 제34조에 따라 재정운영위원회 위원장은 심의·의결 내용을 공단 이사장에게 '즉시' 통보해야 합니다." },
  { id: 5, category: "즉시·지체없이·미리", question: "인사규정상 이사장은 직위해제 사유 중 제3호에 해당하는 직원에 대해서는 해당 사유 발생 시 지체 없이 직위를 부여하지 아니한다.", answer: "X", explanation: "인사규정 제60조제1항 단서에 따라 제3호의 경우에는 해당 사유 발생 시 '즉시' 직위를 부여하지 아니합니다." },
  { id: 6, category: "즉시·지체없이·미리", question: "공단은 요양급여비용의 지급을 보류하려는 경우에는 해당 요양기관에 지체 없이 문서로 통지하여야 한다.", answer: "X", explanation: "지급을 보류하려는 경우에는 해당 요양기관에 '미리' 문서로 통지하여야 합니다(영 제22조의2제1항)." },
  { id: 7, category: "즉시·지체없이·미리", question: "공단은 제84조제1항제3호(체납처분 종결 후 배분금액 부족)에 따라 결손처분을 한 후 압류할 수 있는 다른 재산이 있는 것을 발견한 때에는 즉시 그 처분을 취소하고 체납처분을 하여야 한다.", answer: "X", explanation: "결손처분 취소 및 체납처분은 '지체 없이' 하여야 합니다(법 제84조제2항)." },
  { id: 8, category: "보험자·공단·이사장", question: "법 제78조의2(가산금)에서는 사용자가 거짓으로 '공단'에게 직장가입자로 신고한 경우 가산금을 부과한다고 규정하여 '공단'으로 표기하고 있다.", answer: "X", explanation: "법 제13조 이후임에도 제78조의2(가산금), 제98조(업무정지), 제101조(제조업자 등의 금지행위)에서는 공단 대신 '보험자'로 표기한 부분이 있습니다." },
  { id: 9, category: "보험자·공단·이사장", question: "보건복지부장관은 종합계획 및 시행계획을 수립하거나 변경한 경우에는 관계 중앙행정기관의 장, 공단 및 심사평가원에 그 내용을 알려야 한다.", answer: "X", explanation: "공단과 심평원이 아니라 '공단의 이사장' 및 '심사평가원의 원장'에게 알려야 합니다(법 제2조의2제3항)." },
  { id: 10, category: "보험자·공단·이사장", question: "건강보험심사평가원의 비상임이사 중 1명은 공단의 이사장이 추천한다.", answer: "X", explanation: "심평원 비상임이사(법 제65조)와 진료심사평가위원회 위원(규칙 제33조) 추천 주체는 공단의 이사장이 아니라 '공단'입니다." },
  { id: 11, category: "위원회·조직·인사", question: "건강보험정책심의위원회 위원, 공단 이사장, 이의신청위원회 위원, 건강보험분쟁조정위원회 위원의 임기는 모두 3년이다.", answer: "O", explanation: "위 4가지는 3년이며, 이사·감사·재정운영위·진료심사평가위·정보공개심의위·공표심의위·부당이득체납공개심의위 위원의 임기는 2년입니다." },
  { id: 12, category: "위원회·조직·인사", question: "건강보험공표심의위원회의 공무원 위원 1명은 보건복지부의 4급 이상 공무원 또는 고위공무원단에 속하는 일반직공무원 중에서 장관이 임명한다.", answer: "X", explanation: "공표심의위원회(9명)의 공무원 위원은 급수 언급 없이 오직 '보건복지부의 고위공무원단에 속하는 일반직공무원(고일)'으로만 규정되어 있습니다(영 제73조)." },
  { id: 13, category: "위원회·조직·인사", question: "지역본부 소속 2급 직원의 징계에 관한 사항은 해당 지역본부의 보통징계위원회에서 심의·의결한다.", answer: "X", explanation: "본부 각 부서 소속 직원 및 지역본부·지사 소속 '2급 이상 직원'의 징계는 본부의 '중앙징계위원회' 관할입니다(보통징계위는 3급 이하 관할)." },
  { id: 14, category: "위원회·조직·인사", question: "공단 임직원과 건강보험분쟁조정위원회 위원 중 공무원이 아닌 사람은 형법 제127조(공무상 비밀누설) 및 제129조부터 제132조까지의 규정을 적용할 때 공무원으로 본다.", answer: "X", explanation: "공단 임직원(법 제28조)과 분쟁조정위원회 비공무원 위원(법 제89조)은 형법 제129조~제132조만 적용되며, 형법 제127조까지 포함되는 것은 건정심 위원과 공표심의위원회 위원(법 제114조의2)뿐입니다." },
  { id: 15, category: "승인·인가·제정주체", question: "공단이 회계연도마다 결산보고서와 사업보고서를 작성한 경우, 국민건강보험법 제39조에서는 다음 해 2월 말일까지 장관에게 '보고'하도록 규정하고 있으나, 정관 제59조에서는 회계연도 종료 후 2개월 이내에 장관에게 제출하고 '승인'을 얻도록 규정하고 있다.", answer: "O", explanation: "결산에 대해 법에는 '보고', 정관에는 '승인'으로 다르게 표현되어 있는 핵심 비교 포인트입니다." },
  { id: 16, category: "승인·인가·제정주체", question: "정관상 공단 일산병원의 병원장은 이사장이 임명하고, 직영장기요양기관의 장은 이사회의 의결을 거쳐 이사장이 임명한다.", answer: "X", explanation: "반대입니다! 병원장(정관 제65조)은 '이사회의 의결을 거쳐 이사장이 임명'하고, 직영장기요양기관의 장(정관 제73조)은 이사회 의결 없이 '이사장이 임면'합니다." },
  { id: 17, category: "주요키워드·준용법", question: "정관 제47조에 따라 연체금 징수 예외가 되는 소액 기준은 체납된 보험료 및 그 밖의 징수금이 남아 있지 않은 연체금으로서 건강보험은 '1건당 2천원 미만', 노인장기요양보험은 '1건당 1천원 미만'이다.", answer: "X", explanation: "법 제106조(소액 처리)에는 '1건당' 2천원 미만이라는 표현이 있으나, 정관 제47조(연체금 징수의 예외)에는 '1건당'이라는 문구가 없습니다." },
  { id: 18, category: "주요키워드·준용법", question: "부당이득 징수금 체납자 인적사항 공개 제외 사유(영 제26조의3)에는 '재해 등으로 재산에 심한 손실을 입은 경우'만 규정되어 있고, '사업이 중대한 위기에 처한 경우'는 규정되어 있지 않다.", answer: "O", explanation: "영 제26조의3(부당이득 공개 제외)은 '재해 등으로 재산에 심한 손실'만 있고 사업 위기가 없습니다(영 제48조 고액보험료 공개 제외와 영 제47조 신용정보 제공 제외에는 사업 위기가 포함됨)." },
  { id: 19, category: "비율·기한·종합비교", question: "요양기관이 속임수를 사용하여 공단·가입자 및 피부양자에게 요양급여비용을 부담하게 하였더라도, 적발되기 전에 감독관청에 부당청구 사실을 자진하여 신고한 경우에는 과징금을 2분의 1 범위에서 감경할 수 있다.", answer: "X", explanation: "시행령 별표2 감면처분 단서에 따라 '속임수를 사용하여 부담하게 하였을 때'에는 자진신고 등을 불문하고 감면할 수 없습니다." },
  { id: 20, category: "비율·기한·종합비교", question: "공단은 법 제58조에 따른 손해배상청구권 대위 행사 사무와 법 제82조에 따른 분할납부 승인 사무를 수행하기 위하여 불가피한 경우 범죄경력자료나 주민등록번호 등이 포함된 민감정보 및 고유식별정보를 처리할 수 있다.", answer: "X", explanation: "손해배상청구권(제58조), 보험료 경감(제75조), 분할납부 승인(제82조)은 이사장 권한 위임(영 제13조)에는 있지만 민감정보 및 고유식별정보 처리 사무(영 제81조)에는 없습니다." }
];

export const ExamTab = ({ walletAddress, address }: any) => {
  const safeAddress = walletAddress || address || "guest";

  // 💡 모드 전환 상태 ('ox' : OX 퀴즈 모드 | 'pdf' : PDF 실전 모의고사 모드)
  const [examMode, setExamMode] = useState<'ox' | 'pdf'>('ox');

  // =========================================================================
  // 1. OX 퀴즈 관련 상태 및 로직
  // =========================================================================
  const [oxBank, setOxBank] = useState<OxQuestion[]>(() => {
    try {
      const saved = localStorage.getItem(`blankd_ox_bank_${safeAddress}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return DEFAULT_OX_QUESTIONS;
  });

  const [oxCategory, setOxCategory] = useState<string>('전체');
  const [oxFilterWrongOnly, setOxFilterWrongOnly] = useState<boolean>(false);
  const [oxCurrentIdx, setOxCurrentIdx] = useState<number>(0);
  const [oxSelectedAnswer, setOxSelectedAnswer] = useState<'O' | 'X' | null>(null);

  // 각 문제별 풀이 기록: { [id]: 'correct' | 'wrong' }
  const [oxHistory, setOxHistory] = useState<Record<number, 'correct' | 'wrong'>>(() => {
    try { return JSON.parse(localStorage.getItem(`blankd_ox_history_${safeAddress}`) || '{}'); } catch { return {}; }
  });

  const oxFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try { localStorage.setItem(`blankd_ox_bank_${safeAddress}`, JSON.stringify(oxBank)); } catch (e) {}
  }, [oxBank, safeAddress]);

  useEffect(() => {
    try { localStorage.setItem(`blankd_ox_history_${safeAddress}`, JSON.stringify(oxHistory)); } catch (e) {}
  }, [oxHistory, safeAddress]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    oxBank.forEach(q => { if (q.category) cats.add(q.category); });
    return ['전체', ...Array.from(cats)];
  }, [oxBank]);

  const filteredOxQuestions = useMemo(() => {
    return oxBank.filter(q => {
      if (oxCategory !== '전체' && q.category !== oxCategory) return false;
      if (oxFilterWrongOnly && oxHistory[q.id] !== 'wrong') return false;
      return true;
    });
  }, [oxBank, oxCategory, oxFilterWrongOnly, oxHistory]);

  useEffect(() => {
    setOxCurrentIdx(0);
    setOxSelectedAnswer(null);
  }, [oxCategory, oxFilterWrongOnly]);

  const currentOxQ = filteredOxQuestions[oxCurrentIdx] || null;

  const handleSelectOx = (choice: 'O' | 'X') => {
    if (!currentOxQ || oxSelectedAnswer !== null) return;
    setOxSelectedAnswer(choice);
    const isCorrect = choice === currentOxQ.answer;
    setOxHistory(prev => ({
      ...prev,
      [currentOxQ.id]: isCorrect ? 'correct' : 'wrong'
    }));
  };

  const handleNextOx = () => {
    if (oxCurrentIdx < filteredOxQuestions.length - 1) {
      setOxCurrentIdx(prev => prev + 1);
      setOxSelectedAnswer(null);
    } else {
      alert("현재 목록의 마지막 문제입니다! 처음으로 돌아갑니다.");
      setOxCurrentIdx(0);
      setOxSelectedAnswer(null);
    }
  };

  const handlePrevOx = () => {
    if (oxCurrentIdx > 0) {
      setOxCurrentIdx(prev => prev - 1);
      setOxSelectedAnswer(null);
    }
  };

  // JSON 문제 파일 업로드 핸들러
  const handleUploadOxJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].question && parsed[0].answer) {
          setOxBank(parsed);
          setOxCurrentIdx(0);
          setOxSelectedAnswer(null);
          setOxCategory('전체');
          alert(`✅ 총 ${parsed.length}개의 OX 문제가 성공적으로 등록되었습니다!`);
        } else {
          alert("❌ 올바른 OX 문제 JSON 형식이 아닙니다.");
        }
      } catch (err) {
        alert("❌ JSON 파일 파싱 중 오류가 발생했습니다.");
      }
      if (oxFileInputRef.current) oxFileInputRef.current.value = "";
    };
    reader.readAsText(file);
  };

  const handleResetOxHistory = () => {
    if (window.confirm("OX 풀이 기록(정답/오답 내역)을 모두 초기화하시겠습니까?")) {
      setOxHistory({});
      setOxSelectedAnswer(null);
      setOxCurrentIdx(0);
    }
  };

  const handleDeleteUploadedOxBank = () => {
    if (window.confirm("업로드한 JSON 문제집을 삭제하고 기본 문제(20문항)로 되돌리시겠습니까?")) {
      setOxBank(DEFAULT_OX_QUESTIONS);
      localStorage.removeItem(`blankd_ox_bank_${safeAddress}`);
      setOxCurrentIdx(0);
      setOxSelectedAnswer(null);
      setOxCategory('전체');
    }
  };

  // 💡 OX 퀴즈 키보드 단축키 지원
  useEffect(() => {
    if (examMode !== 'ox') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      if (!currentOxQ) return;

      if (oxSelectedAnswer === null) {
        if (e.key === '1' || e.key.toUpperCase() === 'O' || e.key === 'ArrowLeft') {
          e.preventDefault();
          handleSelectOx('O');
        } else if (e.key === '2' || e.key.toUpperCase() === 'X' || e.key === 'ArrowRight') {
          e.preventDefault();
          handleSelectOx('X');
        }
      } else {
        if (e.code === 'Space' || e.key === 'Enter' || e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          handleNextOx();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          handlePrevOx();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [examMode, currentOxQ, oxSelectedAnswer, oxCurrentIdx, filteredOxQuestions.length]);


  // =========================================================================
  // 2. PDF 실전 모의고사 관련 상태 및 로직 (삭제 기능 추가)
  // =========================================================================
  const [examFile, setExamFile] = useState<File | null>(null);
  const [answerFile, setAnswerFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [questionCount, setQuestionCount] = useState<number>(40);
  const [pageDim, setPageDim] = useState({ w: 800, h: 1131 });

  const examFileInputRef = useRef<HTMLInputElement>(null);
  const answerFileInputRef = useRef<HTMLInputElement>(null);

  const [userAnswers, setUserAnswers] = useState<Record<number, number>>(() => {
    try { return JSON.parse(localStorage.getItem(`blankd_omr_${safeAddress}`) || '{}'); } catch { return {}; }
  });
  
  const [correctAnswers, setCorrectAnswers] = useState<Record<number, number> | null>(() => {
    try { return JSON.parse(localStorage.getItem(`blankd_omr_correct_${safeAddress}`) || 'null'); } catch { return null; }
  });

  const [isGrading, setIsGrading] = useState(false);
  const [score, setScore] = useState<{ correct: number, total: number } | null>(() => {
    try { return JSON.parse(localStorage.getItem(`blankd_omr_score_${safeAddress}`) || 'null'); } catch { return null; }
  });
  const [systemLog, setSystemLog] = useState<string>("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  
  const [lines, setLines] = useState<Record<number, any[]>>(() => {
    try { return JSON.parse(localStorage.getItem(`blankd_drawings_${safeAddress}`) || '{}'); } catch { return {}; }
  }); 
  const currentPathRef = useRef<any[]>([]);

  useEffect(() => { localStorage.setItem(`blankd_omr_${safeAddress}`, JSON.stringify(userAnswers)); }, [userAnswers, safeAddress]);
  useEffect(() => { localStorage.setItem(`blankd_omr_correct_${safeAddress}`, JSON.stringify(correctAnswers)); }, [correctAnswers, safeAddress]);
  useEffect(() => { localStorage.setItem(`blankd_omr_score_${safeAddress}`, JSON.stringify(score)); }, [score, safeAddress]);
  
  useEffect(() => {
    try {
        localStorage.setItem(`blankd_drawings_${safeAddress}`, JSON.stringify(lines));
    } catch (e) {
        console.warn("용량 초과로 일부 필기가 저장되지 않을 수 있습니다.");
    }
  }, [lines, safeAddress]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const onPageLoadSuccess = (page: any) => {
    const vp = page.getViewport({ scale: 1 });
    setPageDim({ w: vp.width, h: vp.height });
  };

  const drawLines = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';

    const pageLines = lines[pageNumber] || [];
    const allPaths = [...pageLines, currentPathRef.current].filter(p => p.length > 0);

    allPaths.forEach(path => {
      ctx.beginPath();
      path.forEach((point, i) => {
        if (i === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
    });
  };

  useEffect(() => {
    drawLines();
  }, [lines, pageNumber, pageDim, examMode]);

  const getScaledCoordinates = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = pageDim.w / rect.width;
    const scaleY = pageDim.h / rect.height;
    return {
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top) * scaleY)
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== 'pen' && e.pointerType !== 'mouse') return;
    const { x, y } = getScaledCoordinates(e);
    setIsDrawing(true);
    currentPathRef.current = [{ x, y }];
    drawLines();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || (e.pointerType !== 'pen' && e.pointerType !== 'mouse')) return;
    const { x, y } = getScaledCoordinates(e);
    const path = currentPathRef.current;
    const lastPoint = path[path.length - 1];
    if (lastPoint && Math.hypot(lastPoint.x - x, lastPoint.y - y) < 2) return;
    path.push({ x, y });
    drawLines();
  };

  const handlePointerUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentPathRef.current.length > 0) {
      setLines(prev => ({
        ...prev,
        [pageNumber]: [...(prev[pageNumber] || []), currentPathRef.current]
      }));
      currentPathRef.current = [];
    }
  };

  const handleAnswerSelect = (qNum: number, ans: number) => {
    if (score) return;
    setUserAnswers(prev => ({ ...prev, [qNum]: ans }));
  };

  // 💡 [추가] 올라와 있는 문제지 PDF 삭제 핸들러
  const handleDeleteExamFile = () => {
    if (window.confirm("현재 올라와 있는 모의고사 문제지 PDF를 닫고 삭제하시겠습니까?")) {
      setExamFile(null);
      setNumPages(null);
      setPageNumber(1);
      if (examFileInputRef.current) examFileInputRef.current.value = "";
      setSystemLog("🗑️ 문제지 PDF가 삭제되었습니다.");
    }
  };

  // 💡 [추가] 올라와 있는 정답지 PDF 및 채점결과 삭제 핸들러
  const handleDeleteAnswerFile = () => {
    if (window.confirm("업로드된 정답지 PDF와 채점 결과를 삭제하시겠습니까?")) {
      setAnswerFile(null);
      setCorrectAnswers(null);
      setScore(null);
      localStorage.removeItem(`blankd_omr_correct_${safeAddress}`);
      localStorage.removeItem(`blankd_omr_score_${safeAddress}`);
      if (answerFileInputRef.current) answerFileInputRef.current.value = "";
      setSystemLog("🗑️ 정답지 및 채점 결과가 삭제되었습니다.");
    }
  };

  // 💡 [수정] 모의고사 전체 완전 삭제 (파일 + 필기 + OMR 마킹 일괄 삭제)
  const handleResetAll = () => {
    if (window.confirm("업로드된 모의고사 PDF 파일과 모든 필기, OMR 마킹 기록을 완전히 삭제하시겠습니까?")) {
      setExamFile(null);
      setAnswerFile(null);
      setNumPages(null);
      setLines({});
      setUserAnswers({});
      setCorrectAnswers(null);
      setScore(null);
      setPageNumber(1);
      localStorage.removeItem(`blankd_omr_${safeAddress}`);
      localStorage.removeItem(`blankd_omr_correct_${safeAddress}`);
      localStorage.removeItem(`blankd_omr_score_${safeAddress}`);
      localStorage.removeItem(`blankd_drawings_${safeAddress}`);
      if (examFileInputRef.current) examFileInputRef.current.value = "";
      if (answerFileInputRef.current) answerFileInputRef.current.value = "";
      setSystemLog("🔄 모의고사 파일 및 모든 기록이 완전히 삭제되었습니다.");
    }
  };

  const handleGradeExam = async () => {
    if (!answerFile) return alert("정답지 PDF 파일을 먼저 업로드해주세요.");
    
    setIsGrading(true);
    setSystemLog("📡 정답지 PDF 텍스트 추출 중...");

    try {
      const formData = new FormData();
      formData.append("file", answerFile);
      const extractRes = await fetch(`${BASE_URL}/extract-pdf-text`, { method: "POST", body: formData });
      const extractData = await extractRes.json();
      
      if (!extractData.text) throw new Error("텍스트 추출 실패");

      setSystemLog("🤖 백엔드 서버(Ollama)에서 정답 번호 추출 중...");

      const aiRes = await fetch(`${BASE_URL}/grade-exam`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: extractData.text,
          question_count: questionCount
        })
      });

      if (!aiRes.ok) throw new Error("AI 채점 서버 연결 실패");

      const parsedAnswers = await aiRes.json();
      setCorrectAnswers(parsedAnswers);

      let correctCnt = 0;
      for (let i = 1; i <= questionCount; i++) {
        if (userAnswers[i] && parsedAnswers[String(i)] && userAnswers[i] === parseInt(parsedAnswers[String(i)])) {
          correctCnt++;
        }
      }
      
      setScore({ correct: correctCnt, total: questionCount });
      setSystemLog("✅ 채점이 완료되었습니다!");

    } catch (e: any) {
      console.error(e);
      setSystemLog(`❌ 채점 오류: ${e.message}`);
      alert("서버 연결에 실패했습니다. 백엔드가 정상적으로 작동 중인지 확인해주세요.");
    } finally {
      setIsGrading(false);
    }
  };

  const totalSolvedOx = Object.keys(oxHistory).length;
  const totalCorrectOx = Object.values(oxHistory).filter(v => v === 'correct').length;
  const totalWrongOx = Object.values(oxHistory).filter(v => v === 'wrong').length;

  return (
    <div className="flex flex-col w-full max-w-[1800px] mx-auto space-y-4 pb-16 animate-in fade-in">
      
      {/* 🧭 상단 모드 스위처 바 */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-[#0a0a0c] border border-white/10 p-3 sm:p-4 rounded-sm shadow-xl">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExamMode('ox')}
            className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-sm transition-all flex items-center gap-2 border ${
              examMode === 'ox'
                ? 'bg-teal-900/50 text-teal-300 border-teal-500 shadow-[0_0_12px_rgba(20,184,166,0.3)]'
                : 'bg-white/5 text-white/40 border-white/10 hover:text-white/80'
            }`}
          >
            <span>⚡ 실전 OX 퀴즈 ({oxBank.length}제)</span>
          </button>
          <button
            onClick={() => setExamMode('pdf')}
            className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-sm transition-all flex items-center gap-2 border ${
              examMode === 'pdf'
                ? 'bg-indigo-900/50 text-indigo-300 border-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.3)]'
                : 'bg-white/5 text-white/40 border-white/10 hover:text-white/80'
            }`}
          >
            <span>📄 PDF 실전 모의고사 (OMR)</span>
          </button>
        </div>

        {examMode === 'ox' ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer bg-amber-900/40 hover:bg-amber-900/60 border border-amber-500/40 text-amber-300 text-[11px] font-bold px-3 py-1.5 rounded-sm transition-colors shadow-sm">
              📂 JSON 문제파일 불러오기
              <input ref={oxFileInputRef} type="file" accept=".json" className="hidden" onChange={handleUploadOxJson} />
            </label>
            {oxBank.length > DEFAULT_OX_QUESTIONS.length && (
              <button
                onClick={handleDeleteUploadedOxBank}
                className="bg-red-950/50 hover:bg-red-900/60 border border-red-500/40 text-red-300 text-[11px] font-bold px-3 py-1.5 rounded-sm transition-colors"
              >
                🗑️ 업로드 문제집 삭제
              </button>
            )}
            <button
              onClick={handleResetOxHistory}
              className="bg-white/5 hover:bg-white/15 border border-white/10 text-white/60 text-[11px] font-bold px-3 py-1.5 rounded-sm transition-colors"
            >
              🔄 풀이 기록 초기화
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {examFile && (
              <button
                onClick={handleDeleteExamFile}
                className="bg-red-950/50 hover:bg-red-900/70 text-red-300 border border-red-500/40 text-[11px] font-bold px-3 py-1.5 rounded-sm transition-colors"
              >
                🗑️ 올라온 문제지 삭제 ({examFile.name.substring(0, 12)}...)
              </button>
            )}
            {(answerFile || score) && (
              <button
                onClick={handleDeleteAnswerFile}
                className="bg-amber-950/50 hover:bg-amber-900/70 text-amber-300 border border-amber-500/40 text-[11px] font-bold px-3 py-1.5 rounded-sm transition-colors"
              >
                🗑️ 정답지·채점결과 삭제
              </button>
            )}
            <button
              onClick={handleResetAll}
              className="bg-red-600/80 hover:bg-red-500 text-white border border-red-400 text-[11px] font-bold px-3 py-1.5 rounded-sm transition-colors shadow-md"
            >
              🚨 모의고사 전체 삭제·초기화
            </button>
          </div>
        )}
      </div>

      {/* =========================================================================
          모드 A: ⚡ 실전 OX 퀴즈 화면
      ========================================================================= */}
      {examMode === 'ox' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          
          {/* 좌측/중앙: OX 문제 풀이 카드 */}
          <div className="lg:col-span-3 bg-[#0a0a0c] border border-white/10 rounded-sm shadow-2xl p-5 sm:p-8 flex flex-col justify-between min-h-[60vh]">
            
            {/* 상단 필터 및 진행률 */}
            <div className="space-y-4 border-b border-white/10 pb-4">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setOxCategory(cat)}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-sm border transition-all ${
                        oxCategory === cat
                          ? 'bg-teal-900/50 text-teal-300 border-teal-500/50'
                          : 'bg-white/5 text-white/40 border-white/10 hover:text-white/70'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setOxFilterWrongOnly(!oxFilterWrongOnly)}
                  className={`px-3 py-1 text-xs font-bold rounded-sm border transition-all ${
                    oxFilterWrongOnly
                      ? 'bg-red-600 text-white border-red-400 shadow-[0_0_10px_rgba(239,68,68,0.4)]'
                      : 'bg-red-950/30 text-red-400 border-red-500/30 hover:bg-red-900/40'
                  }`}
                >
                  🎯 틀린 문제만 보기 ({totalWrongOx})
                </button>
              </div>

              {filteredOxQuestions.length > 0 && (
                <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-teal-500 h-full transition-all duration-300"
                    style={{ width: `${((oxCurrentIdx + 1) / filteredOxQuestions.length) * 100}%` }}
                  />
                </div>
              )}
            </div>

            {/* 본문 문제 영역 */}
            {!currentOxQ ? (
              <div className="py-20 text-center text-white/40 space-y-3">
                <div className="text-4xl">🎉</div>
                <p className="text-sm font-bold">해당 조건에 맞는 문제가 없습니다.</p>
                {oxFilterWrongOnly && (
                  <button
                    onClick={() => setOxFilterWrongOnly(false)}
                    className="mt-2 px-4 py-2 bg-teal-900/40 border border-teal-500/40 text-teal-300 text-xs font-bold rounded-sm"
                  >
                    전체 문제 보기로 돌아가기
                  </button>
                )}
              </div>
            ) : (
              <div className="my-auto py-6 space-y-8">
                <div className="flex justify-between items-center">
                  <span className="px-3 py-1 bg-indigo-950/60 border border-indigo-500/40 text-indigo-300 text-xs font-bold rounded-sm">
                    📁 {currentOxQ.category || '비교표 핵심'}
                  </span>
                  <span className="font-mono text-sm font-bold text-white/60">
                    Q. {oxCurrentIdx + 1} / {filteredOxQuestions.length} <span className="text-white/30 text-xs">(고유번호 #{currentOxQ.id})</span>
                  </span>
                </div>

                <div className="text-base sm:text-xl md:text-2xl font-serif leading-relaxed text-white/95 break-keep bg-white/[0.02] p-5 sm:p-7 rounded-sm border border-white/5 shadow-inner">
                  {currentOxQ.question}
                </div>

                {/* O / X 선택 대형 버튼 */}
                <div className="grid grid-cols-2 gap-4 sm:gap-6 pt-2">
                  <button
                    onClick={() => handleSelectOx('O')}
                    disabled={oxSelectedAnswer !== null}
                    className={`py-6 sm:py-8 rounded-md font-bold text-2xl sm:text-4xl border-2 transition-all flex flex-col items-center justify-center gap-2 shadow-lg active:scale-95 ${
                      oxSelectedAnswer === null
                        ? 'bg-teal-950/30 border-teal-500/40 text-teal-300 hover:bg-teal-900/50 hover:border-teal-400'
                        : currentOxQ.answer === 'O'
                          ? 'bg-teal-600/40 border-teal-400 text-teal-200 shadow-[0_0_20px_rgba(20,184,166,0.4)] scale-[1.02]'
                          : oxSelectedAnswer === 'O'
                            ? 'bg-red-950/60 border-red-500 text-red-300 opacity-80'
                            : 'bg-black/40 border-white/10 text-white/20 opacity-40'
                    }`}
                  >
                    <span>⭕</span>
                    <span className="text-xs sm:text-sm font-mono tracking-widest opacity-80">맞다 (O / 1 / ◀)</span>
                  </button>

                  <button
                    onClick={() => handleSelectOx('X')}
                    disabled={oxSelectedAnswer !== null}
                    className={`py-6 sm:py-8 rounded-md font-bold text-2xl sm:text-4xl border-2 transition-all flex flex-col items-center justify-center gap-2 shadow-lg active:scale-95 ${
                      oxSelectedAnswer === null
                        ? 'bg-red-950/30 border-red-500/40 text-red-300 hover:bg-red-900/50 hover:border-red-400'
                        : currentOxQ.answer === 'X'
                          ? 'bg-teal-600/40 border-teal-400 text-teal-200 shadow-[0_0_20px_rgba(20,184,166,0.4)] scale-[1.02]'
                          : oxSelectedAnswer === 'X'
                            ? 'bg-red-950/60 border-red-500 text-red-300 opacity-80'
                            : 'bg-black/40 border-white/10 text-white/20 opacity-40'
                    }`}
                  >
                    <span>❌</span>
                    <span className="text-xs sm:text-sm font-mono tracking-widest opacity-80">틀리다 (X / 2 / ▶)</span>
                  </button>
                </div>

                {/* 정답 판정 및 해설 박스 */}
                {oxSelectedAnswer !== null && (
                  <div className={`p-5 rounded-sm border animate-in slide-in-from-bottom-3 ${
                    oxSelectedAnswer === currentOxQ.answer
                      ? 'bg-teal-950/30 border-teal-500/50 text-teal-200'
                      : 'bg-red-950/30 border-red-500/50 text-red-200'
                  }`}>
                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/10">
                      <span className="font-bold text-sm sm:text-base flex items-center gap-2">
                        {oxSelectedAnswer === currentOxQ.answer ? (
                          <span className="text-teal-400">🎉 정답입니다! (정답: {currentOxQ.answer})</span>
                        ) : (
                          <span className="text-red-400">🚨 오답입니다! (정답: {currentOxQ.answer})</span>
                        )}
                      </span>
                      <span className="text-[11px] font-mono text-white/50">Space / Enter 로 다음 문제</span>
                    </div>
                    <p className="text-xs sm:text-sm leading-relaxed text-white/90 whitespace-pre-wrap">
                      💡 <span className="font-bold">해설:</span> {currentOxQ.explanation}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* 하단 이전/다음 네비게이션 */}
            <div className="flex justify-between items-center pt-4 border-t border-white/10">
              <button
                onClick={handlePrevOx}
                disabled={oxCurrentIdx <= 0}
                className="px-4 py-2.5 bg-white/5 hover:bg-white/15 disabled:opacity-30 rounded-sm text-xs font-bold text-white/80 transition-colors"
              >
                ◀ 이전 문제
              </button>

              <span className="text-[11px] text-white/40 font-mono hidden sm:inline">
                단축키: [1/O] 맞다 · [2/X] 틀리다 · [Space/Enter] 다음 문제
              </span>

              <button
                onClick={handleNextOx}
                disabled={!currentOxQ}
                className="px-6 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-30 rounded-sm text-xs sm:text-sm font-bold text-white shadow-md transition-colors"
              >
                다음 문제 ▶
              </button>
            </div>
          </div>

          {/* 우측: OX 점수 현황판 및 문항 빠른 이동 그리드 */}
          <div className="bg-[#0a0a0c] border border-white/10 rounded-sm shadow-xl p-4 flex flex-col h-[65vh]">
            <h3 className="text-sm font-bold text-teal-400 tracking-widest border-b border-white/10 pb-3 mb-3">
              📊 OX 학습 현황판
            </h3>

            <div className="grid grid-cols-3 gap-2 mb-4 font-mono text-center">
              <div className="bg-white/5 p-2.5 rounded-sm border border-white/10">
                <div className="text-[10px] text-white/40">풀이 완료</div>
                <div className="text-base font-bold text-white">{totalSolvedOx}/{oxBank.length}</div>
              </div>
              <div className="bg-teal-950/30 p-2.5 rounded-sm border border-teal-500/30">
                <div className="text-[10px] text-teal-400">정답</div>
                <div className="text-base font-bold text-teal-300">{totalCorrectOx}</div>
              </div>
              <div className="bg-red-950/30 p-2.5 rounded-sm border border-red-500/30">
                <div className="text-[10px] text-red-400">오답</div>
                <div className="text-base font-bold text-red-300">{totalWrongOx}</div>
              </div>
            </div>

            <div className="text-[11px] text-white/50 mb-2 font-bold">문항 바로가기 ({filteredOxQuestions.length}문항)</div>
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
              <div className="grid grid-cols-5 gap-1.5">
                {filteredOxQuestions.map((q, idx) => {
                  const status = oxHistory[q.id];
                  const isCurrent = idx === oxCurrentIdx;
                  return (
                    <button
                      key={q.id}
                      onClick={() => {
                        setOxCurrentIdx(idx);
                        setOxSelectedAnswer(null);
                      }}
                      className={`py-2 rounded-sm font-mono text-xs font-bold border transition-all ${
                        isCurrent
                          ? 'ring-2 ring-amber-400 border-amber-400 bg-amber-500/20 text-amber-200'
                          : status === 'correct'
                            ? 'bg-teal-950/50 border-teal-500/40 text-teal-300'
                            : status === 'wrong'
                              ? 'bg-red-950/60 border-red-500/50 text-red-300'
                              : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
                      }`}
                    >
                      {q.id}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* =========================================================================
          모드 B: 📄 PDF 실전 모의고사 뷰어 및 OMR (기존 기능 + 파일 삭제 완비)
      ========================================================================= */}
      {examMode === 'pdf' && (
        <div className="flex flex-col lg:flex-row gap-6 w-full h-[80vh]">
          
          {/* 좌측: PDF 뷰어 및 펜 필기 영역 */}
          <div className="flex flex-col flex-[3] bg-[#0a0a0c] border border-white/10 rounded-sm shadow-xl overflow-hidden relative">
            <div className="flex justify-between items-center p-3 border-b border-white/10 bg-black/40 flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <span className="text-white/80 font-bold text-sm tracking-widest">📝 실전 모의고사 뷰어</span>
                {systemLog && <span className="text-[10px] text-teal-400 font-mono animate-pulse">{systemLog}</span>}
              </div>
              <div className="flex gap-2 items-center flex-wrap">
                 <label className="cursor-pointer bg-white/10 hover:bg-white/20 text-white text-[10px] px-3 py-1.5 rounded-sm transition-colors border border-white/5 font-bold">
                   📂 문제지 PDF 열기
                   <input ref={examFileInputRef} type="file" accept=".pdf" className="hidden" onChange={e => setExamFile(e.target.files?.[0] || null)} />
                 </label>
                 {examFile && (
                   <button
                     onClick={handleDeleteExamFile}
                     className="bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-500/40 text-[10px] px-3 py-1.5 rounded-sm transition-colors font-bold"
                   >
                     🗑️ 문제지 삭제
                   </button>
                 )}
                 <button
                   onClick={() => {
                     if (window.confirm("현재 페이지의 펜 필기를 지우시겠습니까?")) {
                       setLines(prev => ({ ...prev, [pageNumber]: [] }));
                     }
                   }}
                   className="bg-amber-900/30 hover:bg-amber-900/50 text-amber-300 border border-amber-500/30 text-[10px] px-3 py-1.5 rounded-sm transition-colors"
                 >
                   ✏️ 현재 장 필기 지우기
                 </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-[#1a1a1f] relative flex justify-center p-4 custom-scrollbar">
              {!examFile ? (
                <div className="flex flex-col items-center justify-center h-full text-white/30 space-y-4">
                  <span className="text-4xl">📄</span>
                  <p className="text-sm font-serif">상단의 [문제지 PDF 열기] 버튼을 눌러 모의고사 파일을 불러오세요.</p>
                </div>
              ) : (
                <div className="relative inline-block shadow-2xl">
                  <Document file={examFile} onLoadSuccess={onDocumentLoadSuccess} className="pointer-events-none">
                    <Page 
                      pageNumber={pageNumber} 
                      renderTextLayer={false} 
                      renderAnnotationLayer={false}
                      width={800} 
                      onLoadSuccess={onPageLoadSuccess}
                      onRenderSuccess={drawLines}
                    />
                  </Document>

                  <canvas
                    ref={canvasRef}
                    width={pageDim.w}
                    height={pageDim.h}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                    className="absolute top-0 left-0 w-full h-full cursor-crosshair touch-none"
                    style={{ zIndex: 10 }}
                  />
                </div>
              )}
            </div>

            {numPages && (
              <div className="flex justify-center items-center gap-4 p-3 bg-black/40 border-t border-white/10 shrink-0">
                <button 
                  onClick={() => setPageNumber(p => Math.max(1, p - 1))} 
                  disabled={pageNumber <= 1}
                  className="px-4 py-1.5 bg-white/10 hover:bg-white/20 disabled:opacity-30 rounded-sm text-xs font-bold"
                >
                  ◀ 이전 장
                </button>
                <span className="text-xs text-white/60 font-mono font-bold tracking-widest">
                  {pageNumber} / {numPages}
                </span>
                <button 
                  onClick={() => setPageNumber(p => Math.min(numPages, p + 1))} 
                  disabled={pageNumber >= numPages}
                  className="px-4 py-1.5 bg-white/10 hover:bg-white/20 disabled:opacity-30 rounded-sm text-xs font-bold"
                >
                  다음 장 ▶
                </button>
              </div>
            )}
          </div>

          {/* 우측: OMR 답안지 영역 */}
          <div className="flex flex-col flex-1 min-w-[280px] bg-[#0a0a0c] border border-white/10 rounded-sm shadow-xl overflow-hidden h-full">
            <div className="p-4 border-b border-white/10 bg-indigo-950/20">
              <div className="flex justify-between items-center mb-4">
                 <h2 className="text-base font-bold tracking-widest text-indigo-300">OMR 답안지</h2>
                 <div className="flex items-center gap-2">
                   <span className="text-[10px] text-white/50">문항 수:</span>
                   <select 
                     value={questionCount} 
                     onChange={e => setQuestionCount(Number(e.target.value))}
                     className="bg-black border border-white/20 text-xs text-white p-1 rounded outline-none"
                     disabled={score !== null}
                   >
                     <option value={20}>20문제</option>
                     <option value={40}>40문제</option>
                     <option value={50}>50문제</option>
                     <option value={80}>80문제</option>
                     <option value={100}>100문제</option>
                   </select>
                 </div>
              </div>

              {score ? (
                <div className="bg-teal-900/30 border border-teal-500/50 p-4 rounded-sm text-center space-y-2">
                  <div className="text-[10px] text-teal-400 font-bold">최종 채점 결과</div>
                  <div className="text-3xl font-mono font-bold text-white">
                    {score.correct} <span className="text-lg text-white/40">/ {score.total}</span>
                  </div>
                  <div className="text-xs text-teal-300">({Math.round((score.correct / score.total) * 100)}점)</div>
                  <button
                    onClick={handleDeleteAnswerFile}
                    className="mt-2 w-full py-1.5 bg-red-950/60 hover:bg-red-900/80 border border-red-500/40 text-red-300 text-[11px] font-bold rounded-sm transition-colors"
                  >
                    🗑️ 채점결과 삭제 및 다시 풀기
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                   <div className="flex gap-1.5">
                     <label className="flex-1 cursor-pointer text-center bg-indigo-900/40 hover:bg-indigo-900/60 border border-indigo-500/30 text-indigo-300 text-[11px] font-bold py-2 px-2 rounded-sm transition-colors shadow-sm truncate">
                       {answerFile ? `✅ ${answerFile.name}` : "📥 정답지 PDF 업로드"}
                       <input ref={answerFileInputRef} type="file" accept=".pdf" className="hidden" onChange={e => setAnswerFile(e.target.files?.[0] || null)} />
                     </label>
                     {answerFile && (
                       <button
                         onClick={handleDeleteAnswerFile}
                         className="px-2.5 bg-red-950/60 hover:bg-red-900/80 border border-red-500/40 text-red-300 text-xs font-bold rounded-sm shrink-0"
                         title="정답지 삭제"
                       >
                         🗑️
                       </button>
                     )}
                   </div>
                   <button 
                     onClick={handleGradeExam}
                     disabled={isGrading || !answerFile}
                     className={`w-full py-3 text-xs font-bold rounded-sm transition-all shadow-md ${isGrading ? 'bg-white/10 text-white/30' : 'bg-teal-600 text-white hover:bg-teal-500'}`}
                   >
                     {isGrading ? "AI 자동 채점 진행 중..." : "🚀 자동 채점 시작"}
                   </button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 bg-black/20">
              <div className="space-y-2 pb-10">
                {Array.from({ length: questionCount }).map((_, idx) => {
                  const qNum = idx + 1;
                  const isCorrect = correctAnswers && userAnswers[qNum] === parseInt(correctAnswers[String(qNum)] as any);
                  const isWrong = correctAnswers && userAnswers[qNum] !== parseInt(correctAnswers[String(qNum)] as any);

                  return (
                    <div key={qNum} className={`flex items-center gap-3 p-2 rounded-sm border ${isCorrect ? 'bg-teal-950/20 border-teal-500/30' : isWrong ? 'bg-red-950/20 border-red-500/30' : 'bg-white/5 border-transparent hover:border-white/10'}`}>
                      <div className="w-6 text-right font-mono text-[11px] font-bold text-white/60 shrink-0">
                        {String(qNum).padStart(2, '0')}.
                      </div>
                      
                      <div className="flex gap-1.5 flex-1 justify-center">
                        {[1, 2, 3, 4, 5].map(opt => (
                          <button
                            key={opt}
                            onClick={() => handleAnswerSelect(qNum, opt)}
                            className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full text-[10px] font-bold border transition-all flex items-center justify-center shrink-0 ${
                              userAnswers[qNum] === opt 
                                ? 'bg-indigo-500 border-indigo-400 text-white shadow-[0_0_8px_rgba(99,102,241,0.6)]' 
                                : 'bg-black/50 border-white/20 text-white/40 hover:border-indigo-500/50'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>

                      {correctAnswers && (
                        <div className="w-10 flex items-center justify-center shrink-0 border-l border-white/10 pl-2">
                          {isCorrect ? (
                            <span className="text-teal-400 font-bold text-sm">✅</span>
                          ) : (
                            <div className="flex flex-col items-center">
                              <span className="text-red-400 font-bold text-[10px]">❌</span>
                              <span className="text-[9px] text-white/60 font-mono mt-0.5">답:{correctAnswers[String(qNum)] || '?'}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

        </div>
      )}

    </div>
  );
};
