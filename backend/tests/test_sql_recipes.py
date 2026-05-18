"""Golden tests for cookbook SQL recipes (sections I, J, K).

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


if __name__ == "__main__":
    unittest.main()
