# 🌟 cosmetic_ingredient_analysis_backend

cosmetic_ingredient_analysisのバックエンド処理(firebase)

## 🎉 アプリの構成概要

このプロジェクトは、**あなたの美容ライフをサポートする**化粧品成分分析システムのバックエンドです！✨

### 🏗️ システム構成

```
🎯 Firebase Functions (Node.js 22)
   ├── 📸 OCR Service - 画像から成分を読み取り
   ├── 🧪 Analysis Service - AI（Vertex AI）で成分を分析
   ├── 💾 Database Service - BigQueryでデータ管理
   ├── 🗄️ Storage Service - 画像やデータの保存
   └── 🤖 Cosmetic Analysis App - 全体を統合制御

🔧 サポートツール
   ├── 📊 dbt（Data Build Tool）- データ変換
   └── 🌐 Firebase Console - デプロイ・監視
```

### 🚀 主な機能

- **📱 画像認識OCR**: Google Cloud Visionで化粧品パッケージから成分を自動抽出
- **🧠 AI成分分析**: Vertex AIを使って個人の肌質に合わせた成分の影響を分析
- **💝 パーソナライズ**: ユーザープロファイルに基づいたカスタム分析
- **📈 データ蓄積**: BigQueryで分析結果を保存・活用
- **⚡ リアルタイム処理**: Firebase Functionsで高速レスポンス

### 🎨 技術スタック

- **🔥 Firebase Functions**: サーバーレスバックエンド
- **🌤️ Google Cloud**: Vision API, Vertex AI, BigQuery
- **📊 dbt**: データ変換とモデリング
- **🎯 Node.js 22**: 最新の実行環境
