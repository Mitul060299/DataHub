"""Golden tests for cookbook SQL recipes (sections A-H, I, J, K).

Each test:
  1. Creates an in-memory DuckDB connection.
  2. Seeds a minimal fixture table.
  3. Runs the cookbook SQL (with <input> replaced by the fixture table).
  4. Asserts the query doesn't error, returns at least one row, and has
     the expected output columns.

These tests catch regressions where a recipe SQL is syntactically wrong
for the DuckDB version used in production.
"""

import datetime
import unittest

import duckdb


# ── helpers ──────────────────────────────────────────────────────────────────

def _conn():
    """Fresh in-memory DuckDB connection."""
    return duckdb.connect(":memory:")


def _col_names(rel) -> list[str]:
    return [d[0].lower() for d in rel.description]


# ═════════════════════════════════════════════════════════════════════════════
# Section I — Advanced Analytics
# ═════════════════════════════════════════════════════════════════════════════

class TestAnalyticsRecipesI(unittest.TestCase):
    """SQL recipes from Section I — executes on real DuckDB in-memory."""

    # ── I1 Welch t-test ───────────────────────────────────────────────────

    def test_i1_welch_ttest(self):
        con = _conn()
        con.execute("""
            CREATE TABLE ab AS
            SELECT 'A' AS "group", v::DOUBLE AS "metric"
            FROM (VALUES (10),(12),(9),(11),(13)) t(v)
            UNION ALL
            SELECT 'B', v FROM (VALUES (7),(8),(6),(9),(7)) t(v)
        """)
        result = con.execute("""
            WITH s AS (
              SELECT "group", AVG("metric") AS mean, VAR_SAMP("metric") AS var,
                     COUNT(*) AS n FROM ab WHERE "group" IN ('A','B') GROUP BY 1
            ), a AS (SELECT * FROM s WHERE "group"='A'),
               b AS (SELECT * FROM s WHERE "group"='B')
            SELECT a.mean - b.mean AS mean_diff,
                   (a.mean - b.mean) / SQRT(a.var/a.n + b.var/b.n) AS t_statistic,
                   a.n + b.n - 2 AS approx_df
            FROM a CROSS JOIN b
        """)
        rows = result.fetchall()
        self.assertEqual(len(rows), 1)
        t_stat = rows[0][1]
        self.assertGreater(t_stat, 0)

    # ── I2 Chi-square ─────────────────────────────────────────────────────

    def test_i2_chi_square_2x2(self):
        con = _conn()
        # 100 rows: x in {A,B}, y in {Y,N}
        con.execute("""
            CREATE TABLE ct_data AS
            SELECT x, y FROM (VALUES
              ('A','Y'),('A','Y'),('A','Y'),('A','N'),('A','N'),
              ('B','Y'),('B','N'),('B','N'),('B','N'),('B','N')
            ) t(x,y)
        """)
        result = con.execute("""
            WITH ct AS (
              SELECT
                SUM(CASE WHEN "x"='A' AND "y"='Y' THEN 1 ELSE 0 END) AS a,
                SUM(CASE WHEN "x"='A' AND "y"='N' THEN 1 ELSE 0 END) AS b,
                SUM(CASE WHEN "x"='B' AND "y"='Y' THEN 1 ELSE 0 END) AS c,
                SUM(CASE WHEN "x"='B' AND "y"='N' THEN 1 ELSE 0 END) AS d,
                COUNT(*) AS n FROM ct_data
            )
            SELECT n * POWER(a*d - b*c, 2) * 1.0 /
                   ((a+b)*(c+d)*(a+c)*(b+d)) AS chi_square FROM ct
        """)
        rows = result.fetchall()
        self.assertEqual(len(rows), 1)
        self.assertIsNotNone(rows[0][0])

    # ── I4 Cohort retention ───────────────────────────────────────────────

    def test_i4_cohort_retention(self):
        con = _conn()
        con.execute("""
            CREATE TABLE events AS
            SELECT u, d::DATE AS "event_date", u AS "user_id"
            FROM (VALUES
              (1, '2024-01-01'), (1, '2024-01-08'), (1, '2024-01-15'),
              (2, '2024-01-01'), (2, '2024-01-08'),
              (3, '2024-01-08'), (3, '2024-01-15')
            ) t(u, d)
        """)
        result = con.execute("""
            WITH first_seen AS (
              SELECT "user_id", DATE_TRUNC('week', MIN("event_date")) AS cohort_week
              FROM events GROUP BY 1
            ),
            cohort_size AS (
              SELECT cohort_week, COUNT(DISTINCT "user_id") AS cohort_users
              FROM first_seen GROUP BY 1
            ),
            retained AS (
              SELECT f.cohort_week,
                     DATE_DIFF('week', f.cohort_week, e."event_date") AS week_offset,
                     COUNT(DISTINCT e."user_id") AS retained_users
              FROM first_seen f
              JOIN events e USING ("user_id")
              GROUP BY 1, 2
            )
            SELECT r.cohort_week, r.week_offset,
                   r.retained_users * 1.0 / cs.cohort_users AS retention
            FROM retained r
            JOIN cohort_size cs ON r.cohort_week = cs.cohort_week
            ORDER BY 1, 2
        """)
        rows = result.fetchall()
        self.assertGreater(len(rows), 0)
        cols = _col_names(result)
        self.assertIn("retention", cols)

    # ── I5 Funnel conversion ──────────────────────────────────────────────

    def test_i5_funnel(self):
        con = _conn()
        con.execute("""
            CREATE TABLE funnel_data AS
            SELECT "user_id", "event" FROM (VALUES
              (1,'view'),(1,'add_cart'),(1,'checkout'),
              (2,'view'),(2,'add_cart'),
              (3,'view')
            ) t("user_id", "event")
        """)
        result = con.execute("""
            SELECT
              COUNT(DISTINCT "user_id") FILTER (WHERE "event"='view') AS step_1,
              COUNT(DISTINCT "user_id") FILTER (WHERE "event"='add_cart') AS step_2,
              COUNT(DISTINCT "user_id") FILTER (WHERE "event"='checkout') AS step_3
            FROM funnel_data
        """)
        rows = result.fetchall()
        self.assertEqual(rows[0], (3, 2, 1))

    # ── I6 RFM scoring ────────────────────────────────────────────────────

    def test_i6_rfm_scoring(self):
        con = _conn()
        # Create 10 customers so NTILE(5) has 2 per bucket
        con.execute("""
            CREATE TABLE orders AS
            SELECT customer_id::VARCHAR AS "customer_id",
                   order_date::DATE    AS "order_date",
                   order_total::DOUBLE AS "order_total"
            FROM (VALUES
              ('c1','2024-01-10',100), ('c1','2024-01-20',50),
              ('c2','2024-02-01',200), ('c3','2023-12-01',30),
              ('c4','2024-01-15',80),  ('c5','2024-02-10',150),
              ('c6','2023-11-01',20),  ('c7','2024-01-05',60),
              ('c8','2024-02-15',300), ('c9','2024-01-25',90),
              ('c10','2023-10-01',10)
            ) t(customer_id, order_date, order_total)
        """)
        result = con.execute("""
            WITH base AS (
              SELECT "customer_id",
                     DATE_DIFF('day', MAX("order_date"), CURRENT_DATE) AS recency,
                     COUNT(*) AS frequency,
                     SUM("order_total") AS monetary
              FROM orders GROUP BY 1
            )
            SELECT *,
              NTILE(5) OVER (ORDER BY recency DESC)  AS r_score,
              NTILE(5) OVER (ORDER BY frequency ASC) AS f_score,
              NTILE(5) OVER (ORDER BY monetary ASC)  AS m_score,
              (NTILE(5) OVER (ORDER BY recency DESC) * 100 +
               NTILE(5) OVER (ORDER BY frequency ASC) * 10 +
               NTILE(5) OVER (ORDER BY monetary ASC)) AS rfm_code
            FROM base
        """)
        rows = result.fetchall()
        self.assertEqual(len(rows), 10)
        cols = _col_names(result)
        for c in ("r_score", "f_score", "m_score", "rfm_code"):
            self.assertIn(c, cols)

    # ── I7 QUALIFY top-N per group ────────────────────────────────────────

    def test_i7_qualify_top_n(self):
        con = _conn()
        con.execute("""
            CREATE TABLE sales AS SELECT * FROM (VALUES
              ('A',100), ('A',90), ('A',80), ('A',70),
              ('B',50),  ('B',40), ('B',30)
            ) t("category", "revenue")
        """)
        result = con.execute("""
            SELECT * FROM sales
            QUALIFY ROW_NUMBER() OVER (PARTITION BY "category"
                                       ORDER BY "revenue" DESC) <= 3
        """)
        rows = result.fetchall()
        # 3 from A, 3 from B
        self.assertEqual(len(rows), 6)

    # ── I8 Percent of total ───────────────────────────────────────────────

    def test_i8_percent_of_region(self):
        con = _conn()
        con.execute("""
            CREATE TABLE regional AS SELECT * FROM (VALUES
              ('East', 100.0), ('East', 200.0), ('West', 300.0)
            ) t("region", "amount")
        """)
        result = con.execute("""
            SELECT *,
              "amount" * 1.0 / SUM("amount") OVER (PARTITION BY "region") AS pct_of_region
            FROM regional
        """)
        rows = result.fetchall()
        self.assertEqual(len(rows), 3)
        # East rows: 100/300 and 200/300
        pcts = sorted(r[2] for r in rows if r[0] == 'East')
        self.assertAlmostEqual(pcts[0], 1/3, places=5)
        self.assertAlmostEqual(pcts[1], 2/3, places=5)

    # ── I9 Running cumulative ─────────────────────────────────────────────

    def test_i9_running_cumulative(self):
        con = _conn()
        con.execute("""
            CREATE TABLE timeseries AS SELECT * FROM (VALUES
              ('2024-01-01'::DATE, 10.0),
              ('2024-01-02'::DATE, 20.0),
              ('2024-01-03'::DATE, 30.0)
            ) t("dt", "amount")
        """)
        result = con.execute("""
            SELECT *, SUM("amount") OVER (ORDER BY "dt"
               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cumulative
            FROM timeseries
        """)
        rows = result.fetchall()
        cumulatives = [r[2] for r in rows]
        self.assertEqual(cumulatives, [10.0, 30.0, 60.0])

    # ── I10 MoM / YoY deltas ─────────────────────────────────────────────

    def test_i10_mom_yoy_delta(self):
        con = _conn()
        con.execute("""
            CREATE TABLE monthly AS SELECT * FROM (VALUES
              (1, 100.0),(2, 110.0),(3, 105.0)
            ) t("month", "revenue")
        """)
        result = con.execute("""
            SELECT "month", "revenue",
              "revenue" - LAG("revenue", 1)  OVER (ORDER BY "month") AS mom_delta,
              "revenue" - LAG("revenue", 12) OVER (ORDER BY "month") AS yoy_delta
            FROM monthly
        """)
        rows = result.fetchall()
        self.assertEqual(len(rows), 3)
        # first row mom_delta is NULL
        self.assertIsNone(rows[0][2])
        self.assertAlmostEqual(rows[1][2], 10.0)

    # ── I11 Trend (centered MA) ───────────────────────────────────────────

    def test_i11_trend_centered_ma(self):
        con = _conn()
        # 15 rows for window ROWS BETWEEN 6 PRECEDING AND 6 FOLLOWING
        con.execute("""
            CREATE TABLE ts AS
            SELECT ('2024-01-01'::DATE + INTERVAL (i) DAY)::DATE AS "dt",
                   (10 + i % 5)::DOUBLE AS "value"
            FROM generate_series(1, 15) gs(i)
        """)
        result = con.execute("""
            SELECT *,
              AVG("value") OVER (ORDER BY "dt"
                ROWS BETWEEN 6 PRECEDING AND 6 FOLLOWING) AS trend
            FROM ts
        """)
        rows = result.fetchall()
        self.assertEqual(len(rows), 15)
        # middle rows should have a trend value
        self.assertIsNotNone(rows[7][2])

    # ── I13 Residual anomaly flag ─────────────────────────────────────────

    def test_i13_anomaly_residuals(self):
        con = _conn()
        # Trend first, then compute residuals and flag
        con.execute("""
            CREATE TABLE ts2 AS
            SELECT ('2024-01-01'::DATE + INTERVAL (i) DAY)::DATE AS "dt",
                   (10 + (CASE WHEN i = 8 THEN 100 ELSE 0 END))::DOUBLE AS "value"
            FROM generate_series(1, 15) gs(i)
        """)
        result = con.execute("""
            WITH trended AS (
              SELECT "dt", "value",
                AVG("value") OVER (ORDER BY "dt"
                  ROWS BETWEEN 6 PRECEDING AND 6 FOLLOWING) AS trend
              FROM ts2
            ),
            residuals AS (
              SELECT *, "value" - trend AS residual FROM trended
            )
            SELECT *, ABS(residual) > 3 * STDDEV_SAMP(residual) OVER () AS anomaly
            FROM residuals
        """)
        rows = result.fetchall()
        self.assertEqual(len(rows), 15)
        anomaly_flags = [r[-1] for r in rows]
        # The spike at row 8 should be flagged
        self.assertIn(True, anomaly_flags)

    # ── I18 Haversine distance ────────────────────────────────────────────

    def test_i18_haversine(self):
        con = _conn()
        # London (51.5074, -0.1278) → Paris (48.8566, 2.3522) ≈ 341 km
        con.execute("""
            CREATE TABLE geo AS SELECT * FROM (VALUES
              (51.5074::DOUBLE, -0.1278::DOUBLE,
               48.8566::DOUBLE,  2.3522::DOUBLE)
            ) t("lat1","lon1","lat2","lon2")
        """)
        result = con.execute("""
            SELECT *,
              2 * 6371 * ASIN(SQRT(
                POWER(SIN(RADIANS(("lat2" - "lat1") / 2)), 2) +
                COS(RADIANS("lat1")) * COS(RADIANS("lat2")) *
                POWER(SIN(RADIANS(("lon2" - "lon1") / 2)), 2)
              )) AS distance_km
            FROM geo
        """)
        rows = result.fetchall()
        self.assertEqual(len(rows), 1)
        dist = rows[0][-1]
        self.assertAlmostEqual(dist, 341.0, delta=5.0)

    # ── I21 Sessionization ────────────────────────────────────────────────

    def test_i21_sessionization(self):
        con = _conn()
        # user 1: events at t=0, t=100, t=10000 (gap > 1800 → new session)
        base = datetime.datetime(2024, 1, 1, 0, 0, 0)
        rows_data = [
            (1, base),
            (1, base + datetime.timedelta(seconds=100)),
            (1, base + datetime.timedelta(seconds=10100)),
            (2, base),
            (2, base + datetime.timedelta(seconds=200)),
        ]
        con.execute("""
            CREATE TABLE evt AS
            SELECT "user_id", "event_ts" FROM (VALUES
              (1, TIMESTAMPTZ '2024-01-01 00:00:00'),
              (1, TIMESTAMPTZ '2024-01-01 00:01:40'),
              (1, TIMESTAMPTZ '2024-01-01 02:48:20'),
              (2, TIMESTAMPTZ '2024-01-01 00:00:00'),
              (2, TIMESTAMPTZ '2024-01-01 00:03:20')
            ) t("user_id", "event_ts")
        """)
        result = con.execute("""
            SELECT *,
              SUM(CASE WHEN gap_seconds > 1800 OR gap_seconds IS NULL THEN 1 ELSE 0 END)
                OVER (PARTITION BY "user_id" ORDER BY "event_ts") AS session_id
            FROM (
              SELECT *,
                DATE_DIFF('second',
                          LAG("event_ts") OVER (PARTITION BY "user_id" ORDER BY "event_ts"),
                          "event_ts") AS gap_seconds
              FROM evt
            )
        """)
        rows = result.fetchall()
        self.assertEqual(len(rows), 5)
        # user 1: sessions 1, 1, 2
        u1_sessions = sorted(r[-1] for r in rows if r[0] == 1)
        self.assertEqual(u1_sessions, [1, 1, 2])


