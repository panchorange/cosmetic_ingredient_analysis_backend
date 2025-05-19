const { initializeApp } = require('firebase-admin/app');
const vision = require('@google-cloud/vision');
const { getStorage } = require('firebase-admin/storage');
const { onRequest } = require('firebase-functions/v2/https');
const { BigQuery } = require('@google-cloud/bigquery');
const { VertexAI } = require('@google-cloud/vertexai');
const { Storage } = require('@google-cloud/storage');

// Firebase Adminを初期化
initializeApp();

// BigQueryクライアントを初期化
const bigquery = new BigQuery();

// Cloud Vision APIクライアントを初期化
const visionClient = new vision.ImageAnnotatorClient();

// Vertex AIクライアントを初期化
const vertexAI = new VertexAI({
  project: "cosmetic-ingredient-analysis",
  location: "asia-northeast1",
});

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
async function analyzeCosmeIngredients(ocrText, profileText, barcode) {
  try {
    const generativeModel = vertexAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
    });

    const prompt = `
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

    const result = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    console.log(`result(gemini): ${result}`);

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
      user_id: user_id,
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

async function lengthUserProfileAtBigQuery(userProfileJson) {
  const datasetId = 'app_data';
  const tableId = 'users';

  console.log('lengthUserProfileAtBigQuery');
  console.log('Debug - userProfileJson:', JSON.stringify(userProfileJson, null, 2));
  console.log('Debug - userProfileJson.uid:', userProfileJson?.uid);
  const query = `
    SELECT id 
    FROM \`cosmetic-ingredient-analysis.${datasetId}.${tableId}\` 
    WHERE id = '${userProfileJson.uid}'
  `;

  const [rows] = await bigquery.query(query);
  return rows.length;
}

