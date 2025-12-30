export const AI_MODELS = {
  // モデル名は Python コードにあった通り
  PRO: 'gemini-3-pro-preview', 
  FLASH: 'gemini-3-flash-preview',
  
  // 住所は Python コードにあった通り 'global'
  // (ステップ1の修正により、今度はエラーになりません！)
  LOCATION: 'global', 
} as const;