# ═════════════════════════════════════════════════════════════════════════════
# Section J — Visualization SQL helpers
# ═════════════════════════════════════════════════════════════════════════════

class TestVisualizationRecipesJ(unittest.TestCase):
    """SQL helpers from Section J."""

    # ── J2 Sturges auto-binning ───────────────────────────────────────────

    def test_j2_sturges_binning(self):
        con = _conn()
        con.execute("""
            CREATE TABLE nums AS
            SELECT v::DOUBLE AS "value"
            FROM generate_series(1, 64) gs(v)
        """)
        result = con.execute("""
            SELECT FLOOR(("value" - (SELECT MIN("value") FROM nums)) /
                          (((SELECT MAX("value") FROM nums) -
                            (SELECT MIN("value") FROM nums)) /
                           CEIL(LOG2((SELECT COUNT(*) FROM nums)) + 1)))
                     AS bin_index,
                   COUNT(*) AS frequency
            FROM nums
            GROUP BY 1 ORDER BY 1
        """)
        rows = result.fetchall()
        # Sturges: bins = ceil(log2(64)+1) = 7; 64 values → 7 or 8 bins
        self.assertGreater(len(rows), 4)
        self.assertLessEqual(len(rows), 8)
        for row in rows:
            self.assertGreater(row[1], 0)

    # ── J3 Faceting (long format) ─────────────────────────────────────────

    def test_j3_faceting_long_format(self):
        con = _conn()
        con.execute("""
            CREATE TABLE facet_data AS SELECT * FROM (VALUES
              ('East',  'Jan', 100.0),
              ('East',  'Feb', 120.0),
              ('West',  'Jan',  80.0),
              ('West',  'Feb',  90.0)
            ) t("facet_col", "x_col", "y_col")
        """)
        result = con.execute("""
            SELECT "facet_col" AS facet, "x_col" AS x, "y_col" AS y
            FROM facet_data
        """)
        rows = result.fetchall()
        self.assertEqual(len(rows), 4)
        cols = _col_names(result)
        self.assertEqual(cols, ["facet", "x", "y"])

    # ── J4 Trend line columns ─────────────────────────────────────────────

    def test_j4_trend_line(self):
        con = _conn()
        con.execute("""
            CREATE TABLE tl AS SELECT * FROM (VALUES
              (1.0, 2.0),(2.0, 4.0),(3.0, 6.0),(4.0, 8.0)
            ) t("x","y")
        """)
        result = con.execute("""
            SELECT *, REGR_SLOPE("y","x") OVER () AS slope,
                      REGR_INTERCEPT("y","x") OVER () AS intercept
            FROM tl
        """)
        rows = result.fetchall()
        self.assertEqual(len(rows), 4)
        slope = rows[0][2]
        intercept = rows[0][3]
        self.assertAlmostEqual(slope, 2.0, places=5)
        self.assertAlmostEqual(intercept, 0.0, places=5)


