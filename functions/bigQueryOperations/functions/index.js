const { onCall } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { BigQuery } = require('@google-cloud/bigquery');

// Firebase Adminの初期化
initializeApp();

// BigQueryクライアントの初期化
const bigquery = new BigQuery();

/**
 * BigQueryのデータを取得するHTTP関数
 */
exports.queryBigData = onCall({ 
  timeoutSeconds: 300, // タイムアウトを300秒に設定
  cors: true, // CORSを有効化
}, async (request) => {
  try {
    const { query } = request.data;
    
    if (!query) {
      throw new Error('クエリが指定されていません');
    }
    
    console.log(`以下のクエリを実行: ${query}`);
    
    // クエリを実行
    const [rows] = await bigquery.query({
      query,
      // 必要に応じてクエリオプションを追加
      // location: 'asia-northeast1', 必要に応じてロケーション指定
    });
    
    console.log(`取得結果: ${rows.length}行`);
    
    return {
      success: true,
      data: rows,
      rowCount: rows.length
    };
  } catch (error) {
    console.error('BigQueryクエリ実行中にエラーが発生しました:', error);
    
    return {
      success: false,
      error: error.message
    };
  }
});

/**
 * BigQueryにデータを挿入するHTTP関数
 */
exports.insertBigData = onCall({
  timeoutSeconds: 300,
  cors: true,
}, async (request) => {
  try {
    const { datasetId, tableId, rows } = request.data;
    
    if (!datasetId || !tableId || !rows || !Array.isArray(rows)) {
      throw new Error('必要なパラメータ（datasetId, tableId, rows）が不足しています');
    }
    
    console.log(`${datasetId}.${tableId}に${rows.length}行のデータを挿入します`);
    
    // テーブルを参照
    const table = bigquery.dataset(datasetId).table(tableId);
    
    // データを挿入
    const [response] = await table.insert(rows);
    
    return {
      success: true,
      insertedRows: rows.length,
      response
    };
  } catch (error) {
    console.error('BigQueryデータ挿入中にエラーが発生しました:', error);
    
    return {
      success: false,
      error: error.message,
      details: error.errors || []
    };
  }
});

/**
 * BigQueryのデータセットとテーブル情報を取得するHTTP関数
 */
exports.getBigQueryMetadata = onCall({
  timeoutSeconds: 60,
  cors: true,
}, async (request) => {
  try {
    // データセット一覧を取得
    const [datasets] = await bigquery.getDatasets();
    
    const datasetsInfo = await Promise.all(datasets.map(async (dataset) => {
      const [tables] = await dataset.getTables();
      
      return {
        id: dataset.id,
        tables: tables.map(table => ({
          id: table.id,
          fullName: `${dataset.id}.${table.id}`
        }))
      };
    }));
    
    return {
      success: true,
      datasets: datasetsInfo
    };
  } catch (error) {
    console.error('BigQueryメタデータ取得中にエラーが発生しました:', error);
    
    return {
      success: false,
      error: error.message
    };
  }
}); 