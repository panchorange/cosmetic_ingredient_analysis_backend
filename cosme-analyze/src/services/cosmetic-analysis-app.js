/**
 * アプリケーション全体のオーケストレーションを担当するクラス
 */

const OcrService = require('./ocr-service');
const StorageService = require('./storage-service');
const AnalysisService = require('./analysis-service');
const DatabaseService = require('./database-service');

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

module.exports = CosmeticAnalysisApp;