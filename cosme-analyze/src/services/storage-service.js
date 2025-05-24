/**
 * Firebase Storageとの連携を担当するクラス
 */

const { getStorage } = require('firebase-admin/storage');
const config = require('../utils/config');

class StorageService {
  constructor() {
    this.storage = getStorage();
    this.bucketName = config.storage.bucketName;
  }

  /**
   * 指定されたパスからテキストファイルを読み込む
   * @param {string} folderPath - ファイルが格納されているフォルダパス
   * @param {string} fileName - ファイル名
   * @returns {Promise<string>} - ファイルの内容
   */
  async readTextFile(folderPath, fileName) {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const filePath = `${folderPath}/${fileName}`;
      const file = bucket.file(filePath);

      const [exists] = await file.exists();
      if (!exists) {
        throw new Error(`ファイルが見つかりません: ${filePath}`);
      }

      const [content] = await file.download();
      return content.toString('utf-8');
    } catch (error) {
      console.error(
        `ファイル読み込み中にエラーが発生しました (${fileName}):`,
        error
      );
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

module.exports = StorageService;
