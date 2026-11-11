import React, { useState, useEffect, useMemo, useRef } from 'react';

export interface OxQuestion {
  id: number;
  category: string;
  subCategory?: string;
  folder?: string;
  question: string;
  answer: string; // 'O' | 'X'
  correctAnswer?: string;
  explanation: string;
  source?: string;
}

export interface SubjectiveQuestion {
  id: number;
  title: string;
  question: string;
  modelAnswer: string;
  keywords: string[];
  userAnswer?: string;
  score?: number;
}

interface ExamTabProps {
  walletAddress?: string;
  address?: string;
  theme?: string;
}

const DEFAULT_OX_SAMPLE: OxQuestion[] = [
  {
    id: 1,
    category: '법령 1장 총칙',
    subCategory: '1. 목적·관장·정의 및 사용자인 기관장 (법 제1조~제3조, 시행령 제2조·별표1)',
    folder: '',
    question:
      '사용자인 기관장으로 잘못 기술된 것은?\n(1) 헌법재판소 : 사무총장 (2) 사법부 : 법원사무처장 (3) 선거관리위원회 : 중앙선거관리위원회 위원장',
    answer: 'X',
    correctAnswer: '(1) 사무처장 / (2) 법원행정처장 / (3) 중앙선거관리위원회 사무총장',
    explanation:
      '[원래 문제] 사용자인 기관장으로 잘못 기술된 것은?\n[정답·수정] (1) 사무처장 / (2) 법원행정처장 / (3) 중앙선거관리위원회 사무총장\n[분류] 1. 목적·관장·정의 및 사용자인 기관장 (법 제1조~제3조, 시행령 제2조·별표1)\n[출처] 2021년 하반기 제1차(시행령 별표) 1번 (박스형(틀린보기))',
    source: '2021년 하반기 제1차(시행령 별표) 1번 (박스형(틀린보기))',
  },
  {
    id: 2,
    category: '계산 문제',
    subCategory: '01. 별표2·요양급여 본인일부부담금 계산',
    folder: '계산 문제',
    question:
      '희귀난치성질환자등이 아닌 일반 가입자가 상급종합병원에서 외래진료를 받고 진찰료 총액 20,000원, 진찰료를 제외한 요양급여비용 총액 100,000원이 발생한 경우 본인이 부담해야 할 금액은 80,000원이다.',
    answer: 'O',
    correctAnswer:
      'O (맞는 계산/지문) — 상급종합병원 일반 외래 본인부담금은 진찰료 총액의 100%(20,000원)와 나머지 요양급여비용 총액의 60%(60,000원)를 합산하여 총 80,000원이 됩니다.',
    explanation:
      '[정답·해설] (O) 상급종합병원 일반 외래 본인부담금은 진찰료 총액의 100%(20,000원)와 나머지 요양급여비용 총액의 60%(60,000원)를 합산하여 총 80,000원이 됩니다.\n[분류] 별표2·요양급여본인부담률\n[출처] 계산문제 (별표2·요양급여본인부담률) #2',
    source: '계산문제 (별표2·요양급여본인부담률) #2',
  },
];

// 문항이 계산 문제인지 판별하는 헬퍼
const isCalculationQuestion = (q: OxQuestion): boolean => {
  if (q.category === '계산 문제' || q.folder === '계산 문제') return true;
  if ((q.source || '').startsWith('계산문제')) return true;
  return false;
};

