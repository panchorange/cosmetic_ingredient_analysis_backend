SELECT
    id AS product_id,
    product_name,
    company_name,
    category AS cosmetic_category,
    ARRAY_TO_STRING(ingredients, ',') AS ingredients,
    TIMESTAMP_ADD(created_at, INTERVAL 9 HOUR) AS created_at,
    DATE(TIMESTAMP_ADD(created_at, INTERVAL 9 HOUR)) AS created_date,
    DATE_TRUNC(TIMESTAMP_ADD(created_at, INTERVAL 9 HOUR), WEEK(MONDAY)) AS created_week,
    DATE_TRUNC(TIMESTAMP_ADD(created_at, INTERVAL 9 HOUR), MONTH) AS created_month,
    TIMESTAMP_ADD(updated_at, INTERVAL 9 HOUR) AS updated_at,
    DATE(TIMESTAMP_ADD(updated_at, INTERVAL 9 HOUR)) AS updated_date
FROM  {{ source('app_data', 'products') }} 