# ═════════════════════════════════════════════════════════════════════════════
# Section K — Advanced ML prep SQL helpers
# ═════════════════════════════════════════════════════════════════════════════

class TestMLPrepRecipesK(unittest.TestCase):
    """SQL helpers from Section K."""

    # ── K1 Bag-of-words tokenize + explode ────────────────────────────────

    def test_k1_tokenize_explode(self):
        con = _conn()
        con.execute("""
            CREATE TABLE docs AS SELECT * FROM (VALUES
              (1, 'Hello world hello'),
              (2, 'world foo bar')
            ) t("doc_id", "text")
        """)
        result = con.execute("""
            SELECT "doc_id",
                   LOWER(UNNEST(STR_SPLIT(
                     REGEXP_REPLACE("text",'[^a-zA-Z\s]','','g'),' ')))
                   AS token
            FROM docs WHERE TRIM("text") <> ''
        """)
        rows = result.fetchall()
        # "Hello world hello" → 3 tokens; "world foo bar" → 3 tokens = 6 total
        self.assertEqual(len(rows), 6)
        tokens = {r[1] for r in rows}
        self.assertIn("hello", tokens)
        self.assertIn("world", tokens)

    # ── K2 Bigrams ────────────────────────────────────────────────────────

    def test_k2_bigrams(self):
        con = _conn()
        con.execute("""
            CREATE TABLE tokens AS SELECT * FROM (VALUES
              (1, 'the', 1),
              (1, 'quick', 2),
              (1, 'fox', 3)
            ) t("doc_id", t, pos)
        """)
        result = con.execute("""
            WITH tok AS (
              SELECT "doc_id", t AS t,
                     ROW_NUMBER() OVER (PARTITION BY "doc_id" ORDER BY pos) AS rn
              FROM tokens
            )
            SELECT a."doc_id", a.t || ' ' || b.t AS bigram
            FROM tok a JOIN tok b ON a."doc_id"=b."doc_id" AND b.rn = a.rn + 1
        """)
        rows = result.fetchall()
        bigrams = [r[1] for r in rows]
        self.assertIn("the quick", bigrams)
        self.assertIn("quick fox", bigrams)

    # ── K4 Point-biserial correlation ─────────────────────────────────────

    def test_k4_point_biserial(self):
        con = _conn()
        # perfectly correlated: higher feature → target=1
        con.execute("""
            CREATE TABLE corr_data AS SELECT * FROM (VALUES
              (1.0, 0), (2.0, 0), (3.0, 0), (4.0, 0), (5.0, 0),
              (6.0, 1), (7.0, 1), (8.0, 1), (9.0, 1),(10.0, 1)
            ) t("feature_col", "target")
        """)
        result = con.execute("""
            SELECT CORR("feature_col", CAST("target" AS DOUBLE)) AS r
            FROM corr_data
        """)
        rows = result.fetchall()
        r = rows[0][0]
        # strong positive correlation (point-biserial with balanced groups ≈ 0.87)
        self.assertGreater(r, 0.8)

    # ── K5 Reproducibility metadata ───────────────────────────────────────

    def test_k5_reproducibility_metadata(self):
        con = _conn()
        con.execute("""
            CREATE TABLE split_data AS
            SELECT i, (CASE WHEN i <= 6 THEN 'train'
                            WHEN i <= 8 THEN 'val'
                            ELSE 'test' END) AS split
            FROM generate_series(1, 10) gs(i)
        """)
        # Reduced form: row counts per split
        result = con.execute("""
            SELECT
              (SELECT COUNT(*) FROM split_data WHERE split='train') AS n_train,
              (SELECT COUNT(*) FROM split_data WHERE split='val')   AS n_val,
              (SELECT COUNT(*) FROM split_data WHERE split='test')  AS n_test
        """)
        rows = result.fetchall()
        self.assertEqual(rows[0], (6, 2, 2))

    # ── K6 Fit/transform: compute min/max stats from train split ──────────

    def test_k6_fit_stats_from_train(self):
        con = _conn()
        con.execute("""
            CREATE TABLE ml_data AS SELECT * FROM (VALUES
              (1.0, 'train'), (2.0, 'train'), (3.0, 'train'),
              (4.0, 'val'),   (100.0, 'test')  -- outliers in val/test
            ) t("col", split)
        """)
        result = con.execute("""
            SELECT MIN("col") AS col_min, MAX("col") AS col_max,
                   AVG("col") AS col_mean,
                   STDDEV_SAMP("col") AS col_std
            FROM ml_data WHERE split='train'
        """)
        rows = result.fetchall()
        self.assertAlmostEqual(rows[0][0], 1.0)
        self.assertAlmostEqual(rows[0][1], 3.0)
        # mean = 2.0, std = 1.0
        self.assertAlmostEqual(rows[0][2], 2.0)
        self.assertAlmostEqual(rows[0][3], 1.0)


