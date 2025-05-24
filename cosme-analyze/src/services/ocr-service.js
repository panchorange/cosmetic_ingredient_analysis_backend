/**
 * OCR処理を担当するクラス
 */

const vision = require('@google-cloud/vision');
const { Storage } = require('@google-cloud/storage');
const config = require('../utils/config');

class OcrService {
  constructor() {
    this.visionClient = new vision.ImageAnnotatorClient();
    this.storage = new Storage();
    this.bucketName = config.storage.bucketName;
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
      const detectedText = textDetection.fullTextAnnotation
        ? textDetection.fullTextAnnotation.text
        : '';
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
      const resultFile = this.storage
        .bucket(this.bucketName)
        .file(`${folderPath}/ocr_result.txt`);
      await resultFile.save(text, { contentType: 'text/plain' });
      console.log('OCR結果を保存しました');
    } catch (error) {
      console.error('OCR結果の保存中にエラーが発生しました:', error);
      throw error;
    }
  }
}

module.exports = OcrService;
