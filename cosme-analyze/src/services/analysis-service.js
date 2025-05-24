/**
 * AI分析を担当するクラス
 */

const { VertexAI } = require('@google-cloud/vertexai');
const config = require('../utils/config');

class AnalysisService {
  constructor() {
    this.vertexAI = new VertexAI({
      project: config.vertexAI.project,
      location: config.vertexAI.location,
    });
  }

  /**
   * Vertex AI Geminiを使用して化粧品成分のテキスト分析を行う
   * @param {string} ocrText - OCRで検出されたテキスト
   * @param {string} profileText - ユーザープロファイル
   * @param {string} barcode - 製品のバーコード
   * @returns {Promise<string>} - JSON形式の分析結果
   */
  async analyzeCosmeIngredients(ocrText, profileText, barcode) {
    try {
      const generativeModel = this.vertexAI.getGenerativeModel({
        model: config.vertexAI.model,
      });

      const prompt = this.createAnalysisPrompt(ocrText, profileText, barcode);
      const result = await generativeModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      const response = await result.response;
      let responseText = response.candidates[0].content.parts[0].text;

      // コードブロックマーカーやバッククォートを除去
      responseText = responseText.replace(/```json|```|`/g, '').trim();

      // ここでresponseText (JSON形式の文字列) をログに出力します
      console.log(`Gemini分析結果 (JSON): ${responseText}`);

      return responseText;
    } catch (error) {
      console.error('Gemini分析中にエラーが発生しました:', error);
      throw error;
    }
  }

  /**
   * 分析用のプロンプトを作成する
   * @param {string} ocrText - OCRで検出されたテキスト
   * @param {string} profileText - ユーザープロファイル
   * @param {string} barcode - 製品のバーコード
   * @returns {string} - 分析用プロンプト
   */
  createAnalysisPrompt(ocrText, profileText, barcode) {
    return `# スキンケア製品 成分分析AI

あなたはスキンケア製品の成分分析を専門とするAIです。
ユーザーの肌質・悩み・希望に基づいて製品を評価してください。

## 入力情報

### 製品情報（OCR結果）
${ocrText}

### バーコード
${barcode}

### ユーザープロフィール
${profileText}

## 分析タスク

### 1. 製品判定
- 化粧品・スキンケア製品かどうかを判定
- 化粧品以外の場合：is_cosme を false に設定
- 化粧品の場合：各成分を詳細分析

### 2. 成分評価基準
各成分について以下で評価：
- **良好**：ユーザーに適している
- **やや注意**：一部注意が必要
- **不適合**：ユーザーに不適

### 3. 総合評価点数（1-5）
- **5**：非常に適している（完全適合）
- **4**：適している（良く適合）
- **3**：普通（一般的効果）
- **2**：やや不適切（問題あるが使用可能）
- **1**：不適切（使用非推奨）

## 評価ポイント

ユーザーの以下の項目との適合性を評価：
- 肌タイプ：乾燥、脂性、混合、敏感、普通
- 肌悩み：ニキビ、乾燥、シミ、くすみ、毛穴、しわ/たるみ
- 希望効果：保湿、美白、エイジングケア、ニキビケア、毛穴ケア、UVケア
- 避けたい成分：該当成分が含まれていないか
- 特記事項：その他の個別要望

## 出力形式

**重要：以下のJSONフォーマットで回答してください**
- コードブロックマーカー（\`\`\`）は使用しない
- 改行エスケープ（\\n）は使用しない
- 日本語で記述
- そのまま使用可能なJSON形式
- **overall_assessmentは150文字以内で簡潔にまとめる**

### 出力例

{
  "product_name": "モイスチャー乳液",
  "company_name": "花王",
  "category": "乳液",
  "price_infered_without_tax_yen": 1200,
  "is_cosme": true,
  "analysis_type": "成分分析結果",
  "ingredients": [
    {
      "name": "セラミド",
      "rating": "良好",
      "effect": "肌の保湿バリアを強化する成分"
    },
    {
      "name": "ヒアルロン酸",
      "rating": "良好", 
      "effect": "保湿効果が高く、乾燥肌に適しています"
    }
  ],
  "overall_score": 4,
  "overall_assessment": "この製品は保湿成分が豊富で乾燥肌や混合肌の乾燥部分に適しています。ビタミンC誘導体が含まれており、エイジングケアやシミへの効果も期待でき、ユーザーの好みに合致します。ただし、ニキビへの直接的な効果は期待できないため、他の製品との併用が良いでしょう。"
}

## 化粧品以外の場合

化粧品でない場合の出力例：
{
  "product_name": "検出された製品名",
  "is_cosme": false,
  "overall_assessment": "この製品は化粧品ではありません"
}

---
上記の指示に従って分析を開始してください。`;
  }
}

module.exports = AnalysisService;
