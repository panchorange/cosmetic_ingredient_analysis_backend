const { onObjectFinalized } = require('firebase-functions/v2/storage');
const { VertexAI } = require('@google-cloud/vertexai');
const vision = require('@google-cloud/vision');
const { getStorage } = require('firebase-admin/storage');
const { initializeApp } = require('firebase-admin/app');
const path = require('path');

// Firebase Adminを初期化
initializeApp();

// 画像アップロード時のOCR処理
exports.onImageUpload = onObjectFinalized({
  bucket: 'cosmetic-ingredient-analysis.firebasestorage.app',
  eventType: 'google.storage.object.finalize',
  matchPath: 'scanlog/**/ocr_source.{jpg,jpeg,png,gif,bmp,webp}', // 画像ファイル(ocr_source)のみマッチ
}, async (event) => {
  try {
    console.log(`処理開始: ${event.data.name}`);
    
    // アップロードされた画像のパスを取得
    const filePath = event.data.name;
    
    // 画像ファイルかどうかを確認
    if (!event.data.contentType.startsWith('image/')) {
      console.log('画像ファイルではないためスキップします');
      return null;
    }
    
    // 出力先のファイルパスを生成
    const dirName = path.dirname(filePath);
    const outputFileName = path.join(dirName, 'ocr_result.txt');
    
    // Firebaseストレージを初期化
    const storage = getStorage();
    const bucket = storage.bucket(event.data.bucket);
    
    // ocr_result.txtが既に存在するか確認
    const [exists] = await bucket.file(outputFileName).exists();
    if (exists) {
      console.log(`${outputFileName} は既に存在するためOCR処理をスキップします`);
      return null;
    }
    
    // Cloud Vision APIクライアントを初期化
    const visionClient = new vision.ImageAnnotatorClient();
    
    // Google Cloud Vision APIでテキスト検出を実行
    console.log('テキスト検出を開始します');
    const [textDetection] = await visionClient.textDetection(`gs://${event.data.bucket}/${filePath}`);
    const detectedText = textDetection.fullTextAnnotation ? textDetection.fullTextAnnotation.text : '';
    
    console.log('検出されたテキスト:', detectedText);
    
    // テキストファイルをアップロード
    await bucket.file(outputFileName).save(detectedText, {
      contentType: 'text/plain',
      metadata: {
        customMetadata: {
          originalImage: filePath,
          processedAt: new Date().toISOString()
        }
      }
    });
    
    console.log(`テキスト抽出完了: ${outputFileName}`);
    return null;
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
    return null;
  }
});