# ═════════════════════════════════════════════════════════════════════════════
# Bounding-box prefilter (I19)
# ═════════════════════════════════════════════════════════════════════════════

class TestBoundingBoxFilter(unittest.TestCase):
    def test_i19_bounding_box(self):
        con = _conn()
        con.execute("""
            CREATE TABLE places AS SELECT * FROM (VALUES
              ('London', 51.5074::DOUBLE, -0.1278::DOUBLE),
              ('Paris',  48.8566::DOUBLE,  2.3522::DOUBLE),
              ('Berlin', 52.5200::DOUBLE, 13.4050::DOUBLE)
            ) t(name, "lat", "lon")
        """)
        # bounding box: roughly British Isles
        result = con.execute("""
            SELECT * FROM places
            WHERE "lat" BETWEEN 50.0 AND 55.0
              AND "lon" BETWEEN -5.0 AND 5.0
        """)
        rows = result.fetchall()
        names = [r[0] for r in rows]
        self.assertIn("London", names)
        self.assertNotIn("Berlin", names)


# ═════════════════════════════════════════════════════════════════════════════
# Section A — Format Standardization
# ═════════════════════════════════════════════════════════════════════════════

class TestFormatRecipesA(unittest.TestCase):
    """SQL recipes from Section A — format-standardization cookbook."""

    # ── A2 Phone normalization ────────────────────────────────────────────

    def test_a2_phone_normalization(self):
        con = _conn()
        con.execute("""
            CREATE TABLE phones AS SELECT * FROM (VALUES
              ('+1 (555) 123-4567'),
              ('555.987.6543'),
              ('+44 20 7946 0958')
            ) t("phone")
        """)
        result = con.execute("""
            SELECT RIGHT(REGEXP_REPLACE("phone", '[^0-9]', '', 'g'), 10) AS phone_digits
            FROM phones
        """)
        rows = result.fetchall()
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[0][0], '5551234567')
        self.assertEqual(rows[1][0], '5559876543')

    # ── A3 Email normalization ────────────────────────────────────────────

    def test_a3_email_normalization(self):
        con = _conn()
        con.execute("""
            CREATE TABLE emails AS SELECT * FROM (VALUES
              ('  USER@EXAMPLE.COM  '),
              ('  Admin@Test.Org')
            ) t("email")
        """)
        result = con.execute("""
            SELECT LOWER(TRIM("email")) AS email_clean FROM emails
        """)
        rows = result.fetchall()
        self.assertEqual(rows[0][0], 'user@example.com')
        self.assertEqual(rows[1][0], 'admin@test.org')

    # ── A4 Currency string → numeric ──────────────────────────────────────

    def test_a4_currency_to_numeric(self):
        con = _conn()
        con.execute("""
            CREATE TABLE prices AS SELECT * FROM (VALUES
              ('$1,234.56'),
              ('9.99'),
              ('$0.00')
            ) t("price")
        """)
        result = con.execute("""
            SELECT TRY_CAST(REGEXP_REPLACE("price", '[^0-9.\\-]', '', 'g') AS DOUBLE)
                   AS price_num
            FROM prices
        """)
        rows = result.fetchall()
        self.assertAlmostEqual(rows[0][0], 1234.56)
        self.assertAlmostEqual(rows[1][0], 9.99)
        self.assertAlmostEqual(rows[2][0], 0.0)

    # ── A5 Case standardization (UPPER / LOWER; INITCAP unavailable in v1.4) ──

    def test_a5_case_standardization(self):
        con = _conn()
        con.execute("""
            CREATE TABLE names AS SELECT * FROM (VALUES
              ('  HELLO WORLD  '),
              ('alice'),
              ('MiXeD cAsE')
            ) t("name")
        """)
        result = con.execute("""
            SELECT LOWER(TRIM("name")) AS name_lower,
                   UPPER(TRIM("name")) AS name_upper
            FROM names
        """)
        rows = result.fetchall()
        self.assertEqual(rows[0][0], 'hello world')
        self.assertEqual(rows[0][1], 'HELLO WORLD')
        self.assertEqual(rows[1][0], 'alice')
        self.assertEqual(rows[2][0], 'mixed case')

    # ── A6 Boolean unification ────────────────────────────────────────────

    def test_a6_boolean_unification(self):
        con = _conn()
        con.execute("""
            CREATE TABLE flags AS SELECT * FROM (VALUES
              ('yes'),('true'),('1'),('Y'),('T'),
              ('no'),('false'),('0'),('N'),('F')
            ) t("active")
        """)
        result = con.execute("""
            SELECT CASE WHEN LOWER(TRIM("active")) IN ('y','yes','true','t','1') THEN TRUE
                        WHEN LOWER(TRIM("active")) IN ('n','no','false','f','0') THEN FALSE
                        ELSE NULL END AS flag
            FROM flags
        """)
        rows = result.fetchall()
        flags = [r[0] for r in rows]
        # First 5 are truthy, last 5 are falsy
        self.assertTrue(all(flags[:5]))
        self.assertFalse(any(flags[5:]))

    # ── A7 Whitespace cleanup ─────────────────────────────────────────────

    def test_a7_whitespace_cleanup(self):
        con = _conn()
        con.execute("""
            CREATE TABLE messy AS SELECT * FROM (VALUES
              ('  hello   world  '),
              (' foo  bar   baz ')
            ) t("col")
        """)
        result = con.execute("""
            SELECT TRIM(REGEXP_REPLACE("col", '\\s+', ' ', 'g')) AS col_clean
            FROM messy
        """)
        rows = result.fetchall()
        self.assertEqual(rows[0][0], 'hello world')
        self.assertEqual(rows[1][0], 'foo bar baz')


