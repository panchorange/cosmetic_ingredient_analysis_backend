# cosmetic_ingredient_analysis_backend
cosmetic_ingredient_analysisのバックエンド処理(firebase)

# デプロイ方法
```bash
cd cosme-analyze
firebase deploy --only functions:analyzeIngredients --project cosmetic-ingredient-analysis
```
test

# dbtの設定
1. [GCP]サービスアカウントの発行。IAMで権利を付与。
2. [ローカル]サービスアカウントキーの生成 と配置 (dbt_bq/config/cosmetic-ingredient-analysis_dbt_service_account.json)
3. [ローカル]/ユーザーホーム/.dbt/profiles.yml を作成
