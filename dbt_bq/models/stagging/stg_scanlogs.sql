SELECT
    id AS scanlog_id,
    user_id,
    barcode,
    TIMESTAMP_ADD(created_at, INTERVAL 9 HOUR) AS created_at,
    DATE(TIMESTAMP_ADD(created_at, INTERVAL 9 HOUR)) AS created_date,
    DATE_TRUNC(TIMESTAMP_ADD(created_at, INTERVAL 9 HOUR), WEEK(MONDAY)) AS created_week,
    DATE_TRUNC(TIMESTAMP_ADD(created_at, INTERVAL 9 HOUR), MONTH) AS created_month,
    TIMESTAMP_ADD(updated_at, INTERVAL 9 HOUR) AS updated_at,
    DATE(TIMESTAMP_ADD(updated_at, INTERVAL 9 HOUR)) AS updated_date
FROM {{ source('app_data', 'scanlogs') }}
WHERE
    LENGTH(CAST(barcode AS STRING)) = 13
AND
    user_id IS NOT NULL
AND
    DATE(TIMESTAMP_ADD(created_at, INTERVAL 9 HOUR)) >= DATE(2025, 5, 1)