# ═════════════════════════════════════════════════════════════════════════════
# Section B — Deduplication
# ═════════════════════════════════════════════════════════════════════════════

class TestDeduplicationRecipesB(unittest.TestCase):
    """SQL recipes from Section B — deduplication cookbook."""

    # ── B1 Exact dedup ────────────────────────────────────────────────────

    def test_b1_exact_dedup(self):
        con = _conn()
        con.execute("""
            CREATE TABLE dupes AS SELECT * FROM (VALUES
              (1,'alice','a@x.com'),
              (1,'alice','a@x.com'),
              (2,'bob',  'b@x.com'),
              (2,'bob',  'b@x.com'),
              (3,'carol','c@x.com')
            ) t(id, name, email)
        """)
        result = con.execute("SELECT DISTINCT * FROM dupes ORDER BY id")
        rows = result.fetchall()
        self.assertEqual(len(rows), 3)

    # ── B2 Keep-latest by timestamp ───────────────────────────────────────

    def test_b2_keep_latest_by_timestamp(self):
        con = _conn()
        con.execute("""
            CREATE TABLE orders AS SELECT * FROM (VALUES
              ('O1', '2024-01-10'::TIMESTAMP, 'pending'),
              ('O1', '2024-01-15'::TIMESTAMP, 'shipped'),
              ('O1', '2024-01-20'::TIMESTAMP, 'delivered'),
              ('O2', '2024-01-05'::TIMESTAMP, 'pending')
            ) t("order_id", "updated_at", status)
        """)
        result = con.execute("""
            SELECT "order_id", status FROM (
              SELECT *, ROW_NUMBER() OVER (
                PARTITION BY "order_id" ORDER BY "updated_at" DESC
              ) AS rn FROM orders
            ) WHERE rn = 1
            ORDER BY "order_id"
        """)
        rows = result.fetchall()
        self.assertEqual(len(rows), 2)
        # O1 should be the latest status
        o1_row = next(r for r in rows if r[0] == 'O1')
        self.assertEqual(o1_row[1], 'delivered')

    # ── B4 Fuzzy dedup via jaro_winkler_similarity ────────────────────────

    def test_b4_fuzzy_dedup_similarity(self):
        con = _conn()
        # Verify jaro_winkler_similarity is available and works
        result = con.execute("""
            SELECT jaro_winkler_similarity('john smith', 'jon smith') AS sim
        """)
        rows = result.fetchall()
        sim = rows[0][0]
        self.assertGreater(sim, 0.9)

    def test_b4_fuzzy_pairs_detection(self):
        con = _conn()
        con.execute("""
            CREATE TABLE entities AS SELECT * FROM (VALUES
              (1, 'acme corp'),
              (2, 'acme corporation'),
              (3, 'globex inc')
            ) t(id, "name")
        """)
        result = con.execute("""
            SELECT a.id AS row_a, b.id AS row_b,
                   jaro_winkler_similarity(LOWER(a."name"), LOWER(b."name")) AS sim
            FROM entities a JOIN entities b ON a.id < b.id
            WHERE jaro_winkler_similarity(LOWER(a."name"), LOWER(b."name")) > 0.8
        """)
        rows = result.fetchall()
        # acme corp / acme corporation should be flagged
        self.assertGreater(len(rows), 0)
        sims = [r[2] for r in rows]
        self.assertTrue(all(s > 0.8 for s in sims))


# ═════════════════════════════════════════════════════════════════════════════
# Section D — Merging Files
# ═════════════════════════════════════════════════════════════════════════════

class TestMergeRecipesD(unittest.TestCase):
    """SQL recipes from Section D — merging / union / join cookbook."""

    # ── D1 UNION with mismatched columns ──────────────────────────────────

    def test_d1_union_mismatched_columns(self):
        con = _conn()
        con.execute("""
            CREATE TABLE tbl_a AS SELECT * FROM (VALUES
              (1, 'alice', NULL::VARCHAR)
            ) t(id, name, email)
        """)
        con.execute("""
            CREATE TABLE tbl_b AS SELECT * FROM (VALUES
              (2, 'bob', 'bob@x.com')
            ) t(id, name, email)
        """)
        result = con.execute("""
            SELECT id, name, NULL AS email, NULL::TIMESTAMP AS created_at FROM tbl_a
            UNION ALL
            SELECT id, name, email, NULL::TIMESTAMP AS created_at FROM tbl_b
            ORDER BY id
        """)
        rows = result.fetchall()
        self.assertEqual(len(rows), 2)
        cols = _col_names(result)
        self.assertIn('email', cols)
        self.assertIn('created_at', cols)
        # tbl_a row should have null email
        self.assertIsNone(rows[0][2])
        # tbl_b row should have the email
        self.assertEqual(rows[1][2], 'bob@x.com')

    # ── D3 Multi-key JOIN with type coercion ──────────────────────────────

    def test_d3_join_with_type_coercion(self):
        con = _conn()
        con.execute("""
            CREATE TABLE orders AS SELECT * FROM (VALUES
              (101::INT, 'US', 'open'),
              (102::INT, 'EU', 'open')
            ) t("order_id", "region", status)
        """)
        con.execute("""
            CREATE TABLE statuses AS SELECT * FROM (VALUES
              ('101', 'US', 'shipped'),
              ('102', 'EU', 'processing')
            ) t("order_id", "region", "status")
        """)
        result = con.execute("""
            SELECT a."order_id", a."region", b."status"
            FROM orders a
            LEFT JOIN statuses b
              ON TRY_CAST(a."order_id" AS VARCHAR) = TRY_CAST(b."order_id" AS VARCHAR)
             AND a."region" = b."region"
            ORDER BY a."order_id"
        """)
        rows = result.fetchall()
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0][2], 'shipped')
        self.assertEqual(rows[1][2], 'processing')

    # ── D4 Anti-join ──────────────────────────────────────────────────────

    def test_d4_anti_join(self):
        con = _conn()
        con.execute("""
            CREATE TABLE all_customers AS SELECT * FROM (VALUES
              (1,'alice'),(2,'bob'),(3,'carol'),(4,'dave')
            ) t(id, name)
        """)
        con.execute("""
            CREATE TABLE ordered_customers AS SELECT * FROM (VALUES
              (1),(3)
            ) t(id)
        """)
        result = con.execute("""
            SELECT a.id, a.name
            FROM all_customers a
            LEFT JOIN ordered_customers b ON a.id = b.id
            WHERE b.id IS NULL
            ORDER BY a.id
        """)
        rows = result.fetchall()
        self.assertEqual(len(rows), 2)
        ids = [r[0] for r in rows]
        self.assertIn(2, ids)
        self.assertIn(4, ids)


# ═════════════════════════════════════════════════════════════════════════════
# Section E — Missing Value Handling
# ═════════════════════════════════════════════════════════════════════════════