export const ExamTab: React.FC<ExamTabProps> = ({ walletAddress, address, theme }) => {
  const safeAddress = walletAddress || address || 'default';
  const storageKeyOx = `blankd_ox_questions_${safeAddress}`;
  const storageKeyOxAnswers = `blankd_ox_user_answers_${safeAddress}`;
  const storageKeyOxFolders = `blankd_ox_folders_${safeAddress}`;

  // 화이트 모드(라이트 테마) 실시간 감지
  const [isLightMode, setIsLightMode] = useState<boolean>(() => {
    if (theme === 'white' || theme === 'light') return true;
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('blankd_theme');
      return savedTheme === 'white' || savedTheme === 'light';
    }
    return false;
  });

  useEffect(() => {
    const checkTheme = () => {
      if (theme === 'white' || theme === 'light') {
        setIsLightMode(true);
        return;
      }
      if (theme === 'black' || theme === 'green' || theme === 'dark') {
        setIsLightMode(false);
        return;
      }
      const savedTheme = localStorage.getItem('blankd_theme');
      setIsLightMode(savedTheme === 'white' || savedTheme === 'light');
    };
    checkTheme();
    const interval = setInterval(checkTheme, 600);
    window.addEventListener('storage', checkTheme);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', checkTheme);
    };
  }, [theme]);

  // 상단 탭 모드: 'ox' (일반 법령·정관 오답노트) | 'calc' (계산 문제 전용) | 'subjective' (단답·요약)
  const [examSubTab, setExamSubTab] = useState<'ox' | 'calc' | 'subjective'>('ox');

  // OX 문제 목록 상태
  const [oxQuestions, setOxQuestions] = useState<OxQuestion[]>(() => {
    try {
      const saved =
        localStorage.getItem(storageKeyOx) || localStorage.getItem('blankd_ox_questions_default');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('OX 데이터 로드 오류:', e);
    }
    return DEFAULT_OX_SAMPLE;
  });

  // 사용자 정의 학습 폴더 목록 상태
  const [oxFolders, setOxFolders] = useState<string[]>(() => {
    try {
      const saved =
        localStorage.getItem(storageKeyOxFolders) ||
        localStorage.getItem('blankd_ox_folders_default');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return ['계산 문제', '자주 틀리는 조항', '시험 직전 필수암기'];
  });

  // 사용자 O/X 풀이 기록
  const [oxUserAnswers, setOxUserAnswers] = useState<Record<number, string>>(() => {
    try {
      const saved =
        localStorage.getItem(storageKeyOxAnswers) ||
        localStorage.getItem('blankd_ox_user_answers_default');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {};
  });

  // 필터 상태
  const [activeFolder, setActiveFolder] = useState<string>('전체');
  const [activeCategory, setActiveCategory] = useState<string>('전체');
  const [activeSubCategory, setActiveSubCategory] = useState<string>('전체');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unsolved' | 'wrong' | 'correct'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 정답/해설 펼침 상태 (조항 클릭 시 토글)
  const [expandedOxIds, setExpandedOxIds] = useState<Set<number>>(new Set());
  const [showAllAnswers, setShowAllAnswers] = useState<boolean>(false);

  // 폴더 생성 및 일괄 분류/선택 모드 상태
  const [newFolderName, setNewFolderName] = useState<string>('');
  const [isCreatingFolder, setIsCreatingFolder] = useState<boolean>(false);
  const [isSelectMode, setIsSelectMode] = useState<boolean>(false);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<number>>(new Set());
  const [targetMoveFolder, setTargetMoveFolder] = useState<string>('');

  // 신규 문항 직접 추가 모달/패널 상태
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [newQCategory, setNewQCategory] = useState<string>('법령 1장 총칙');
  const [newQSubCategory, setNewQSubCategory] = useState<string>('');
  const [newQFolder, setNewQFolder] = useState<string>('');
  const [newQText, setNewQText] = useState<string>('');
  const [newQAnswer, setNewQAnswer] = useState<'O' | 'X'>('X');
  const [newQCorrectAnswer, setNewQCorrectAnswer] = useState<string>('');
  const [newQExplanation, setNewQExplanation] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 로컬스토리지 자동 저장
  useEffect(() => {
    try {
      const serialized = JSON.stringify(oxQuestions);
      localStorage.setItem(storageKeyOx, serialized);
      localStorage.setItem('blankd_ox_questions_default', serialized);
    } catch (e) {
      console.error('OX 문제 저장 오류:', e);
    }
  }, [oxQuestions, storageKeyOx]);

  useEffect(() => {
    try {
      const serialized = JSON.stringify(oxFolders);
      localStorage.setItem(storageKeyOxFolders, serialized);
      localStorage.setItem('blankd_ox_folders_default', serialized);
    } catch (e) {}
  }, [oxFolders, storageKeyOxFolders]);

  useEffect(() => {
    try {
      const serialized = JSON.stringify(oxUserAnswers);
      localStorage.setItem(storageKeyOxAnswers, serialized);
      localStorage.setItem('blankd_ox_user_answers_default', serialized);
    } catch (e) {}
  }, [oxUserAnswers, storageKeyOxAnswers]);

  // 문제 데이터 내의 폴더명이 oxFolders에 없으면 자동 등록
  useEffect(() => {
    const foldersInQuestions = Array.from(
      new Set(
        oxQuestions
          .map((q) => (q.folder || '').trim())
          .filter((f) => f !== '' && f !== '미분류' && f !== '전체')
      )
    );
    if (foldersInQuestions.length > 0) {
      setOxFolders((prev) => {
        const merged = Array.from(new Set([...prev, ...foldersInQuestions]));
        return merged.length !== prev.length ? merged : prev;
      });
    }
  }, [oxQuestions]);

  // 정답 핵심 텍스트 추출 헬퍼
  const getConciseCorrectAnswer = (q: OxQuestion): string => {
    if (q.correctAnswer && q.correctAnswer.trim()) {
      return q.correctAnswer.trim();
    }
    if (q.explanation) {
      const firstLine = q.explanation
        .split('\n')[0]
        .replace(/^\[정답·수정\]\s*/, '')
        .replace(/^\[정답·해설\]\s*/, '')
        .trim();
      if (firstLine) return firstLine;
    }
    return q.answer === 'O' ? 'O (맞는 지문)' : 'X (틀린 지문)';
  };

  // 조항(문장) 클릭 시 정답 배지 및 해설 토글
  const toggleOxExp = (id: number) => {
    setExpandedOxIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 전체 정답 보기/숨기기 토글
  const handleToggleAllAnswers = () => {
    if (showAllAnswers) {
      setShowAllAnswers(false);
      setExpandedOxIds(new Set());
    } else {
      setShowAllAnswers(true);
      setExpandedOxIds(new Set(filteredQuestions.map((q) => q.id)));
    }
  };

  // 폴더 생성
  const handleCreateFolder = () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) {
      alert('폴더 이름을 입력해 주세요.');
      return;
    }
    if (trimmed === '전체' || trimmed === '미분류') {
      alert('"전체" 또는 "미분류"는 예약된 이름입니다.');
      return;
    }
    if (oxFolders.includes(trimmed)) {
      alert('이미 존재하는 폴더 이름입니다.');
      return;
    }
    setOxFolders((prev) => [...prev, trimmed]);
    setTargetMoveFolder(trimmed);
    setNewFolderName('');
    setIsCreatingFolder(false);
  };

  // 폴더 이름 변경
  const handleRenameFolder = (oldName: string) => {
    const nextName = prompt(`"${oldName}" 폴더의 새 이름을 입력하세요:`, oldName);
    if (!nextName) return;
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === oldName) return;
    if (trimmed === '전체' || trimmed === '미분류' || oxFolders.includes(trimmed)) {
      alert('사용할 수 없거나 이미 존재하는 폴더 이름입니다.');
      return;
    }
    setOxFolders((prev) => prev.map((f) => (f === oldName ? trimmed : f)));
    setOxQuestions((prev) =>
      prev.map((q) => ((q.folder || '').trim() === oldName ? { ...q, folder: trimmed } : q))
    );
    if (activeFolder === oldName) setActiveFolder(trimmed);
  };

  // 폴더 삭제
  const handleDeleteFolder = (folderName: string) => {
    if (
      !confirm(
        `"${folderName}" 폴더를 삭제하시겠습니까?\n(폴더 안의 문제들은 삭제되지 않고 '미분류' 상태로 유지됩니다.)`
      )
    ) {
      return;
    }
    setOxFolders((prev) => prev.filter((f) => f !== folderName));
    setOxQuestions((prev) =>
      prev.map((q) => ((q.folder || '').trim() === folderName ? { ...q, folder: '' } : q))
    );
    if (activeFolder === folderName) setActiveFolder('전체');
  };

  // 개별 문항 폴더 지정
  const handleAssignSingleQuestionFolder = (questionId: number, folderName: string) => {
    setOxQuestions((prev) =>
      prev.map((q) => (q.id === questionId ? { ...q, folder: folderName } : q))
    );
  };

  // 선택된 문항들을 특정 폴더로 일괄 이동
  const handleBulkMoveToFolder = (destinationFolder: string) => {
    if (selectedQuestionIds.size === 0) {
      alert('먼저 폴더에 넣을 문항을 체크해 주세요.');
      return;
    }
    const cleanDest = destinationFolder === '미분류' ? '' : destinationFolder.trim();
    setOxQuestions((prev) =>
      prev.map((q) => (selectedQuestionIds.has(q.id) ? { ...q, folder: cleanDest } : q))
    );
    setSelectedQuestionIds(new Set());
  };

  // 선택된 문항 일괄 삭제
  const handleBulkDeleteQuestions = () => {
    if (selectedQuestionIds.size === 0) {
      alert('삭제할 문항을 먼저 선택해 주세요.');
      return;
    }
    if (!confirm(`선택한 ${selectedQuestionIds.size}개 문항을 삭제하시겠습니까?`)) return;
    setOxQuestions((prev) => prev.filter((q) => !selectedQuestionIds.has(q.id)));
    setSelectedQuestionIds(new Set());
  };

  // JSON 파일 업로드
  const handleUploadJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const raw = event.target?.result as string;
        const parsed = JSON.parse(raw);
        const list: any[] = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed.questions)
          ? parsed.questions
          : [];

        if (list.length === 0) {
          alert('유효한 문항 배열이 없는 JSON 파일입니다.');
          return;
        }

        const normalizedLoaded: OxQuestion[] = list.map((item, idx) => ({
          id: Number(item.id) || idx + 1,
          category: String(item.category || '기타').trim(),
          subCategory: item.subCategory ? String(item.subCategory).trim() : '',
          folder: item.folder ? String(item.folder).trim() : '',
          question: String(item.question || '').trim(),
          answer: String(item.answer || 'X').toUpperCase() === 'O' ? 'O' : 'X',
          correctAnswer: item.correctAnswer ? String(item.correctAnswer).trim() : '',
          explanation: String(item.explanation || '').trim(),
          source: item.source ? String(item.source).trim() : '',
        }));

        const shouldMerge =
          oxQuestions.length > 5 &&
          confirm(
            `불러온 파일(${normalizedLoaded.length}문항)을 현재 목록(${oxQuestions.length}문항)과 합치시겠습니까?\n\n[확인] = 중복 제외하고 합치기 (기존 폴더 분류 유지)\n[취소] = 새 파일로 전체 교체하기`
          );

        const normKey = (s: string) =>
          s
            .replace(/\s+/g, '')
            .replace(/[.,·ㆍ•"“”'‘’()\[\]\-—]/g, '')
            .toLowerCase();

        if (shouldMerge) {
          const seen = new Map<string, OxQuestion>();
          oxQuestions.forEach((q) => {
            seen.set(normKey(q.question), q);
          });
          normalizedLoaded.forEach((q) => {
            const k = normKey(q.question);
            if (!seen.has(k)) {
              seen.set(k, q);
            } else {
              const existing = seen.get(k)!;
              if (!existing.folder && q.folder) {
                seen.set(k, { ...existing, folder: q.folder, category: q.category });
              }
            }
          });
          const merged = Array.from(seen.values()).map((q, i) => ({ ...q, id: i + 1 }));
          setOxQuestions(merged);
          alert(`중복을 제외하고 총 ${merged.length}문항으로 통합되었습니다.`);
        } else {
          const seen = new Set<string>();
          const deduped: OxQuestion[] = [];
          normalizedLoaded.forEach((q) => {
            const k = normKey(q.question);
            if (!seen.has(k)) {
              seen.add(k);
              deduped.push({ ...q, id: deduped.length + 1 });
            }
          });
          setOxQuestions(deduped);
          setOxUserAnswers({});
          setExpandedOxIds(new Set());
          setActiveFolder('전체');
          setActiveCategory('전체');
          setActiveSubCategory('전체');
          alert(`총 ${deduped.length}문항을 성공적으로 불러왔습니다.`);
        }
      } catch (err) {
        alert('JSON 파일 파싱에 실패했습니다. 올바른 JSON 형식인지 확인해 주세요.');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file, 'utf-8');
  };

  // 현재 오답정리 목록(폴더 분류 포함)을 JSON 파일로 다운로드
  const handleExportJson = () => {
    const dataStr = JSON.stringify(oxQuestions, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `국민건강보험공단_오답정리_폴더분류포함_${oxQuestions.length}문항.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 일반 법령·정관 문항 vs 계산 문제 분리 카운트
  const nonCalcQuestions = useMemo(
    () => oxQuestions.filter((q) => !isCalculationQuestion(q)),
    [oxQuestions]
  );
  const calcQuestions = useMemo(
    () => oxQuestions.filter((q) => isCalculationQuestion(q)),
    [oxQuestions]
  );

  // 현재 탭('ox' vs 'calc')의 베이스 문항 풀
  const baseModeQuestions = useMemo(() => {
    if (examSubTab === 'calc') return calcQuestions;
    // 일반 탭에서 사용자가 '계산 문제' 폴더나 '계산 문제' 카테고리를 직접 클릭한 경우를 제외하면 일반 문항만 표시
    if (activeFolder === '계산 문제' || activeCategory === '계산 문제') return calcQuestions;
    return nonCalcQuestions;
  }, [examSubTab, nonCalcQuestions, calcQuestions, activeFolder, activeCategory]);

  // 폴더별 문항 수 계산
  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {
      전체: nonCalcQuestions.length,
      미분류: 0,
    };
    oxFolders.forEach((f) => {
      counts[f] = 0;
    });
    oxQuestions.forEach((q) => {
      const f = (q.folder || '').trim();
      if (!f) {
        if (!isCalculationQuestion(q)) {
          counts['미분류'] = (counts['미분류'] || 0) + 1;
        }
      } else {
        counts[f] = (counts[f] || 0) + 1;
      }
    });
    return counts;
  }, [oxQuestions, nonCalcQuestions, oxFolders]);

  // 현재 선택된 폴더 내의 문항 목록
  const folderFilteredQuestions = useMemo(() => {
    if (examSubTab === 'calc') return calcQuestions;
    return baseModeQuestions.filter((q) => {
      const f = (q.folder || '').trim();
      if (activeFolder === '전체') return true;
      if (activeFolder === '미분류') return !f;
      return f === activeFolder;
    });
  }, [examSubTab, calcQuestions, baseModeQuestions, activeFolder]);

  const categoriesList = useMemo(() => {
    const cats = Array.from(new Set(folderFilteredQuestions.map((q) => q.category)));
    return ['전체', ...cats];
  }, [folderFilteredQuestions]);

  const subCategoriesList = useMemo(() => {
    if (examSubTab === 'calc') {
      const subs = Array.from(
        new Set(
          calcQuestions.map((q) => (q.subCategory || '').trim()).filter(Boolean)
        )
      );
      return ['전체', ...subs];
    }
    if (activeCategory === '전체') return ['전체'];
    const subs = Array.from(
      new Set(
        folderFilteredQuestions
          .filter((q) => q.category === activeCategory)
          .map((q) => (q.subCategory || '').trim())
          .filter(Boolean)
      )
    );
    return ['전체', ...subs];
  }, [examSubTab, calcQuestions, folderFilteredQuestions, activeCategory]);

  // 최종 필터링된 문항 목록
  const filteredQuestions = useMemo(() => {
    return folderFilteredQuestions.filter((q) => {
      if (examSubTab !== 'calc' && activeCategory !== '전체' && q.category !== activeCategory)
        return false;
      if (activeSubCategory !== '전체' && (q.subCategory || '').trim() !== activeSubCategory)
        return false;

      const userAns = oxUserAnswers[q.id];
      if (statusFilter === 'unsolved' && userAns !== undefined) return false;
      if (statusFilter === 'wrong' && (!userAns || userAns === q.answer)) return false;
      if (statusFilter === 'correct' && userAns !== q.answer) return false;

      if (searchQuery.trim()) {
        const kw = searchQuery.trim().toLowerCase();
        const inQ = q.question.toLowerCase().includes(kw);
        const inAns = (q.correctAnswer || '').toLowerCase().includes(kw);
        const inExp = (q.explanation || '').toLowerCase().includes(kw);
        const inSub = (q.subCategory || '').toLowerCase().includes(kw);
        const inFolder = (q.folder || '').toLowerCase().includes(kw);
        if (!inQ && !inAns && !inExp && !inSub && !inFolder) return false;
      }
      return true;
    });
  }, [
    examSubTab,
    folderFilteredQuestions,
    activeCategory,
    activeSubCategory,
    statusFilter,
    searchQuery,
    oxUserAnswers,
  ]);

  // 현재 필터 목록 전체 선택/해제
  const handleToggleSelectAllFiltered = () => {
    const filteredIds = filteredQuestions.map((q) => q.id);
    const allSelected =
      filteredIds.length > 0 && filteredIds.every((id) => selectedQuestionIds.has(id));
    if (allSelected) {
      setSelectedQuestionIds((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedQuestionIds((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  // 신규 문항 수동 추가
  const handleAddSingleQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQText.trim()) return;
    const nextId = oxQuestions.length > 0 ? Math.max(...oxQuestions.map((q) => q.id)) + 1 : 1;
    const item: OxQuestion = {
      id: nextId,
      category: newQCategory.trim() || '기타',
      subCategory: newQSubCategory.trim(),
      folder: newQFolder.trim(),
      question: newQText.trim(),
      answer: newQAnswer,
      correctAnswer: newQCorrectAnswer.trim(),
      explanation:
        newQExplanation.trim() || `[정답·수정] ${newQCorrectAnswer.trim() || newQAnswer}`,
      source: '직접 추가',
    };
    setOxQuestions((prev) => [item, ...prev]);
    setNewQText('');
    setNewQCorrectAnswer('');
    setNewQExplanation('');
    setIsAddModalOpen(false);
  };

  /**
   * 조항 렌더링 함수:
   * 1) 틀린 부분 인라인 하이라이트(wrongParts) 제거
   * 2) 항목형 문항(원래 문제가 위에 있고 \n(1)...(2)...가 이어지는 형태)은
   *    원래 문제를 위에 굵게 표시하고 아래에 (1)(2) 항목을 이어서 표시
   * 3) 조항 클릭 시 오른쪽에 빨간색 동그라미 형태 배지(👉 정답: ...) 표시
   */
  const renderClauseWithRightAnswerBadge = (q: OxQuestion, isExpanded: boolean) => {
    const ansText = getConciseCorrectAnswer(q);
    const hasStemAndItems = q.question.includes('\n(1)');
    let stemPart = '';
    let itemsPart = q.question;

    if (hasStemAndItems) {
      const splitIdx = q.question.indexOf('\n(1)');
      stemPart = q.question.slice(0, splitIdx).trim();
      itemsPart = q.question.slice(splitIdx + 1).trim();
    }

    return (
      <span className="inline leading-relaxed">
        {hasStemAndItems ? (
          <>
            <span
              className={`block font-extrabold mb-1 text-[13px] sm:text-[14px] ${
                isLightMode ? 'text-indigo-950' : 'text-amber-300'
              }`}
            >
              📌 {stemPart}
            </span>
            <span
              className={`whitespace-pre-line font-medium ${
                isLightMode ? 'text-slate-900 font-semibold' : 'text-zinc-100'
              }`}
            >
              {itemsPart}
            </span>
          </>
        ) : (
          <span
            className={`whitespace-pre-line ${
              isLightMode ? 'text-slate-900 font-semibold' : 'text-zinc-100'
            }`}
          >
            {q.question}
          </span>
        )}

        {isExpanded && ansText && (
          <span
            className={`inline-flex items-center gap-1 ml-2.5 px-3 py-0.5 rounded-full text-xs sm:text-[13px] font-extrabold align-middle shadow-sm border-2 transition-all ${
              isLightMode
                ? 'bg-rose-50 text-rose-700 border-rose-500 shadow-rose-100'
                : 'bg-rose-950/90 text-rose-200 border-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.35)]'
            }`}
          >
            <span>👉 정답:</span>
            <span>{ansText}</span>
          </span>
        )}
      </span>
    );
  };

  // 통계 수치
  const totalSolved = Object.keys(oxUserAnswers).length;
  const totalCorrect = Object.entries(oxUserAnswers).filter(([idStr, ans]) => {
    const q = oxQuestions.find((item) => item.id === Number(idStr));
    return q && q.answer === ans;
  }).length;
  const totalWrong = totalSolved - totalCorrect;

  return (
    <div
      className={`w-full space-y-4 transition-colors ${
        isLightMode ? 'text-slate-900' : 'text-zinc-100'
      }`}
    >
      {/* 상단 헤더 & 모드 분리 탭(일반 법령·정관 오답노트 vs 계산 문제 별도 분리) */}
      <div
        className={`p-4 rounded-xl border flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-sm ${
          isLightMode ? 'bg-white border-slate-300' : 'bg-[#0a0a0c] border-white/10'
        }`}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex rounded-lg p-1 border bg-opacity-50 gap-1 flex-wrap">
            <button
              onClick={() => {
                setExamSubTab('ox');
                if (activeFolder === '계산 문제') setActiveFolder('전체');
                if (activeCategory === '계산 문제') setActiveCategory('전체');
                setActiveSubCategory('전체');
              }}
              className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-extrabold transition-all ${
                examSubTab === 'ox'
                  ? 'bg-teal-600 text-white shadow'
                  : isLightMode
                  ? 'text-slate-700 hover:bg-slate-200'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              📋 법령·정관 오답노트 ({nonCalcQuestions.length})
            </button>

            <button
              onClick={() => {
                setExamSubTab('calc');
                setActiveSubCategory('전체');
              }}
              className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-extrabold transition-all ${
                examSubTab === 'calc'
                  ? 'bg-rose-600 text-white shadow'
                  : isLightMode
                  ? 'text-rose-800 bg-rose-50 hover:bg-rose-100'
                  : 'text-rose-300 hover:text-white'
              }`}
            >
              🧮 계산 문제 ({calcQuestions.length})
            </button>

            <button
              onClick={() => setExamSubTab('subjective')}
              className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-extrabold transition-all ${
                examSubTab === 'subjective'
                  ? 'bg-indigo-600 text-white shadow'
                  : isLightMode
                  ? 'text-slate-700 hover:bg-slate-200'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              ✍️ 나만의 단답·요약 노트
            </button>
          </div>

          <div
            className={`text-xs font-bold flex items-center gap-2 px-2.5 py-1 rounded-lg border ${
              isLightMode
                ? 'bg-slate-100 border-slate-300 text-slate-800'
                : 'bg-white/5 border-white/10 text-zinc-300'
            }`}
          >
            <span>총 {oxQuestions.length}문항</span>
            <span>·</span>
            <span className={isLightMode ? 'text-teal-700' : 'text-teal-400'}>
              정답 {totalCorrect}
            </span>
            <span>·</span>
            <span className={isLightMode ? 'text-rose-700' : 'text-rose-400'}>
              오답 {totalWrong}
            </span>
          </div>
        </div>

        {/* 우측 액션 버튼들 */}
        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleUploadJson}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold border transition-all flex items-center gap-1.5 shadow-sm ${
              isLightMode
                ? 'bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700'
                : 'bg-indigo-600/80 text-white border-indigo-400 hover:bg-indigo-500'
            }`}
          >
            📂 JSON 파일 불러오기
          </button>

          <button
            onClick={handleExportJson}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold border transition-all flex items-center gap-1.5 shadow-sm ${
              isLightMode
                ? 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700'
                : 'bg-emerald-700/80 text-white border-emerald-500 hover:bg-emerald-600'
            }`}
          >
            💾 JSON 백업 저장 (폴더포함)
          </button>

          <button
            onClick={() => setIsAddModalOpen((prev) => !prev)}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold border transition-all ${
              isLightMode
                ? 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200'
                : 'bg-white/5 text-zinc-200 border-white/15 hover:bg-white/10'
            }`}
          >
            ➕ 문항 추가
          </button>

          <button
            onClick={() => {
              if (confirm('모든 O/X 풀이 체크 기록을 초기화하시겠습니까?')) {
                setOxUserAnswers({});
              }
            }}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${
              isLightMode
                ? 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                : 'bg-white/5 text-zinc-400 border-white/10 hover:text-white'
            }`}
          >
            🔄 풀이 초기화
          </button>
        </div>
      </div>

      {/* 수동 문항 추가 패널 */}
      {isAddModalOpen && (
        <form
          onSubmit={handleAddSingleQuestion}
          className={`p-4 rounded-xl border space-y-3 shadow-md ${
            isLightMode ? 'bg-white border-slate-300' : 'bg-[#101014] border-teal-500/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-extrabold">➕ 새 오답 문항 직접 등록</h4>
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="text-xs font-bold opacity-70 hover:opacity-100"
            >
              ✕ 닫기
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              value={newQCategory}
              onChange={(e) => setNewQCategory(e.target.value)}
              placeholder="대분류 (예: 법령 1장 총칙 또는 계산 문제)"
              className={`px-3 py-1.5 rounded border text-xs font-bold ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-900'
                  : 'bg-black/50 border-white/20 text-white'
              }`}
            />
            <input
              type="text"
              value={newQSubCategory}
              onChange={(e) => setNewQSubCategory(e.target.value)}
              placeholder="세부분류 (선택)"
              className={`px-3 py-1.5 rounded border text-xs font-bold ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-900'
                  : 'bg-black/50 border-white/20 text-white'
              }`}
            />
            <select
              value={newQFolder}
              onChange={(e) => setNewQFolder(e.target.value)}
              className={`px-3 py-1.5 rounded border text-xs font-bold ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-900'
                  : 'bg-black/50 border-white/20 text-white'
              }`}
            >
              <option value="">📂 폴더 미지정 (미분류)</option>
              {oxFolders.map((f) => (
                <option key={f} value={f}>
                  🗂️ {f}
                </option>
              ))}
            </select>
          </div>
          <textarea
            rows={2}
            value={newQText}
            onChange={(e) => setNewQText(e.target.value)}
            placeholder="문제 지문을 입력하세요 (항목형인 경우 첫 줄에 문제를 적고 줄바꿈 후 (1) 항목1 (2) 항목2 형태로 입력)"
            className={`w-full px-3 py-2 rounded border text-xs font-medium ${
              isLightMode
                ? 'bg-slate-50 border-slate-300 text-slate-900'
                : 'bg-black/50 border-white/20 text-white'
            }`}
            required
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select
              value={newQAnswer}
              onChange={(e) => setNewQAnswer(e.target.value as 'O' | 'X')}
              className={`px-3 py-1.5 rounded border text-xs font-bold ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-900'
                  : 'bg-black/50 border-white/20 text-white'
              }`}
            >
              <option value="X">정답: X (틀린 지문)</option>
              <option value="O">정답: O (맞는 지문)</option>
            </select>
            <input
              type="text"
              value={newQCorrectAnswer}
              onChange={(e) => setNewQCorrectAnswer(e.target.value)}
              placeholder="조항 클릭 시 오른쪽에 표시할 핵심 정답 (예: 지체 없이 → 즉시)"
              className={`sm:col-span-2 px-3 py-1.5 rounded border text-xs font-bold ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-900'
                  : 'bg-black/50 border-white/20 text-white'
              }`}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="submit"
              className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded text-xs font-extrabold shadow"
            >
              등록하기
            </button>
          </div>
        </form>
      )}

      {examSubTab !== 'subjective' ? (
        <>
          {/* ===================================================================== */}
          {/* 📁 1. 나만의 학습 폴더 바 (일반 탭에서 폴더 생성 / 이름변경 / 삭제 / 분류) */}
          {/* ===================================================================== */}
          {examSubTab === 'ox' && (
            <div
              className={`p-3.5 rounded-xl border space-y-2.5 shadow-sm ${
                isLightMode ? 'bg-white border-slate-300' : 'bg-[#0a0a0c] border-white/10'
              }`}
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs sm:text-sm font-extrabold flex items-center gap-1.5 ${
                      isLightMode ? 'text-slate-900' : 'text-amber-300'
                    }`}
                  >
                    📁 내 학습 폴더 분류
                  </span>
                  <span
                    className={`text-[11px] font-medium ${
                      isLightMode ? 'text-slate-600' : 'text-zinc-400'
                    }`}
                  >
                    (계산 문제는 상단 [🧮 계산 문제] 탭 또는 [🗂️ 계산 문제] 폴더로 별도 분리되어 있습니다)
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {!isCreatingFolder ? (
                    <button
                      onClick={() => setIsCreatingFolder(true)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-extrabold border transition-all ${
                        isLightMode
                          ? 'bg-amber-50 text-amber-900 border-amber-400 hover:bg-amber-100'
                          : 'bg-amber-950/60 text-amber-300 border-amber-500/50 hover:bg-amber-900/60'
                      }`}
                    >
                      ➕ 새 폴더 만들기
                    </button>
                  ) : (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCreateFolder();
                          }
                        }}
                        placeholder="새 폴더 이름 입력..."
                        autoFocus
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border outline-none ${
                          isLightMode
                            ? 'bg-white border-amber-500 text-slate-900'
                            : 'bg-black border-amber-400 text-white'
                        }`}
                      />
                      <button
                        onClick={handleCreateFolder}
                        className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-amber-500 text-black hover:bg-amber-400"
                      >
                        생성
                      </button>
                      <button
                        onClick={() => {
                          setIsCreatingFolder(false);
                          setNewFolderName('');
                        }}
                        className="px-2 py-1 rounded-lg text-xs font-bold opacity-70 hover:opacity-100"
                      >
                        취소
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      setIsSelectMode((prev) => !prev);
                      setSelectedQuestionIds(new Set());
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-extrabold border transition-all ${
                      isSelectMode
                        ? 'bg-teal-600 text-white border-teal-500 shadow'
                        : isLightMode
                        ? 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200'
                        : 'bg-white/5 text-zinc-200 border-white/15 hover:bg-white/10'
                    }`}
                  >
                    {isSelectMode ? '☑️ 선택 분류 모드 닫기' : '☑️ 문항 다중선택 · 폴더 이동'}
                  </button>
                </div>
              </div>

              {/* 폴더 탭 버튼 리스트 */}
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <button
                  onClick={() => {
                    setActiveFolder('전체');
                    setActiveCategory('전체');
                    setActiveSubCategory('전체');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold border transition-all ${
                    activeFolder === '전체'
                      ? 'bg-amber-500 text-black border-amber-600 shadow-sm'
                      : isLightMode
                      ? 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200'
                      : 'bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10'
                  }`}
                >
                  📁 법령·정관 전체 ({folderCounts['전체'] || 0})
                </button>

                <button
                  onClick={() => {
                    setActiveFolder('미분류');
                    setActiveCategory('전체');
                    setActiveSubCategory('전체');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold border transition-all ${
                    activeFolder === '미분류'
                      ? 'bg-amber-500 text-black border-amber-600 shadow-sm'
                      : isLightMode
                      ? 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200'
                      : 'bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10'
                  }`}
                >
                  📂 미분류 ({folderCounts['미분류'] || 0})
                </button>

                {oxFolders.map((folderName) => {
                  const isSelected = activeFolder === folderName;
                  return (
                    <div key={folderName} className="inline-flex items-center">
                      <button
                        onClick={() => {
                          if (folderName === '계산 문제') {
                            setExamSubTab('calc');
                            setActiveSubCategory('전체');
                          } else {
                            setActiveFolder(folderName);
                            setActiveCategory('전체');
                            setActiveSubCategory('전체');
                          }
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-extrabold border transition-all flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-amber-500 text-black border-amber-600 shadow-sm'
                            : folderName === '계산 문제'
                            ? isLightMode
                              ? 'bg-rose-50 text-rose-900 border-rose-300 hover:bg-rose-100'
                              : 'bg-rose-950/40 text-rose-200 border-rose-500/40 hover:bg-rose-900/50'
                            : isLightMode
                            ? 'bg-amber-50/70 text-amber-950 border-amber-300 hover:bg-amber-100'
                            : 'bg-amber-950/30 text-amber-200 border-amber-500/30 hover:bg-amber-900/40'
                        }`}
                      >
                        <span>{folderName === '계산 문제' ? '🧮' : '🗂️'} {folderName}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                            isSelected
                              ? 'bg-black/20 text-black'
                              : isLightMode
                              ? 'bg-amber-200 text-amber-950'
                              : 'bg-black/40 text-amber-300'
                          }`}
                        >
                          {folderCounts[folderName] || 0}
                        </span>
                      </button>
                    </div>
                  );
                })}

                {activeFolder !== '전체' && activeFolder !== '미분류' && (
                  <div className="inline-flex items-center gap-1 ml-2 pl-2 border-l border-slate-400/30">
                    <button
                      onClick={() => handleRenameFolder(activeFolder)}
                      className={`px-2 py-1 rounded text-[11px] font-bold border ${
                        isLightMode
                          ? 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                          : 'bg-white/5 text-zinc-300 border-white/10 hover:bg-white/15'
                      }`}
                    >
                      ✏️ 폴더명 변경
                    </button>
                    <button
                      onClick={() => handleDeleteFolder(activeFolder)}
                      className={`px-2 py-1 rounded text-[11px] font-bold border ${
                        isLightMode
                          ? 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100'
                          : 'bg-rose-950/40 text-rose-300 border-rose-500/30 hover:bg-rose-900/60'
                      }`}
                    >
                      🗑️ 폴더 삭제
                    </button>
                  </div>
                )}
              </div>

              {/* 다중 선택 모드 액션 바 */}
              {isSelectMode && (
                <div
                  className={`mt-2 p-2.5 rounded-lg border flex flex-wrap items-center justify-between gap-2 ${
                    isLightMode
                      ? 'bg-teal-50 border-teal-300 text-slate-900'
                      : 'bg-teal-950/30 border-teal-500/40 text-teal-100'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={handleToggleSelectAllFiltered}
                      className={`px-2.5 py-1 rounded text-xs font-extrabold border ${
                        isLightMode
                          ? 'bg-white text-slate-900 border-slate-300 hover:bg-slate-100'
                          : 'bg-black/50 text-white border-white/20 hover:bg-black/70'
                      }`}
                    >
                      ✅ 현재 목록 전체선택/해제 ({selectedQuestionIds.size}개 선택됨)
                    </button>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={targetMoveFolder}
                      onChange={(e) => setTargetMoveFolder(e.target.value)}
                      className={`px-2.5 py-1 rounded text-xs font-extrabold border ${
                        isLightMode
                          ? 'bg-white border-slate-400 text-slate-900'
                          : 'bg-black border-white/20 text-white'
                      }`}
                    >
                      <option value="">-- 이동할 폴더 선택 --</option>
                      {oxFolders.map((f) => (
                        <option key={f} value={f}>
                          🗂️ {f}
                        </option>
                      ))}
                      <option value="미분류">📂 미분류 (폴더에서 빼기)</option>
                    </select>

                    <button
                      onClick={() => {
                        if (!targetMoveFolder) {
                          alert('이동할 대상 폴더를 선택해 주세요.');
                          return;
                        }
                        handleBulkMoveToFolder(targetMoveFolder);
                      }}
                      className="px-3 py-1 rounded text-xs font-extrabold bg-teal-600 hover:bg-teal-700 text-white shadow"
                    >
                      📥 선택 문항 폴더로 이동
                    </button>

                    <button
                      onClick={handleBulkDeleteQuestions}
                      className="px-2.5 py-1 rounded text-xs font-extrabold bg-rose-600 hover:bg-rose-700 text-white shadow"
                    >
                      🗑️ 선택 삭제
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===================================================================== */}
          {/* 🔍 2. 법령 장별 카테고리 / 계산문제 유형별 필터 · 검색어 · 전체 정답 토글 바 */}
          {/* ===================================================================== */}
          <div
            className={`p-3.5 rounded-xl border space-y-3 shadow-sm ${
              isLightMode ? 'bg-white border-slate-300' : 'bg-[#0a0a0c] border-white/10'
            }`}
          >
            {examSubTab === 'calc' ? (
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs sm:text-sm font-extrabold ${
                      isLightMode ? 'text-rose-800' : 'text-rose-300'
                    }`}
                  >
                    🧮 계산 문제 전용 모음 (별표 2~7 · 인사규정 재직연수/특별휴가 · 영 제52조 과오납금 가산이자)
                  </span>
                </div>
                <button
                  onClick={() => setExamSubTab('ox')}
                  className={`px-2.5 py-1 rounded text-xs font-extrabold border ${
                    isLightMode
                      ? 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200'
                      : 'bg-white/5 text-zinc-200 border-white/15 hover:bg-white/10'
                  }`}
                >
                  ◀ 일반 법령·정관 오답노트로 돌아가기
                </button>
              </div>
            ) : (
              /* 일반 탭 대분류 버튼 */
              <div className="flex items-center gap-1.5 flex-wrap">
                {categoriesList.map((cat) => {
                  const active = activeCategory === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => {
                        setActiveCategory(cat);
                        setActiveSubCategory('전체');
                      }}
                      className={`px-2.5 py-1 rounded-md text-xs font-extrabold border transition-all ${
                        active
                          ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                          : isLightMode
                          ? 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200'
                          : 'bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            )}

            {/* 중분류(조문 범위 또는 계산 문제 10대 유형) 버튼 */}
            {subCategoriesList.length > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-slate-400/20">
                {subCategoriesList.map((sub) => {
                  const active = activeSubCategory === sub;
                  return (
                    <button
                      key={sub}
                      onClick={() => setActiveSubCategory(sub)}
                      className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-all ${
                        active
                          ? examSubTab === 'calc'
                            ? 'bg-rose-600 text-white border-rose-600'
                            : 'bg-indigo-600 text-white border-indigo-600'
                          : isLightMode
                          ? 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                          : 'bg-black/40 text-zinc-300 border-white/10 hover:text-white'
                      }`}
                    >
                      {sub}
                    </button>
                  );
                })}
              </div>
            )}

            {/* 검색창 + 상태 필터 + 전체 정답 토글 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                {(
                  [
                    { id: 'all', label: `전체 (${filteredQuestions.length})` },
                    { id: 'unsolved', label: '미풀이' },
                    { id: 'wrong', label: '틀린 문제' },
                    { id: 'correct', label: '맞힌 문제' },
                  ] as const
                ).map((st) => (
                  <button
                    key={st.id}
                    onClick={() => setStatusFilter(st.id)}
                    className={`px-2.5 py-1 rounded text-xs font-bold border ${
                      statusFilter === st.id
                        ? isLightMode
                          ? 'bg-slate-800 text-white border-slate-900'
                          : 'bg-white/20 text-white border-white/40'
                        : isLightMode
                        ? 'bg-slate-100 text-slate-700 border-slate-300'
                        : 'bg-white/5 text-zinc-400 border-white/10'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}

                <button
                  onClick={handleToggleAllAnswers}
                  className={`px-3 py-1 rounded text-xs font-extrabold border transition-all ${
                    showAllAnswers
                      ? 'bg-amber-600 text-white border-amber-500'
                      : isLightMode
                      ? 'bg-amber-50 text-amber-900 border-amber-400 hover:bg-amber-100'
                      : 'bg-amber-950/50 text-amber-300 border-amber-500/40 hover:bg-amber-900/50'
                  }`}
                >
                  {showAllAnswers ? '🙈 전체 정답 숨기기' : '👀 전체 정답 한번에 보기'}
                </button>
              </div>

              <div className="flex items-center gap-2 flex-1 sm:max-w-xs">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="조문·단어·숫자·정답 검색..."
                  className={`w-full px-3 py-1.5 rounded-lg text-xs font-bold border outline-none ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-teal-600'
                      : 'bg-black/50 border-white/15 text-white placeholder-zinc-500 focus:border-teal-400'
                  }`}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="text-xs font-bold opacity-60 hover:opacity-100"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ===================================================================== */}
          {/* 📋 3. 문항 리스트 (조항 클릭 -> 오른쪽 빨간 동그라미 정답 배지 & 폴더 이동) */}
          {/* ===================================================================== */}
          <div className="space-y-2.5">
            {filteredQuestions.length === 0 ? (
              <div
                className={`p-10 text-center rounded-xl border font-bold text-sm ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-600'
                    : 'bg-[#0a0a0c] border-white/10 text-zinc-400'
                }`}
              >
                조건에 맞는 문항이 없습니다. 폴더나 검색 필터를 변경해 보세요.
              </div>
            ) : (
              filteredQuestions.map((q, idx) => {
                const isExpanded = expandedOxIds.has(q.id);
                const userAns = oxUserAnswers[q.id];
                const isChecked = selectedQuestionIds.has(q.id);

                return (
                  <div
                    key={q.id}
                    className={`p-3.5 sm:p-4 rounded-xl border transition-all ${
                      isLightMode
                        ? 'bg-white border-slate-300 hover:border-slate-400 shadow-sm'
                        : 'bg-[#0a0a0c] border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 flex-1 min-w-0">
                        {isSelectMode && (
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setSelectedQuestionIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(q.id)) next.delete(q.id);
                                else next.add(q.id);
                                return next;
                              });
                            }}
                            className="mt-1.5 h-4 w-4 accent-teal-600 cursor-pointer shrink-0"
                          />
                        )}

                        <span
                          className={`font-mono text-xs font-extrabold mt-0.5 shrink-0 ${
                            isLightMode ? 'text-slate-500' : 'text-zinc-500'
                          }`}
                        >
                          {String(idx + 1).padStart(2, '0')}.
                        </span>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap mb-1">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                                q.category === '계산 문제'
                                  ? isLightMode
                                    ? 'bg-rose-50 text-rose-800 border-rose-300'
                                    : 'bg-rose-950/60 text-rose-300 border-rose-500/40'
                                  : isLightMode
                                  ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                  : 'bg-indigo-950/60 text-indigo-300 border-indigo-500/30'
                              }`}
                            >
                              {q.category === '계산 문제' && q.subCategory
                                ? `🧮 ${q.subCategory}`
                                : q.category}
                            </span>

                            {q.folder && q.folder !== '계산 문제' && (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                                  isLightMode
                                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                                    : 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                                }`}
                              >
                                🗂️ {q.folder}
                              </span>
                            )}
                          </div>

                          {/* 조항 텍스트 영역 (클릭 시 오른쪽 빨간 원형 배지 + 하단 해설 토글) */}
                          <div
                            onClick={() => toggleOxExp(q.id)}
                            className="cursor-pointer select-text text-sm sm:text-[15px] leading-relaxed break-keep"
                            title="조항을 클릭하면 오른쪽에 정답이 표시됩니다"
                          >
                            {renderClauseWithRightAnswerBadge(q, isExpanded)}
                          </div>
                        </div>
                      </div>

                      {/* 우측 컨트롤: 개별 폴더 지정 드롭다운 + 정답 토글 + O / X + 삭제 */}
                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                        <select
                          value={q.folder || ''}
                          onChange={(e) => handleAssignSingleQuestionFolder(q.id, e.target.value)}
                          title="이 문항을 넣을 학습 폴더 선택"
                          className={`px-2 py-1 rounded text-[11px] font-bold border outline-none cursor-pointer ${
                            q.folder
                              ? isLightMode
                                ? 'bg-amber-50 text-amber-900 border-amber-400'
                                : 'bg-amber-950/50 text-amber-300 border-amber-500/40'
                              : isLightMode
                              ? 'bg-slate-100 text-slate-700 border-slate-300'
                              : 'bg-white/5 text-zinc-400 border-white/10'
                          }`}
                        >
                          <option value="">📁 폴더지정</option>
                          {oxFolders.map((f) => (
                            <option key={f} value={f}>
                              🗂️ {f}
                            </option>
                          ))}
                        </select>

                        <button
                          onClick={() => toggleOxExp(q.id)}
                          className={`px-2.5 py-1 rounded text-xs font-extrabold border transition-all ${
                            isExpanded
                              ? 'bg-amber-600 text-white border-amber-500'
                              : isLightMode
                              ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                              : 'bg-amber-950/40 text-amber-400 border-amber-500/30 hover:bg-amber-900/50'
                          }`}
                        >
                          {isExpanded ? '정답숨김' : '👉정답'}
                        </button>

                        <button
                          onClick={() =>
                            setOxUserAnswers((prev) => ({ ...prev, [q.id]: 'O' }))
                          }
                          className={`w-7 h-7 rounded font-extrabold text-xs border transition-all ${
                            userAns === 'O'
                              ? 'bg-teal-600 text-white border-teal-500 shadow'
                              : isLightMode
                              ? 'bg-slate-100 text-teal-800 border-slate-300 hover:bg-teal-50'
                              : 'bg-white/5 text-teal-400 border-white/10 hover:bg-teal-950/50'
                          }`}
                        >
                          O
                        </button>

                        <button
                          onClick={() =>
                            setOxUserAnswers((prev) => ({ ...prev, [q.id]: 'X' }))
                          }
                          className={`w-7 h-7 rounded font-extrabold text-xs border transition-all ${
                            userAns === 'X'
                              ? 'bg-rose-600 text-white border-rose-500 shadow'
                              : isLightMode
                              ? 'bg-slate-100 text-rose-800 border-slate-300 hover:bg-rose-50'
                              : 'bg-white/5 text-rose-400 border-white/10 hover:bg-rose-950/50'
                          }`}
                        >
                          X
                        </button>

                        <button
                          onClick={() => {
                            if (confirm('이 문항을 목록에서 삭제하시겠습니까?')) {
                              setOxQuestions((prev) => prev.filter((item) => item.id !== q.id));
                            }
                          }}
                          className={`px-1.5 py-1 text-xs font-bold opacity-50 hover:opacity-100 ${
                            isLightMode
                              ? 'text-slate-600 hover:text-rose-600'
                              : 'text-zinc-400 hover:text-rose-400'
                          }`}
                          title="문항 삭제"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* 하단 상세 해설 박스 */}
                    {isExpanded && (
                      <div
                        className={`mt-3 p-3 rounded-lg border text-xs sm:text-[13px] space-y-1.5 leading-relaxed ${
                          isLightMode
                            ? 'bg-amber-50/70 border-amber-300 text-slate-900'
                            : 'bg-amber-950/20 border-amber-500/30 text-zinc-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 flex-wrap font-extrabold">
                          <span className={isLightMode ? 'text-amber-900' : 'text-amber-400'}>
                            💡 오답 수정 · 정답 확인 (정답: {q.answer})
                          </span>
                          {q.correctAnswer && (
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-extrabold border ${
                                isLightMode
                                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                  : 'bg-teal-950/80 text-teal-300 border-teal-500/40'
                              }`}
                            >
                              바른 표현: {q.correctAnswer}
                            </span>
                          )}
                        </div>
                        <div
                          className={`whitespace-pre-line font-medium ${
                            isLightMode ? 'text-slate-800' : 'text-zinc-300'
                          }`}
                        >
                          {q.explanation}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : (
        /* 단답·서술 요약 서브탭 */
        <div
          className={`p-6 rounded-xl border text-center space-y-2 ${
            isLightMode
              ? 'bg-white border-slate-300 text-slate-800'
              : 'bg-[#0a0a0c] border-white/10 text-zinc-300'
          }`}
        >
          <h3 className="text-base font-extrabold">✍️ 나만의 단답·요약 노트</h3>
          <p className="text-xs opacity-80">
            법령·정관 오답노트 탭과 계산 문제 탭에서 폴더별로 분류한 문항들을 집중 복습할 수 있습니다.
          </p>
        </div>
      )}
    </div>
  );
};

export default ExamTab;
