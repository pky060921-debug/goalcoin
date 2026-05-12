const BASE_URL = "https://api.blankd.top/api";

export const api = {
  async getCategories(address: string) {
    const res = await fetch(`${BASE_URL}/get-categories?wallet_address=${address}`);
    return res.json();
  },
  async getMyCards(address: string) {
    const res = await fetch(`${BASE_URL}/my-cards?wallet_address=${address}`);
    return res.json();
  },
  async deleteCard(address: string, id: number) {
    return fetch(`${BASE_URL}/delete-card`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet_address: address, id })
    });
  },
  async deleteAll(address: string) {
    return fetch(`${BASE_URL}/delete-all`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet_address: address })
    });
  },
  async getCbtSession() {
    const res = await fetch(`${BASE_URL}/get-cbt-session`);
    if (!res.ok) throw new Error("CBT 데이터를 불러오지 못했습니다.");
    return res.json();
  },
  async generateStyles(articleText: string) {
    const res = await fetch(`${BASE_URL}/generate-styles`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ article_text: articleText })
    });
    if (!res.ok) throw new Error("스타일 샘플 생성 실패");
    return res.json();
  },
  
  // ==========================================
  // 💡 [업그레이드] 합동 검수용 API (DB 동기화 지원)
  // ==========================================
  async uploadExamCoop(file: File, address: string) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('wallet_address', address);
    const res = await fetch(`${BASE_URL}/upload-exam-coop`, { method: 'POST', body: formData });
    return res.json();
  },
  async getPendingExams(address: string) {
    const res = await fetch(`${BASE_URL}/get-pending-exams?wallet_address=${address}`);
    return res.json();
  },
  async deletePendingExam(address: string, id: number) {
    return fetch(`${BASE_URL}/delete-pending-exam`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet_address: address, id })
    });
  },
  async analyzeChunk(chunkText: string) {
    const res = await fetch(`${BASE_URL}/analyze-chunk`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chunk_text: chunkText })
    });
    return res.json();
  },
  async saveGoldenExam(data: any) {
    const res = await fetch(`${BASE_URL}/save-golden-exam`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }
};