class TestMissingValueRecipesE(unittest.TestCase):
    """SQL recipes from Section E — missing value cookbook."""

    # ── E1 Constant fill ──────────────────────────────────────────────────

    def test_e1_constant_fill(self):
        con = _conn()
        con.execute("""
            CREATE TABLE countries AS SELECT * FROM (VALUES
              (1, 'US'), (2, NULL), (3, 'DE'), (4, NULL)
            ) t(id, "country")
        """)
        result = con.execute("""
            SELECT id, COALESCE("country", 'Unknown') AS "country" FROM countries
        """)
        rows = result.fetchall()
        nulls = [r for r in rows if r[1] is None]
        unknowns = [r for r in rows if r[1] == 'Unknown']
        self.assertEqual(len(nulls), 0)
        self.assertEqual(len(unknowns), 2)

    # ── E2 Mean imputation ────────────────────────────────────────────────

    def test_e2_mean_imputation(self):
        con = _conn()
        con.execute("""
            CREATE TABLE amounts AS SELECT * FROM (VALUES
              (1, 10.0), (2, NULL), (3, 20.0), (4, NULL), (5, 30.0)
            ) t(id, "amount")
        """)
        result = con.execute("""
            SELECT id,
              COALESCE("amount",
                (SELECT AVG("amount") FROM amounts)) AS amount_imputed
            FROM amounts
        """)
        rows = result.fetchall()
        imputed = {r[0]: r[1] for r in rows}
        # mean of 10, 20, 30 = 20
        self.assertAlmostEqual(imputed[2], 20.0)
        self.assertAlmostEqual(imputed[4], 20.0)
        self.assertAlmostEqual(imputed[1], 10.0)

    # ── E3 Mode imputation ────────────────────────────────────────────────

    def test_e3_mode_imputation(self):
        con = _conn()
        con.execute("""
            CREATE TABLE cats AS SELECT * FROM (VALUES
              (1, 'A'), (2, 'A'), (3, 'B'), (4, NULL), (5, 'A')
            ) t(id, "category")
        """)
        result = con.execute("""
            SELECT id,
              COALESCE("category",
                (SELECT "category" FROM cats WHERE "category" IS NOT NULL
                 GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 1)) AS cat_imputed
            FROM cats
        """)
        rows = result.fetchall()
        # NULL at id=4 should be filled with mode 'A'
        imputed = {r[0]: r[1] for r in rows}
        self.assertEqual(imputed[4], 'A')

    # ── E4 Forward-fill (last non-null) ───────────────────────────────────

    def test_e4_forward_fill(self):
        con = _conn()
        con.execute("""
            CREATE TABLE prices AS SELECT * FROM (VALUES
              ('2024-01-01'::DATE, 100.0),
              ('2024-01-02'::DATE, NULL),
              ('2024-01-03'::DATE, NULL),
              ('2024-01-04'::DATE, 110.0),
              ('2024-01-05'::DATE, NULL)
            ) t("trade_date", "price")
        """)
        result = con.execute("""
            SELECT "trade_date",
              LAST_VALUE("price" IGNORE NULLS) OVER (
                ORDER BY "trade_date"
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
              ) AS price_filled
            FROM prices
            ORDER BY "trade_date"
        """)
        rows = result.fetchall()
        prices = [r[1] for r in rows]
        # Jan 2 and 3 forward-filled to 100, Jan 5 forward-filled to 110
        self.assertAlmostEqual(prices[1], 100.0)
        self.assertAlmostEqual(prices[2], 100.0)
        self.assertAlmostEqual(prices[4], 110.0)

    # ── E5 Drop null rows ─────────────────────────────────────────────────

    def test_e5_drop_null_rows(self):
        con = _conn()
        con.execute("""
            CREATE TABLE recs AS SELECT * FROM (VALUES
              (1, '2024-01-01'::DATE),
              (NULL, '2024-01-02'::DATE),
              (3, NULL),
              (4, '2024-01-04'::DATE)
            ) t("customer_id", "order_date")
        """)
        result = con.execute("""
            SELECT * FROM recs
            WHERE "customer_id" IS NOT NULL AND "order_date" IS NOT NULL
        """)
        rows = result.fetchall()
        self.assertEqual(len(rows), 2)

    # ── E7 Flag-and-keep ──────────────────────────────────────────────────

    def test_e7_flag_and_keep(self):
        con = _conn()
        con.execute("""
            CREATE TABLE contacts AS SELECT * FROM (VALUES
              (1, 'alice@x.com'),
              (2, NULL),
              (3, '  '),
              (4, 'bob@x.com')
            ) t(id, "email")
        """)
        result = con.execute("""
            SELECT *, ("email" IS NULL OR TRIM("email") = '') AS is_email_missing
            FROM contacts
        """)
        rows = result.fetchall()
        missing = {r[0]: r[2] for r in rows}
        self.assertFalse(missing[1])
        self.assertTrue(missing[2])
        self.assertTrue(missing[3])
        self.assertFalse(missing[4])


# ═════════════════════════════════════════════════════════════════════════════
# Section F — General Transformations
# ═════════════════════════════════════════════════════════════════════════════

class TestTransformRecipesF(unittest.TestCase):
    """SQL recipes from Section F — transformation cookbook."""

    # ── F1 Split column ───────────────────────────────────────────────────

    def test_f1_split_column(self):
        con = _conn()
        con.execute("""
            CREATE TABLE people AS SELECT * FROM (VALUES
              ('Alice Smith'),
              ('Bob Jones'),
              ('Carol Ann White')
            ) t("full_name")
        """)
        result = con.execute("""
            SELECT STR_SPLIT("full_name", ' ')[1] AS first_name,
                   STR_SPLIT("full_name", ' ')[2] AS last_name
            FROM people
        """)
        rows = result.fetchall()
        self.assertEqual(rows[0][0], 'Alice')
        self.assertEqual(rows[0][1], 'Smith')
        self.assertEqual(rows[1][0], 'Bob')

    # ── F2 Combine columns ────────────────────────────────────────────────

    def test_f2_concat_columns(self):
        con = _conn()
        con.execute("""
            CREATE TABLE names AS SELECT * FROM (VALUES
              ('Alice', 'Smith'),
              ('Bob',   'Jones')
            ) t("first_name", "last_name")
        """)
        result = con.execute("""
            SELECT CONCAT_WS(' ', "first_name", "last_name") AS full_name FROM names
        """)
        rows = result.fetchall()
        self.assertEqual(rows[0][0], 'Alice Smith')
        self.assertEqual(rows[1][0], 'Bob Jones')

    # ── F3 Bucketize ──────────────────────────────────────────────────────

    def test_f3_bucketize(self):
        con = _conn()
        con.execute("""
            CREATE TABLE people2 AS SELECT * FROM (VALUES
              (10), (25), (45), (65)
            ) t("age")
        """)
        result = con.execute("""
            SELECT "age",
              CASE WHEN "age" < 18 THEN '<18'
                   WHEN "age" < 35 THEN '18-34'
                   WHEN "age" < 55 THEN '35-54'
                   ELSE '55+' END AS age_group
            FROM people2 ORDER BY "age"
        """)
        rows = result.fetchall()
        groups = {r[0]: r[1] for r in rows}
        self.assertEqual(groups[10], '<18')
        self.assertEqual(groups[25], '18-34')
        self.assertEqual(groups[45], '35-54')
        self.assertEqual(groups[65], '55+')

    # ── F4 Pivot-like CASE SUM ────────────────────────────────────────────

    def test_f4_pivot_case_sum(self):
        con = _conn()
        con.execute("""
            CREATE TABLE sales AS SELECT * FROM (VALUES
              ('c1','US', 100.0),
              ('c1','EU',  50.0),
              ('c2','US', 200.0),
              ('c2','EU',  80.0),
              ('c2','US',  20.0)
            ) t(customer_id, region, amount)
        """)
        result = con.execute("""
            SELECT customer_id,
                   SUM(CASE WHEN region='US' THEN amount ELSE 0 END) AS us_amount,
                   SUM(CASE WHEN region='EU' THEN amount ELSE 0 END) AS eu_amount
            FROM sales GROUP BY customer_id ORDER BY customer_id
        """)
        rows = result.fetchall()
        by_cust = {r[0]: r for r in rows}
        self.assertAlmostEqual(by_cust['c1'][1], 100.0)
        self.assertAlmostEqual(by_cust['c1'][2], 50.0)
        self.assertAlmostEqual(by_cust['c2'][1], 220.0)
        self.assertAlmostEqual(by_cust['c2'][2], 80.0)


