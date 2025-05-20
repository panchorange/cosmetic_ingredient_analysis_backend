/**
 * 化粧品成分分析バックエンドシステム
 * Firebase Functionsを使用して、OCR、成分分析、データ保存を行うアプリケーション
 */

// 必要なライブラリのインポート
const { initializeApp } = require('firebase-admin/app');
const { getStorage } = require('firebase-admin/storage');
const { onRequest } = require('firebase-functions/v2/https');
const vision = require('@google-cloud/vision');
const { BigQuery } = require('@google-cloud/bigquery');
const { VertexAI } = require('@google-cloud/vertexai');
const { Storage } = require('@google-cloud/storage');

// Firebase Adminの初期化
initializeApp();

/**
 * OCR処理を担当するクラス
 */
class OcrService {
  constructor() {
    this.visionClient = new vision.ImageAnnotatorClient();
    this.storage = new Storage();
    this.bucketName = 'cosmetic-ingredient-analysis.firebasestorage.app';
  }

  /**
   * 画像からテキストを検出し、結果を保存する
   * @param {string} firebaseFolderPath - 画像ファイルが格納されているフォルダパス
   * @returns {Promise<string>} - 検出されたテキスト
   */
  async detectText(firebaseFolderPath) {
    try {
      const filePath = `${firebaseFolderPath}/ocr_source.jpg`;
      const gcsUri = `gs://${this.bucketName}/${filePath}`;

      // OCR実行
      console.log('テキスト検出を開始します');
      const [textDetection] = await this.visionClient.textDetection(gcsUri);
      const detectedText = textDetection.fullTextAnnotation ? textDetection.fullTextAnnotation.text : '';
      console.log('検出されたテキスト:', detectedText);

      // OCR結果をStorageに保存
      await this.saveOcrResult(firebaseFolderPath, detectedText);

      return detectedText;
    } catch (error) {
      console.error('OCR処理中にエラーが発生しました:', error);
      throw error;
    }
  }

  /**
   * OCR結果をStorageに保存
   * @param {string} folderPath - 保存先フォルダパス
   * @param {string} text - 保存するテキスト
   * @returns {Promise<void>}
   */
  async saveOcrResult(folderPath, text) {
    try {
      const resultFile = this.storage.bucket(this.bucketName).file(`${folderPath}/ocr_result.txt`);
      await resultFile.save(text, { contentType: 'text/plain' });
      console.log('OCR結果を保存しました');
    } catch (error) {
      console.error('OCR結果の保存中にエラーが発生しました:', error);
      throw error;
    }
  }
}

/**
 * Firebase Storageとの連携を担当するクラス
 */
class StorageService {
  constructor() {
    this.storage = getStorage();
  }

  /**
   * 指定されたパスからテキストファイルを読み込む
   * @param {string} folderPath - ファイルが格納されているフォルダパス
   * @param {string} fileName - ファイル名
   * @returns {Promise<string>} - ファイルの内容
   */
  async readTextFile(folderPath, fileName) {
    try {
      const bucket = this.storage.bucket('cosmetic-ingredient-analysis.firebasestorage.app');
      const filePath = `${folderPath}/${fileName}`;
      const file = bucket.file(filePath);
      
      const [exists] = await file.exists();
      if (!exists) {
        throw new Error(`ファイルが見つかりません: ${filePath}`);
      }
      
      const [content] = await file.download();
      return content.toString('utf-8');
    } catch (error) {
      console.error(`ファイル読み込み中にエラーが発生しました (${fileName}):`, error);
      throw error;
    }
  }

  /**
   * プロファイルファイルを読み込む
   * @param {string} folderPath - プロファイルファイルが格納されているフォルダパス
   * @returns {Promise<string>} - プロファイルの内容
   */
  async readProfile(folderPath) {
    return this.readTextFile(folderPath, 'profile.txt');
  }
}

/**
 * AI分析を担当するクラス
 */