// 製品データをBigQueryに保存
async function saveProductDataToBigQuery(analysisResult, barcode) {
  const datasetId = 'app_data';
  const tableId = 'products';

  console.log('saveProductDataToBigQuery');
  console.log('Debug - analysisResult:', JSON.stringify(analysisResult, null, 2));
  console.log('Debug - barcode:', barcode);


  // 1 製品がテーブルに存在するか確認
  const [rows] = await bigquery.query(`
    SELECT id FROM \`cosmetic-ingredient-analysis.${datasetId}.${tableId}\` 
    WHERE id = '${barcode}'
  `);

  if (rows.length >= 1) {
    console.log('製品はすでに存在します。INSERTをスキップします。');
    return;
  }

  console.log('saveProductDataToBigQuery 2');
  console.log("typeof: analysisResult:", typeof analysisResult);
  analysisResult = JSON.parse(analysisResult);
  console.log('parsed analysisResult:', analysisResult);
  console.log("typeof: barcode:", typeof barcode);
  const ingredientNames = analysisResult.ingredients.map(ingredient => ingredient.name);
  console.log('抽出された成分名:', ingredientNames);

  const insertRow = {
    id: barcode,
    product_name: analysisResult.product_name,
    company_name: analysisResult.company_name,
    category: analysisResult.category,
    ingredients: ingredientNames,
    price_infered_without_tax: analysisResult.price_infered_without_tax_yen,
    is_cosme: analysisResult.is_cosme,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    // 3. insert
    await bigquery.dataset(datasetId).table(tableId).insert([insertRow]);
    console.log('製品データをBigQueryに保存しました');
  } catch (error) {
    console.error('BigQueryへの挿入エラー(製品テーブル):', error);
    throw error;
  }
}
// ユーザープロフィールをBigQueryに保存
async function saveUserProfileToBigQuery(userProfileJson) {
  const datasetId = 'app_data';
  const tableId = 'users';

  console.log('Debug - userProfileJson:', JSON.stringify(userProfileJson, null, 2));
  console.log('Debug - userProfileJson.uid:', userProfileJson?.uid);

  // 1. 既存ユーザー確認
  console.log('saveUserProfileToBigQuery');
  const [rows] = await bigquery.query(`
    SELECT id FROM \`cosmetic-ingredient-analysis.${datasetId}.${tableId}\` 
    WHERE id = '${userProfileJson.uid}'
  `);

  console.log('rows.length:', rows.length);

  if (rows.length >= 1) {
    console.log('User already exists, skipping insert.');
    return;
  }

  // 2. データ整形 - ARRAY型に合わせて修正
  const insertRow = {
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
  
  // エラーハンドリングを強化
  try {
    // 3. insert
    await bigquery.dataset(datasetId).table(tableId).insert([insertRow]);
    console.log('ユーザープロフィールをBigQueryに保存しました');
  } catch (error) {
    console.error('BigQueryへの挿入エラー(ユーザーテーブル):', error);
    
    // エラーの詳細情報を出力
    if (error.errors) {
      error.errors.forEach((err, i) => {
        console.error(`エラー ${i}:`, err);
      });
    }
    if (error.response && error.response.insertErrors) {
      console.error('挿入エラー詳細:', JSON.stringify(error.response.insertErrors, null, 2));
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
    const { firebaseFolderPath, barcode, userProfileJson } = req.body;
    console.log(`firebaseFolderPath, barcode, userProfileJson:${firebaseFolderPath}, ${barcode}, ${userProfileJson}`);
    if (!firebaseFolderPath || !barcode || !userProfileJson) {
      res.status(400).json({
        error: '必要なパラメータが不足しています'
      });
      return;
    }
    console.log("barcode(関数開始):", barcode);

    // OCR結果を読み込む
    const ocrText = await getOcrResult(firebaseFolderPath);
    console.log(`ocrText: ${ocrText}`);

    // ユーザープロフィールを読み込む
    const profileText = await readProfile(firebaseFolderPath);
    console.log(`profileText: ${profileText}`);

    // プロフィール情報

    // Geminiで分析
    const analysisResult = await analyzeCosmeIngredients(
      ocrText,
      profileText,
      barcode
    );
    console.log(`analysisResult: ${analysisResult}`);
    console.log(`typeof: analysisResult: ${typeof analysisResult}`);
    
    // Bigquery:scanlogsに保存
    await saveScanLogToBigQuery({
      user_id: userProfileJson.uid,
      product_id: barcode,
      ocr_text: ocrText,
      analysis_results: analysisResult
    });

    user_length = await lengthUserProfileAtBigQuery(userProfileJson);
    console.log(`user_length: ${user_length}`);
    console.log(`userProfileJson['uid']: ${userProfileJson['uid']}`);
    if (user_length === 0) {
      await saveUserProfileToBigQuery(userProfileJson);
    }

     // レスポンス
    console.log(`analysisResult(JSON.stringify): ${JSON.stringify(analysisResult)}`);
    console.log(`typeof: analysisResult: ${typeof analysisResult}`);
    await saveProductDataToBigQuery(
      analysisResult, barcode
    );
  


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

async function getOcrResult(firebaseFolderPath) {
  // 画像ファイルのStorageパス
  const storage = new Storage();
  const bucketName = 'cosmetic-ingredient-analysis.firebasestorage.app';
  const filePath = `${firebaseFolderPath}/ocr_source.jpg`;
  const gcsUri = `gs://${bucketName}/${filePath}`;

  // OCR実行
  console.log('テキスト検出を開始します');
  const [textDetection] = await visionClient.textDetection(gcsUri);
  const detectedText = textDetection.fullTextAnnotation ? textDetection.fullTextAnnotation.text : '';
  console.log('検出されたテキスト:', detectedText);

  // OCR結果をStorageに保存（必要なら）
  const resultFile = storage.bucket(bucketName).file(`${firebaseFolderPath}/ocr_result.txt`);
  await resultFile.save(detectedText, { contentType: 'text/plain' });

  return detectedText;
}

