# DataHub Data Source Connectors

Complete guide to connecting DataHub with various data sources including relational databases, cloud data warehouses, NoSQL databases, cloud storage, and SaaS APIs.

---

## Table of Contents

- [Connector Availability by Tier](#connector-availability-by-tier)
- [Relational Databases](#relational-databases)
  - [PostgreSQL](#postgresql)
  - [MySQL](#mysql)
  - [Microsoft SQL Server](#microsoft-sql-server)
  - [Oracle Database](#oracle-database)
- [NoSQL Databases](#nosql-databases)
  - [MongoDB](#mongodb)
- [Cloud Data Warehouses](#cloud-data-warehouses)
  - [Snowflake](#snowflake)
  - [Google BigQuery](#google-bigquery)
  - [Amazon Redshift](#amazon-redshift)
  - [Azure Synapse Analytics](#azure-synapse-analytics)
- [Cloud Storage](#cloud-storage)
  - [Amazon S3](#amazon-s3)
  - [Google Cloud Storage](#google-cloud-storage)
  - [Azure Blob Storage](#azure-blob-storage)
- [SaaS APIs](#saas-apis)
  - [Salesforce](#salesforce)
- [File Formats](#file-formats)
- [Local Testing](#local-testing)
- [Troubleshooting](#troubleshooting)

---

## Connector Availability by Tier

| Data Source | Free | Professional | Team | Business | Enterprise |
|-------------|------|--------------|------|----------|------------|
| **Files (CSV, Excel, JSON, Parquet)** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **PostgreSQL** | ❌ | 🔜 | 🔜 | 🔜 | 🔜 |
| **MySQL** | ❌ | 🔜 | 🔜 | 🔜 | 🔜 |
| **SQLite** | ❌ | 🔜 | 🔜 | 🔜 | 🔜 |
| **SQL Server (MSSQL)** | ❌ | 🔜 | 🔜 | 🔜 | 🔜 |
| **Oracle** | ❌ | 🔜 | 🔜 | 🔜 | 🔜 |
| **Amazon S3** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Google Cloud Storage** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Azure Blob Storage** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Snowflake** | ❌ | ❌ | 🔜 | 🔜 | 🔜 |
| **Google BigQuery** | ❌ | ❌ | 🔜 | 🔜 | 🔜 |
| **Amazon Redshift** | ❌ | ❌ | 🔜 | 🔜 | 🔜 |
| **Azure Synapse** | ❌ | ❌ | 🔜 | 🔜 | 🔜 |
| **Custom connectors** | ❌ | ❌ | ❌ | 🔜 | 🔜 |
| **On-premise custom** | ❌ | ❌ | ❌ | ❌ | 🔜 |
| **Salesforce** | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## Relational Databases

### PostgreSQL

**Tier Required:** Professional+

**Connection Parameters:**
```json
{
  "host": "localhost",
  "port": 5432,
  "database": "mydb",
  "username": "myuser",
  "password": "mypassword",
  "schema": "public"
}
```

**Query Options:**
```json
{
  "table": "customers",
  "where": "created_at > '2024-01-01'",
  "query": "SELECT * FROM orders WHERE status = 'completed'"
}
```

**Connection String Format:**
```
postgresql+psycopg://username:password@host:port/database
```

**Permissions Required:**
- `SELECT` privilege on target tables
- `CONNECT` privilege on database
- (Optional) `INSERT`, `UPDATE` for write operations

**Example Usage:**
1. Navigate to Data Import tab
2. Select "PostgreSQL" as data source
3. Enter connection details
4. Click "Test Connection"
5. Select table or write custom SQL query
6. Import data

**Common Issues:**
- **Connection timeout**: Check firewall rules, ensure port 5432 is accessible
- **Authentication failed**: Verify username/password, check `pg_hba.conf` for connection permissions
- **SSL required**: Add `sslmode=require` parameter if server requires SSL

---

### MySQL

**Tier Required:** Professional+

**Connection Parameters:**
```json
{
  "host": "localhost",
  "port": 3306,
  "database": "mydb",
  "username": "myuser",
  "password": "mypassword"
}
```

**Query Options:**
```json
{
  "table": "users",
  "where": "status = 'active'",
  "query": "SELECT id, name, email FROM users LIMIT 1000"
}
```

**Connection String Format:**
```
mysql+pymysql://username:password@host:port/database
```

**Permissions Required:**
- `SELECT` privilege on target tables
- (Optional) `INSERT`, `UPDATE`, `DELETE` for write-back operations

**Common Issues:**
- **Authentication plugin error**: Ensure user is created with `mysql_native_password` plugin
- **Connection refused**: Verify MySQL is listening on external IP (not just 127.0.0.1)
- **Too many connections**: Check MySQL `max_connections` setting

---

### Microsoft SQL Server

**Tier Required:** Professional+

**Connection Parameters:**
```json
{
  "host": "localhost",
  "port": 1433,
  "database": "mydb",
  "username": "sa",
  "password": "YourPassword123!",
  "schema": "dbo"
}
```

**Query Options:**
```json
{
  "table": "Sales.Customers",
  "query": "SELECT TOP 1000 * FROM Sales.Orders WHERE Year = 2024"
}
```

**Connection String Format:**
```
mssql+pymssql://username:password@host:port/database
```

**Permissions Required:**
- `SELECT` permission on target tables/schemas
- `CONNECT` permission on database
- (Optional) `INSERT`, `UPDATE` for write operations

**Common Issues:**
- **Named instance connection**: Use `host\\INSTANCENAME` format or specify port explicitly
- **Windows Authentication**: Not supported currently, use SQL Server authentication
- **Encrypted connection**: SQL Server 2022+ requires encrypted connections by default

---

### Oracle Database

**Tier Required:** Professional+

**Connection Parameters:**
```json
{
  "host": "localhost",
  "port": 1521,
  "service_name": "ORCL",
  "username": "system",
  "password": "oracle"
}
```

**OR using SID:**
```json
{
  "host": "localhost",
  "port": 1521,
  "sid": "XE",
  "username": "system",
  "password": "oracle"
}
```

**Query Options:**
```json
{
  "table": "EMPLOYEES",
  "query": "SELECT * FROM HR.EMPLOYEES WHERE ROWNUM <= 1000"
}
```

**Connection String Format:**
```
oracle+oracledb://username:password@host:port/service_name
```

**Permissions Required:**
- `SELECT` privilege on target tables
- `CREATE SESSION` system privilege
- (Optional) `INSERT`, `UPDATE` for write operations

**Common Issues:**
- **TNS listener error**: Verify listener is running (`lsnrctl status`)
- **ORA-12505 TNS could not resolve**: Check service_name vs SID configuration
- **ORA-01017 invalid username/password**: Verify credentials and account status

---

## NoSQL Databases

### MongoDB

**Tier Required:** Not available _(MongoDB has been removed from the DataHub connector roadmap. Use CSV/Parquet exports from MongoDB Compass or `mongoexport` to import data via file upload.)_

**Connection Parameters:**
```json
{
  "host": "localhost",
  "port": 27017,
  "database": "mydb",
  "collection": "users",
  "username": "admin",
  "password": "password"
}
```

**Query Options:**
```json
{
  "collection": "orders",
  "query": {"status": "completed", "total": {"$gte": 100}},
  "limit": 1000
}
```

**Connection String Format:**
```
mongodb://username:password@host:port/database
```

**Permissions Required:**
- `read` role on target database
- (Optional) `readWrite` role for write operations

**Data Type Handling:**
- MongoDB documents are automatically flattened to DataFrame columns
- Nested objects are converted to JSON strings
- Arrays are converted to JSON strings
- ObjectId fields are converted to strings

**Common Issues:**
- **Authentication failed**: Check username/password and authentication database
- **ServerSelectionTimeoutError**: Verify host/port and network connectivity
- **Large documents**: Set appropriate `limit` to avoid memory issues

---

## Cloud Data Warehouses

### Snowflake

**Tier Required:** Team+

**Connection Parameters:**
```json
{
  "account": "xy12345.us-east-1",
  "username": "myuser",
  "password": "mypassword",
  "warehouse": "COMPUTE_WH",
  "database": "ANALYTICS",
  "schema": "PUBLIC"
}
```

**Query Options:**
```json
{
  "table": "SALES_DATA",
  "query": "SELECT * FROM SALES_DATA WHERE YEAR = 2024 LIMIT 10000"
}
```

**Account Identifier Format:**
- Old format: `<account>.<region>` (e.g., `xy12345.us-east-1`)
- New format: `<org_name>-<account_name>` (e.g., `myorg-myaccount`)

**Permissions Required:**
- `USAGE` on warehouse and database
- `SELECT` privilege on target tables/views
- (Optional) `INSERT`, `UPDATE` for write operations

**Best Practices:**
- Use a dedicated warehouse (XS/S size) for DataHub imports
- Set `AUTO_SUSPEND = 60` to avoid idle costs
- Use `TRANSIENT` tables for temporary data
- Leverage Snowflake's query result cache

**Common Issues:**
- **Account identifier error**: Use full account identifier including region
- **Warehouse suspended**: Ensure warehouse is running or set AUTO_RESUME
- **Query timeout**: Increase warehouse size or add LIMIT clause

---

### Google BigQuery

**Tier Required:** Team+

**Connection Parameters:**
```json
{
  "project_id": "my-project-123",
  "dataset": "analytics",
  "credentials_json": "{...service account JSON...}"
}
```

**Query Options:**
```json
{
  "table": "sales_data",
  "query": "SELECT * FROM `my-project-123.analytics.sales_data` WHERE date >= '2024-01-01' LIMIT 10000"
}
```

**Authentication:**
- **Service Account (Recommended)**: Download JSON key from GCP Console
- **Default Credentials**: Use when running on GCP (Compute Engine, Cloud Run)

**Service Account Setup:**
1. Go to GCP Console → IAM & Admin → Service Accounts
2. Create service account with these roles:
   - **BigQuery Data Viewer** (for read access)
   - **BigQuery Job User** (to run queries)
   - (Optional) **BigQuery Data Editor** for write access
3. Generate JSON key
4. Copy entire JSON content to `credentials_json` field

**Permissions Required:**
- `bigquery.datasets.get` on target dataset
- `bigquery.tables.getData` on target tables
- `bigquery.jobs.create` to run queries

**Cost Optimization:**
- Use `LIMIT` clauses to avoid scanning large tables
- Query specific columns instead of `SELECT *`
- Leverage partitioned and clustered tables
- Monitor query costs in GCP Console

**Common Issues:**
- **Access Denied**: Verify service account has correct IAM roles
- **Invalid credentials**: Ensure JSON is properly formatted and complete
- **Quota exceeded**: Check project quotas and billing status

---

### Amazon Redshift

**Tier Required:** Team+

**Connection Parameters:**
```json
{
  "host": "my-cluster.abc123.us-east-1.redshift.amazonaws.com",
  "port": 5439,
  "database": "analytics",
  "username": "admin",
  "password": "MyPassword123!",
  "schema": "public"
}
```

**Query Options:**
```json
{
  "table": "sales_fact",
  "query": "SELECT * FROM sales_fact WHERE sale_date >= '2024-01-01' LIMIT 10000"
}
```

**Connection Details:**
- Redshift uses PostgreSQL protocol (port 5439 by default)
- Obtain endpoint from AWS Console → Redshift → Clusters
- Ensure cluster is publicly accessible or use VPN/bastion

**Security:**
- Create dedicated read-only user for DataHub
- Use VPC security groups to restrict access
- Enable SSL/TLS connections
- Rotate credentials regularly

**Permissions Required:**
- `CONNECT` on database
- `USAGE` on schema
- `SELECT` on target tables

**Performance Tips:**
- Use `LIMIT` clauses to avoid full table scans
- Query sorted/distribution keys for faster results
- Vacuum and analyze tables regularly
- Use columnar compression

**Common Issues:**
- **Connection timeout**: Check VPC security group inbound rules (allow port 5439)
- **SSL connection required**: Redshift may require SSL connections
- **Cluster paused**: Resume cluster from AWS Console

---

### Azure Synapse Analytics

**Tier Required:** Team+

**Connection Parameters:**
```json
{
  "server": "myserver.database.windows.net",
  "database": "analytics",
  "username": "sqladmin",
  "password": "MyPassword123!",
  "schema": "dbo"
}
```

**Query Options:**
```json
{
  "table": "SalesData",
  "query": "SELECT TOP 10000 * FROM SalesData WHERE Year = 2024"
}
```

**Connection Details:**
- Uses SQL Server protocol (port 1433)
- Server format: `<project-name>.sql.azuresynapse.net`
- Can also connect to dedicated SQL pools

**Firewall Configuration:**
1. Azure Portal → Synapse project → Networking
2. Add your IP address to firewall rules
3. Or allow Azure services access

**Permissions Required:**
- `CONNECT` permission on database
- `SELECT` permission on target tables/views
- (Optional) `INSERT`, `UPDATE` for write operations

**Authentication:**
- SQL Authentication (username/password) - currently supported
- Azure AD authentication - planned for future release

**Common Issues:**
- **Firewall blocked**: Add your IP to Azure firewall rules
- **Login failed**: Verify username/password and database name
- **Query timeout**: Synapse queries may take longer, increase timeout settings

---

## Cloud Storage

### Amazon S3

**Tier Required:** Professional+

**Configuration (Environment Variables):**
```bash
STORAGE_PROVIDER=s3
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
S3_BUCKET_NAME=my-datahub-bucket
```

**IAM Permissions Required:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::my-datahub-bucket",
        "arn:aws:s3:::my-datahub-bucket/*"
      ]
    }
  ]
}
```

**Features:**
- Server-side encryption (AES256)
- Signed URLs for secure downloads (1 hour expiry)
- Automatic archival to Glacier (optional)
- Direct query using DuckDB S3 integration

---

### Google Cloud Storage

**Tier Required:** Professional+

**Configuration (Environment Variables):**
```bash
STORAGE_PROVIDER=gcs
GCS_PROJECT_ID=my-project-123
GCS_BUCKET_NAME=my-datahub-bucket
GCS_CREDENTIALS_JSON='{"type":"service_account",...}'
```

**Service Account Setup:**
1. GCP Console → IAM & Admin → Service Accounts
2. Create service account
3. Grant role: **Storage Object Admin** or **Storage Object Creator**
4. Generate JSON key
5. Copy entire JSON to `GCS_CREDENTIALS_JSON` environment variable

**IAM Roles Required:**
- `storage.objects.create` (write files)
- `storage.objects.get` (read files)
- `storage.objects.delete` (delete files)
- `storage.buckets.get` (access bucket)

**Features:**
- Signed URLs for temporary access
- Automatic regional/multi-regional storage
- Versioning support
- Lifecycle management

---

### Azure Blob Storage

**Tier Required:** Professional+

**Configuration (Environment Variables):**
```bash
STORAGE_PROVIDER=azure
AZURE_STORAGE_ACCOUNT_NAME=mydatahubstorage
AZURE_STORAGE_ACCOUNT_KEY=...
AZURE_CONTAINER_NAME=datahub-data
```

**OR using connection string:**
```bash
AZURE_STORAGE_CONNECTION_STRING='DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net'
```

**Access Setup:**
1. Azure Portal → Storage Accounts → Your storage account
2. Access Keys → Copy account name and key1
3. Containers → Create container "datahub-data" (Private access)

**Permissions Required:**
- **Storage Blob Data Contributor** role on container

**Features:**
- SAS tokens for signed URLs
- Hot/Cool/Archive tier support
- Blob snapshots and soft delete
- Automatic encryption at rest

---

## SaaS APIs

### Salesforce

**Tier Required:** Enterprise

**Connection Parameters:**
```json
{
  "username": "user@company.com",
  "password": "mypassword",
  "security_token": "abc123xyz789",
  "domain": "login"
}
```

**For Sandbox:**
```json
{
  "domain": "test"
}
```

**Query Options:**
```json
{
  "object_name": "Account",
  "query": "SELECT Id, Name, Industry, AnnualRevenue FROM Account WHERE AnnualRevenue > 1000000"
}
```

**Security Token:**
1. Salesforce → Settings → My Personal Information → Reset Security Token
2. Check email for new security token
3. Password + Security Token used for API authentication

**Supported Objects:**
- Standard objects: Account, Contact, Lead, Opportunity, etc.
- Custom objects: CustomObject__c
- Use SOQL queries for complex filtering

**SOQL Examples:**
```sql
-- Get recent opportunities
SELECT Id, Name, Amount, StageName FROM Opportunity WHERE CreatedDate = THIS_YEAR

-- Get accounts with contacts
SELECT Id, Name, (SELECT Id, FirstName, LastName FROM Contacts) FROM Account

-- Custom object query
SELECT Id, CustomField__c FROM MyCustomObject__c WHERE Status__c = 'Active'
```

**Rate Limits:**
- API calls limited by Salesforce edition (Developer: 15,000/day, Enterprise: 100,000/day)
- Large queries automatically chunked
- Respect rate limits to avoid temporary blocks

**Common Issues:**
- **Login failed**: Check username/password/security token
- **INVALID_LOGIN**: Reset security token if changed
- **Request limit exceeded**: Reduce query frequency or upgrade Salesforce edition

---

## File Formats

**Tier Required:** Free+ (Read-only for all tiers)

DataHub supports importing structured data from various file formats:

### Supported Formats

| Format | Extension | Library | Notes |
|--------|-----------|---------|-------|
| CSV | `.csv`, `.tsv`, `.txt` | pandas | Auto-detects delimiter |
| Excel | `.xlsx`, `.xls` | openpyxl | Supports multiple sheets |
| JSON | `.json` | pandas | Structured/tabular JSON only |
| Parquet | `.parquet` | pyarrow | Columnar format, best performance |

### File Upload Limits

| Tier | Max File Size |
|------|---------------|
| Free | 50 MB |
| Professional | 1 GB |
| Team | 5 GB |
| Business | 10 GB |
| Enterprise | Custom |

### Best Practices

- **CSV**: Ensure first row contains column headers
- **Excel**: Select specific sheet or defaults to first sheet
- **JSON**: Use array of objects format: `[{"col1": "val1", "col2": "val2"}, ...]`
- **Parquet**: Preferred for large datasets (compressed, fast queries)

---

## Local Testing

### Start Test Databases

```bash
# Start all test databases
docker-compose -f docker-compose.test.yml up -d

# Check status
docker-compose -f docker-compose.test.yml ps

# View logs
docker-compose -f docker-compose.test.yml logs -f test-postgres
```

### Test Connection Strings

```bash
# PostgreSQL
postgresql+psycopg://testuser:testpass@localhost:15432/testdb

# MySQL
mysql+pymysql://testuser:testpass@localhost:13306/testdb

# SQL Server
mssql+pymssql://sa:TestPass123!@localhost:11433/master

# MongoDB
mongodb://testuser:testpass@localhost:17017/testdb

# MinIO (S3-compatible)
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
S3_ENDPOINT_URL=http://localhost:19000
```

### Sample Data Setup

```bash
# PostgreSQL - create sample table
docker exec -it datahub-test-postgres psql -U testuser -d testdb -c "
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100),
  email VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);
INSERT INTO customers (name, email) VALUES 
  ('John Doe', 'john@example.com'),
  ('Jane Smith', 'jane@example.com');
"

# MySQL - create sample table
docker exec -it datahub-test-mysql mysql -u testuser -ptestpass testdb -e "
CREATE TABLE products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100),
  price DECIMAL(10,2)
);
INSERT INTO products (name, price) VALUES 
  ('Widget', 19.99),
  ('Gadget', 29.99);
"
```

### Stop Test Databases

```bash
# Stop all test services
docker-compose -f docker-compose.test.yml down

# Stop and remove volumes (clean slate)
docker-compose -f docker-compose.test.yml down -v
```

---

## Troubleshooting

### Connection Timeout Issues

**Symptoms:** "Connection timed out" or "Unable to connect"

**Solutions:**
1. Check firewall rules allow incoming connections on database port
2. Verify database is listening on external IP (not just localhost)
3. Test connectivity: `telnet <host> <port>` or `Test-NetConnection` (PowerShell)
4. For cloud databases: Check VPC/security group/firewall settings
5. Ensure database service is running

### Authentication Failures

**Symptoms:** "Access denied", "Login failed", "Authentication error"

**Solutions:**
1. Verify username and password are correct
2. Check if user has permission to access from your IP address
   - PostgreSQL: Check `pg_hba.conf`
   - MySQL: Check user host permissions (`'user'@'%'` for all IPs)
3. For cloud services: Verify service account/IAM credentials
4. Check if account is locked or expired

### SSL/TLS Certificate Errors

**Symptoms:** "SSL certificate verification failed"

**Solutions:**
1. Add SSL parameters to connection:
   - PostgreSQL: `sslmode=require` or `sslmode=disable` (development only)
   - MySQL: `ssl_verify_cert=false` (development only)
2. For production: Install proper certificates
3. Cloud warehouses: Usually handle SSL automatically

### Query Performance Issues

**Symptoms:** Slow data import, timeouts on large tables

**Solutions:**
1. Add `LIMIT` clause to queries
2. Use `WHERE` clause to filter data at source
3. Query specific columns instead of `SELECT *`
4. For warehouse

s: Increase compute resources temporarily
5. Consider incremental imports using `updated_at_column` parameter

### Memory Errors

**Symptoms:** "Out of memory", crash during large imports

**Solutions:**
1. Import smaller datasets (use `LIMIT`)
2. Upgrade to higher tier for larger file size limits
3. Use Parquet format instead of CSV (more memory efficient)
4. For streaming data: Use pagination/chunking in connector config

### Permissions/Authorization Errors

**Symptoms:** "Insufficient privileges", "Access denied to table"

**Solutions:**
1. Grant necessary permissions to database user:
   ```sql
   -- PostgreSQL
   GRANT SELECT ON ALL TABLES IN SCHEMA public TO myuser;
   
   -- MySQL
   GRANT SELECT ON mydb.* TO 'myuser'@'%';
   
   -- SQL Server
   GRANT SELECT ON SCHEMA::dbo TO myuser;
   ```
2. For cloud services: Check IAM roles/permissions
3. Verify database name and schema are correct

### Cloud-Specific Issues

**Snowflake:**
- Ensure warehouse is running (not suspended)
- Check account identifier format
- Verify network policy allows your IP

**BigQuery:**
- Enable BigQuery API in GCP project
- Service account must have `bigquery.jobs.create` permission
- Check project quotas

**Redshift:**
- Cluster must be publicly accessible or use VPN
- VPC security group must allow port 5439
- Check cluster endpoint is correct

**Azure Synapse:**
- Add IP to firewall rules in Azure Portal
- Ensure SQL pool is running (not paused)
- Use correct database name (not project name)

### Getting Help

If you encounter issues not covered here:

1. **Check logs**: Backend logs will show detailed error messages
2. **Test connection**: Use the "Test Connection" button in UI
3. **Verify locally**: Test connection using psql, mysql CLI, or other tools
4. **Documentation**: Refer to official database documentation
5. **Support**: Contact DataHub support with:
   - Connection parameters (sanitize passwords!)
   - Error message
   - Backend logs
   - Tier and DataHub version

---

## Additional Resources

- [DataHub Architecture](./ARCHITECTURE.md)
- [API Documentation](./API.md)
- [Pricing & Tiers](./PRICING_TIERS.md)
- [Platform Overview](./PLATFORM_OVERVIEW.md)

---

**Last Updated:** February 18, 2026  
**Version:** 1.0.0
