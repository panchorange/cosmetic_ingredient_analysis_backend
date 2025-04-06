const { onObjectFinalized } = require('firebase-functions/v2/storage');
const { getStorage } = require('firebase-admin/storage');
const { initializeApp } = require('firebase-admin/app');
const vision = require('@google-cloud/vision');
const path = require('path');

// Initialize Firebase Admin
initializeApp();

exports.onImageUpload = onObjectFinalized({
  bucket: 'cosmetic-ingredient-analysis.firebasestorage.app',
  eventType: 'google.storage.object.finalize',
  matchPath: '/cosmes/**',
}, async (event) => {
  try {
    console.log(`処理開始: ${event.data.name}`);
    
    // アップロードされた画像のパスを取得
    const filePath = event.data.name;
    const fileExtension = path.extname(filePath);
    
    // 画像ファイルかどうかを確認
    if (!event.data.contentType.startsWith('image/')) {
      console.log('画像ファイルではないためスキップします');
      return null;
    }
    
    // Cloud Vision APIクライアントを初期化
    const visionClient = new vision.ImageAnnotatorClient();
    
    // Firebaseストレージから画像のURLを取得
    const storage = getStorage();
    const bucket = storage.bucket(event.data.bucket);
    const file = bucket.file(filePath);
    
    // Google Cloud Vision APIでテキスト検出を実行
    console.log('テキスト検出を開始します');
    const [textDetection] = await visionClient.textDetection(`gs://${event.data.bucket}/${filePath}`);
    const detectedText = textDetection.fullTextAnnotation ? textDetection.fullTextAnnotation.text : '';
    
    console.log('検出されたテキスト:', detectedText);
    
    // 出力ファイル名を作成（拡張子をtxtに変更）
    const outputFileName = filePath.replace(fileExtension, '.txt');
    
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