// OCRテキスト分析処理
exports.textAnalyzeVertexGemini = onObjectFinalized({
  bucket: 'cosmetic-ingredient-analysis.firebasestorage.app',
  eventType: 'google.storage.object.finalize',
  matchPath: 'scanlog/**/ocr_result.txt',  // ocr_result.txtファイルのみ処理
  memory: '512MiB', // メモリ制限を512MiBに増やす
}, async (event) => {
  const file = event.data;
  const fileName = file.name;
  const fileSize = file.size;
  const fileType = file.contentType;

  console.log('アップロードされたファイル: ' + fileName);
  console.log('ファイルサイズ: ' + fileSize);
  console.log('ファイルタイプ: ' + fileType);

  // ocr_result.txtが存在するか確認（関数のトリガー設定で既に確認しているが、念のため）
  if (!fileName.endsWith('ocr_result.txt')) {
    console.log('ocr_result.txtファイルではないため処理を中止します');
    return { error: 'ocr_result.txtファイルではありません' };
  }

  const storage = getStorage();
  const bucket = storage.bucket(event.data.bucket);
  const fileObject = bucket.file(fileName);
  
  // ファイルが実際に存在するか確認
  try {
    const [exists] = await fileObject.exists();
    if (!exists) {
      console.log('OCR結果ファイルが存在しないため、処理を中止します');
      return { error: 'OCR結果ファイルが見つかりません' };
    }
  } catch (existsError) {
    console.error('ファイル存在確認エラー: ', existsError);
    return { error: 'ファイル存在確認に失敗しました' };
  }
  
  // ディレクトリパスを取得
  const dirPath = path.dirname(fileName);
  
  try {
    // ocr_result.txtの内容を取得
    let ocrText;
    try {
      const [ocrFileContents] = await fileObject.download();
      ocrText = ocrFileContents.toString('utf-8');
    } catch (downloadError) {
      console.error('OCR結果ファイルのダウンロードに失敗しました: ', downloadError);
      return { error: 'OCR結果ファイルの読み込みに失敗しました' };
    }
    
    // ocr_result.txtが空または有効なテキストがない場合は処理をスキップ
    if (!ocrText || ocrText.trim() === '') {
      console.log('OCR結果が空のため、分析処理をスキップします');
      return { error: 'OCR結果が空です' };
    }
    
    // 同じディレクトリにあるprofile.txtを読み込む
    const profileFileName = `${dirPath}/profile.txt`;
    const profileFileObject = bucket.file(profileFileName);
    
    // profile.txtの存在確認
    const [profileExists] = await profileFileObject.exists();
    if (!profileExists) {
      console.log('プロファイルファイルが存在しないため、分析処理をスキップします');
      return { error: 'プロファイルファイルが見つかりません' };
    }
    
    let profileText = '';
    try {
      const [profileFileContents] = await profileFileObject.download();
      profileText = profileFileContents.toString('utf-8');
      
      // profile.txtが空の場合も処理をスキップ
      if (!profileText || profileText.trim() === '') {
        console.log('プロファイル情報が空のため、分析処理をスキップします');
        return { error: 'プロファイル情報が空です' };
      }
      
      console.log('プロファイルファイルを読み込みました: ' + profileFileName);
    } catch (profileError) {
      console.warn('プロファイルファイルが読み込めません: ', profileError);
      return { error: 'プロファイルファイルの読み込みに失敗しました' };
    }

    // Google Vertex AI の設定
    const projectId = 'cosmetic-ingredient-analysis'; // GCPプロジェクトID
    const location = 'us-central1'; // ロケーション
    const vertexAI = new VertexAI({project: projectId, location: location});
    
    // Gemini 2.0 Flash モデルのインスタンスを取得
    const generativeModel = vertexAI.preview.getGenerativeModel({
      model: 'gemini-2.0-flash',
    });

    // プロンプトの作成 - OCR結果とプロファイルを別々に指定
    const prompt = `
あなたはスキンケア製品の成分分析AIです。与えられたOCR結果とユーザープロフィールを元に、製品の成分を分析し、ユーザーの肌質や敏感性に合うかどうかを評価してください。

OCR結果には製品名と検出された成分リストが含まれています：
${ocrText}

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

    // Vertex AI Gemini API を呼び出し
    const result = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    
    const response = result.response;
    const textResponse = response.candidates[0].content.parts[0].text;
    
    // レスポンステキストをJSONに変換
    let resultJson;
    try {
      // コードブロックマーカーやエスケープシーケンスを取り除く処理
      let cleanedResponse = textResponse;
      
      // バッククォートとcodeブロックの削除
      cleanedResponse = cleanedResponse.replace(/```json|```|`/g, '');
      
      // 前後の空白を削除
      cleanedResponse = cleanedResponse.trim();
      
      resultJson = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.log('JSONのパースに失敗しました。テキストをそのまま保存します: ', parseError);
      resultJson = { response: textResponse };
    }

    console.log('分析結果JSON:', JSON.stringify(resultJson, null, 2));
    
    // analysis_result.jsonをストレージに保存せず、関数の戻り値として返す
    return resultJson;
    
  } catch (error) {
    // エラー情報のログ出力
    console.error('エラーが発生しました: ', error);
    console.error('ファイル処理に失敗: ' + fileName);
    return { error: error.message };
  }
});