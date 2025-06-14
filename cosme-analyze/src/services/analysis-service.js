/**
 * AI分析を担当するクラス
 */

const { VertexAI } = require('@google-cloud/vertexai');
const { GoogleAuth } = require('google-auth-library');
const path = require('path');
const config = require('../utils/config');

class AnalysisService {
  constructor() {
    this.vertexAI = new VertexAI({
      project: config.vertexAI.project,
      location: config.vertexAI.location,
    });
  }

  /**
   * ベクトル検索を実行する
   * @param {string} query - 検索クエリ
   * @returns {Promise<Array>} - 検索結果
   */
  async performVectorSearch(query) {
    try {
      console.log('🔑 サービスアカウントで認証中...');

      // サービスアカウントキーファイルのパスを指定
      const keyFilePath = path.join(
        __dirname,
        '../config/vertex-ai-search_cosem-analyze.json'
      );

      // Google Auth Libraryを使用して認証
      const auth = new GoogleAuth({
        keyFile: keyFilePath,
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });

      // アクセストークンを取得
      const authClient = await auth.getClient();
      const accessToken = await authClient.getAccessToken();

      console.log('✅ 認証成功');

      const url =
        'https://discoveryengine.googleapis.com/v1/projects/cosmetic-ingredient-analysis/locations/global/collections/default_collection/dataStores/cosme-ingredient-bucket-datastore_1749650091742/servingConfigs/default_search:search';

      console.log('🔍 検索URL:', url);
      console.log('🔍 検索クエリ:', query);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query,
          pageSize: 10,
          queryExpansionSpec: {
            condition: 'AUTO',
          },
          spellCorrectionSpec: {
            mode: 'AUTO',
          },
        }),
      });


      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ エラーレスポンス:', errorText);
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      return data.results || [];

    } catch (error) {
      console.error('🚫 ベクトル検索エラー:', error);
      // エラーが発生した場合は空の配列を返して処理を継続
      return [];
    }
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

      // ベクトル検索を実行
      console.log('🔍 ベクトル検索を実行中...');
      const searchQuery = `この肌質に適した成分と避けるべき成分: ${profileText}`;
      const vectorSearchResults = await this.performVectorSearch(searchQuery);
      console.log('✅ ベクトル検索完了');

      const prompt = this.createAnalysisPrompt(
        ocrText,
        profileText,
        barcode,
        vectorSearchResults
      );
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
   * @param {Array} vectorSearchResults - ベクトル検索結果
   * @returns {string} - 分析用プロンプト
   */
  createAnalysisPrompt(ocrText, profileText, barcode, vectorSearchResults) {
    // ベクトル検索結果からcontentのみを抽出
    const extractedContents = vectorSearchResults
      .map((result, index) => {
        const extractiveAnswers =
          result.document?.derivedStructData?.extractive_answers || [];
        const contents = extractiveAnswers
          .map((answer) => answer.content)
          .join('\n');
        return contents ? `検索結果${index + 1}:\n${contents}` : '';
      })
      .filter((content) => content)
      .join('\n\n');

    const vectorSearchSection =
      extractedContents || '関連情報が見つかりませんでした。';
    console.log('ベクトル検索結果のコンテンツ:', vectorSearchSection);

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

### 関連情報（ベクトル検索結果）
${vectorSearchSection}

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
