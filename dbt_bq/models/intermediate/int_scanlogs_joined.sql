SELECT
    scanlogs.scanlog_id,
    scanlogs.user_id,
    scanlogs.barcode,
    scanlogs.created_at,
    scanlogs.created_date,
    scanlogs.created_week,
    scanlogs.created_month,
    scanlogs.updated_at,
    scanlogs.updated_date,
    users.birth_date,
    users.gender,
    users.gender_jp,
    CASE
        WHEN users.age_at_scanned < 20 THEN '20歳未満'
        WHEN users.age_at_scanned < 30 THEN '20代'
        WHEN users.age_at_scanned < 40 THEN '30代'
        WHEN users.age_at_scanned < 50 THEN '40代'
        WHEN users.age_at_scanned < 60 THEN '50代'
        WHEN users.age_at_scanned < 70 THEN '60代'
        ELSE '70歳以上'
    END AS age_group,
    users.age_at_scanned,
    users.age_at_current,
    users.skin_type,
    users.skin_problems,
    ARRAY_LENGTH(SPLIT(users.skin_problems, ',')) AS skin_problems_cnt,
    products.product_id,
    products.product_name,
    products.company_name,
    products.cosmetic_category,
    products.ingredients,
FROM {{ ref('stg_scanlogs') }} AS scanlogs
LEFT JOIN {{ ref('stg_users') }} AS users
    ON scanlogs.user_id = users.user_id
LEFT JOIN  {{ref('stg_products')}} AS products
    ON scanlogs.barcode = CAST(products.product_id AS INT64)
