SELECT
    id AS user_id,
    birth_date,
    gender,
    CASE
        WHEN gender = 'male' THEN '男性'
        WHEN gender = 'female' THEN '女性'
        ELSE 'その他'
    END AS gender_jp,
    DATE_DIFF(DATE(TIMESTAMP_ADD(created_at, INTERVAL 9 HOUR)), birth_date, YEAR) AS age_at_scanned,
    DATE_DIFF(CURRENT_DATE(), birth_date, YEAR) AS age_at_current,
    TIMESTAMP_ADD(created_at, INTERVAL 9 HOUR) AS created_at,
    DATE(TIMESTAMP_ADD(created_at, INTERVAL 9 HOUR)) AS created_date,
    DATE_TRUNC(TIMESTAMP_ADD(created_at, INTERVAL 9 HOUR), WEEK(MONDAY)) AS created_week,
    DATE_TRUNC(TIMESTAMP_ADD(created_at, INTERVAL 9 HOUR), MONTH) AS created_month,
    TIMESTAMP_ADD(updated_at, INTERVAL 9 HOUR) AS updated_at,
    DATE(TIMESTAMP_ADD(updated_at, INTERVAL 9 HOUR)) AS updated_date,
    skin_type,
    ARRAY_TO_STRING(skin_problems, ',') AS skin_problems,
    ARRAY_TO_STRING(ingredients_to_avoid, ',') AS ingredients_to_avoid,
    ARRAY_TO_STRING(desired_effect, ',') AS desired_effect,
FROM {{ source('app_data', 'users') }}
WHERE
    id != "debuguserid101"