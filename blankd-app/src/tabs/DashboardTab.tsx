import React, { useState, useEffect, useMemo } from 'react';
import { parseCardStats } from '../utils/constants';

const safeParseStats = (memoStr: string) => {
    try {
        if (memoStr && memoStr.trim().startsWith('{')) {
            const p = JSON.parse(memoStr);
            return { filled: p.filled || 0, wrongIndices: p.wrongIndices || [] };
        }
    } catch(e) {}
    return parseCardStats(memoStr);
};

const getKSTDateString = () => {
  const kstTime = Date.now() + (9 * 60 * 60 * 1000);
  return new Date(kstTime).toISOString().split('T')[0];
};

const getKSTInfo = () => {
  const kstTime = Date.now() + (9 * 60 * 60 * 1000);
  const kstDate = new Date(kstTime);
  return {
      year: kstDate.getUTCFullYear(),
      month: kstDate.getUTCMonth()
  };
};

export const DashboardTab = ({ 
  categories, savedCards, setActiveTab, setExpandedId, setActiveCard, 
  goalBalance, handleUpdateBalance, 
  activityLog, claimedRewards, setClaimedRewards, safeAddress,
  loadAllData, isOffline,
  targetCycle, setTargetCycle // 💡 App.tsx에서 전달받는 전역 상태
}: any) => {
  const kstNow = getKSTInfo();
  const [calYear, setCalYear] = useState(kstNow.year);
  const [calMonth, setCalMonth] = useState(kstNow.month);
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [tempCycle, setTempCycle] = useState<number | string>(targetCycle || 30);
  const [isEditingCycle, setIsEditingCycle] = useState(false);

  useEffect(() => {
    setTempCycle(targetCycle || 30);
  }, [targetCycle]);

  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      if (typeof loadAllData === 'function') {
        await loadAllData(true);
        alert('✅ 동기화 완료! 현재 기기(스마트폰/PC)의 작업 내역이 서버에 우선 반영되었습니다.');
      }
    } catch (e) {
      alert('동기화 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsSyncing(false);
    }
  };

  const todayStr = getKSTDateString();

  // 💡 [핵심] 300P 지불하여 마스터 주기 변경
  const handleStartEditCycle = () => {
    if (goalBalance < 300) {
      alert('🚨 포인트가 부족합니다. 마스터 주기를 변경하려면 300 P가 필요합니다!');
      return;
    }
    if (window.confirm('300 P를 지불하고 마스터 주기를 변경하시겠습니까?')) {
      handleUpdateBalance(-300);
      setIsEditingCycle(true);
    }
  };

  const handleSaveCycle = () => {
    let finalVal = Number(tempCycle);
    if (isNaN(finalVal) || finalVal < 1) finalVal = 30;
    
    setTargetCycle(finalVal);
    setIsEditingCycle(false);
    
    // 서버에 즉시 동기화
    if (!isOffline && safeAddress && navigator.onLine) {
      fetch("https://api.blankd.top/api/update-balance", {
        method: "POST", keepalive: true, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: safeAddress, target_cycle: finalVal })
      }).catch(()=>{});
    }
    alert(`✅ 마스터 주기가 ${finalVal}일로 변경되었습니다!`);
  };

  const saveClaim = (key: string, points: number) => {
    const next = { ...claimedRewards, [key]: true };
    setClaimedRewards(next);
    localStorage.setItem(`blankd_claimed_rewards_${safeAddress}`, JSON.stringify(next));
    handleUpdateBalance(points);
    
    fetch("https://api.blankd.top/api/update-balance", {
       method: "POST", keepalive: true, headers: { "Content-Type": "application/json" },
       body: JSON.stringify({ wallet_address: safeAddress, claimed_rewards: next })
    }).catch(()=>{});
    alert(`🎉 목표 달성! 보상으로 ${points}P가 지급되었습니다.`);
  };

  const changeMonth = (offset: number) => {
    let newMonth = calMonth + offset;
    let newYear = calYear;
    if (newMonth > 11) { newMonth -= 12; newYear++; }
    else if (newMonth < 0) { newMonth += 12; newYear--; }
    setCalMonth(newMonth);
    setCalYear(newYear);
  };

  const stats = useMemo(() => {
    let total = 0; let wrong = 0; let correct = 0; let unplayed = 0;
    (savedCards || []).forEach((card: any) => {
        if (!card || !card.content) return;
        const bodyOnly = card.content.split('\n').slice(1).join('\n');
        const blanksCount = (bodyOnly.match(/\[\s*(.*?)\s*\]/g) || []).filter((b: string) => !b.includes('ORIG_ID')).length;
        total += blanksCount;
        try {
            const st = safeParseStats(card.memo);
            if (st.filled > 0) {
                wrong += st.wrongIndices.length;
                correct += Math.max(0, blanksCount - st.wrongIndices.length);
            } else { unplayed += blanksCount; }
        } catch(e) {}
    });
    return { total, correct, wrong, unplayed };
  }, [savedCards]);

  const dailyFilled = activityLog[todayStr] || 0;

  const kstNowObj = new Date(Date.now() + (9 * 60 * 60 * 1000));
  kstNowObj.setUTCHours(0, 0, 0, 0);
  kstNowObj.setUTCDate(kstNowObj.getUTCDate() - kstNowObj.getUTCDay());
  const weekKey = kstNowObj.toISOString().split('T')[0];

  let weeklyFilled = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(kstNowObj.getTime());
    d.setUTCDate(d.getUTCDate() + i);
    weeklyFilled += activityLog[d.toISOString().split('T')[0]] || 0;
  }

  const monthKey = todayStr.slice(0, 7);
  let monthlyFilled = 0;
  Object.keys(activityLog).forEach(dateStr => {
    if (dateStr.startsWith(monthKey)) monthlyFilled += activityLog[dateStr];
  });

  const cycleNum = Number(targetCycle) || 30;
  const dailyTarget = stats.total > 0 ? Math.ceil(stats.total / cycleNum) : 50;
  const weeklyTarget = dailyTarget * 7;
  const monthlyTarget = dailyTarget * 30;

  const GOALS = {
    daily: { title: "일일 빈칸 채우기", target: dailyTarget, reward: dailyTarget, current: dailyFilled, key: `daily_${todayStr}` },
    weekly: { title: "주간 빈칸 채우기", target: weeklyTarget, reward: weeklyTarget, current: weeklyFilled, key: `weekly_${weekKey}` },
    monthly: { title: "월간 집중 훈련", target: monthlyTarget, reward: monthlyTarget, current: monthlyFilled, key: `monthly_${monthKey}` }
  };

  const firstDayKST = new Date(Date.UTC(calYear, calMonth, 1));
  const firstDay = firstDayKST.getUTCDay();
  const daysInMonthKST = new Date(Date.UTC(calYear, calMonth + 1, 0));
  const daysInMonth = daysInMonthKST.getUTCDate();
  
  const blankCells = Array.from({ length: firstDay });
  const dayCells = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const renderGoalCard = (goal: any, icon: string) => {
    const isCompleted = goal.current >= goal.target;
    const isClaimed = claimedRewards[goal.key];
    const progressPercent = Math.min((goal.current / goal.target) * 100, 100);
    return (
      <div className="bg-[#0a0a0c] border border-white/10 p-5 rounded-sm flex flex-col gap-3 shadow-md relative overflow-hidden">
        {isCompleted && !isClaimed && <div className="absolute top-0 right-0 bg-amber-500 text-black text-[9px] font-bold px-2 py-0.5 rounded-bl-sm animate-pulse">달성 완료!</div>}
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <h3 className="text-[13px] font-bold text-white/80">{goal.title}</h3>
        </div>
        <div className="flex justify-between items-end mb-1">
          <span className="text-[20px] font-mono font-bold text-teal-400">{goal.current} <span className="text-[11px] text-white/40">/ {goal.target}칸</span></span>
        </div>
        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden mb-2">
          <div className="h-full bg-teal-500 transition-all duration-500 ease-out" style={{ width: `${progressPercent}%` }}></div>
        </div>
        <button 
          disabled={!isCompleted || isClaimed}
          onClick={() => saveClaim(goal.key, goal.reward)}
          className={`w-full py-2 text-[11px] font-bold rounded-sm transition-all ${
            isClaimed ? 'bg-white/5 text-white/20 cursor-not-allowed border border-white/5' :
            isCompleted ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-[0_0_10px_rgba(245,158,11,0.4)]' : 
            'bg-teal-900/20 text-teal-500/50 border border-teal-500/20 cursor-not-allowed'
          }`}
        >
          {isClaimed ? '보상 수령 완료' : isCompleted ? `${goal.reward}P 보상 받기` : `진행 중 (목표: ${goal.target}칸)`}
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in w-full">
      <div className="flex flex-col mb-6 border-b border-white/10 pb-4 gap-4">
        <div className="flex justify-between items-center w-full gap-2">
          <h1 className="text-2xl sm:text-3xl font-serif text-current tracking-tight">학습 대시보드</h1>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              title="서버와 로컬 데이터를 다시 병합합니다. 누락된 진행상황이 보이면 눌러주세요."
              className={`flex items-center gap-1 px-3 py-2 text-[11px] sm:text-xs font-bold rounded-sm transition-colors shadow-md border ${
                isSyncing ? 'bg-white/5 text-white/30 border-white/10 cursor-not-allowed' :
                isOffline ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20' :
                'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
              }`}
            >
              {isSyncing ? '동기화 중...' : isOffline ? '⚠ 오프라인 (눌러서 동기화)' : '🔄 동기화'}
            </button>
            <button onClick={() => setActiveTab('enhance')} className="bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 text-[11px] sm:text-xs font-bold rounded-sm transition-colors shadow-md shrink-0">
              채우기 바로가기 ▶
            </button>
          </div>
        </div>
        <p className="text-xs sm:text-sm text-white/40 mb-2">목표를 달성하고 보상을 획득하여 상점 스킬을 이용하세요.</p>
        
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center bg-black/30 p-3 sm:p-4 rounded border border-white/5 gap-4 shadow-inner">
          <div className="flex items-center gap-3 text-[12px] sm:text-[13px] font-mono tracking-tight flex-wrap">
            <span className="text-white/60 font-bold">빈칸 현황 ➔</span>
            <span className="font-bold text-white">전체 {stats.total}개</span>
            <span className="text-white/20">|</span>
            <span className="font-bold text-teal-400">정답 {stats.correct}개</span>
            <span className="text-white/20">|</span>
            <span className="font-bold text-red-400">오답 {stats.wrong}개</span>
            <span className="text-white/20">|</span>
            <span className="text-white/40">미학습 {stats.unplayed}개</span>
          </div>
          
          <div className="flex items-center gap-2 bg-white/5 px-3 py-2 rounded-sm border border-white/10 shrink-0 w-full xl:w-auto flex-wrap">
            <span className="text-[11px] sm:text-xs text-white/50 font-bold">전체 빈칸을</span>
            
            {isEditingCycle ? (
              <div className="flex items-center gap-1">
                <input 
                  type="number" 
                  value={tempCycle} 
                  onChange={(e) => setTempCycle(e.target.value)}
                  className="w-14 bg-black/80 border border-amber-500 rounded p-1 text-center text-[12px] font-bold outline-none text-amber-400"
                  min="1" max="365" autoFocus
                />
                <button onClick={handleSaveCycle} className="px-2 py-1 bg-amber-500 text-black text-[10px] font-bold rounded hover:bg-amber-400">저장</button>
                <button onClick={() => setIsEditingCycle(false)} className="px-2 py-1 bg-white/10 text-white/60 text-[10px] rounded hover:bg-white/20">취소</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-mono font-bold text-amber-400 border-b border-amber-500/50 px-1">{targetCycle}</span>
                <span className="text-[11px] sm:text-xs text-white/50 font-bold whitespace-nowrap">
                  일 주기로 마스터 <span className="text-amber-400 ml-1">(일일 목표: {dailyTarget}칸)</span>
                </span>
                <button 
                  onClick={handleStartEditCycle}
                  title="300 P를 지불하고 마스터 주기를 자유롭게 변경합니다."
                  className="ml-2 px-2.5 py-1 bg-indigo-900/40 border border-indigo-500/50 text-indigo-300 text-[10px] font-bold rounded hover:bg-indigo-900/80 transition-colors shadow-sm whitespace-nowrap"
                >
                  ⚡ 주기 변경 (-300P)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 bg-[#08080a]/80 border border-white/10 p-5 sm:p-6 rounded-sm shadow-xl">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-[14px] font-bold text-white/80">📅 나의 학습 기록</h2>
            <div className="flex items-center gap-4 bg-white/5 rounded-sm px-2 py-1">
              <button onClick={() => changeMonth(-1)} className="text-white/40 hover:text-teal-400 px-2 font-bold transition-colors">&lt;</button>
              <span className="text-[12px] font-mono font-bold text-white/70 w-20 text-center">{calYear}년 {calMonth + 1}월</span>
              <button onClick={() => changeMonth(1)} className="text-white/40 hover:text-teal-400 px-2 font-bold transition-colors">&gt;</button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
            {['일', '월', '화', '수', '목', '금', '토'].map(d => (
              <div key={d} className="text-center text-[10px] sm:text-[11px] font-bold text-white/30 py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {blankCells.map((_, i) => <div key={`b-${i}`} className="aspect-square"></div>)}
            {dayCells.map(day => {
              const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const count = activityLog[dateStr] || 0;
              
              let bgClass = "bg-white/5 text-white/20 border border-white/5";
              if (count > 0 && count < dailyTarget * 0.5) bgClass = "bg-teal-900/40 text-teal-400 border border-teal-500/20";
              else if (count >= dailyTarget * 0.5 && count < dailyTarget) bgClass = "bg-teal-700/60 text-teal-100 border border-teal-500/40";
              else if (count >= dailyTarget) bgClass = "bg-teal-500 text-black border border-teal-400 shadow-[0_0_10px_rgba(20,184,166,0.3)] font-bold";

              return (
                <div key={day} className={`aspect-square rounded-sm flex flex-col items-center justify-center transition-all hover:scale-105 cursor-default ${bgClass}`} title={`${dateStr}: ${count}칸 완료 (목표 ${dailyTarget}칸)`}>
                  <span className="text-[11px] sm:text-[13px]">{day}</span>
                  {count > 0 && <span className="text-[8px] sm:text-[9px] mt-0.5 opacity-80 font-mono tracking-tighter">{count}</span>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {renderGoalCard(GOALS.daily, "🎯")}
          {renderGoalCard(GOALS.weekly, "🔥")}
          {renderGoalCard(GOALS.monthly, "👑")}
        </div>
      </div>
    </div>
  );
};
