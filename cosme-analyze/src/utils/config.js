/**
 * 共通設定と定数
 * 環境変数から設定を読み込み、デフォルト値をフォールバックとして使用
 */

module.exports = {
  // Firebase Storage設定
  storage: {
    bucketName: process.env.STORAGE_BUCKET_NAME || 'cosmetic-ingredient-analysis.firebasestorage.app'
  },
  
  // BigQuery設定
  bigquery: {
    projectId: process.env.GCP_PROJECT_ID || 'cosmetic-ingredient-analysis',
    datasetId: process.env.BQ_DATASET_ID || 'app_data',
    tables: {
      scanlogs: process.env.BQ_TABLE_SCANLOGS || 'scanlogs',
      products: process.env.BQ_TABLE_PRODUCTS || 'products',
      users: process.env.BQ_TABLE_USERS || 'users'
    }
  },
  
  // VertexAI設定
  vertexAI: {
    project: process.env.GCP_PROJECT_ID || 'cosmetic-ingredient-analysis',
    location: process.env.GCP_LOCATION || 'asia-northeast1',
    model: process.env.GEMINI_MODEL || 'gemini-1.5-flash'
  },
  
  // Firebase Functions設定
  functions: {
    region: process.env.FUNCTION_REGION || 'asia-northeast1',
    timeoutSeconds: parseInt(process.env.FUNCTION_TIMEOUT_SECONDS || '300', 10),
    cors: true
  }
};