const { initializeApp } = require('firebase-admin/app');
const { getStorage } = require('firebase-admin/storage');
const { onRequest } = require('firebase-functions/v2/https');
const { BigQuery } = require('@google-cloud/bigquery');
const { VertexAI } = require('@google-cloud/vertexai');

// Firebase Adminを初期化
initializeApp();

// BigQueryクライアントを初期化
const bigquery = new BigQuery();

// Vertex AIクライアントを初期化
const vertexAI = new VertexAI({
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: 'asia-northeast1',
});

/**
 * OCR結果ファイルを読み込む関数
 * @param {string} folderPath - OCR結果が保存されているフォルダパス
 * @returns {Promise<string>} - OCR結果のテキスト
 */
async function readOCRResult(folderPath) {
  try {
    const storage = getStorage();
    const bucket = storage.bucket('cosmetic-ingredient-analysis.firebasestorage.app');
    const filePath = `${folderPath}/ocr_result.txt`;
    
    const file = bucket.file(filePath);
    const [exists] = await file.exists();
    
    if (!exists) {
      throw new Error(`OCR結果ファイルが見つかりません: ${filePath}`);
    }
    
    const [content] = await file.download();
    return content.toString('utf-8');
  } catch (error) {
    console.error('OCR結果の読み込み中にエラーが発生しました:', error);
    throw error;
  }
}

/**
 * Vertex AI Geminiを使用してテキスト分析を行う関数
 * @param {string} text - 分析対象のテキスト
 * @returns {Promise<Object>} - 分析結果
 */
async function analyzeWithGemini(text) {
  try {
    const model = 'gemini-pro';
    const generativeModel = vertexAI.preview.getGenerativeModel({
      model: model,
    });

    const prompt = `
      以下の化粧品成分リストを分析し、以下の情報をJSON形式で返してください：
      1. 主な成分とその役割
      2. 肌への影響
      3. 注意点やアレルギーリスク
      
      成分リスト：
      ${text}
    `;

    const result = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const response = await result.response;
    return JSON.parse(response.candidates[0].content.parts[0].text);
  } catch (error) {
    console.error('Gemini分析中にエラーが発生しました:', error);
    throw error;
  }
}

/**
 * 分析結果をBigQueryに保存する関数
 * @param {Object} analysisResult - 分析結果
 * @param {string} originalText - 元のテキスト
 * @param {string} uid - ユーザーID
 * @param {string} folderPath - フォルダパス
 * @returns {Promise<void>}
 */
async function saveToBigQuery(analysisResult, originalText, uid, folderPath) {
  try {
    const datasetId = 'cosmetic_analysis';
    const tableId = 'analysis_results';
    
    const rows = [{
      timestamp: new Date().toISOString(),
      original_text: originalText,
      analysis_result: JSON.stringify(analysisResult),
      user_id: uid,
      folder_path: folderPath,
      created_at: new Date().toISOString()
    }];
    
    await bigquery
      .dataset(datasetId)
      .table(tableId)
      .insert(rows);
      
    console.log('分析結果をBigQueryに保存しました');
  } catch (error) {
    console.error('BigQueryへの保存中にエラーが発生しました:', error);
    throw error;
  }
}

// Flutter側からHTTPリクエストを受け取る
exports.analyzeIngredients = onRequest({
  cors: true,
  timeoutSeconds: 300,
}, async (req, res) => {
  try {
    // リクエストボディからデータを取得
    const { folderPath, uid } = req.body;

    if (!folderPath || !uid) {
      res.status(400).json({
        error: '必要なパラメータが不足しています'
      });
      return;
    }

    // OCR結果を読み込む
    const ocrText = await readOCRResult(folderPath);
    
    // Geminiで分析
    const analysisResult = await analyzeWithGemini(ocrText);
    
    // BigQueryに保存
    // await saveToBigQuery(analysisResult, ocrText, uid, folderPath);

    // レスポンス
    res.status(200).json({
      success: true,
      data: {
        originalText: ocrText,
        analysis: analysisResult
      }
    });

  } catch (error) {
    console.error('エラーが発生しました:', error);
    res.status(500).json({
      error: 'サーバーエラーが発生しました',
      message: error.message
    });
  }
});