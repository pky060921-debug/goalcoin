import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';

export const MypageTab = ({
  safeAddress,
  enokiFlow,
  zkLogin,
  setCategories,
  setSystemLogs,
  useAiRecommend,
  setUseAiRecommend,
  studyMode,
  setStudyMode,
  globalDict,
  saveGlobalDict,
  loadAllData,
  theme,
  setTheme,
  savedCards,
  setSavedCards,
}: any) => {
  const [showWallet, setShowWallet] = useState(false);
  const [lawFile, setLawFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [uploadLog, setUploadLog] = useState<string | null>(null);

  const [userEmail, setUserEmail] = useState('설계자 계정 (이메일 정보 불러오는 중...)');
  const [rankingData, setRankingData] = useState<any[]>([]);
  const [isLoadingRanking, setIsLoadingRanking] = useState(false);

  // 💡 폴더별 반복횟수 일괄 변경용 상태
  const [targetFolderForUpdate, setTargetFolderForUpdate] = useState<string>('');
  const [fromReps, setFromReps] = useState(''); // 비워두면 폴더 내 전체 카드 일괄 변경
  const [toReps, setToReps] = useState('25');
  const [folderBulkInputs, setFolderBulkInputs] = useState<Record<string, string>>({});
  const [isUpdatingReps, setIsUpdatingReps] = useState(false);

  // 💡 장별 목표 회독수(합격률 계산 분모) 설정 상태
  const [targetRepsSettings, setTargetRepsSettings] = useState<Record<string, number>>({});
  const [availableFolders, setAvailableFolders] = useState<string[]>([]);

  // 카드 memo에서 현재 반복횟수(filled)와 객체 안전 추출
  const parseCardMemoObj = (memoStr: string) => {
    let currentFilled = 0;
    let memoObj: any = {
      text: '',
      filled: 0,
      wrongIndices: [],
      upgrade: 0,
      bestTime: 0,
      totalCorrect: 0,
      totalWrong: 0,
      history: [],
      highlights: {},
      hiddenTokens: [],
      modifiedTokens: {},
    };
    try {
      if (memoStr) {
        if (memoStr.trim().startsWith('{')) {
          const parsed = JSON.parse(memoStr);
          memoObj = { ...memoObj, ...parsed };
          currentFilled = Number(parsed.filled) || 0;
        } else {
          const parts = memoStr.split('|');
          currentFilled = parts.length > 2 ? parseInt(parts[2], 10) || 0 : 0;
          memoObj = { ...memoObj, text: parts[1] || '', filled: currentFilled };
        }
      }
    } catch (e) {}
    return { currentFilled, memoObj };
  };

  // 폴더별 카드 개수 및 현재 반복횟수 요약 통계
  const folderRepStats = useMemo(() => {
    const stats: Record<
      string,
      { count: number; minReps: number; maxReps: number; avgReps: number }
    > = {};
    if (!savedCards || savedCards.length === 0) return stats;

    savedCards.forEach((c: any) => {
      const f = c.folder_name || '기본 폴더';
      const { currentFilled } = parseCardMemoObj(c.memo || '');
      if (!stats[f]) {
        stats[f] = {
          count: 1,
          minReps: currentFilled,
          maxReps: currentFilled,
          avgReps: currentFilled,
        };
      } else {
        stats[f].count += 1;
        stats[f].minReps = Math.min(stats[f].minReps, currentFilled);
        stats[f].maxReps = Math.max(stats[f].maxReps, currentFilled);
        stats[f].avgReps += currentFilled;
      }
    });

    Object.keys(stats).forEach((f) => {
      stats[f].avgReps = Math.round(stats[f].avgReps / stats[f].count);
    });
    return stats;
  }, [savedCards]);

  useEffect(() => {
    const fetchUserEmail = async () => {
      try {
        if (zkLogin?.userEmail) {
          setUserEmail(zkLogin.userEmail);
          return;
        }
        if (enokiFlow && typeof enokiFlow.getUserInfo === 'function') {
          const userInfo = await enokiFlow.getUserInfo();
          if (userInfo && userInfo.email) {
            setUserEmail(userInfo.email);
            return;
          }
        }
        if (enokiFlow?.user?.email) {
          setUserEmail(enokiFlow.user.email);
          return;
        }
        setUserEmail('설계자 계정 (이메일 정보 공백)');
      } catch (err) {
        setUserEmail('설계자 계정 (이메일 정보 공백)');
      }
    };
    fetchUserEmail();
  }, [enokiFlow, zkLogin]);

  useEffect(() => {
    const fetchRanking = async () => {
      setIsLoadingRanking(true);
      try {
        const res = await fetch('https://api.blankd.top/api/ranking');
        const data = await res.json();
        if (data.ranking) {
          setRankingData(data.ranking);
        }
      } catch (err) {
        console.error('랭킹 로드 실패:', err);
      } finally {
        setIsLoadingRanking(false);
      }
    };
    fetchRanking();
  }, []);

  // 💡 저장된 목표 회독수 설정 및 폴더 목록 로드
  useEffect(() => {
    if (savedCards && savedCards.length > 0) {
      const allFolders = Array.from(
        new Set(savedCards.map((c: any) => c.folder_name || '기본 폴더'))
      ).filter(Boolean) as string[];
      const nonDefault = allFolders.filter((f) => f !== '기본 폴더').sort();
      const folders = allFolders.includes('기본 폴더')
        ? [...nonDefault, '기본 폴더']
        : nonDefault;

      setAvailableFolders(folders);

      if (folders.length > 0 && !targetFolderForUpdate) {
        setTargetFolderForUpdate(folders[0]);
      }

      // 각 폴더별 일괄 변경 입력창 초기값 세팅
      setFolderBulkInputs((prev) => {
        const next = { ...prev };
        folders.forEach((f) => {
          if (next[f] === undefined) {
            next[f] = String(folderRepStats[f]?.minReps ?? 25);
          }
        });
        return next;
      });

      try {
        const savedSettings = localStorage.getItem(`blankd_target_reps_${safeAddress}`);
        if (savedSettings) {
          setTargetRepsSettings(JSON.parse(savedSettings));
        } else {
          const initialSettings: Record<string, number> = {};
          folders.forEach((f) => (initialSettings[f] = 50));
          setTargetRepsSettings(initialSettings);
          localStorage.setItem(
            `blankd_target_reps_${safeAddress}`,
            JSON.stringify(initialSettings)
          );
        }
      } catch (e) {
        console.error('목표 회독수 로드 실패', e);
      }
    }
  }, [savedCards, safeAddress, targetFolderForUpdate, folderRepStats]);

  // 💡 목표 회독수(합격률 계산 기준) 변경 핸들러
  const handleTargetRepsChange = (folder: string, value: string) => {
    const numValue = Math.max(1, parseInt(value, 10) || 1);
    const newSettings = { ...targetRepsSettings, [folder]: numValue };
    setTargetRepsSettings(newSettings);
    localStorage.setItem(`blankd_target_reps_${safeAddress}`, JSON.stringify(newSettings));
    window.dispatchEvent(new Event('targetRepsUpdated'));
  };

  /**
   * 💡 [핵심 수정] 특정 폴더(또는 전체 폴더)의 실제 반복횟수(filled)를
   * 원하는 횟수(예: 25회)로 일괄 변경하는 통합 함수
   * - fromRepsOption이 비어 있으면 해당 폴더의 모든 카드를 targetVal(예: 25회)로 일괄 변경
   * - fromRepsOption이 입력되어 있으면 해당 횟수인 카드만 targetVal로 변경
   */
  const executeFolderRepsUpdate = async (
    folderName: string,
    targetValStr: string,
    fromValStr: string = ''
  ) => {
    const toVal = parseInt(targetValStr, 10);
    const hasFromFilter = fromValStr.trim() !== '';
    const fromVal = hasFromFilter ? parseInt(fromValStr, 10) : null;

    if (!folderName) {
      alert('변경할 폴더(장)를 선택해주세요.');
      return;
    }
    if (isNaN(toVal) || toVal < 0) {
      alert('변경할 반복 횟수를 0 이상의 숫자로 입력해주세요. (예: 25)');
      return;
    }
    if (hasFromFilter && (fromVal === null || isNaN(fromVal))) {
      alert('현재 횟수 조건을 숫자로 입력하거나 비워두세요.');
      return;
    }

    const scopeLabel = folderName === '__ALL__' ? '전체 모든 폴더' : `[${folderName}] 폴더`;
    const confirmMsg = hasFromFilter
      ? `${scopeLabel} 내에서 현재 반복 횟수가 [${fromVal}회]인 카드를 모두 [${toVal}회]로 일괄 변경하시겠습니까?`
      : `${scopeLabel}의 모든 조항 반복(회독) 횟수를 일괄로 [${toVal}회]로 변경하시겠습니까?`;

    if (!window.confirm(confirmMsg)) return;

    setIsUpdatingReps(true);
    try {
      if (!savedCards || savedCards.length === 0) {
        throw new Error('로드된 카드 데이터가 없습니다. 새로고침 후 다시 시도해주세요.');
      }

      let changeCount = 0;
      const updatedCardIds = new Set<string>();
      const updatePayloads: any[] = [];

      const nextCards = savedCards.map((card: any) => {
        const cardFolder = card.folder_name || '기본 폴더';
        if (folderName !== '__ALL__' && cardFolder !== folderName) {
          return card;
        }

        const { currentFilled, memoObj } = parseCardMemoObj(card.memo || '');
        if (hasFromFilter && currentFilled !== fromVal) {
          return card;
        }

        changeCount++;
        updatedCardIds.add(String(card.id));

        const updatedMemoObj = {
          ...memoObj,
          filled: toVal,
          _forceReps: true, // 백엔드 max() 방어 로직 우회 플래그
        };
        const newMemoStr = JSON.stringify(updatedMemoObj);

        updatePayloads.push({
          wallet_address: safeAddress || 'ENOKI_USER',
          card_id: parseInt(card.id, 10),
          card_content: card.content,
          answer_text: card.answer || card.answer_text || '',
          folder_name: card.folder_name || '기본 폴더',
          memo: newMemoStr,
          force_overwrite: true,
        });

        // 프론트 상태에는 깨끗한 memo 저장
        const cleanMemoObj = { ...memoObj, filled: toVal };
        return { ...card, memo: JSON.stringify(cleanMemoObj) };
      });

      if (changeCount === 0) {
        alert(
          hasFromFilter
            ? `❌ ${scopeLabel} 내에 현재 반복 횟수가 ${fromVal}회인 카드가 없습니다.`
            : `❌ ${scopeLabel} 내에 변경할 카드가 없습니다.`
        );
        setIsUpdatingReps(false);
        return;
      }

      if (setSystemLogs) {
        setSystemLogs((prev: string[]) => [
          ...prev,
          `[폴더 일괄 변경] ${scopeLabel} 내 ${changeCount}개 카드를 ${toVal}회로 변경 중...`,
        ]);
      }

      // 1) 로컬 동기화 대기열(blankd_sync_queue)에서 구버전 메모 제거 (덮어쓰기 방지)
      try {
        const qStr = localStorage.getItem('blankd_sync_queue');
        if (qStr) {
          const q = JSON.parse(qStr);
          if (q && Array.isArray(q.memos)) {
            q.memos = q.memos.filter((m: any) => !updatedCardIds.has(String(m.id)));
            localStorage.setItem('blankd_sync_queue', JSON.stringify(q));
          }
        }
      } catch (e) {}

      // 2) 로컬스토리지 및 상위 App.tsx의 savedCards 상태 즉시 업데이트
      localStorage.setItem(`blankd_off_card_${safeAddress}`, JSON.stringify(nextCards));
      if (typeof setSavedCards === 'function') {
        setSavedCards(nextCards);
      }
      window.dispatchEvent(new Event('targetRepsUpdated'));

      // 3) 백엔드 일괄 변경 엔드포인트(/api/update-folder-reps) 호출 시도
      let bulkApiSucceeded = false;
      if (navigator.onLine) {
        try {
          const bulkRes = await fetch('https://api.blankd.top/api/update-folder-reps', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              wallet_address: safeAddress,
              folder_name: folderName,
              target_reps: toVal,
              from_reps: hasFromFilter ? fromVal : null,
            }),
          });
          if (bulkRes.ok) {
            bulkApiSucceeded = true;
          }
        } catch (e) {}

        // 4) 백엔드에 신규 엔드포인트가 아직 없을 경우 /api/save-card 병렬 호출 폴백
        if (!bulkApiSucceeded) {
          for (let i = 0; i < updatePayloads.length; i += 8) {
            await Promise.all(
              updatePayloads.slice(i, i + 8).map((payload) =>
                fetch('https://api.blankd.top/api/save-card', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload),
                }).catch(() => {})
              )
            );
          }
        }
      }

      setFolderBulkInputs((prev) => ({
        ...prev,
        ...(folderName === '__ALL__'
          ? Object.fromEntries(availableFolders.map((f) => [f, String(toVal)]))
          : { [folderName]: String(toVal) }),
      }));

      alert(
        `✅ ${scopeLabel}의 총 ${changeCount}개 조항 반복 횟수가 [${toVal}회]로 일괄 변경되었습니다!`
      );
      setFromReps('');
    } catch (err: any) {
      alert(`❌ 일괄 변경 실패: ${err.message}`);
    } finally {
      setIsUpdatingReps(false);
    }
  };

  const handleFileUploadAndSubmit = async () => {
    if (!lawFile) {
      alert('전송할 원본 학습용 데이터 파일(.txt)을 선택해주십시오.');
      return;
    }
    try {
      setIsUploading(true);
      if (setSystemLogs)
        setSystemLogs((prev: string[]) => [
          ...prev,
          `[진단 시작] 📡 서버로 파일 전송 시도 중...`,
        ]);
      const formData = new FormData();
      formData.append('file', lawFile);
      formData.append('wallet_address', safeAddress);
      const res = await fetch(`https://api.blankd.top/api/upload-pdf`, {
        method: 'POST',
        body: formData,
      });
      const statusCode = res.status;
      const rawText = await res.text();
      if (!res.ok) {
        throw new Error(
          `[HTTP 상태코드: ${statusCode}]\n서버 응답: ${rawText.substring(0, 300)}...`
        );
      }
      const data = JSON.parse(rawText);
      if (setSystemLogs)
        setSystemLogs((prev: string[]) => [
          ...prev,
          `[성공] ${data.count || 0}개의 학습 조항 노드가 정착되었습니다.`,
        ]);
      const updatedCats = await api.getCategories(safeAddress);
      if (setCategories) setCategories(updatedCats);
      alert(`✅ 성공적으로 ${data.count || 0}개의 조항이 마이그레이션 파싱되었습니다.`);
      setLawFile(null);
    } catch (err: any) {
      console.error(err);
      if (setSystemLogs)
        setSystemLogs((prev: string[]) => [...prev, `❌ [에러] 통신 실패: ${err.message}`]);
      alert(
        `🚨 업로드 실패 원인 정밀 진단 🚨\n\n${err.message}\n\n터미널(F12 또는 하단)을 확인해주세요.`
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleExportExcel = async () => {
    if (!safeAddress) return alert('로그인 세션이 존재하지 않습니다.');
    setIsExporting(true);
    const downloadUrl = `https://api.blankd.top/api/export-excel?wallet_address=${safeAddress}&t=${Date.now()}`;
    if (setSystemLogs)
      setSystemLogs((prev: string[]) => [
        ...prev,
        `🔍 [진단 탐색] 주소: ${safeAddress} 기반 엑셀 빌드 유닛 요청 전송.`,
      ]);
    try {
      const checkRes = await fetch(downloadUrl, { method: 'GET' });
      if (!checkRes.ok) {
        const errorJson = await checkRes.json().catch(() => ({}));
        const mainError = errorJson.error || '알 수 없는 백엔드 가동 중단';
        const traceLog = errorJson.traceback || '트레이스백 없음';
        if (setSystemLogs)
          setSystemLogs((prev: string[]) => [
            ...prev,
            `❌ [서버거절] 원인: ${mainError}`,
            `🚨 [추적로그]: ${traceLog.substring(0, 150)}...`,
          ]);
        alert(
          `❌ [서버 내부 진단 결과] 다운로드 실패\n\n요약: ${mainError}\n\n*상세 정보는 하단 터미널을 확인하세요.`
        );
        setIsExporting(false);
        return;
      }
      const blob = await checkRes.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute(
        'download',
        `blankd_내자료_백업_${new Date().toISOString().slice(0, 10)}.xlsx`
      );
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(link);
      if (setSystemLogs)
        setSystemLogs((prev: string[]) => [...prev, `✅ [정상 완료] 엑셀 다운로드 성공.`]);
    } catch (err: any) {
      if (setSystemLogs)
        setSystemLogs((prev: string[]) => [
          ...prev,
          `❌ [통신차단] 프론트 브라우저 통신 실패: ${err.message}`,
        ]);
      alert(`❌ [네트워크 차단 진단]\n서버 연결 실패\n사유: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !safeAddress) return;
    if (
      !window.confirm(
        '엑셀 내용에 따라 데이터베이스 내역이 즉시 일괄 수정 및 덮어쓰기됩니다. 진행하시겠습니까?'
      )
    ) {
      e.target.value = '';
      return;
    }
    setIsImporting(true);
    setUploadLog('⏳ 엑셀 바이너리 구조 해석 및 동기화 반영 중...');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('wallet_address', safeAddress);
    try {
      const res = await fetch('https://api.blankd.top/api/import-excel', {
        method: 'POST',
        body: formData,
      });
      const result = await res.json().catch(() => ({}));
      if (res.ok) {
        setUploadLog('✅ 성공: 데이터베이스 일괄 동기화 완료!');
        if (typeof loadAllData === 'function') await loadAllData(true);
      } else {
        throw new Error(result.error || '엑셀 파일 가공 동기화 실패');
      }
    } catch (err: any) {
      setUploadLog(`❌ 실패: ${err.message || '엑셀 규격 오류'}`);
    } finally {
      setIsImporting(false);
      e.target.value = '';
    }
  };

  const handleForceSync = async () => {
    if (
      !window.confirm(
        '현재 기기 화면에 보이는 최신 반복 횟수와 기록들을 서버 DB로 강제 덮어쓰기 합니다. 진행하시겠습니까?'
      )
    )
      return;

    setIsImporting(true);
    setUploadLog('⏳ 기기(로컬)에 갇혀있던 최신 데이터를 서버 DB로 펌핑 중...');

    try {
      const localCardsStr = localStorage.getItem(`blankd_off_card_${safeAddress}`);
      if (!localCardsStr) throw new Error('동기화할 로컬 데이터가 없습니다.');

      const localCards = JSON.parse(localCardsStr);
      let syncCount = 0;

      for (const card of localCards) {
        await fetch('https://api.blankd.top/api/save-card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet_address: safeAddress,
            card_id: parseInt(card.id, 10),
            card_content: card.content,
            answer_text: card.answer || card.answer_text || '',
            folder_name: card.folder_name,
            memo: card.memo,
            force_overwrite: true,
          }),
        });
        syncCount++;
      }

      localStorage.setItem('blankd_sync_queue', JSON.stringify({ memos: [], answers: [] }));

      setUploadLog(
        `✅ 성공: 기기에 보관되어 있던 ${syncCount}개의 학습 기록이 서버 DB에 완벽히 저장되었습니다!`
      );
    } catch (err: any) {
      setUploadLog(`❌ 강제 동기화 실패: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const formatAddress = (addr: string) => {
    if (!addr) return 'Unknown User';
    if (addr.includes('@')) {
      const [name, domain] = addr.split('@');
      return `${name.substring(0, 3)}***@${domain}`;
    }
    if (addr.length > 15) {
      return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
    }
    return addr;
  };

  return (
    <div className="max-w-xl mx-auto space-y-8 py-12 px-4 animate-in fade-in duration-300 font-sans pb-24">
      <div className="border border-white/10 p-6 rounded-sm bg-[#08080a] shadow-xl space-y-6">
        {/* 계정 정보 */}
        <div>
          <div className="text-xs text-white/40 mb-2 font-mono uppercase tracking-wider">
            연결된 계정 식별자 (이메일 주소)
          </div>
          <button
            onClick={() => setShowWallet(!showWallet)}
            className="w-full text-left p-3 bg-black/50 border border-white/5 rounded-sm transition-all hover:bg-white/[0.02] cursor-pointer group"
          >
            <div className="text-xs font-bold text-teal-400 group-hover:text-teal-300 transition-colors break-all">
              {userEmail}
            </div>
            <div className="text-[10px] text-white/30 mt-1">
              💡 클릭하면 분산 원장용 블록체인 노드 고유 주소가 아래에 토글 표시됩니다.
            </div>
          </button>
          {showWallet && (
            <div className="text-[10px] font-mono text-amber-400 bg-amber-950/20 border border-amber-900/30 p-3 rounded-sm break-all animate-in fade-in duration-200 mt-2">
              <span className="font-bold block mb-0.5 text-white/50">
                [안전 보안 수이 네트워크 노드 주소]
              </span>
              {safeAddress || '연결된 노드 지갑 고유 주소가 공백 상태입니다.'}
            </div>
          )}
        </div>

        <button
          onClick={() => {
            enokiFlow?.logout();
            window.location.reload();
          }}
          className="w-full py-2 text-xs border border-white/20 text-white/60 hover:text-white hover:bg-white/10 rounded-sm transition-all font-bold cursor-pointer"
        >
          시스템 연결 해제 (로그아웃)
        </button>

        <div className="border-t border-white/10"></div>

        {/* ========================================================================= */}
        {/* 🛠️ 1. 폴더별 실제 반복(회독) 횟수 일괄 변경 (예: 해당 폴더 전체 25회로 변경) */}
        {/* ========================================================================= */}
        <div className="space-y-3">
          <div className="text-xs text-teal-400 font-bold tracking-wider font-mono uppercase flex items-center gap-2">
            <span>🔁</span> 폴더별 실제 반복(회독) 횟수 일괄 변경
          </div>

          <div className="bg-black/40 border border-white/5 p-4 rounded-sm space-y-4">
            <p className="text-[10px] sm:text-[11px] text-white/50 leading-relaxed">
              각 폴더(장)의 <span className="text-teal-400 font-bold">현재 반복(채우기) 횟수</span>를 원하는 숫자(예:{' '}
              <span className="text-amber-400 font-bold">25회</span>)로 한 번에 일괄 변경합니다. 변경 즉시 진행상황·기록실·상단 누적 회독수에 반영됩니다.
            </p>

            {/* A. 상단 빠른 선택 & 일괄 변경 바 */}
            <div className="p-3 bg-white/5 border border-teal-500/30 rounded-sm space-y-2.5">
              <div className="text-[11px] font-bold text-teal-300">
                ⚡ 선택한 폴더 전체 일괄 변경
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={targetFolderForUpdate}
                  onChange={(e) => setTargetFolderForUpdate(e.target.value)}
                  className="flex-1 bg-black/60 border border-white/20 p-2 text-xs text-white font-bold outline-none rounded-sm focus:border-teal-400"
                >
                  <option value="" disabled>
                    폴더(장) 선택
                  </option>
                  <option value="__ALL__">🌟 전체 모든 폴더 일괄 적용</option>
                  {availableFolders.map((f) => (
                    <option key={f} value={f}>
                      📁 {f} ({folderRepStats[f]?.count || 0}개 조항 · 현재{' '}
                      {folderRepStats[f]?.minReps === folderRepStats[f]?.maxReps
                        ? `${folderRepStats[f]?.minReps || 0}회`
                        : `${folderRepStats[f]?.minReps || 0}~${folderRepStats[f]?.maxReps || 0}회`}
                      )
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    placeholder="변경할 횟수 (예: 25)"
                    value={toReps}
                    onChange={(e) => setToReps(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        executeFolderRepsUpdate(targetFolderForUpdate, toReps, fromReps);
                      }
                    }}
                    className="w-24 bg-black/60 border border-teal-500/50 p-2 text-xs text-amber-300 font-extrabold text-center outline-none rounded-sm focus:border-teal-400"
                  />
                  <span className="text-xs text-white/60 font-bold shrink-0">회로</span>
                  <button
                    onClick={() =>
                      executeFolderRepsUpdate(targetFolderForUpdate, toReps, fromReps)
                    }
                    disabled={isUpdatingReps || toReps === '' || !targetFolderForUpdate}
                    className={`px-3.5 py-2 font-extrabold text-xs rounded-sm transition-all shadow-md shrink-0 ${
                      isUpdatingReps || toReps === '' || !targetFolderForUpdate
                        ? 'bg-white/5 text-white/30 border border-white/10 cursor-not-allowed'
                        : 'bg-teal-600 text-white border border-teal-400 hover:bg-teal-500 cursor-pointer'
                    }`}
                  >
                    {isUpdatingReps ? '변경 중...' : '일괄 변경'}
                  </button>
                </div>
              </div>

              {/* 자주 쓰는 횟수 원클릭 프리셋 버튼 + (선택) 특정 횟수만 변경 필터 */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/10">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[10px] text-white/40 mr-1">빠른 설정:</span>
                  {[0, 5, 10, 15, 20, 25, 30, 50].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setToReps(String(preset))}
                      className={`px-2 py-0.5 text-[10px] font-bold rounded border transition-all ${
                        toReps === String(preset)
                          ? 'bg-amber-500 text-black border-amber-400'
                          : 'bg-black/40 text-white/60 border-white/10 hover:text-white'
                      }`}
                    >
                      {preset}회
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-white/40">특정 횟수만 변경(선택):</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="전체"
                    value={fromReps}
                    onChange={(e) => setFromReps(e.target.value)}
                    className="w-14 bg-black/50 border border-white/15 px-1.5 py-0.5 text-[10px] text-white/80 text-center outline-none rounded-sm"
                  />
                </div>
              </div>
            </div>

            {/* B. 각 폴더별 개별 카드에서 바로 숫자 입력 후 [변경] 버튼 */}
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-white/70">
                📂 폴더별 바로 변경 (숫자 입력 후 [변경] 클릭 또는 Enter)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[320px] overflow-y-auto custom-scrollbar pr-1">
                {availableFolders.map((folder) => {
                  const stat = folderRepStats[folder];
                  const currentDisplay = stat
                    ? stat.minReps === stat.maxReps
                      ? `${stat.minReps}회`
                      : `${stat.minReps}~${stat.maxReps}회 (평균 ${stat.avgReps}회)`
                    : '0회';
                  const inputVal = folderBulkInputs[folder] ?? '25';

                  return (
                    <div
                      key={folder}
                      className="flex flex-col justify-between bg-white/5 p-2.5 rounded-sm border border-white/10 gap-2"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] font-bold text-white/90 truncate">
                          📁 {folder}
                        </span>
                        <span className="text-[10px] font-mono text-teal-400 font-bold shrink-0">
                          현재: {currentDisplay}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          value={inputVal}
                          onChange={(e) =>
                            setFolderBulkInputs((prev) => ({
                              ...prev,
                              [folder]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              executeFolderRepsUpdate(folder, inputVal, '');
                            }
                          }}
                          className="bg-black/60 border border-white/20 px-2 py-1 text-xs text-amber-300 font-extrabold outline-none rounded-sm focus:border-teal-400 w-full text-center"
                        />
                        <span className="text-[10px] text-white/50 shrink-0">회</span>
                        <button
                          type="button"
                          disabled={isUpdatingReps}
                          onClick={() => executeFolderRepsUpdate(folder, inputVal, '')}
                          className="px-2.5 py-1 bg-teal-600/80 hover:bg-teal-600 text-white text-[11px] font-extrabold rounded-sm shrink-0 transition-all cursor-pointer shadow"
                        >
                          변경
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {availableFolders.length === 0 && (
                <div className="text-[10px] text-white/30 text-center py-2">
                  학습할 조항 데이터가 없습니다.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-white/10"></div>

        {/* 🎯 2. 장별 목표 회독수 설정 (합격률 100% 기준 분모 설정) */}
        <div className="space-y-3">
          <div className="text-xs text-indigo-400 font-bold tracking-wider font-mono uppercase flex items-center gap-2">
            <span>🎯</span> 장별 목표 회독수 설정 (합격률 계산 기준)
          </div>
          <div className="bg-black/40 border border-white/5 p-4 rounded-sm space-y-4">
            <p className="text-[10px] sm:text-[11px] text-white/40 leading-relaxed">
              각 장별로 합격(100%)을 위해 목표로 하는{' '}
              <span className="text-indigo-400 font-bold">목표 회독수(분모)</span>를 설정합니다. 상단의 &apos;예상 합격률&apos; 계산에 반영됩니다.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {availableFolders.map((folder) => (
                <div
                  key={folder}
                  className="flex flex-col bg-white/5 p-2 rounded-sm border border-white/10"
                >
                  <span className="text-[10px] font-bold text-white/70 mb-1 truncate">
                    {folder}
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      value={targetRepsSettings[folder] || 50}
                      onChange={(e) => handleTargetRepsChange(folder, e.target.value)}
                      className="bg-black/50 border border-white/20 px-2 py-1 text-xs text-indigo-300 font-bold outline-none rounded-sm focus:border-indigo-400 w-full text-center"
                    />
                    <span className="text-[10px] text-white/40 shrink-0">회 목표</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-white/10"></div>

        {/* 🎨 화면 테마 설정 */}
        <div className="space-y-3">
          <div className="text-xs text-white/50 font-bold tracking-wider font-mono uppercase flex items-center gap-2">
            <span>🎨</span> 화면 테마 설정
          </div>
          <div className="grid grid-cols-3 gap-2 bg-black/40 border border-white/5 p-4 rounded-sm">
            <button
              onClick={() => setTheme('black')}
              className={`py-2.5 rounded-sm text-xs font-bold transition-all shadow-sm ${
                theme === 'black'
                  ? 'bg-gray-800 text-white border border-gray-500'
                  : 'bg-white/5 text-white/40 border border-transparent hover:bg-white/10'
              }`}
            >
              다크 (블랙)
            </button>
            <button
              onClick={() => setTheme('white')}
              className={`py-2.5 rounded-sm text-xs font-bold transition-all shadow-sm ${
                theme === 'white'
                  ? 'bg-gray-200 text-gray-900 border border-gray-400'
                  : 'bg-white/5 text-white/40 border border-transparent hover:bg-white/10'
              }`}
            >
              라이트 (화이트)
            </button>
            <button
              onClick={() => setTheme('green')}
              className={`py-2.5 rounded-sm text-xs font-bold transition-all shadow-sm ${
                theme === 'green'
                  ? 'bg-green-800 text-green-50 border border-green-500'
                  : 'bg-white/5 text-white/40 border border-transparent hover:bg-white/10'
              }`}
            >
              칠판 (그린)
            </button>
          </div>
        </div>

        <div className="border-t border-white/10"></div>

        {/* 🧠 복습 모드 설정 */}
        <div className="space-y-3">
          <div className="text-xs text-indigo-400 font-bold tracking-wider font-mono uppercase flex items-center gap-2">
            <span>🧠</span> 복습 모드 설정
          </div>
          <div className="bg-black/40 border border-white/5 p-4 rounded-sm space-y-4">
            <p className="text-[10px] sm:text-[11px] text-white/40 leading-relaxed">
              학습 완료 후 카드의 <span className="text-indigo-400 font-bold">다음 복습 간격</span>을 결정하는 방식을 선택합니다.
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setStudyMode('일반')}
                className={`py-2.5 rounded-sm text-xs font-bold transition-all shadow-sm ${
                  studyMode === '일반'
                    ? 'bg-indigo-600 text-white border border-indigo-400'
                    : 'bg-white/5 text-white/40 border border-transparent hover:bg-white/10'
                }`}
              >
                기본 (현재)
              </button>
              <button
                onClick={() => setStudyMode('AI자동')}
                className={`py-2.5 rounded-sm text-xs font-bold transition-all shadow-sm ${
                  studyMode === 'AI자동'
                    ? 'bg-indigo-600 text-white border border-indigo-400'
                    : 'bg-white/5 text-white/40 border border-transparent hover:bg-white/10'
                }`}
              >
                AI 자동 계산
              </button>
              <button
                onClick={() => setStudyMode('수동')}
                className={`py-2.5 rounded-sm text-xs font-bold transition-all shadow-sm ${
                  studyMode === '수동'
                    ? 'bg-indigo-600 text-white border border-indigo-400'
                    : 'bg-white/5 text-white/40 border border-transparent hover:bg-white/10'
                }`}
              >
                수동 (Anki식)
              </button>
            </div>

            <div className="text-[10px] sm:text-[11px] text-indigo-300 bg-indigo-950/30 p-3 rounded-sm border border-indigo-500/20 leading-relaxed">
              {studyMode === '일반' &&
                '📍 현재 설정: 설정된 기본 간격에 맞춰 순차적으로 카드를 복습합니다.'}
              {studyMode === 'AI자동' &&
                '🤖 현재 설정: 오답률과 소요 시간을 분석하여 최적의 복습 주기를 AI가 자동으로 계산합니다.'}
              {studyMode === '수동' &&
                '🕹️ 현재 설정: 학습 종료 시 [다시/어려움/알맞음/쉬움] 4가지 버튼이 나타나며, 유저가 직접 난이도를 판단하여 간격을 선택합니다.'}
            </div>
          </div>
        </div>

        <div className="border-t border-white/10"></div>

        {/* 🏆 명예의 전당 */}
        <div className="space-y-3">
          <div className="text-xs text-amber-400/80 font-bold tracking-wider font-mono uppercase flex items-center gap-2">
            <span>🏆</span> 명예의 전당 (학습 랭킹)
          </div>
          <div className="bg-black/40 border border-white/5 p-4 rounded-sm">
            {isLoadingRanking ? (
              <div className="text-center text-white/40 text-[11px] py-6 animate-pulse">
                실시간 서버 데이터를 수집하는 중...
              </div>
            ) : rankingData.length > 0 ? (
              <div className="space-y-2 max-h-[250px] overflow-y-auto custom-scrollbar pr-2">
                {rankingData.map((user, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center justify-between p-3 rounded-sm border transition-colors ${
                      idx === 0
                        ? 'bg-amber-900/30 border-amber-500/50'
                        : idx === 1
                        ? 'bg-gray-400/10 border-gray-400/30'
                        : idx === 2
                        ? 'bg-orange-900/20 border-orange-700/40'
                        : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`font-bold font-mono text-[14px] w-6 text-center ${
                          idx === 0
                            ? 'text-amber-400'
                            : idx === 1
                            ? 'text-gray-300'
                            : idx === 2
                            ? 'text-orange-400'
                            : 'text-white/30'
                        }`}
                      >
                        {idx + 1}
                      </div>
                      <div className="text-[11px] sm:text-xs text-white/80 font-mono">
                        {user.wallet_address === safeAddress ? (
                          <span className="text-teal-400 font-bold">
                            (내 계정) {formatAddress(user.wallet_address)}
                          </span>
                        ) : (
                          formatAddress(user.wallet_address)
                        )}
                      </div>
                    </div>
                    <div className="text-[11px] sm:text-xs font-bold text-indigo-400 text-right shrink-0">
                      {user.total_filled.toLocaleString()} 회
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-white/40 text-[11px] py-6">
                랭킹 데이터가 존재하지 않습니다.
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-white/10"></div>

        {/* 📊 데이터베이스 엑셀 통합 관리 */}
        <div className="space-y-3">
          <div className="text-xs text-white/50 font-bold tracking-wider font-mono uppercase">
            📊 데이터베이스 엑셀 통합 관리
          </div>
          <div className="p-4 bg-black/40 border border-white/5 rounded-sm space-y-4">
            <p className="text-[10px] sm:text-[11px] text-white/40 leading-relaxed">
              기기 화면에 보이는 숫자가 엑셀에 반영되지 않는다면{' '}
              <span className="text-teal-400 font-bold">강제 동기화</span>를 진행해 주세요.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                onClick={handleExportExcel}
                disabled={isExporting}
                className={`w-full py-2.5 px-3 border rounded-sm font-bold text-[11px] transition-all shadow-md ${
                  isExporting
                    ? 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed'
                    : 'bg-indigo-600/20 border-indigo-500 text-indigo-400 hover:bg-indigo-600/30 cursor-pointer'
                }`}
              >
                {isExporting ? '⏳ 다운로드 중...' : '📥 엑셀 DB 추출'}
              </button>
              <div className="relative">
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  id="excel-import-file-mypage"
                  onChange={handleImportExcel}
                  disabled={isImporting}
                  className="hidden"
                />
                <label
                  htmlFor="excel-import-file-mypage"
                  className={`w-full py-2.5 px-3 border rounded-sm font-bold text-[11px] text-center block cursor-pointer transition-all shadow-md ${
                    isImporting
                      ? 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed'
                      : 'bg-amber-500/10 border-amber-500/50 text-amber-400 hover:bg-amber-500/20'
                  }`}
                >
                  {isImporting ? '🔄 반영 중...' : '📤 엑셀 업로드'}
                </label>
              </div>
              <button
                onClick={handleForceSync}
                disabled={isImporting}
                className={`w-full py-2.5 px-3 border rounded-sm font-bold text-[11px] transition-all shadow-md ${
                  isImporting
                    ? 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed'
                    : 'bg-teal-600/20 border-teal-500 text-teal-400 hover:bg-teal-600/30 cursor-pointer'
                }`}
              >
                {isImporting ? '🔄 펌핑 중...' : '🚀 화면 ➔ DB 강제 동기화'}
              </button>
            </div>
            {uploadLog && (
              <div
                className={`p-2.5 text-[11px] rounded-sm border font-mono ${
                  uploadLog.includes('❌')
                    ? 'bg-red-950/20 border-red-500/30 text-red-400'
                    : uploadLog.includes('✅')
                    ? 'bg-teal-950/20 border-teal-500/30 text-teal-300'
                    : 'bg-white/5 border-white/10 text-white/60 animate-pulse'
                }`}
              >
                {uploadLog}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-white/10"></div>

        {/* .txt 원본 데이터 업로드 */}
        <div className="space-y-3">
          <div className="text-xs text-white/50 font-bold tracking-wider font-mono uppercase">
            📖 원본 학습자료 텍스트 소스 공급부
          </div>
          <div className="space-y-4 bg-black/40 border border-white/5 p-4 rounded-sm">
            <div className="border border-dashed border-white/20 p-6 rounded-sm text-center bg-black/30 hover:border-amber-500/40 transition-colors relative group">
              <input
                type="file"
                accept=".txt"
                onChange={(e) => setLawFile(e.target.files?.[0] || null)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="text-[11px] text-white/70 group-hover:text-amber-400 transition-colors">
                {lawFile
                  ? `📄 ${lawFile.name}`
                  : '클릭하여 원본 (.txt) 파일을 공급해 주십시오'}
              </div>
              <div className="text-[10px] text-white/30 mt-1">
                파일 인코딩 규격 권장: UTF-8 일반 텍스트 문서
              </div>
            </div>
            <button
              onClick={handleFileUploadAndSubmit}
              disabled={isUploading || !lawFile}
              className={`w-full py-3 text-[11px] font-bold rounded-sm border transition-all ${
                isUploading
                  ? 'bg-white/5 border-white/5 text-white/20 cursor-wait'
                  : !lawFile
                  ? 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed'
                  : 'bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30 cursor-pointer'
              }`}
            >
              {isUploading
                ? '⚡ 인공지능 프레임 가공 엔진 분석 중...'
                : '🚀 서버로 원본 데이터 전송 가동'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MypageTab;
