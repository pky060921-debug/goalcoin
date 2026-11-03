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

// 💡 기본 내장 핵심 OX 문제
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
  // 1. OX 퀴즈 관련 상태 및 로직 (리스트형 한 줄 표시 + 하단 정답 아코디언)
  // =========================================================================
  const [oxBank, setOxBank] = useState<OxQuestion[]>(() => {
    try {
      const saved = localStorage.getItem(`blankd_ox_bank_${safeAddress}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return DEFAULT_OX_QUESTIONS;
  });

  const [oxCategory, setOxCategory] = useState<string>('전체');
  const [oxFilterWrongOnly, setOxFilterWrongOnly] = useState<boolean>(false);

  // 💡 각 문항별로 사용자가 방금 클릭한 답 ('O' | 'X') -> 클릭 시 해당 줄 밑에 정답/해설 표시
  const [oxUserChoices, setOxUserChoices] = useState<Record<number, 'O' | 'X'>>({});

  // 💡 OX 문제 선택 삭제 모드 및 선택된 문제 ID 집합
  const [isOxDeleteMode, setIsOxDeleteMode] = useState<boolean>(false);
  const [selectedOxIds, setSelectedOxIds] = useState<Set<number>>(new Set());

  // 각 문제별 누적 풀이 기록: { [id]: 'correct' | 'wrong' }
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

  // 💡 특정 문항의 O 또는 X 버튼 클릭 시 처리
  const handleSelectOxRow = (q: OxQuestion, choice: 'O' | 'X') => {
    setOxUserChoices(prev => {
      // 이미 같은 버튼을 눌러 해설이 열려있는 상태에서 한 번 더 누르면 해설 접기
      if (prev[q.id] === choice) {
        const next = { ...prev };
        delete next[q.id];
        return next;
      }
      return { ...prev, [q.id]: choice };
    });

    const isCorrect = choice === q.answer;
    setOxHistory(prev => ({
      ...prev,
      [q.id]: isCorrect ? 'correct' : 'wrong'
    }));
  };

  // 💡 JSON 문제 파일 업로드 핸들러 (덮어쓰기 대신 기존 문제 뒤에 추가)
  const handleUploadOxJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].question && parsed[0].answer) {
          setOxBank(prevBank => {
            const existingQuestions = new Set(prevBank.map(q => q.question.trim()));
            let maxId = prevBank.reduce((max, q) => Math.max(max, Number(q.id) || 0), 0);

            const addedQuestions: OxQuestion[] = [];
            let duplicateCount = 0;

            parsed.forEach((item: any) => {
              if (!item.question || !item.answer) return;
              const qText = String(item.question).trim();
              if (existingQuestions.has(qText)) {
                duplicateCount++;
                return;
              }
              existingQuestions.add(qText);
              maxId += 1;
              addedQuestions.push({
                id: maxId,
                category: item.category ? String(item.category).trim() : "추가 문제",
                question: qText,
                answer: String(item.answer).trim().toUpperCase() === 'O' ? 'O' : 'X',
                explanation: item.explanation ? String(item.explanation).trim() : ""
              });
            });

            if (addedQuestions.length === 0) {
              alert(`⚠️ 새로 추가된 문제가 없습니다. (중복된 문제 ${duplicateCount}개 제외)`);
              return prevBank;
            }

            const nextBank = [...prevBank, ...addedQuestions];
            alert(
              `✅ ${addedQuestions.length}개의 OX 문제가 새로 추가되었습니다! (총 ${nextBank.length}문제)` +
              (duplicateCount > 0 ? `\n* 이미 존재하는 중복 문제 ${duplicateCount}개는 자동 제외되었습니다.` : '')
            );
            return nextBank;
          });
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

  // 💡 단일 OX 문제 삭제
  const handleDeleteSingleOx = (targetId: number) => {
    if (!window.confirm(`#${targetId}번 문제를 삭제하시겠습니까?`)) return;
    setOxBank(prev => prev.filter(q => q.id !== targetId));
    setOxHistory(prev => {
      const next = { ...prev };
      delete next[targetId];
      return next;
    });
    setOxUserChoices(prev => {
      const next = { ...prev };
      delete next[targetId];
      return next;
    });
    setSelectedOxIds(prev => {
      const next = new Set(prev);
      next.delete(targetId);
      return next;
    });
  };

  // 💡 선택 삭제 모드에서 문제 선택/해제 토글
  const toggleSelectOxForDelete = (id: number) => {
    setSelectedOxIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 💡 현재 필터링된 목록 전체 선택 / 해제
  const handleToggleSelectAllFiltered = () => {
    const filteredIds = filteredOxQuestions.map(q => q.id);
    const allSelected = filteredIds.length > 0 && filteredIds.every(id => selectedOxIds.has(id));
    setSelectedOxIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        filteredIds.forEach(id => next.delete(id));
      } else {
        filteredIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  // 💡 선택한 OX 문제들 일괄 삭제 실행
  const handleDeleteSelectedOxQuestions = () => {
    if (selectedOxIds.size === 0) return alert("삭제할 문제를 먼저 선택해주세요.");
    if (!window.confirm(`선택한 ${selectedOxIds.size}개의 OX 문제를 삭제하시겠습니까?`)) return;

    setOxBank(prev => prev.filter(q => !selectedOxIds.has(q.id)));
    setOxHistory(prev => {
      const next = { ...prev };
      selectedOxIds.forEach(id => delete next[id]);
      return next;
    });
    setOxUserChoices(prev => {
      const next = { ...prev };
      selectedOxIds.forEach(id => delete next[id]);
      return next;
    });
    setSelectedOxIds(new Set());
    setIsOxDeleteMode(false);
  };

  const handleResetOxHistory = () => {
    if (window.confirm("OX 풀이 기록 및 펼쳐진 정답 표시를 모두 초기화하시겠습니까?")) {
      setOxHistory({});
      setOxUserChoices({});
    }
  };

  const handleRestoreDefaultOxBank = () => {
    if (window.confirm("모든 문제 변경사항을 초기화하고 기본 문제(20문항)로 되돌리시겠습니까?")) {
      setOxBank(DEFAULT_OX_QUESTIONS);
      localStorage.removeItem(`blankd_ox_bank_${safeAddress}`);
      setOxUserChoices({});
      setOxCategory('전체');
      setSelectedOxIds(new Set());
      setIsOxDeleteMode(false);
    }
  };

  // =========================================================================
  // 2. PDF 실전 모의고사 관련 상태 및 로직
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

  const handleDeleteExamFile = () => {
    if (window.confirm("현재 올라와 있는 모의고사 문제지 PDF를 닫고 삭제하시겠습니까?")) {
      setExamFile(null);
      setNumPages(null);
      setPageNumber(1);
      if (examFileInputRef.current) examFileInputRef.current.value = "";
      setSystemLog("🗑️ 문제지 PDF가 삭제되었습니다.");
    }
  };

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
              ➕ JSON 문제 추가 업로드
              <input ref={oxFileInputRef} type="file" accept=".json" className="hidden" onChange={handleUploadOxJson} />
            </label>
            <button
              onClick={() => {
                setIsOxDeleteMode(prev => !prev);
                setSelectedOxIds(new Set());
              }}
              className={`text-[11px] font-bold px-3 py-1.5 rounded-sm border transition-colors ${
                isOxDeleteMode
                  ? 'bg-red-600 text-white border-red-400 shadow-[0_0_10px_rgba(239,68,68,0.4)]'
                  : 'bg-red-950/40 hover:bg-red-900/60 border-red-500/40 text-red-300'
              }`}
            >
              {isOxDeleteMode ? '✕ 선택 삭제 종료' : '🗑️ 문제 골라서 삭제'}
            </button>
            <button
              onClick={handleRestoreDefaultOxBank}
              className="bg-white/5 hover:bg-white/15 border border-white/10 text-white/60 text-[11px] font-bold px-3 py-1.5 rounded-sm transition-colors"
              title="기본 20문제로 되돌리기"
            >
              🔄 기본 문제로 복원
            </button>
            <button
              onClick={handleResetOxHistory}
              className="bg-white/5 hover:bg-white/15 border border-white/10 text-white/60 text-[11px] font-bold px-3 py-1.5 rounded-sm transition-colors"
            >
              🧹 풀이 초기화
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
          모드 A: ⚡ 실전 OX 퀴즈 화면 (한 줄에 문제 + OX 버튼, 클릭 시 밑에 정답 표시)
      ========================================================================= */}
      {examMode === 'ox' && (
        <div className="bg-[#0a0a0c] border border-white/10 rounded-sm shadow-2xl p-4 sm:p-6 space-y-4">
          
          {/* 상단 카테고리 필터 + 점수 현황 요약 */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-white/10 pb-4">
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

            <div className="flex flex-wrap items-center gap-2 shrink-0 font-mono text-xs">
              <span className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-sm text-white/70">
                진행 <b className="text-white">{totalSolvedOx}</b>/{oxBank.length}
              </span>
              <span className="px-2.5 py-1 bg-teal-950/30 border border-teal-500/30 rounded-sm text-teal-300">
                정답 <b>{totalCorrectOx}</b>
              </span>
              <span className="px-2.5 py-1 bg-red-950/30 border border-red-500/30 rounded-sm text-red-300">
                오답 <b>{totalWrongOx}</b>
              </span>
              <button
                onClick={() => setOxFilterWrongOnly(!oxFilterWrongOnly)}
                className={`px-3 py-1 text-xs font-sans font-bold rounded-sm border transition-all ${
                  oxFilterWrongOnly
                    ? 'bg-red-600 text-white border-red-400 shadow-[0_0_10px_rgba(239,68,68,0.4)]'
                    : 'bg-red-950/30 text-red-400 border-red-500/30 hover:bg-red-900/40'
                }`}
              >
                🎯 틀린 문제만 보기 ({totalWrongOx})
              </button>
            </div>
          </div>

          {/* 선택 삭제 모드 컨트롤 바 */}
          {isOxDeleteMode && (
            <div className="flex flex-wrap justify-between items-center gap-2 bg-red-950/30 border border-red-500/40 px-4 py-2.5 rounded-sm">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-red-300">
                  🗑️ 삭제할 문제를 체크하세요 ({selectedOxIds.size}개 선택됨)
                </span>
                {filteredOxQuestions.length > 0 && (
                  <button
                    onClick={handleToggleSelectAllFiltered}
                    className="px-2.5 py-1 bg-amber-950/60 hover:bg-amber-900/80 border border-amber-500/40 text-amber-300 text-[11px] font-bold rounded-sm"
                  >
                    현재 목록 전체 선택/해제
                  </button>
                )}
              </div>
              <button
                onClick={handleDeleteSelectedOxQuestions}
                disabled={selectedOxIds.size === 0}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-30 text-white text-xs font-bold rounded-sm shadow-md transition-all"
              >
                선택한 {selectedOxIds.size}개 문제 일괄 삭제
              </button>
            </div>
          )}

          {/* 문제 리스트 (한 줄에 문제 + O/X 버튼, 클릭 시 밑에 정답 표시) */}
          {filteredOxQuestions.length === 0 ? (
            <div className="py-16 text-center text-white/40 space-y-3">
              <div className="text-3xl">🎉</div>
              <p className="text-sm font-bold">표시할 OX 문제가 없습니다.</p>
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
            <div className="divide-y divide-white/10 border-t border-white/10">
              {filteredOxQuestions.map((q, idx) => {
                const userChoice = oxUserChoices[q.id];
                const isAnswered = userChoice !== undefined;
                const isCorrect = isAnswered && userChoice === q.answer;
                const isSelectedForDelete = selectedOxIds.has(q.id);

                return (
                  <div
                    key={q.id}
                    className={`py-3 px-2 sm:px-3 transition-colors ${
                      isOxDeleteMode && isSelectedForDelete
                        ? 'bg-red-950/30'
                        : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    {/* 1줄: [체크박스(삭제모드)] + 번호 + 카테고리 + 문제 지문 + [O 버튼] [X 버튼] + [단일삭제] */}
                    <div className="flex items-start sm:items-center justify-between gap-2 sm:gap-4">
                      <div
                        className={`flex items-start sm:items-center gap-2 flex-1 min-w-0 ${
                          isOxDeleteMode ? 'cursor-pointer select-none' : ''
                        }`}
                        onClick={() => {
                          if (isOxDeleteMode) toggleSelectOxForDelete(q.id);
                        }}
                      >
                        {isOxDeleteMode && (
                          <input
                            type="checkbox"
                            checked={isSelectedForDelete}
                            onChange={() => toggleSelectOxForDelete(q.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1 sm:mt-0 w-4 h-4 accent-red-500 shrink-0 cursor-pointer"
                          />
                        )}
                        <span className="font-mono text-xs font-bold text-white/40 shrink-0 mt-0.5 sm:mt-0">
                          {String(idx + 1).padStart(2, '0')}.
                        </span>
                        {q.category && (
                          <span className="px-1.5 py-0.5 bg-indigo-950/60 border border-indigo-500/30 text-indigo-300 text-[10px] font-bold rounded-sm shrink-0 mt-0.5 sm:mt-0">
                            {q.category}
                          </span>
                        )}
                        <p className="text-xs sm:text-sm md:text-[15px] text-white/90 leading-relaxed break-keep flex-1">
                          {q.question}
                        </p>
                      </div>

                      {/* 우측 O / X 버튼 및 개별 삭제 버튼 */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleSelectOxRow(q, 'O')}
                          className={`w-8 h-8 sm:w-9 sm:h-9 rounded-sm font-bold text-xs sm:text-sm border transition-all flex items-center justify-center active:scale-95 ${
                            userChoice === 'O'
                              ? q.answer === 'O'
                                ? 'bg-teal-600 text-white border-teal-400 shadow-[0_0_8px_rgba(20,184,166,0.5)]'
                                : 'bg-red-600 text-white border-red-400 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                              : 'bg-teal-950/30 border-teal-500/40 text-teal-300 hover:bg-teal-900/50'
                          }`}
                        >
                          O
                        </button>
                        <button
                          onClick={() => handleSelectOxRow(q, 'X')}
                          className={`w-8 h-8 sm:w-9 sm:h-9 rounded-sm font-bold text-xs sm:text-sm border transition-all flex items-center justify-center active:scale-95 ${
                            userChoice === 'X'
                              ? q.answer === 'X'
                                ? 'bg-teal-600 text-white border-teal-400 shadow-[0_0_8px_rgba(20,184,166,0.5)]'
                                : 'bg-red-600 text-white border-red-400 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                              : 'bg-red-950/30 border-red-500/40 text-red-300 hover:bg-red-900/50'
                          }`}
                        >
                          X
                        </button>
                        <button
                          onClick={() => handleDeleteSingleOx(q.id)}
                          title="이 문제 삭제"
                          className="w-7 h-8 sm:h-9 rounded-sm text-white/25 hover:text-red-400 hover:bg-red-950/30 text-xs flex items-center justify-center transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* 2줄 (O나 X를 눌렀을 때 바로 밑에 펼쳐지는 정답 및 해설) */}
                    {isAnswered && (
                      <div
                        className={`mt-2.5 ml-6 sm:ml-8 p-2.5 sm:p-3 rounded-sm border text-xs sm:text-sm animate-in fade-in duration-150 ${
                          isCorrect
                            ? 'bg-teal-950/30 border-teal-500/40 text-teal-200'
                            : 'bg-red-950/30 border-red-500/40 text-red-200'
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2 font-bold mb-1">
                          <span className={isCorrect ? 'text-teal-400' : 'text-red-400'}>
                            {isCorrect ? '⭕ 정답입니다!' : '❌ 오답입니다!'}
                          </span>
                          <span className="text-white/70 font-mono text-xs">
                            (정답: <b className="text-amber-300">{q.answer}</b>)
                          </span>
                        </div>
                        {q.explanation && (
                          <p className="text-white/85 leading-relaxed whitespace-pre-wrap text-xs sm:text-[13px]">
                            💡 {q.explanation}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          모드 B: 📄 PDF 실전 모의고사 뷰어 및 OMR
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
