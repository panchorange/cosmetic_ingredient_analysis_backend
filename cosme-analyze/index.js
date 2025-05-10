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
  project: "cosmetic-ingredient-analysis",
  location: "asia-northeast1",
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

async function readProfile(folderPath) {
  try {
    const storage = getStorage();
    const bucket = storage.bucket('cosmetic-ingredient-analysis.firebasestorage.app');
    const filePath = `${folderPath}/profile.txt`;
    const file = bucket.file(filePath);
    const [exists] = await file.exists();
    if (!exists) {
      throw new Error(`プロファイルファイルが見つかりません: ${filePath}`);
    }
    const [content] = await file.download();
    return content.toString('utf-8');
  } catch (error) {
    console.error('プロファイルの読み込み中にエラーが発生しました:', error);
    throw error;
  }
}

/**
 * Vertex AI Geminiを使用してテキスト分析を行う関数
 * @param {string} text - 分析対象のテキスト
 * @returns {Promise<Object>} - 分析結果
 */
async function analyzeWithGemini(ocrText, profileText, barcode) {
  try {
    const generativeModel = vertexAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
    });

    const prompt = `
      あなたはスキンケア製品の成分分析AIです。与えられたOCR結果、バーコード、ユーザープロフィールを元に、製品の成分を分析し、ユーザーの肌質や敏感性に合うかどうかを評価してください。
      
      OCR結果には製品名と検出された成分リストが含まれています
      ${ocrText}
      
      バーコード：${barcode}
      
      重要: 提供されたテキストが化粧品やスキンケア製品でない場合、または化粧品成分が検出できない場合は、以下のフォーマットで返してください：
      {
        "product_name": "識別された製品名または「不明」",
        "analysis_type": "成分分析結果",
        "ingredients": [
          {
            "name": "なし",
            "rating": "評価なし",
            "effect": "成分が検出されませんでした"
          }
        ],
        "overall_assessment": "この製品は化粧品ではないか、成分情報が検出できませんでした。"
      }
      
      化粧品成分が検出された場合は、各成分について分析してください。
      
      ユーザープロフィール：
      ${profileText}
      
      分析結果は以下の形式で、日本語でJSONを返してください。
      コードブロックマーカーやバッククォート、または改行エスケープシーケンスなどを含めず、そのままJSONとして使用できる形式で返してください。
      
      重要: rating（評価）と effect（効果）は必ず日本語で記述し、英語は使わないでください。
      評価は「良好」「やや注意」「不適合」のいずれかを使用してください。
      総合評価（overall_assessment）も必ず日本語で記述してください。
      
      overall_assessmentでは、以下の点を含めて総合的に評価してください。
      ・製品の成分がユーザーの肌タイプ（乾燥、脂性、混合、敏感、普通）に合っているか
      ・製品の成分がユーザーの肌悩み（ニキビ、乾燥、シミ、くすみ、毛穴、しわ/たるみ）に合っているか
      ・ユーザーの希望する効果（保湿、美白、エイジングケア、ニキビケア、毛穴ケア、UVケア）に合致しているか
      ・ユーザーが避けたい成分が含まれていないか
      ・ユーザーの特記事項が考慮されているか
        
      例：
      {
        "product_name": "モイスチャーローション",
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

    const result = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const response = await result.response;
    let response_text = response.candidates[0].content.parts[0].text;
    // コードブロックマーカーやバッククォートを除去
    response_text = response_text.replace(/```json|```|`/g, '').trim();
    return response_text;
  } catch (error) {
    console.error('Gemini分析中にエラーが発生しました:', error);
    throw error;
  }
}

async function saveScanLogToBigQuery({ user_id, product_id, ocr_text, analysis_results }) {
  try {
    const datasetId = 'app_data';
    const tableId = 'scanlogs';

    // 1. 現在の最大IDを取得
    const [rows] = await bigquery.query(`
      SELECT MAX(id) as max_id FROM \`${datasetId}.${tableId}\`
    `);
    const maxId = rows[0].max_id || 0;
    const newId = maxId + 1;

    // 2. 新しいレコードを作成
    const insertRows = [{
      id: newId,
      user_id,
      barcode: product_id,
      ocr_result: ocr_text,
      analysis_result: JSON.stringify(analysis_results),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }];

    // 3. 挿入
    await bigquery.dataset(datasetId).table(tableId).insert(insertRows);
    console.log('scanlogsに保存しました');
  } catch (error) {
    console.error('scanlogs保存エラー:', error);

    // insertErrorsの詳細を出力
    if (error && error.errors) {
      console.error('insertErrors:', JSON.stringify(error.errors, null, 2));
    }
    if (error && error.insertErrors) {
      console.error('insertErrors:', JSON.stringify(error.insertErrors, null, 2));
    }

    throw error;
  }
}

// Flutter側からHTTPリクエストを受け取る
exports.analyzeIngredients = onRequest({
  region: 'asia-northeast1',
  cors: true,
  timeoutSeconds: 300,
}, async (req, res) => {
  try {
    // リクエストボディからデータを取得
    const { folderPath, uid, barcode } = req.body;
    console.log("folderPath, uid:${folderPath}, ${uid}");
    if (!folderPath || !uid) {
      res.status(400).json({
        error: '必要なパラメータが不足しています'
      });
      return;
    }

    // OCR結果を読み込む
    const ocrText = await readOCRResult(folderPath);
    console.log("ocrText: ${ocrText}");

    // ユーザープロフィールを読み込む
    const profileText = await readProfile(folderPath);
    console.log("profileText: ${profileText}");

    // Geminiで分析
    const analysisResult = await analyzeWithGemini(ocrText, profileText, barcode);
    

    // Bigquery:scanlogsに保存
    await saveScanLogToBigQuery({
      user_id: uid,
      product_id: barcode,
      ocr_text: ocrText,
      analysis_results: analysisResult
    });

    // レスポンス
    console.log("ocrText: ${ocrText}");
    console.log("analysisResult: ${analysisResult}");
    res.status(200).json({
      success: true,
      data: {
        ocr_result: ocrText,
        user_profile: profileText,
        analysis_result: analysisResult
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