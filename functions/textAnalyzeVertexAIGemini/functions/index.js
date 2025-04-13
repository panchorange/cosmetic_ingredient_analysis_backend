const { onObjectFinalized } = require('firebase-functions/v2/storage');
const admin = require('firebase-admin');
const { VertexAI } = require('@google-cloud/vertexai');
const path = require('path');
admin.initializeApp();

exports.textAnalyzeVertexGemini = onObjectFinalized({
  bucket: 'cosmetic-ingredient-analysis.firebasestorage.app',
  eventType: 'google.storage.object.finalize',
  matchPath: '/cosmes/**/ocr_result.txt',  // ocr_result.txtファイルのみ処理
}, async (event) => {
  const file = event.data;
  const fileName = file.name;
  const fileSize = file.size;
  const fileType = file.contentType;

  console.log('アップロードされたファイル: ' + fileName);
  console.log('ファイルサイズ: ' + fileSize);
  console.log('ファイルタイプ: ' + fileType);

  const bucket = admin.storage().bucket();
  const fileObject = bucket.file(fileName);
  
  // ディレクトリパスを取得
  const dirPath = path.dirname(fileName);
  
  try {
    // ocr_result.txtの内容を取得
    const ocrFileContents = await fileObject.download();
    const ocrText = ocrFileContents.toString('utf-8');
    
    // 同じディレクトリにあるprofile.txtを読み込む
    const profileFileName = `${dirPath}/profile.txt`;
    const profileFileObject = bucket.file(profileFileName);
    
    let profileText = '';
    try {
      const profileFileContents = await profileFileObject.download();
      profileText = profileFileContents.toString('utf-8');
      console.log('プロファイルファイルを読み込みました: ' + profileFileName);
    } catch (profileError) {
      console.warn('プロファイルファイルが見つからないか読み込めません: ', profileError);
      profileText = 'プロファイル情報がありません';
    }

    // Google Vertex AI の設定
    const projectId = 'cosmetic-ingredient-analysis'; // あなたのGCPプロジェクトIDを設定
    const location = 'us-central1'; // 適切なロケーションを設定
    const vertexAI = new VertexAI({project: projectId, location: location});
    
    // Gemini 1.5 Flash モデルのインスタンスを取得
    const generativeModel = vertexAI.preview.getGenerativeModel({
      model: 'gemini-1.5-flash',
    });

    // プロンプトの作成 - OCR結果とプロファイルを別々に指定
    const prompt = `
あなたはスキンケア製品の成分分析AIです。与えられたOCR結果とユーザープロフィールを元に、製品の成分を分析し、ユーザーの肌質や敏感性に合うかどうかを評価してください。

OCR結果には製品名と検出された成分リストが含まれています。各成分について：
${ocrText}

を分析してください。

ユーザープロフィール：
${profileText}

分析結果は以下の形式で、日本語でJSONを返してください。
コードブロックマーカーやバッククォート、または改行エスケープシーケンスなどを含めず、そのままJSONとして使用できる形式で返してください。

重要: rating（評価）と effect（効果）は必ず日本語で記述し、英語は使わないでください。
評価は「良好」「やや注意」「不適合」のいずれかを使用してください。
総合評価（overall_assessment）も必ず日本語で記述してください。

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
    },
    {
      "name": "パラベン",
      "rating": "やや注意",
      "effect": "防腐剤。敏感肌の方は注意が必要です"
    },
    {
      "name": "香料",
      "rating": "不適合",
      "effect": "人工香料にアレルギー反応がある可能性があります"
    }
  ],
  "overall_assessment": "この製品は基本的な保湿成分は優れていますが、含有されている防腐剤と香料が肌質に合わない可能性があります。無香料タイプを検討されることをお勧めします。"
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

    // 結果を整形されたJSONとして保存 (インデント付き)
    const outputFileName = fileName.replace('ocr_result.txt', 'analysis_result.json');
    const outputFile = bucket.file(outputFileName);
    await outputFile.save(JSON.stringify(resultJson, null, 2), {
      contentType: 'application/json',
      metadata: { contentDisposition: 'attachment' },
    });

    console.log('整形済みJSONファイルが保存されました: ' + outputFileName);
  } catch (error) {
    // エラー情報のログ出力
    console.error('エラーが発生しました: ', error);
    console.error('ファイル処理に失敗: ' + fileName);
  }

  return null;
});