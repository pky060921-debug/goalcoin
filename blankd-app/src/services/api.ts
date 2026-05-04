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
  async getExams(address: string) {
    const res = await fetch(`${BASE_URL}/get-all-exams?wallet_address=${address}`);
    return res.json();
  },
  async saveCard(data: any) {
    return fetch(`${BASE_URL}/save-card`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  },
  async deleteCategory(address: string, id: number) {
    return fetch(`${BASE_URL}/delete-category`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet_address: address, id })
    });
  },
  async submitAnswer(cardId: number, isCorrect: boolean, time: number) {
    return fetch(`${BASE_URL}/submit-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card_id: cardId, is_correct: isCorrect, clear_time: time })
    });
  }
};