# ═════════════════════════════════════════════════════════════════════════════
# Section H — ML / AI Preparation
# ═════════════════════════════════════════════════════════════════════════════

class TestMLPrepRecipesH(unittest.TestCase):
    """SQL recipes from Section H — ML prep cookbook."""

    # ── H1 Z-score standardization ───────────────────────────────────────

    def test_h1_zscore(self):
        con = _conn()
        con.execute("""
            CREATE TABLE feats AS SELECT * FROM (VALUES
              (10.0), (20.0), (30.0), (40.0), (50.0)
            ) t("amount")
        """)
        result = con.execute("""
            SELECT "amount",
              ("amount" - AVG("amount") OVER ()) /
                NULLIF(STDDEV_SAMP("amount") OVER (), 0) AS amount_zscore
            FROM feats ORDER BY "amount"
        """)
        rows = result.fetchall()
        zscores = [r[1] for r in rows]
        # mean=30, std=15.81...; middle value z~=0
        self.assertAlmostEqual(sum(zscores), 0.0, places=10)
        # sorted: first should be most negative, last most positive
        self.assertLess(zscores[0], 0)
        self.assertGreater(zscores[-1], 0)

    # ── H2 Min-max scaling ────────────────────────────────────────────────

    def test_h2_minmax_scaling(self):
        con = _conn()
        con.execute("""
            CREATE TABLE vals AS SELECT * FROM (VALUES
              (0.0), (25.0), (50.0), (75.0), (100.0)
            ) t("amount")
        """)
        result = con.execute("""
            SELECT "amount",
              ("amount" - MIN("amount") OVER ()) /
                NULLIF(MAX("amount") OVER () - MIN("amount") OVER (), 0) AS amount_scaled
            FROM vals ORDER BY "amount"
        """)
        rows = result.fetchall()
        scaled = [r[1] for r in rows]
        self.assertAlmostEqual(scaled[0], 0.0)
        self.assertAlmostEqual(scaled[-1], 1.0)
        self.assertAlmostEqual(scaled[2], 0.5)

    # ── H3 Robust scaling (median + IQR) ─────────────────────────────────

    def test_h3_robust_scaling(self):
        con = _conn()
        con.execute("""
            CREATE TABLE robvals AS SELECT * FROM (VALUES
              (1.0),(2.0),(3.0),(4.0),(5.0),(100.0)
            ) t("amount")
        """)
        result = con.execute("""
            WITH s AS (
              SELECT QUANTILE_CONT("amount", 0.5) AS med,
                     QUANTILE_CONT("amount", 0.75) - QUANTILE_CONT("amount", 0.25) AS iqr
              FROM robvals
            )
            SELECT t."amount",
                   (t."amount" - s.med) / NULLIF(s.iqr, 0) AS amount_robust
            FROM robvals t CROSS JOIN s
            ORDER BY t."amount"
        """)
        rows = result.fetchall()
        self.assertEqual(len(rows), 6)
        cols = _col_names(result)
        self.assertIn('amount_robust', cols)
        # median value (3.5) should scale to ~0
        robust = {r[0]: r[1] for r in rows}
        # The outlier 100.0 should have a much larger robust score than others
        self.assertGreater(abs(robust[100.0]), abs(robust[3.0]))

    # ── H6 Label encoding ────────────────────────────────────────────────

    def test_h6_label_encoding(self):
        con = _conn()
        con.execute("""
            CREATE TABLE labeled AS SELECT * FROM (VALUES
              ('banana'), ('apple'), ('cherry'), ('apple'), ('banana')
            ) t("category")
        """)
        result = con.execute("""
            SELECT t."category", c.label_id AS category_label
            FROM labeled t
            LEFT JOIN (
              SELECT "category",
                     DENSE_RANK() OVER (ORDER BY "category") - 1 AS label_id
              FROM (SELECT DISTINCT "category" FROM labeled WHERE "category" IS NOT NULL)
            ) c USING ("category")
        """)
        rows = result.fetchall()
        self.assertEqual(len(rows), 5)
        # apple < banana < cherry alphabetically → 0, 1, 2
        label_map = {r[0]: r[1] for r in rows}
        self.assertEqual(label_map['apple'], 0)
        self.assertEqual(label_map['banana'], 1)
        self.assertEqual(label_map['cherry'], 2)

    # ── H8 One-hot encoding ───────────────────────────────────────────────

    def test_h8_one_hot_encoding(self):
        con = _conn()
        con.execute("""
            CREATE TABLE colors AS SELECT * FROM (VALUES
              ('red'), ('green'), ('blue'), ('red')
            ) t("color")
        """)
        result = con.execute("""
            SELECT "color",
              CAST("color" = 'red'   AS INTEGER) AS color_red,
              CAST("color" = 'green' AS INTEGER) AS color_green,
              CAST("color" = 'blue'  AS INTEGER) AS color_blue
            FROM colors
        """)
        rows = result.fetchall()
        self.assertEqual(len(rows), 4)
        for row in rows:
            color, r, g, b = row
            self.assertEqual(r + g + b, 1)  # exactly one hot per row
            if color == 'red':
                self.assertEqual(r, 1)
            elif color == 'green':
                self.assertEqual(g, 1)
            else:
                self.assertEqual(b, 1)

    # ── H9 Frequency encoding ─────────────────────────────────────────────

    def test_h9_frequency_encoding(self):
        con = _conn()
        con.execute("""
            CREATE TABLE cats AS SELECT * FROM (VALUES
              ('A'),('A'),('A'),('B'),('B'),('C')
            ) t("category")
        """)
        result = con.execute("""
            SELECT t."category", f.freq AS category_freq
            FROM cats t
            LEFT JOIN (SELECT "category", COUNT(*) AS freq FROM cats GROUP BY 1) f
            USING ("category")
        """)
        rows = result.fetchall()
        freq_map = {r[0]: r[1] for r in rows}
        self.assertEqual(freq_map['A'], 3)
        self.assertEqual(freq_map['B'], 2)
        self.assertEqual(freq_map['C'], 1)

    # ── H12 Date-part features ────────────────────────────────────────────

    def test_h12_date_part_features(self):
        con = _conn()
        con.execute("""
            CREATE TABLE events AS SELECT * FROM (VALUES
              ('2024-03-15'::DATE),
              ('2024-07-04'::DATE)
            ) t("order_date")
        """)
        result = con.execute("""
            SELECT "order_date",
              EXTRACT(YEAR  FROM "order_date") AS order_year,
              EXTRACT(MONTH FROM "order_date") AS order_month,
              EXTRACT(DOW   FROM "order_date") AS order_dow,
              CAST(EXTRACT(DOW FROM "order_date") IN (0, 6) AS INTEGER) AS is_weekend
            FROM events ORDER BY "order_date"
        """)
        rows = result.fetchall()
        self.assertEqual(len(rows), 2)
        # 2024-03-15 is a Friday → DOW=5, not weekend
        self.assertEqual(int(rows[0][1]), 2024)
        self.assertEqual(int(rows[0][2]), 3)
        self.assertEqual(rows[0][4], 0)
        # 2024-07-04 is a Thursday → not weekend
        self.assertEqual(int(rows[1][2]), 7)

    # ── H13 Cyclical encoding ─────────────────────────────────────────────

    def test_h13_cyclical_encoding(self):
        con = _conn()
        import math
        con.execute("""
            CREATE TABLE dts AS SELECT * FROM (VALUES
              ('2024-01-15'::DATE),
              ('2024-07-15'::DATE),
              ('2024-12-15'::DATE)
            ) t("dt")
        """)
        result = con.execute("""
            SELECT "dt",
              SIN(2 * PI() * EXTRACT(MONTH FROM "dt") / 12) AS month_sin,
              COS(2 * PI() * EXTRACT(MONTH FROM "dt") / 12) AS month_cos
            FROM dts ORDER BY "dt"
        """)
        rows = result.fetchall()
        self.assertEqual(len(rows), 3)
        # Jan (1): sin(2π*1/12) ≈ 0.5, cos ≈ 0.866
        jan_sin, jan_cos = rows[0][1], rows[0][2]
        self.assertAlmostEqual(jan_sin, math.sin(2 * math.pi / 12), places=5)
        self.assertAlmostEqual(jan_cos, math.cos(2 * math.pi / 12), places=5)

    # ── H14 Lag features ──────────────────────────────────────────────────

    def test_h14_lag_features(self):
        con = _conn()
        con.execute("""
            CREATE TABLE prices AS SELECT * FROM (VALUES
              ('AAPL', '2024-01-01'::DATE, 180.0),
              ('AAPL', '2024-01-02'::DATE, 182.0),
              ('AAPL', '2024-01-03'::DATE, 179.0),
              ('MSFT', '2024-01-01'::DATE, 350.0),
              ('MSFT', '2024-01-02'::DATE, 355.0)
            ) t("ticker", "dt", "price")
        """)
        result = con.execute("""
            SELECT "ticker", "dt", "price",
              LAG("price", 1) OVER (PARTITION BY "ticker" ORDER BY "dt") AS price_lag1
            FROM prices ORDER BY "ticker", "dt"
        """)
        rows = result.fetchall()
        self.assertEqual(len(rows), 5)
        # First row per ticker should have NULL lag
        aapl_rows = [r for r in rows if r[0] == 'AAPL']
        self.assertIsNone(aapl_rows[0][3])
        self.assertAlmostEqual(aapl_rows[1][3], 180.0)

    # ── H15 Rolling window aggregates ────────────────────────────────────

    def test_h15_rolling_ma7(self):
        con = _conn()
        con.execute("""
            CREATE TABLE daily AS
            SELECT ('2024-01-01'::DATE + INTERVAL (i-1) DAY)::DATE AS "dt",
                   i::DOUBLE AS "price"
            FROM generate_series(1, 10) gs(i)
        """)
        result = con.execute("""
            SELECT "dt", "price",
              AVG("price") OVER (ORDER BY "dt"
                                  ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS price_ma7
            FROM daily ORDER BY "dt"
        """)
        rows = result.fetchall()
        self.assertEqual(len(rows), 10)
        # Row 7 (price=7): MA over 1..7 = 4.0
        self.assertAlmostEqual(rows[6][2], 4.0)
        # Row 10 (price=10): MA over 4..10 = 7.0
        self.assertAlmostEqual(rows[9][2], 7.0)

    # ── H23 Class balance check ───────────────────────────────────────────

    def test_h23_class_balance(self):
        con = _conn()
        con.execute("""
            CREATE TABLE labeled AS SELECT * FROM (VALUES
              (0),(0),(0),(0),(0),(0),(0),(1),(1),(1)
            ) t("label")
        """)
        result = con.execute("""
            SELECT "label", COUNT(*) AS n,
                   COUNT(*) * 1.0 / SUM(COUNT(*)) OVER () AS pct
            FROM labeled GROUP BY "label" ORDER BY n DESC
        """)
        rows = result.fetchall()
        self.assertEqual(len(rows), 2)
        pcts = {r[0]: r[2] for r in rows}
        self.assertAlmostEqual(pcts[0], 0.7)
        self.assertAlmostEqual(pcts[1], 0.3)

    # ── H26 Deterministic hash split ─────────────────────────────────────

    def test_h26_hash_split(self):
        con = _conn()
        con.execute("""
            CREATE TABLE items AS
            SELECT i AS "id" FROM generate_series(1, 100) gs(i)
        """)
        result = con.execute("""
            SELECT "id",
              CASE WHEN ABS(hash(CAST("id" AS VARCHAR))) % 100 < 70 THEN 'train'
                   WHEN ABS(hash(CAST("id" AS VARCHAR))) % 100 < 85 THEN 'val'
                   ELSE 'test' END AS split
            FROM items
        """)
        rows = result.fetchall()
        self.assertEqual(len(rows), 100)
        splits = [r[1] for r in rows]
        counts = {s: splits.count(s) for s in ('train', 'val', 'test')}
        # Rough check: all splits present
        self.assertGreater(counts['train'], 0)
        self.assertGreater(counts['val'], 0)
        self.assertGreater(counts['test'], 0)
        # Determinism: run again and check same result
        result2 = con.execute("""
            SELECT "id",
              CASE WHEN ABS(hash(CAST("id" AS VARCHAR))) % 100 < 70 THEN 'train'
                   WHEN ABS(hash(CAST("id" AS VARCHAR))) % 100 < 85 THEN 'val'
                   ELSE 'test' END AS split
            FROM items
        """)
        rows2 = result2.fetchall()
        self.assertEqual(rows, rows2)

    # ── H27 Time-based split ──────────────────────────────────────────────

    def test_h27_time_based_split(self):
        con = _conn()
        con.execute("""
            CREATE TABLE timeseries AS SELECT * FROM (VALUES
              ('2023-06-01'::DATE, 1.0),
              ('2023-12-31'::DATE, 2.0),
              ('2024-04-01'::DATE, 3.0),
              ('2024-08-01'::DATE, 4.0),
              ('2024-11-01'::DATE, 5.0)
            ) t("dt", val)
        """)
        result = con.execute("""
            SELECT "dt", val,
              CASE WHEN "dt" < DATE '2024-01-01' THEN 'train'
                   WHEN "dt" < DATE '2024-07-01' THEN 'val'
                   ELSE 'test' END AS split
            FROM timeseries ORDER BY "dt"
        """)
        rows = result.fetchall()
        splits = {r[0]: r[2] for r in rows}
        import datetime
        self.assertEqual(splits[datetime.date(2023, 6, 1)], 'train')
        self.assertEqual(splits[datetime.date(2023, 12, 31)], 'train')
        self.assertEqual(splits[datetime.date(2024, 4, 1)], 'val')
        self.assertEqual(splits[datetime.date(2024, 8, 1)], 'test')
        self.assertEqual(splits[datetime.date(2024, 11, 1)], 'test')


if __name__ == "__main__":
    unittest.main()
