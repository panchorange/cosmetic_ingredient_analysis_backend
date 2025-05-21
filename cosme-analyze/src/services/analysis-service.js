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
      
      console.log(`result(gemini): ${result}`);
      const response = await result.response;
      let responseText = response.candidates[0].content.parts[0].text;
      
      // コードブロックマーカーやバッククォートを除去
      responseText = responseText.replace(/```json|```|`/g, '').trim();
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
    return `
      あなたはスキンケア製品の成分分析AIです。与えられたOCR結果、バーコード、ユーザープロフィールを元に、製品の成分を分析し、ユーザーの肌質や敏感性に合うかどうかを評価してください。
      
      OCR結果には製品名と検出された成分リストが含まれています
      ${ocrText}
      
      バーコード：${barcode}
      
      重要: 
        - 提供されたテキストが化粧品やスキンケア製品でない場合、JSONフォーマットは同じで、is_cosmeをfalseにしてください。また、overall_assessmentでは、製品が化粧品でないことを明記してください。
      化粧品成分が検出された場合は、各成分について分析してください。
      
      ユーザープロフィール：
      ${profileText}
      
      分析結果は以下の形式で、日本語でJSONを返してください。
      コードブロックマーカーやバッククォート、または改行エスケープシーケンスなどを含めず、そのままJSONとして使用できる形式で返してください。
      
      重要: rating（評価）と effect（効果）は必ず日本語で記述し、英語は使わないでください。
      評価は「良好」「やや注意」「不適合」のいずれかを使用してください。
      総合評価（overall_assessment）も必ず日本語で記述してください。
      
      overall_assessmentでは、以下の点を含めて総合的に評価してください。
      - 製品の成分がユーザーの肌タイプ（乾燥、脂性、混合、敏感、普通）に合っているか
      - 製品の成分がユーザーの肌悩み（ニキビ、乾燥、シミ、くすみ、毛穴、しわ/たるみ）に合っているか
      - ユーザーの希望する効果（保湿、美白、エイジングケア、ニキビケア、毛穴ケア、UVケア）に合致しているか
      - ユーザーが避けたい成分が含まれていないか
      - ユーザーの特記事項が考慮されているか
        
      例：
      注意:
        - is_cosmeは化粧品の場合はtrue、それ以外の場合はfalse
        - price_infered_without_tax_yenは推定価格（税込み）
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
        "overall_assessment": "この製品は保湿成分が豊富で乾燥肌や混合肌の乾燥部分に適しています。ビタミンC誘導体が含まれており、エイジングケアやシミへの効果も期待でき、ユーザーの好みに合致します。ただし、ニキビへの直接的な効果は期待できないため、他の製品との併用が良いでしょう。"
    }`;
  }
}

module.exports = AnalysisService;