/**
 * 化粧品成分分析バックエンドシステム
 * Firebase Functionsを使用して、OCR、成分分析、データ保存を行うアプリケーション
 */

// 必要なライブラリのインポート
const { initializeApp } = require('firebase-admin/app');
const { onRequest } = require('firebase-functions/v2/https');

// サービスモジュールと設定のインポート
const CosmeticAnalysisApp = require('./services/cosmetic-analysis-app');
const config = require('./utils/config');

// Firebase Adminの初期化
initializeApp();

// Firebase Function
exports.analyzeIngredients = onRequest({
  region: config.functions.region,
  cors: config.functions.cors,
  timeoutSeconds: config.functions.timeoutSeconds,
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