class AnalysisService {
  constructor() {
    this.vertexAI = new VertexAI({
      project: "cosmetic-ingredient-analysis",
      location: "asia-northeast1",
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
        model: 'gemini-1.5-flash',
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

/**
 * データベース操作を担当するクラス
 */
class DatabaseService {
  constructor() {
    this.bigquery = new BigQuery();
    this.datasetId = 'app_data';
  }

  /**
   * スキャンログをBigQueryに保存する
   * @param {Object} params - スキャンログパラメータ
   * @param {string} params.user_id - ユーザーID
   * @param {string} params.product_id - 製品ID (バーコード)
   * @param {string} params.ocr_text - OCR結果
   * @param {string} params.analysis_results - 分析結果
   * @returns {Promise<void>}
   */
  async saveScanLog(params) {
    try {
      const { user_id, product_id, ocr_text, analysis_results } = params;
      const tableId = 'scanlogs';

      // 現在の最大IDを取得
      const [rows] = await this.bigquery.query(`
        SELECT MAX(id) as max_id FROM \`${this.datasetId}.${tableId}\`
      `);
      const maxId = rows[0].max_id || 0;
      const newId = maxId + 1;

      // 新しいレコードを作成
      const insertRows = [{
        id: newId,
        user_id: user_id,
        barcode: product_id,
        ocr_result: ocr_text,
        analysis_result: analysis_results,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }];

      // 挿入
      await this.bigquery.dataset(this.datasetId).table(tableId).insert(insertRows);
      console.log('scanlogsに保存しました');
    } catch (error) {
      console.error('scanlogs保存エラー:', error);
      this.logInsertErrors(error);
      throw error;
    }
  }

  /**
   * 製品データをBigQueryに保存する
   * @param {string} analysisResult - 分析結果 (JSON文字列)
   * @param {string} barcode - バーコード
   * @returns {Promise<void>}
   */
  async saveProductData(analysisResult, barcode) {
    try {
      const tableId = 'products';

      // 製品がテーブルに存在するか確認
      const [rows] = await this.bigquery.query(`
        SELECT id FROM \`cosmetic-ingredient-analysis.${this.datasetId}.${tableId}\` 
        WHERE id = '${barcode}'
      `);

      if (rows.length >= 1) {
        console.log('製品はすでに存在します。INSERTをスキップします。');
        return;
      }

      // 文字列の場合はJSONにパース
      const analysisObj = typeof analysisResult === 'string' ? JSON.parse(analysisResult) : analysisResult;
      const ingredientNames = analysisObj.ingredients.map(ingredient => ingredient.name);

      const insertRow = {
        id: barcode,
        product_name: analysisObj.product_name,
        company_name: analysisObj.company_name,
        category: analysisObj.category,
        ingredients: ingredientNames,
        price_infered_without_tax: analysisObj.price_infered_without_tax_yen,
        is_cosme: analysisObj.is_cosme,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // 挿入
      await this.bigquery.dataset(this.datasetId).table(tableId).insert([insertRow]);
      console.log('製品データをBigQueryに保存しました');
    } catch (error) {
      console.error('BigQueryへの挿入エラー(製品テーブル):', error);
      throw error;
    }
  }

  /**
   * ユーザープロファイルをBigQueryに保存する
   * @param {Object} userProfileJson - ユーザープロファイル
   * @returns {Promise<void>}
   */
  async saveUserProfile(userProfileJson) {
    try {
      const tableId = 'users';

      // 既存ユーザー確認
      const [rows] = await this.bigquery.query(`
        SELECT id FROM \`cosmetic-ingredient-analysis.${this.datasetId}.${tableId}\` 
        WHERE id = '${userProfileJson.uid}'
      `);

      if (rows.length >= 1) {
        console.log('ユーザーはすでに存在します。INSERTをスキップします。');
        return;
      }

      // データ整形 - ARRAY型に合わせて修正
      const insertRow = this.formatUserProfileForInsert(userProfileJson);
      
      // 挿入
      await this.bigquery.dataset(this.datasetId).table(tableId).insert([insertRow]);
      console.log('ユーザープロフィールをBigQueryに保存しました');
    } catch (error) {
      console.error('BigQueryへの挿入エラー(ユーザーテーブル):', error);
      this.logInsertErrors(error);
      throw error;
    }
  }

  /**
   * ユーザープロファイルの存在確認
   * @param {Object} userProfileJson - ユーザープロファイル
   * @returns {Promise<number>} - 存在する場合は1、しない場合は0
   */
  async checkUserExists(userProfileJson) {
    try {
      const tableId = 'users';
      const query = `
        SELECT id 
        FROM \`cosmetic-ingredient-analysis.${this.datasetId}.${tableId}\` 
        WHERE id = '${userProfileJson.uid}'
      `;

      const [rows] = await this.bigquery.query(query);
      return rows.length;
    } catch (error) {
      console.error('ユーザー存在確認中にエラーが発生しました:', error);
      throw error;
    }
  }

  /**
   * ユーザープロファイルをBigQuery用に整形する
   * @param {Object} userProfileJson - 元のユーザープロファイル
   * @returns {Object} - 整形済みのユーザープロファイル
   */
  formatUserProfileForInsert(userProfileJson) {
    return {
      id: userProfileJson['uid'],
      birth_date: userProfileJson['birth_date'] ? userProfileJson['birth_date'].slice(0, 10) : null,
      gender: userProfileJson['gender'] || null,
      skin_type: userProfileJson['skin_type'] || null,
      
      skin_problems: Array.isArray(userProfileJson['skin_problems']) 
        ? userProfileJson['skin_problems'] 
        : (userProfileJson['skin_problems'] ? [userProfileJson['skin_problems']] : []),
      
      ingredients_to_avoid: Array.isArray(userProfileJson['ingredients_to_avoid']) 
        ? userProfileJson['ingredients_to_avoid'] 
        : (userProfileJson['ingredients_to_avoid'] ? [userProfileJson['ingredients_to_avoid']] : []),
      
      desired_effect: Array.isArray(userProfileJson['desired_effect']) 
        ? userProfileJson['desired_effect'] 
        : (userProfileJson['desired_effect'] ? [userProfileJson['desired_effect']] : []),
      
      user_memo: userProfileJson['note'] || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * BigQueryの挿入エラーを詳細にログ出力する
   * @param {Error} error - エラーオブジェクト
   */
  logInsertErrors(error) {
    if (error && error.errors) {
      console.error('insertErrors:', JSON.stringify(error.errors, null, 2));
    }
    if (error && error.response && error.response.insertErrors) {
      console.error('insertErrors詳細:', JSON.stringify(error.response.insertErrors, null, 2));
    }
  }
}

/**
 * アプリケーション全体のオーケストレーションを担当するクラス
 */
class CosmeticAnalysisApp {
  constructor() {
    this.ocrService = new OcrService();
    this.storageService = new StorageService();
    this.analysisService = new AnalysisService();
    this.dbService = new DatabaseService();
  }

  /**
   * 成分分析のメインプロセスを実行する
   * @param {Object} requestData - リクエストデータ
   * @param {string} requestData.firebaseFolderPath - Storageのフォルダパス
   * @param {string} requestData.barcode - 製品のバーコード
   * @param {Object} requestData.userProfileJson - ユーザープロファイル
   * @returns {Promise<Object>} - 分析結果
   */
  async analyzeIngredients(requestData) {
    try {
      const { firebaseFolderPath, barcode, userProfileJson } = requestData;
      console.log(`処理開始 - パス: ${firebaseFolderPath}, バーコード: ${barcode}`);

      // OCR処理
      const ocrText = await this.ocrService.detectText(firebaseFolderPath);
      
      // プロファイル読み込み
      const profileText = await this.storageService.readProfile(firebaseFolderPath);
      
      // 成分分析
      const analysisResult = await this.analysisService.analyzeCosmeIngredients(
        ocrText,
        profileText,
        barcode
      );
      
      // スキャンログ保存
      await this.dbService.saveScanLog({
        user_id: userProfileJson.uid,
        product_id: barcode,
        ocr_text: ocrText,
        analysis_results: analysisResult
      });
      
      // ユーザー存在確認と保存
      const userExists = await this.dbService.checkUserExists(userProfileJson);
      if (userExists === 0) {
        await this.dbService.saveUserProfile(userProfileJson);
      }
      
      // 製品データ保存
      await this.dbService.saveProductData(analysisResult, barcode);
      
      // 結果を返す
      return {
        success: true,
        data: {
          ocr_result: ocrText,
          user_profile: profileText,
          analysis_result: analysisResult
        }
      };
    } catch (error) {
      console.error('成分分析処理中にエラーが発生しました:', error);
      throw error;
    }
  }
}

// Firebase Function
exports.analyzeIngredients = onRequest({
  region: 'asia-northeast1',
  cors: true,
  timeoutSeconds: 300,
}, async (req, res) => {
  try {
    // リクエストの検証
    const { firebaseFolderPath, barcode, userProfileJson } = req.body;
    
    if (!firebaseFolderPath || !barcode || !userProfileJson) {
      return res.status(400).json({
        error: '必要なパラメータが不足しています'
      });
    }
    
    // アプリケーションのインスタンス化と処理実行
    const app = new CosmeticAnalysisApp();
    const result = await app.analyzeIngredients(req.body);
    
    // 成功レスポンス
    res.status(200).json(result);
  } catch (error) {
    // エラーレスポンス
    console.error('リクエスト処理中にエラーが発生しました:', error);
    res.status(500).json({
      error: 'サーバーエラーが発生しました',
      message: error.message
    });
  }
});