/**
 * データベース操作を担当するクラス
 */

const { BigQuery } = require('@google-cloud/bigquery');
const config = require('../utils/config');

class DatabaseService {
  constructor() {
    this.bigquery = new BigQuery();
    this.datasetId = config.bigquery.datasetId;
    this.tables = config.bigquery.tables;
    this.projectId = config.bigquery.projectId;
  }

  /**
   * スキャンログをBigQueryに保存する
   * @param {Object} params - スキャンログパラメータ
   * @param {string} params.user_id - ユーザーID
   * @param {string} params.product_id - 製品ID (バーコード)
   * @param {string} params.ocr_text - OCR結果
   * @param {string} params.analysis_results - 分析結果
   * @returns {Promise<void>}
   */
  async saveScanLog(params) {
    try {
      const { user_id, product_id, ocr_text, analysis_results } = params;
      const tableId = this.tables.scanlogs;

      // 現在の最大IDを取得
      const [rows] = await this.bigquery.query(`
        SELECT MAX(id) as max_id FROM \`${this.datasetId}.${tableId}\`
      `);
      const maxId = rows[0].max_id || 0;
      const newId = maxId + 1;

      // 新しいレコードを作成
      const insertRows = [
        {
          id: newId,
          user_id: user_id,
          barcode: product_id,
          ocr_result: ocr_text,
          analysis_result: analysis_results,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      // 挿入
      await this.bigquery
        .dataset(this.datasetId)
        .table(tableId)
        .insert(insertRows);
      console.log('scanlogsに保存しました');
    } catch (error) {
      console.error('scanlogs保存エラー:', error);
      this.logInsertErrors(error);
      throw error;
    }
  }

  /**
   * 製品データをBigQueryに保存する
   * @param {string} analysisResult - 分析結果 (JSON文字列)
   * @param {string} barcode - バーコード
   * @returns {Promise<void>}
   */
  async saveProductData(analysisResult, barcode) {
    try {
      const tableId = this.tables.products;

      // 製品がテーブルに存在するか確認
      const [rows] = await this.bigquery.query(`
        SELECT id FROM \`${this.projectId}.${this.datasetId}.${tableId}\` 
        WHERE id = '${barcode}'
      `);

      if (rows.length >= 1) {
        console.log('製品はすでに存在します。INSERTをスキップします。');
        return;
      }

      // 文字列の場合はJSONにパース
      const analysisObj =
        typeof analysisResult === 'string'
          ? JSON.parse(analysisResult)
          : analysisResult;
      const ingredientNames = analysisObj.ingredients.map(
        (ingredient) => ingredient.name
      );

      const insertRow = {
        id: barcode,
        product_name: analysisObj.product_name,
        company_name: analysisObj.company_name,
        category: analysisObj.category,
        ingredients: ingredientNames,
        price_infered_without_tax: analysisObj.price_infered_without_tax_yen,
        is_cosme: analysisObj.is_cosme,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // 挿入
      await this.bigquery
        .dataset(this.datasetId)
        .table(tableId)
        .insert([insertRow]);
      console.log('製品データをBigQueryに保存しました');
    } catch (error) {
      console.error('BigQueryへの挿入エラー(製品テーブル):', error);
      throw error;
    }
  }

  /**
   * ユーザープロファイルをBigQueryに保存する
   * @param {Object} userProfileJson - ユーザープロファイル
   * @returns {Promise<void>}
   */
  async saveUserProfile(userProfileJson) {
    try {
      const tableId = this.tables.users;

      // 既存ユーザー確認
      const [rows] = await this.bigquery.query(`
        SELECT id FROM \`${this.projectId}.${this.datasetId}.${tableId}\` 
        WHERE id = '${userProfileJson.uid}'
      `);

      if (rows.length >= 1) {
        console.log('ユーザーはすでに存在します。INSERTをスキップします。');
        return;
      }

      // データ整形 - ARRAY型に合わせて修正
      const insertRow = this.formatUserProfileForInsert(userProfileJson);

      // 挿入
      await this.bigquery
        .dataset(this.datasetId)
        .table(tableId)
        .insert([insertRow]);
      console.log('ユーザープロフィールをBigQueryに保存しました');
    } catch (error) {
      console.error('BigQueryへの挿入エラー(ユーザーテーブル):', error);
      this.logInsertErrors(error);
      throw error;
    }
  }

  /**
   * ユーザープロファイルの存在確認
   * @param {Object} userProfileJson - ユーザープロファイル
   * @returns {Promise<number>} - 存在する場合は1、しない場合は0
   */
  async checkUserExists(userProfileJson) {
    try {
      const tableId = this.tables.users;
      const query = `
        SELECT id 
        FROM \`${this.projectId}.${this.datasetId}.${tableId}\` 
        WHERE id = '${userProfileJson.uid}'
      `;

      const [rows] = await this.bigquery.query(query);
      return rows.length;
    } catch (error) {
      console.error('ユーザー存在確認中にエラーが発生しました:', error);
      throw error;
    }
  }

  /**
   * ユーザープロファイルをBigQuery用に整形する
   * @param {Object} userProfileJson - 元のユーザープロファイル
   * @returns {Object} - 整形済みのユーザープロファイル
   */
  formatUserProfileForInsert(userProfileJson) {
    return {
      id: userProfileJson['uid'],
      birth_date: userProfileJson['birth_date']
        ? userProfileJson['birth_date'].slice(0, 10)
        : null,
      gender: userProfileJson['gender'] || null,
      skin_type: userProfileJson['skin_type'] || null,

      skin_problems: Array.isArray(userProfileJson['skin_problems'])
        ? userProfileJson['skin_problems']
        : userProfileJson['skin_problems']
          ? [userProfileJson['skin_problems']]
          : [],

      ingredients_to_avoid: Array.isArray(
        userProfileJson['ingredients_to_avoid']
      )
        ? userProfileJson['ingredients_to_avoid']
        : userProfileJson['ingredients_to_avoid']
          ? [userProfileJson['ingredients_to_avoid']]
          : [],

      desired_effect: Array.isArray(userProfileJson['desired_effect'])
        ? userProfileJson['desired_effect']
        : userProfileJson['desired_effect']
          ? [userProfileJson['desired_effect']]
          : [],

      user_memo: userProfileJson['note'] || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * BigQueryの挿入エラーを詳細にログ出力する
   * @param {Error} error - エラーオブジェクト
   */
  logInsertErrors(error) {
    if (error && error.errors) {
      console.error('insertErrors:', JSON.stringify(error.errors, null, 2));
    }
    if (error && error.response && error.response.insertErrors) {
      console.error(
        'insertErrors詳細:',
        JSON.stringify(error.response.insertErrors, null, 2)
      );
    }
  }
}

module.exports = DatabaseService;
