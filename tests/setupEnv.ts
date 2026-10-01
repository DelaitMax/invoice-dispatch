process.env["NODE_ENV"] ??= "test";
process.env["PORT"] ??= "3000";

process.env["DATABASE_URL"] ??= "postgres://postgres:postgres@localhost:5432/invoice_dispatch_test";
process.env["DATABASE_POOL_MAX"] ??= "5";

process.env["REDIS_URL"] ??= "redis://localhost:6379";

process.env["LOG_LEVEL"] ??= "silent";
process.env["LOG_PRETTY"] ??= "false";

process.env["MAIL_DRIVER"] ??= "console";
process.env["MAIL_OUTBOX_DIR"] ??= "./tmp/test-outbox";

process.env["MAIL_FROM_NAME"] ??= "Test Sender";
process.env["MAIL_FROM_EMAIL"] ??= "test-sender@example.com";

process.env["SENDER_BRAND"] ??= "Test Brand";
process.env["SENDER_NAME"] ??= "Test Sender Name";
process.env["SENDER_ADDRESS_LINE1"] ??= "1 Test Street";
process.env["SENDER_CITY"] ??= "Test City";
process.env["SENDER_EMAIL"] ??= "sender@example.com";

process.env["INVOICE_CURRENCY_DEFAULT"] ??= "USD";
process.env["INVOICE_DUE_DAYS"] ??= "14";

process.env["PDF_TIMEOUT_MS"] ??= "20000";
process.env["PDF_MAX_BYTES"] ??= "5242880";
process.env["PUPPETEER_EXECUTABLE_PATH"] ??= "/usr/bin/chromium";

process.env["QUEUE_PDF_CONCURRENCY"] ??= "2";
process.env["QUEUE_EMAIL_CONCURRENCY"] ??= "2";
process.env["QUEUE_JOB_ATTEMPTS"] ??= "3";
process.env["QUEUE_BACKOFF_DELAY_MS"] ??= "10";
process.env["QUEUE_STUCK_SWEEP_INTERVAL_MS"] ??= "60000";
process.env["QUEUE_STUCK_TIMEOUT_MS"] ??= "120000";
process.env["EMAIL_RATE_LIMIT_MAX"] ??= "50";
process.env["EMAIL_RATE_LIMIT_DURATION_MS"] ??= "60000";

process.env["RATE_LIMIT_WINDOW_MS"] ??= "60000";
process.env["RATE_LIMIT_MAX"] ??= "1000";
process.env["SHUTDOWN_TIMEOUT_MS"] ??= "1000";
